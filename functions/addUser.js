// Imports
const admin = require("firebase-admin");
const functions = require("firebase-functions");
const constants = require("./constants");
const { assert } = require("./utilities");

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
    const parsedURL = new URL(data.profilePicUrl);
    assert(parsedURL.origin === "https://firebasestorage.googleapis.com");
  } catch (e) {
    throw new functions.https.HttpsError(
      "invalid-argument", "Invalid profile picture URL"
    );
  }
  try {
    await userRef.create({
      deaths: 0,
      displayName: data.displayName,
      id: uid,
      kills: 0,
      longestLifeSeconds: 0,
      profilePicUrl: data.profilePicUrl
    });
  }
  catch (e) {
    return false;
  }
  return true;
});
