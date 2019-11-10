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

    if (typeof data.firebaseInstanceId !== "string") {
        throw new functions.https.HttpsError(
            "invalid-argument",
            "Invalid firebaseInstanceId"
        );
    }

    if(data.operation !== "add" && data.operation !== "remove"){
        throw new functions.https.HttpsError(
            "invalid-argument",
            "Value of operation field must be 'add' or 'remove'"
        );
    }

    const uid = context.auth.uid;
    try {
        if(data.operation === "add"){
            await usersRef.doc(uid).update({ firebaseInstanceIds: admin.firestore.FieldValue.arrayUnion(data.firebaseInstanceId) });
        }
        else if(data.operation === "remove"){
            await usersRef.doc(uid).update({ firebaseInstanceIds: admin.firestore.FieldValue.arrayRemove(data.firebaseInstanceId) });
        }
    }
    catch (e) {
        throw new functions.https.HttpsError("failed-precondition", `User with id ${uid} does not exist`)
    }
    return true;
});
