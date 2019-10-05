// Imports
const admin = require("firebase-admin");
const functions = require("firebase-functions");
const constants = require("./constants");

// Globals
const firestore = admin.firestore();
const usersRef = firestore.collection("users");

module.exports = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "auth-failed", "No authentication was provided"
    );
  }
  const uid = context.auth.uid;
  const userRef = usersRef.doc(uid);

  try {
    await userRef.create({
      deaths: 0,
      displayName: data.displayName,
      id: uid,
      kills: 0,
      longestLifeSeconds: 0
    });
  }
  catch (e) {
      throw new functions.https.HttpsError("already-exists", `Tried to create a user that already exists with id ${uid}`)
  }
  return true;
});
