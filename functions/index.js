const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();

const firestore = admin.firestore();
const gamesRef = firestore.collection("games");
const usersRef = firestore.collection("users");

exports.helloWorld = functions.https.onRequest(async (request, response) => {
  const doc = await firestore.doc("games/77bv5AwBf5UpNpfNd2R4").get();
  const name = doc.get("name");
  response.send("Hello, world! Game has name \"" + name.toString() + "\".");
});

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
