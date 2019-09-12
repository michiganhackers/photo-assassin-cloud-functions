// Imports
const admin = require("firebase-admin");
const functions = require("firebase-functions");

// Globals
const firestore = admin.firestore();
const gamesRef = firestore.collection("games");
const usersRef = firestore.collection("users");

// Exports

// endGame(gameRef) should be called when a game should be ended. The caller is
//  responsible for putting the `players` and `snipes` collections in their
//  final states. This includes giving the winning player (if applicable) a
//  `place` of `1`. This function simply changes the game's status and adds an
//  endTime.
exports.endGame = async (gameRef) => {
  await gameRef.update({
    endTime: new Date(),
    status: constants.status.ended
  });
};
