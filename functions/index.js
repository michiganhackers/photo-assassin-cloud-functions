const admin = require("firebase-admin");
const serviceAccount = require("./photo-assassin-adminsdk-service-account-key.json")
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: "photo-assassin.appspot.com",
  databaseURL: "https://photo-assassin.firebaseio.com"
});

// TODO: Parallelize all reads/writes
// TODO: Make functions idempotent

exports.addUser = require("./addUser");
exports.createGame = require("./createGame");
exports.startGame = require("./startGame");
exports.submitSnipe = require("./submitSnipe");
exports.addFriend = require("./addFriend");
exports.removeFriend = require("./removeFriend");
exports.storageProfilePicOnFinalize = require("./storageProfilePicOnFinalize");