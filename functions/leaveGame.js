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
      "unauthenticated", "No authentication was provided"
    );
  }
  const uid = context.auth.uid;
  const gameID = data.gameID;
  if (!isValidUniqueString(gameID)) {
    throw new functions.https.HttpsError(
      "failed-precondition", "Invalid gameID " + gameID +
      " provided to leaveGame function");
  }
  const gameRef = gamesRef.doc(gameID);
  const currentGame = await gameRef.get();
  if (!currentGame.exists) {
    throw new functions.https.HttpsError(
      "failed-precondition", "Invalid gameID " + gameID +
      " provided to leaveGame function");
  }
  const gamePlayersRef = gameRef.collection("players");
  const userInGameRef = gamePlayersRef.doc(uid);
  const userInGameData = await userInGameRef.get();
  if (!userInGameData.exists) {
    throw new functions.https.HttpsError(
      "unauthenticated", "User is not authenticated as a member of the game");
  }
  if (userInGameData.get("isOwner")) {
    throw new functions.https.HttpsError(
      "failed-precondition", "Owner cannot leave games"
    );
  }

  await userInGameRef.delete();
  // TODO: If fewer than 3 players remain in the game, end the game.
  // TODO: Reassign targets if the game is in play.
});


