// Imports
const admin = require("firebase-admin");

// Globals
const firestore = admin.firestore();
const messaging = admin.messaging();
const usersRef = firestore.collection("users");


// Exports
// payload: messaging.MessagingPayload
// https://firebase.google.com/docs/reference/admin/node/admin.messaging.MessagingPayload.html
// options?: messaging.MessagingOptions
// https://firebase.google.com/docs/reference/admin/node/admin.messaging.MessagingOptions
exports.sendMessageToUser = async (uid, payload, options) => {
    const user = await usersRef.doc(uid).get();
    const tokens = user.get("firebaseInstanceIds");
    const response = await messaging.sendToDevice(tokens, payload, options);
    const tokensToRemove = [];
    response.results.forEach((result, index) => {
        const error = result.error;
        if (error) {
            console.error('Failure sending message to', tokens[index], error);
            if (error.code === 'messaging/invalid-registration-token' ||
                error.code === 'messaging/registration-token-not-registered') {
                tokensToRemove.push(tokens[index]);
            }
        }
    });
    return user.ref.update({ firebaseInstanceIds: admin.firestore.FieldValue.arrayRemove(tokensToRemove) });
}

// snipeData = data from snipe document
// Returns {payload: messaging.MessagingPayload, options?: messaging.MessagingOptions}
exports.createSnipeVoteMessage = snipeData => {
    const payload = {
        notification:{
            title:"Someone has been sniped!",
            body:"Vote if it's a success!"
          },
          data : {
            gameID : snipeData.gameID,
            snipeID : snipeData.snipeID,
            snipePicUrl : snipeData.snipePicUrl,
            profilePicUrl : snipeData.profilePicUrl
          }
    }
    const options = undefined;

    return {payload: payload, options: options};
}