// Imports
const admin = require("firebase-admin");
const functions = require("firebase-functions");
const constants = require("./constants");
const { shuffle } = require("./utilities");

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
  const uid = context.auth.uid;
  const gameID = data.gameID;
  if (typeof gameID !== "string" || gameID.test(/[^0-9a-zA-Z]/)) {
    throw new functions.https.HttpsError(
      "invalid-argument", "Invalid (or no) gameID provided to startGame"
    );
  }
  const gameRef = gamesRef.doc(gameID);
  const currentGame = await gameRef.get();
  if (!currentGame.exists) {
    throw new functions.https.HttpsError(
      "invalid-argument", "Invalid (or no) gameID provided to startGame"
    );
  }
  if (currentGame.get("status") !== constants.status.notStarted) {
    throw new functions.https.HttpsError(
      "invalid-state", "Cannot start a game that has already been started"
    );
  }
  const gamePlayersRef = gameRef.collection("players");
  const userInGameRef = gamePlayersRef.doc(uid);
  const userInGameData = await userInGameRef.get();
  if (!userInGameData.exists || !userInGameData.get("isOwner")) {
    throw new functions.https.HttpsError(
      "auth-failed", "User does not have authentication to start game"
    );
  }
  const playerRefs = await gamePlayersRef.listDocuments();
  if (playerRefs.length < constants.minPlayers) {
    throw new functions.https.HttpsError(
      "invalid-state", "Cannot start a game with fewer than " +
        constants.minPlayers + " players."
    );
  }
  shuffle(playerRefs);
  await Promise.all(playerRefs.map((playerRef, i) => {
    return playerRef.update({
      alive: true,
      kills: 0,
      pendingVotes: [],
      sniper: i === 0 ? playerRefs[playerRefs.length - 1] : playerRefs[i - 1],
      target: i === playerRefs.length - 1 ? playerRefs[0] : playerRefs[i + 1]
    });
  }));

  await gameRef.update({
    startTime: new Date(),
    status: constants.string.started
  });

  return {
    gameID: gameID
  };
});
