// Imports
const admin = require("firebase-admin");
const functions = require("firebase-functions");

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
  const userFriendsRef = usersRef.doc(uid).collection("friends");
  const friendToAddFriendsRef = usersRef.doc(data.friendToAddId).collection("friends");

  try {
    const p1 = userFriendsRef.doc(data.friendToAddId).create({friend: data.friendToAddId})
    const p2 = friendToAddFriendsRef.doc(uid).create({friend: uid})
    await Promise.all([p1, p2])
  }
  catch (e) {
    throw new functions.https.HttpsError("operation-failed", `Unable to create friendship between users with uids ${uid} and ${data.friendToAddId}`)
  }
  return true;
});
