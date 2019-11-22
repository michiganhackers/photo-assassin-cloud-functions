// Imports
const testFirebase = require("@firebase/testing");
const { generateUniqueString } = require("../utilities.js");
const admin = require("firebase-admin");

// Globals
const firestore = admin.firestore();
const usersRef = firestore.collection("users");

// Exports

// deletes all the data in firestore
exports.clearFirestoreData = () => {
    return testFirebase.clearFirestoreData({ projectId: "photo-assassin" });
};

// calls addUserFunc numUsers times and returns the uids
// of the users created
exports.addUsers = (numUsers, addUserFunc) => {
    const addUserPromises = []
    for (let userNum = 0; userNum < numUsers; ++userNum) {
        const data = {
            displayName: `testDisplayName${userNum}`,
            username: `testUsername${userNum}`
        };
        const context = { auth: { uid: `testUserID${userNum}` } };
        addUserPromises.push(addUserFunc(data, context));
    }
    return Promise.all(addUserPromises)
        .then(values => values.map((_, idx) => `testUserID${idx}`));
};

// calls createGameFunc to create a game with players associated with the
// given UIDs. Returns the gameID of the created game.
exports.createGame = async (ownerUID, invitedUIDs, maxPlayers, createGameFunc) => {
    const name = generateUniqueString();
    const invitedUsersPromises = invitedUIDs.map(uid => usersRef.doc(uid).get());
    const invitedUsernames = await Promise.all(invitedUsersPromises)
        .then(vals => vals.map(user => user.get("username")));

    const data = {
        maxPlayers: maxPlayers,
        name: name,
        invitedUsernames: invitedUsernames
    };
    const context = { auth: { uid: ownerUID } };
    return createGameFunc(data, context).then(v => v.gameID);
};


