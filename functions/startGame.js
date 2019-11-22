// Imports
const admin = require("firebase-admin");
const functions = require("firebase-functions");
const constants = require("./constants");
const { isValidUniqueString, shuffle } = require("./utilities");
const { sendMessageToUser, createGameStartedMessage } = require("./firebaseCloudMessagingUtilities");

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
      "invalid-argument", "Invalid (or no) gameID provided to startGame"
    );
  }
  const gameRef = gamesRef.doc(gameID);
  const { playerUIDs, gameData } = await firestore.runTransaction(async t => {
    const currentGame = await t.get(gameRef);
    if (!currentGame.exists) {
      throw new functions.https.HttpsError(
        "failed-precondition", "Invalid gameID " + gameID + " provided to startGame"
      );
    }
    if (currentGame.get("status") !== constants.gameStatus.notStarted) {
      throw new functions.https.HttpsError(
        "failed-precondition", "Cannot start a game that has already been started"
      );
    }
    const gamePlayersRef = gameRef.collection("players");
    const userInGameRef = gamePlayersRef.doc(uid);
    const userInGameData = await t.get(userInGameRef);
    if (!userInGameData.exists || !userInGameData.get("isOwner")) {
      throw new functions.https.HttpsError(
        "unauthenticated", "User does not have authentication to start game"
      );
    }
    // TODO: what if a document in playerRefs doesn't exist?
    const playerRefs = await gamePlayersRef.listDocuments();
    if (playerRefs.length < constants.minPlayers) {
      throw new functions.https.HttpsError(
        "failed-precondition", "Cannot start a game with fewer than " +
        constants.minPlayers + " players."
      );
    }
    shuffle(playerRefs);
    playerRefs.forEach((playerRef, i) => {
      t.update(playerRef, {
        alive: true,
        kills: 0,
        pendingVotes: [],
        sniper: i === 0 ? playerRefs[playerRefs.length - 1].id : playerRefs[i - 1].id,
        target: i === playerRefs.length - 1 ? playerRefs[0].id : playerRefs[i + 1].id
      });
      t.update(usersRef.doc(playerRef.id), { currentGames: admin.firestore.FieldValue.arrayUnion(gameID) })
    });

    t.update(gameRef, {
      numberAlive: playerRefs.length,
      startTime: new Date(),
      status: constants.gameStatus.started
    });

    const playerUIDs = playerRefs.map(playerRef => playerRef.id);
    const gameData = { gameID: gameID, name: currentGame.name };
    return { playerUIDs: playerUIDs, gameData: gameData };
  });

  const { payload, options } = createGameStartedMessage(gameData);
  const sendMessagePromises = playerUIDs.map(playerUID => sendMessageToUser(playerUID, payload, options));
  await Promise.all(sendMessagePromises);

  return {
    gameID: gameID
  };
});
