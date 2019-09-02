const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();

const firestore = admin.firestore();

exports.helloWorld = functions.https.onRequest(async (request, response) => {
  const doc = await firestore.doc("games/77bv5AwBf5UpNpfNd2R4").get();
  const name = doc.get("name");
  response.send("Hello, world! Game has name \"" + name.toString() + "\".");
});
