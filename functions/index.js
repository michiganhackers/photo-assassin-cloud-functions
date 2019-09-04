const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();

const firestore = admin.firestore();
const gamesRef = firestore.collection("games");
const usersRef = firestore.collection("users");

const MIN_PLAYERS = 3;

// TODO: Parallelize all these reads/writes

// Implementation of Fisher-Yates shuffle, based on
//  https://en.wikipedia.org/wiki/Fisher%E2%80%93Yates_shuffle
const shuffle = (array) => {
  let temp, swapIndex;
  for (let i = array.length - 1; i >= 0; --i) {
    swapIndex = Math.floor(Math.random() * (i + 1));
    temp = array[i];
    array[i] = array[swapIndex];
    array[swapIndex] = temp;
  }
};

exports.createGame = functions.https.onCall(async (data, context) => {
  // TODO: Make idempotent
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "auth-failed", "No authentication was provided"
    );
  }
  const uid = context.auth.uid;
  const documentRef = await gamesRef.add({
    name: data.name,
    status: "notStarted"
  });

  // TODO: Use data.invitedUsernames to "invite" players to join a game

  // Assumption: uid contains no slashes.
  await documentRef.collection("players").doc(uid).create({
    isOwner: true
  });

  return {
    gameID: documentRef.id,
  };
});

exports.startGame = functions.https.onCall(async (data, context) => {
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
  if (currentGame.get("status") !== "notStarted") {
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
  if (playerRefs.length < MIN_PLAYERS) {
    throw new functions.https.HttpsError(
      "invalid-state", "Cannot start a game with fewer than " + MIN_PLAYERS +
        " players."
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
    status: "started"
  });

  return {
    gameID: gameID
  };
});
