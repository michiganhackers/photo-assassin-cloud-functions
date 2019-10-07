const admin = require("firebase-admin");
admin.initializeApp({
  storageBucket: "photo-assassin.appspot.com"
});

// TODO: Parallelize all reads/writes
// TODO: Make functions idempotent

exports.addUser = require("./addUser");
exports.createGame = require("./createGame");
exports.startGame = require("./startGame");
exports.submitSnipe = require("./submitSnipe");
exports.addFriend = require("./addFriend");
exports.removeFriend = require("./removeFriend");
