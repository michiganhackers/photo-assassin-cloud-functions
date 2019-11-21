// Imports
const admin = require("firebase-admin");
const functions = require("firebase-functions");
const { sendMessageToUser, createSnipeVoteMessage } = require("./firebaseCloudMessagingUtilities");
const constants = require("./constants");

// Globals
const firestore = admin.firestore();
const gamesRef = firestore.collection("games");
const usersRef = firestore.collection("users");
const snipePicturesRef = firestore.collection("snipePictures");

// TODO: add error handling
module.exports = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated", "No authentication was provided"
    );
  }
  validateArguments(data);
  const sendVoteMessages = await firestore.runTransaction(async t => {
    const gameRef = gamesRef.doc(data.gameID);
    const gamePromise = t.get(gameRef);
    const playerPromise = t.get(gameRef.collection("players").doc(uid));
    const snipePromise = t.get(gameRef.collection("snipes").doc(data.snipeID));
    const [game, player, snipe] = await Promise.all(gamePromise, playerPromise, snipePromise);
    checkPreconditions(game, player, snipe);

    let sendVoteMessages = false;
    // target gets chance to vote before everyone else
    if (snipe.get("target") === player.get("playerID")) {
      sendVoteMessages = !data.vote;
      handleTargetVote(t, data.vote, game, snipe);
    }
    // If user isn't target, majority (of alive players) required to settle vote
    else {
      handleNonTargetVote(t, data.vote, game, snipe);
    }
    t.update(player.ref, { pendingVotes: admin.firestore.FieldValue.arrayRemove(data.snipeID) });
    return sendVoteMessages;
  });

  if (sendVoteMessages) {
    await sendVoteMessagesToAlivePlayers(game.ref, snipe.getData());
  }

  await firestore.runTransaction(async t => {
    const gameRef = gamesRef.doc(gameID);
    const game = t.get(gameRef);
    if (game.get("numberAlive") === 1) {
      handleGameEnded(t, game);
    }
  });

  return true;
});

// Sends vote message to all alive players EXCLUDING the sniper
// Players could be dead by the time they receive this message. Filtering is required on the client
// side to prevent dead players from getting a vote notification.
// This isn't done in transaction for the reason above as well as because transactions shouldn't
// modify application state
async function sendVoteMessagesToAlivePlayers(gameRef, snipeData) {
  const alivePlayers = await gameRef.collection("players").where('alive', '==', true).get();
  const updatePendingVotes = alivePlayers.filter(playerRef => playerRef !== snipeData.sniper)
    .map(playerRef =>
      playerRef.update({ pendingVotes: admin.firestore.FieldValue.arrayUnion(data.snipeID) })
    );
  await Promise.all(updatePendingVotes);
  const { payload, options } = createSnipeVoteMessage(snipeData);
  const messages = alivePlayers.map(playerRef => sendMessageToUser(playerRef.id, payload, options));
  return Promise.all(messages);
}

function handleTargetVote(transaction, vote, game, snipe) {
  if (vote) {
    // assumes no writes have happened before this point in the transaction
    handleSuccessfulSnipe(transaction, game, snipe);
  }
}
function handleNonTargetVote(transaction, vote, game, snipe) {
  if (vote) {
    // >= and not > because don't include sniper
    if (snipe.get("votesFor") + 1 >= game.get("numberAlive") / 2) {
      // assumes no writes have happened before this point in the transaction
      handleSuccessfulSnipe(transaction, game, snipe);
    }
    transaction.update(snipe.ref, { votesFor: admin.firestore.FieldValue.increment });
  }
  else {
    // >= and not > because don't include sniper
    if (snipe.get("votesAgainst") + 1 >= game.get("numberAlive") / 2) {
      handleFailedSnipe(transaction, snipe);
    }
    transaction.update(snipe.ref, { votesAgainst: admin.firestore.FieldValue.increment });
  }
}

