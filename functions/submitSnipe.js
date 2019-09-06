// Imports
const fs = require("fs").promises;
const os = require("os");
const path = require("path");
const admin = require("firebase-admin");
const functions = require("firebase-functions");
const constants = require("./constants");
const { generateUniqueString, isValidUniqueString } = require("./utilities");

// Globals
const firestore = admin.firestore();
const bucket = admin.storage().bucket();
const gamesRef = firestore.collection("games");
const snipePicturesRef = firestore.collection("snipePictures");
const usersRef = firestore.collection("users");

// Exports
module.exports = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "auth-failed", "No authentication was provided"
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
  await bucket.upload(tempFilePath, {
    destination: "images/snipes/" + pictureID + ".jpg"
  });
  await fs.unlink(tempFilePath);

  // Add a global snipe with a refCount so we know when to delete the actual
  //  image.
  // TODO: If the "Add the snipes to each game" step below fails,
  //  we will have a dangling reference!!
  snipePicturesRef.doc(pictureID).create({ refCount: gameIDs.length });

  // Add the snipes to each game.
  await Promise.all(gameIDs.map(async (gameID) => {
    // First, ensure that the gameID and UID are valid in this context.
    if (!isValidUniqueString(gameID)) {
      // TODO: Use a batch so a partial write doesn't happen here (or below).
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Invalid gameID " + gameID + " provided to submitSnipe"
      );
    }
    const gameRef = gamesRef.doc(gameID);
    const game = await gameRef.get();
    if (!game.exists) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Invalid gameID " + gameID + " provided to submitSnipe"
      );
    }
    if (game.get("status") !== constants.status.started) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Game with gameID " + gameID + " is not in progress"
      );
    }
    const userInGame = await gameRef.collection("players").doc(uid).get();
    if (!userInGame.exists || !userInGame.alive) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "User with UID " + uid + " is not alive in game with gameID " + gameID
      );
    }
    const targetUID = userInGame.get("target");
    const snipeID = generateUniqueString();
    // Next, create a snipe in the "snipes" collection.
    await gameRef.collection("snipes").doc(snipeID).create({
      pictureID: pictureID,
      sniper: uid,
      status: "voting",
      target: targetUID,
      time: new Date(),
      votesAgainst: 0,
      votesFor: 0
    });
    // Finally, add pending votes for all players except the target and sniper.
    const playersInGame = await gameRef.collection("players").listDocuments();
    await Promise.all(playersInGame.filter((playerRef) => {
      return playerRef.id !== uid && playerRef.id !== targetUID;
    }).map(async (playerRef) => {
      let pendingVotes = (await playerRef.get()).get("pendingVotes");
      pendingVotes.push(snipeID);
      await playerRef.update({
        pendingVotes: pendingVotes
      });
    }));
  }));
  return {
    pictureID: pictureID
  };
});
