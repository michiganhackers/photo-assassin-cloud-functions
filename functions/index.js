const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();

const firestore = admin.firestore();
const gamesRef = firestore.collection("games");
const usersRef = firestore.collection("users");

const performAuth = async (request) => {
  if (request.headers.authorization &&
      request.headers.authorization.startsWith("Bearer ")) {
    const token = request.headers.authorization.substring("Bearer ".length);
    try {
      const decodedIDToken = await admin.auth().verifyIdToken(token);
      return decodedIDToken.uid;
    }
    catch (error) {
      // Fall down to `return null;`
    }
  }
  // Return null if there is no valid token.
  return null;
};

exports.helloWorld = functions.https.onRequest(async (request, response) => {
  const doc = await firestore.doc("games/77bv5AwBf5UpNpfNd2R4").get();
  const name = doc.get("name");
  response.send("Hello, world! Game has name \"" + name.toString() + "\".");
});

exports.createGame = functions.https.onRequest(async (request, response) => {
  // TODO: Make idempotent
  if (request.method !== "POST") {
    console.error("Non-POST request attempted for createGame");
    response.sendStatus(405); // Method Not Allowed
    return;
  }
  const uid = await performAuth(request);
  if (!uid) {
    console.error("Unable to validate user authentication for createGame");
    response.sendStatus(403); // Forbidden
    return;
  }
  const documentRef = await gamesRef.add({
    name: request.body.name,
    status: "notStarted"
  });
  // Assumption: uid contains no slashes.
  await documentRef.collection("players").doc(uid).create({
    isOwner: true
  });
  response.set("Content-Type", "application/json");
  response.send(JSON.stringify({
    gameID: documentRef.id
  }));
});
