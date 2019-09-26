// Imports
const admin = require("firebase-admin");
const functions = require("firebase-functions");
const constants = require("./constants");

// Globals
const firestore = admin.firestore();
const gamesRef = firestore.collection("games");
const usersRef = firestore.collection("users");

// Exports
module.exports = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "auth-failed", "No authentication was provided"
    );
  }
  if (typeof data.maxPlayers !== "number" ||
      data.maxPlayers < constants.minPlayers) {
    throw new functions.https.HttpsError(
      "invalid-argument", "An invalid maxPlayers number was provided"
    );
  }
  const uid = context.auth.uid;
  const documentRef = await gamesRef.add({
    maxPlayers: data.maxPlayers,
    name: String(data.name),
    status: constants.status.notStarted
  });

  // TODO: Use data.invitedUsernames to "invite" players to join a game

  await documentRef.collection("players").doc(uid).create({
    isOwner: true
  });

  return {
    gameID: documentRef.id,
  };
});


