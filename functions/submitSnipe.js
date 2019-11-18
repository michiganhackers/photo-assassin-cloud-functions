// Imports
const fs = require("fs").promises;
const os = require("os");
const path = require("path");
const admin = require("firebase-admin");
const functions = require("firebase-functions");
const constants = require("./constants");
const { generateUniqueString, isValidUniqueString } = require("./utilities");
const { sendMessageToUser, createSnipeVoteMessage } = require("./firebaseCloudMessagingUtilities");
const { getReadableImageUrl } = require("./utilities");

// Globals
const firestore = admin.firestore();
const bucket = admin.storage().bucket();
const gamesRef = firestore.collection("games");
const snipePicturesRef = firestore.collection("snipePictures");

// Exports
module.exports = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated", "No authentication was provided"
    );
  }
  const uid = context.auth.uid;
  if (!Array.isArray(data.gameIDs)) {
    throw new functions.https.HttpsError(
      "invalid-argument", "Invalid list of gameIDs provided to submitSnipe"
    );
  }
  // Filter the gameIDs to ensure uniqueness (so we don't try to update the same
  //  game two times).
  const gameIDs = [...new Set(data.gameIDs)];
  const pictureID = generateUniqueString();

  if (gameIDs.length === 0) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Invalid (zero-length) list of gameIDs provided to submitSnipe"
    );
  }

  // Create and upload the JPEG picture (provided as a base64 string in
  //  data.base64JPEG).
  const tempFilePath = path.join(os.tmpdir(), pictureID + ".jpg");
  await fs.writeFile(
    tempFilePath,
    data.base64JPEG,
    { encoding: "base64" }
  );
  const remoteFilePath = "images/snipes/" + pictureID + ".jpg"
  await bucket.upload(tempFilePath, {
    destination: remoteFilePath
  });
  await fs.unlink(tempFilePath);

  const snipePicUrl = await getReadableImageUrl(bucket, remoteFilePath);

  // Add a global snipe with a refCount so we know when to delete the actual
  //  image.
  await snipePicturesRef.doc(pictureID).create({ refCount: 0, pictureID: pictureID });

  // Add the snipes to each game.
  const snipes = await Promise.all(gameIDs.map(async (gameID) => {
    return firestore.runTransaction(async t => {
      // First, ensure that the gameID and UID are valid in this context.
      if (!isValidUniqueString(gameID)) {
        throw new functions.https.HttpsError(
          "invalid-argument",
          "Invalid gameID " + gameID + " provided to submitSnipe"
        );
      }
      const gameRef = gamesRef.doc(gameID);
      const game = await t.get(gameRef);
      if (!game.exists) {
        throw new functions.https.HttpsError(
          "failed-precondition",
          "Invalid gameID " + gameID + " provided to submitSnipe"
        );
      }
      if (game.get("status") !== constants.gameStatus.started) {
        throw new functions.https.HttpsError(
          "failed-precondition",
          "Game with gameID " + gameID + " is not in progress"
        );
      }
      const userInGame = await t.get(gameRef.collection("players").doc(uid));
      if (!userInGame.exists || !userInGame.alive) {
        throw new functions.https.HttpsError(
          "failed-precondition",
          "User with UID " + uid + " is not alive in game with gameID " + gameID
        );
      }
      const targetUID = userInGame.get("target");
      const snipeID = generateUniqueString();
      // Next, create a snipe in the "snipes" collection.
      const snipeData = {
        pictureID: pictureID,
        sniper: uid,
        status: constants.snipeStatus.voting,
        target: targetUID,
        time: new Date(),
        votesAgainst: 0,
        votesFor: 0,
        snipePicUrl: snipePicUrl,
        targetProfilePicUrl: userInGame.get("profilePicUrl"),
        snipeID: snipeID
      };
      t.create(gameRef.collection("snipes").doc(snipeID), snipeData);

      // Add pending vote to target and increment snipePicture refCount
      t.update(userInGame.ref, { pendingVotes: admin.firestore.FieldValue.arrayUnion(snipeID) });
      t.update(snipePicturesRef.doc(pictureID), { refCount: admin.firestore.FieldValue.increment });
      return snipeData;
    });
  }));

  // Send vote notification to target(s)
  // Note: snipe picture could contain multiple targets for different games
  // TODO: Consolidate snipes of same target and apply their vote to all games
  snipes.forEach(snipeData => {
    const {payload, options} = createSnipeVoteMessage(snipeData);
    sendMessageToUser(snipeData.target, payload, options);
  });

  return {
    pictureID: pictureID
  };
});
