// Imports
const fs = require("fs").promises;
const os = require("os");
const path = require("path");
const admin = require("firebase-admin");
const functions = require("firebase-functions");
const constants = require("./constants");
const { generateUniqueString, isValidUniqueString, reflect, getSnipePicRemoteFilePath } = require("./utilities");
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

  if (!Array.isArray(data.gameIDs)) {
    throw new functions.https.HttpsError(
      "invalid-argument", "Invalid list of gameIDs provided to submitSnipe"
    );
  }

  // Filter the gameIDs to ensure uniqueness (so we don't try to update the same
  //  game two times).
  const gameIDs = [...new Set(data.gameIDs)];
  if (gameIDs.length === 0) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Invalid (zero-length) list of gameIDs provided to submitSnipe"
    );
  }

  gameIDs.forEach(gameID => {
    if (!isValidUniqueString(gameID)) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Invalid gameID " + gameID + " provided to submitSnipe"
      );
    }
  });

  // Create and upload the JPEG picture (provided as a base64 string in
  //  data.base64JPEG).
  const pictureID = generateUniqueString();
  const tempFilePath = path.join(os.tmpdir(), pictureID + ".jpg");
  await fs.writeFile(
    tempFilePath,
    data.base64JPEG,
    { encoding: "base64" }
  );
  const remoteFilePath = getSnipePicRemoteFilePath(pictureID);
  await bucket.upload(tempFilePath, {
    destination: remoteFilePath
  });
  await fs.unlink(tempFilePath);

  // Add a global snipe with a refCount so we know when to delete the actual
  //  image.
  await snipePicturesRef.doc(pictureID).create({ refCount: 0, pictureID: pictureID });

  // Add the snipes to each game.
  const snipes = [];
  const snipePicUrl = await getReadableImageUrl(bucket, remoteFilePath);
  for (gameID of gameIDs) {
    const transaction = createSnipeTransaction(gameID, context.auth.uid, pictureID, snipePicUrl);
    const transactionPromise = firestore.runTransaction(transaction);
    // reflect the transaction promise so failed snipes don't throw an error
    // await in loop to prevent transactions from contending for same documents
    const snipe = await reflect(transactionPromise); //eslint-disable-line no-await-in-loop
    if (snipe.status === constants.promiseStatus.fulfilled) {
      snipes.push(snipe.value);
    }
  }

  // Send vote notification to target(s)
  // Note: snipe picture could contain multiple targets for different games
  // TODO: Consolidate snipes of same target and apply their vote to all games
  const sendMessagePromises = snipes.map(snipeData => {
    const { payload, options } = createSnipeVoteMessage(snipeData);
    return sendMessageToUser(snipeData.target, payload, options);
  });
  await Promise.all(sendMessagePromises);

  return {
    pictureID: pictureID
  };
});

function createSnipeTransaction(gameID, sniperUID, pictureID, snipePicUrl) {
  return async t => {
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

    const playersRef = gamesRef.doc(gameID).collection("players");
    const sniper = await t.get(playersRef.doc(sniperUID));
    if (!sniper.exists || !sniper.get("alive")) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "User with UID " + sniperUID + " is not alive in game with gameID " + gameID
      );
    }
    const snipePicture = await t.get(snipePicturesRef.doc(pictureID));
    const targetUID = sniper.get("target");
    const target = await t.get(playersRef.doc(targetUID));
    // Next, create a snipe in the "snipes" collection.
    const snipeID = generateUniqueString();
    const snipeData = {
      pictureID: pictureID,
      sniper: sniperUID,
      status: constants.snipeStatus.voting,
      target: targetUID,
      time: new Date(),
      votesAgainst: 0,
      votesFor: 0,
      snipePicUrl: snipePicUrl,
      snipeID: snipeID
    };
    t.create(gameRef.collection("snipes").doc(snipeID), snipeData);

    // Add pending vote to target and increment snipePicture refCount
    t.update(playersRef.doc(targetUID), { pendingVotes: [...target.get("pendingVotes"), snipeID] });
    t.update(snipePicturesRef.doc(pictureID), { refCount: snipePicture.get("refCount") + 1, pictureID: pictureID });
    return snipeData;
  }
}