async function handleSuccessfulSnipe(transaction, game, snipe) {
  // assumes no writes have happened before this point in the transaction
  const playersRef = game.ref.collection("players");
  const targetUserRef = usersRef.doc(snipe.get("target"));
  const sniperUserRef = usersRef.doc(snipe.get("sniper"));
  const targetPlayerRef = playersRef.doc(snipe.get("target"));
  const sniperPlayerRef = playersRef.doc(snipe.get("sniper"));
  const snipePictureRef = snipePicturesRef.doc(snipe.get("pictureID"));
  const targetUserPromise = transaction.get(targetUserRef);
  const targetPlayerPromise = transaction.get(targetPlayerRef);
  const snipePicturePromise = transaction.get(snipePictureRef);
  const [targetUser, targetPlayer, snipePicture] = await Promise.all(targetUserPromise, targetPlayerPromise, snipePicturePromise);

  if (snipePicture.get("refCount") === 1) {
    transaction.delete(snipePictureRef);
  }
  else {
    transaction.update(snipePictureRef, { refCount: admin.firestore.FieldValue.decrement });
  }

  const targetLifeLength = game.get("startTime") - new Date(); //TODO: probably not correct
  if (targetLifeLength > targetUser.get("longestLifeSeconds")) { //TODO: probably not correct
    transaction.update(targetUserRef, { longestLifeSeconds: targetLifeLength });
  }
  transaction.update(targetUserRef, { deaths: admin.firestore.FieldValue.increment });
  transaction.update(sniperUserRef, { kills: admin.firestore.FieldValue.increment });
  transaction.update(targetPlayerRef, { alive: false, timeOfDeath: new Date() });
  transaction.update(sniperPlayerRef, { kills: admin.firestore.FieldValue.increment, target: targetPlayer.get("target") });
  transaction.update(game.ref, { numberAlive: admin.firestore.FieldValue.decrement });
  transaction.update(snipe.ref, { status: constants.snipeStatus.success });
  transaction.update(playersRef.doc(targetPlayer.get("target")), { sniper:  snipe.get("sniper")});

  // Note: An ended game is handled in a different transaction for simplicity reasons
  // This means that a client could see that there is only 1 player left in a game that is
  // in progress for a short amount of time before it updates to ended
}

async function handleGameEnded(transaction, game) {
  // assumes no writes have happened before this point in the transaction
  // Note: winner doesn't have timeOfDeath, so they aren't included in this query result
  const deadPlayersPromise = game.ref.collection("players").orderBy("timeOfDeath", "desc").get(); //TODO: not sure if this will work. Make sure values in db have actual timestamp type
  const winnersPromise = game.ref.collection("players").where('alive', '==', true).get();
  const [deadPlayers, winners] = await Promise.all(deadPlayersPromise, winnersPromise);
  if (winners.docs.length !== 1) {
    console.error("Game ended with more than 1 player alive");
  }
  transaction.update(game.ref, { endTime: new Date(), status: constants.gameStatus.ended });
  const winner = winners.docs[0];
  // Note: place is 1-indexed
  transaction.update(winner.ref, { place: 1 });
  deadPlayers.docs.forEach((doc, i) => transaction.update(doc.ref, { place: i + 2 }));

  const playerRefs = await game.ref.collection("players").listDocuments();
  playerRefs.forEach(playerRef => {
    t.update(usersRef.doc(playerRef.id),
      {
        currentGames: admin.firestore.FieldValue.arrayRemove(game.ref.id),
        completedGames: admin.firestore.FieldValue.arrayUnion(game.ref.id)
      });
  });
}

function handleFailedSnipe(transaction, snipe) {
  transaction.update(snipe.ref, { status: constants.snipeStatus.failure });
  // TODO: punish sniper somehow?
}


function validateArguments(data) {
  if (!isValidUniqueString(data.gameID)) {
    throw new functions.https.HttpsError(
      "invalid-argument", "Invalid (or no) gameID provided to submitVote"
    );
  }

  if (!isValidUniqueString(data.snipeID)) {
    throw new functions.https.HttpsError(
      "invalid-argument", "Invalid (or no) snipeID provided to submitVote"
    );
  }

  if (typeof data.vote !== "boolean") {
    throw new functions.https.HttpsError(
      "invalid-argument", "Invalid (or no) vote provided to submitVote"
    );
  }
}

function checkPreconditions(game, player, snipe) {
  const gameID = game.get("gameID");
  const snipeID = snipe.get("snipeID");
  const uid = player.get("playerID");

  if (!game.exists) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      `Invalid gameID ${gameID} provided to submitVote`
    );
  }

  if (game.get("status") !== constants.gameStatus.started) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      `Game with gameID ${gameID} is not in progress`
    );
  }

  if (!player.exists) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      `User with UID ${uid} is not in game with gameID ${gameID}`
    );
  }

  if (!player.get("alive")) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      `User with UID ${uid} is not alive in game with gameID ${gameID}`
    );
  }

  if (!player.get("pendingVotes").includes(snipeID)) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      `User with UID ${uid} does not have a pending vote for snipe with snipeID ${snipeID} in game with gameID ${gameID}`
    );
  }

  if (!snipe.exists) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      `Invalid snipeID ${snipeID} provided to submitVote`
    );
  }

  if (!snipe.get("status") !== constants.snipeStatus.voting) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      `Snipe with snipeID ${snipeID} does not have status voting in game with gameID ${gameID}`
    );
  }

  if(snipe.get("sniper") === uid){
    throw new functions.https.HttpsError(
      "failed-precondition",
      `Sniper with uid ${uid} tried to vote on their own snipe with snipeID ${snipeID}`
    );
  }
}
