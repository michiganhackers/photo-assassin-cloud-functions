const admin = require("firebase-admin");
admin.initializeApp();

// TODO: Parallelize all reads/writes
// TODO: Make functions idempotent

exports.createGame = require("./createGame");
exports.startGame = require("./startGame");
