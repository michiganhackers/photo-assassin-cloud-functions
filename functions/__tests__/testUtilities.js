// Imports
const testFirebase = require("@firebase/testing");

// deletes all the data in firestore
exports.clearFirestoreData = () => {
    return testFirebase.clearFirestoreData({projectId: "photo-assassin"});
}

// calls addUserFunc numUsers times and returns the uids
// of the users created
exports.addUsers = (numUsers, addUserFunc) => {
    const addUserPromises = []
    for (let userNum = 0; userNum < numUsers; ++userNum) {
        const data = { displayName: `testUser${userNum}` };
        const context = { auth: { uid: `testUserID${userNum}` } };
        addUserPromises.push(addUserFunc(data, context));
    }
    return Promise.all(addUserPromises)
        .then(values => values.map((_, idx) => `testUserID${idx}`));
}


