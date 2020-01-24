// Imports
const admin = require("firebase-admin");
const functions = require("firebase-functions");
const constants = require("./constants");
const { generateUniqueString, isValidUsername } = require("./utilities");
const { sendMessageToUser, createGameInviteMessage } = require("./firebaseCloudMessagingUtilities");

// Globals
const firestore = admin.firestore();
const gamesRef = firestore.collection("games");
const usersRef = firestore.collection("users");
const usernamesRef = firestore.collection("usernames");

// Exports
module.exports = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated", "No authentication was provided"
    );
  }
  if (typeof data.maxPlayers !== "number" ||
    data.maxPlayers < constants.minPlayers) {
    throw new functions.https.HttpsError(
      "invalid-argument", "An invalid maxPlayers number was provided"
    );
  }

  data.invitedUsernames.forEach(username => {
    if (!isValidUsername) {
      throw new functions.https.HttpsError(
        "invalid-argument", "Invalid username provided to createGame"
      );
    }
  });

  const uid = context.auth.uid;
  const gameID = generateUniqueString();
  const gameRef = gamesRef.doc(gameID);
  const playersRef = gameRef.collection("players");
  const invitedUsernamesLower = data.invitedUsernames.map(username => username.toLowerCase());

  const invitedUIDs = await firestore.runTransaction(async t => {
    const usernamesPromises = invitedUsernamesLower.map(username => t.get(usernamesRef.doc(username)));
    const invitedUIDs = [];
    try {
      const usernames = await Promise.all(usernamesPromises);
      usernames.forEach(username => {
        if (!username.exists) {
          throw new functions.https.HttpsError(
            "failed-precondition", `Username ${username} doesn't exist.`
          );
        }
        invitedUIDs.push(username.get("uid"));
      });
    } catch (e) {
      throw new functions.https.HttpsError(
        "failed-precondition", "A provided username doesn't exist."
      );
    }

    t.create(gameRef, {
      maxPlayers: data.maxPlayers,
      name: String(data.name), //TODO: why is this cast necessary?
      status: constants.gameStatus.notStarted,
      gameID: gameID
    });

    return invitedUIDs;
  });

  const ownerPlayerPromise = playersRef.doc(uid).create({
    isOwner: true,
    uid: uid
  }).then(() => {
    return usersRef.doc(uid).collection("currentGames").doc(gameID).create({
      // No data needed
    });
  });
  const invitedPlayersPromises = invitedUIDs.map(invitedUID => {
    return playersRef.doc(invitedUID).create({
      isOwner: false,
      uid: invitedUID
    }).then(() => {
      return usersRef.doc(uid).collection("currentGames").doc(gameID).create({
        // No data needed
      });
    });
  });
  await Promise.all([ownerPlayerPromise, ...invitedPlayersPromises]);

  const gameData = { name: data.name, gameID: gameID };
  const { payload, options } = createGameInviteMessage(gameData);
  const sendMessagePromises = invitedUIDs.map(invitedUID =>  sendMessageToUser(invitedUID, payload, options));
  await Promise.all(sendMessagePromises);

  return {
    gameID: gameID,
  };
});


