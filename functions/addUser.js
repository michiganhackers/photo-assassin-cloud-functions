// Imports
const admin = require("firebase-admin");
const functions = require("firebase-functions");
const constants = require("./constants");
const { isValidDisplayName, isValidUsername } = require("./utilities");

// Globals
const firestore = admin.firestore();
const usersRef = firestore.collection("users");
const usernamesRef = firestore.collection("usernames");

module.exports = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated", "No authentication was provided"
    );
  }

  if (!isValidDisplayName(data.displayName)) {
    throw new functions.https.HttpsError(
      "invalid-argument", "Invalid (or no) displayName provided to addUser"
    );
  }


  if (!isValidUsername(data.username)) {
    throw new functions.https.HttpsError(
      "invalid-argument", "Invalid (or no) username provided to addUser"
    );
  }

  const uid = context.auth.uid;
  const userRef = usersRef.doc(uid);
  const usernameLower = data.username.toLowerCase();
  let usernameAlreadyExists = true;
  try {
    usernameAlreadyExists = await firestore.runTransaction(async t => {
      const existingUsername = await t.get(usernamesRef.doc(usernameLower));
      if (existingUsername.exists) {
        return true;
      }

      t.create(userRef, {
        deaths: 0,
        displayName: data.displayName,
        username: usernameLower,
        id: uid,
        kills: 0,
        longestLifeSeconds: 0,
        gamesWon: 0
      });
      t.create(usernamesRef.doc(usernameLower), { username: usernameLower, uid: uid });

      return false;
    });
  }
  catch (e) {
    throw new functions.https.HttpsError("already-exists", `Tried to create a user that already exists with id ${uid}`)
  }
  return {
    errorCode: usernameAlreadyExists ? constants.errorCode.duplicateUsername : constants.errorCode.ok
  };
});
