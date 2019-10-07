// Imports
const admin = require("firebase-admin");
const functions = require("firebase-functions");
const { isValidDisplayName } = require("./utilities");

// Globals
const firestore = admin.firestore();
const usersRef = firestore.collection("users");

module.exports = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError(
            "unauthenticated", "No authentication was provided"
        );
    }

    if (!isValidDisplayName(data.displayName)) {
        throw new functions.https.HttpsError(
            "invalid-argument", "Invalid (or no) displayName provided to updateDisplayName"
        );
    }

    const uid = context.auth.uid;
    try {
        await usersRef.doc(uid).update({ displayName: data.displayName });
    }
    catch (e) {
        throw new functions.https.HttpsError("unknown", `Unable to update displayName of user with id ${uid}`)
    }
    return true;
});
