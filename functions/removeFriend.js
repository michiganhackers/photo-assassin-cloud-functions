// Imports
const admin = require("firebase-admin");
const functions = require("firebase-functions");

// Globals
const firestore = admin.firestore();
const usersRef = firestore.collection("users");

module.exports = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated", "No authentication was provided"
    );
  }
  const uid = context.auth.uid;
  const userFriendsRef = usersRef.doc(uid).collection("friends");
  const friendToRemoveFriendsRef = usersRef.doc(data.friendToRemoveId).collection("friends");

  try {
    const p1 = userFriendsRef.doc(data.friendToRemoveId).delete()
    const p2 = friendToRemoveFriendsRef.doc(uid).delete()
    await Promise.all([p1, p2])
  }
  catch (e) {
    console.log(e)
    throw new functions.https.HttpsError("unknown", `Unable to remove friendship between users with uids ${uid} and ${data.friendToRemoveId}`)
  }
  return true;
});
