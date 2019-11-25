// Imports
const admin = require("firebase-admin");
const functions = require("firebase-functions");
const { sendMessageToUser, createSnipeVoteMessage } = require("./firebaseCloudMessagingUtilities");
const constants = require("./constants");
const { getSnipePicRemoteFilePath, isValidUniqueString } = require("./utilities");

// Globals
const firestore = admin.firestore();
const bucket = admin.storage().bucket();
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
  const gameRef = gamesRef.doc(data.gameID);
  const playersRef = gameRef.collection("players");
  const snipesRef = gameRef.collection("snipes");
  const sendVoteMessages = await firestore.runTransaction(async t => {
    const gamePromise = t.get(gameRef);
    const playerPromise = t.get(playersRef.doc(context.auth.uid));
    const snipePromise = t.get(snipesRef.doc(data.snipeID));
    const [game, player, snipe] = await Promise.all([gamePromise, playerPromise, snipePromise]);
    checkPreconditions(game, player, snipe);

    let sendVoteMessages = false;
    // target gets chance to vote before everyone else
    if (snipe.get("target") === player.get("uid")) {
      sendVoteMessages = !data.vote;
      await handleTargetVote(t, data.vote, game, snipe);
    }
    // If user isn't target, majority required to settle vote (excluding sniper and target)
    else {
      await handleNonTargetVote(t, data.vote, game, snipe);
    }
    t.update(player.ref, { pendingVotes: admin.firestore.FieldValue.arrayRemove(data.snipeID) });
    return sendVoteMessages;
  });

  if (sendVoteMessages) {
    const snipe = await snipesRef.doc(data.snipeID).get();
    await sendSecondRoundVoteMessages(playersRef, snipe.data());
  }

  return true;
});

// This isn't done in transaction because transactions shouldn't modify application state
async function sendSecondRoundVoteMessages(playersRef, snipeData) {
  const playerRefs = await playersRef.listDocuments();
  const receiverRefs = playerRefs.filter(ref => ref.id !== snipeData.sniper && ref.id !== snipeData.target);
  const updatePendingVotes = receiverRefs.map(playerRef =>
    playerRef.update({ pendingVotes: admin.firestore.FieldValue.arrayUnion(snipeData.snipeID) })
  );
  await Promise.all(updatePendingVotes);
  const { payload, options } = createSnipeVoteMessage(snipeData);
  const messages = receiverRefs.map(playerRef => sendMessageToUser(playerRef.id, payload, options));
  await Promise.all(messages);
}

async function handleTargetVote(transaction, vote, game, snipe) {
  if (vote) {
    // assumes no writes have happened before this point in the transaction
    await handleSuccessfulSnipe(transaction, game, snipe);
  }
}
async function handleNonTargetVote(transaction, vote, game, snipe) {
  // numVoters doesn't include sniper and target
  const numVoters = game.get("numPlayers") - 2;
  if (vote) {
    if (snipe.get("votesFor") + 1 > numVoters / 2) {
      // assumes no writes have happened before this point in the transaction
      await handleSuccessfulSnipe(transaction, game, snipe);
    }
    transaction.update(snipe.ref, { votesFor: snipe.get("votesFor") + 1 });
  }
  else {
    // break ties by favoring failed snipe
    if (snipe.get("votesAgainst") + 1 >= numVoters / 2) {
      handleFailedSnipe(transaction, snipe);
    }
    transaction.update(snipe.ref, { votesAgainst: snipe.get("votesAgainst") + 1 });
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
  const sniperUserPromise = transaction.get(sniperUserRef);
  const targetPlayerPromise = transaction.get(targetPlayerRef);
  const sniperPlayerPromise = transaction.get(sniperPlayerRef);
  const snipePicturePromise = transaction.get(snipePictureRef);

  const [targetUser, sniperUser, targetPlayer, sniperPlayer, snipePicture] = await Promise.all([targetUserPromise, sniperUserPromise, targetPlayerPromise, sniperPlayerPromise, snipePicturePromise]);

  if (snipePicture.get("refCount") === 1) {
    const remotePicFilePath = getSnipePicRemoteFilePath(snipe.get("pictureID"));
    try {
      await bucket.deleteFiles({
        prefix: remotePicFilePath
      });
    } catch (e) {
      console.log(`picture at ${remotePicFilePath} doesn't exist`);
    }
  }
  transaction.update(snipePictureRef, { refCount: snipePicture.get("refCount") - 1 });

  const targetLifeLengthSeconds = (game.get("startTime").toDate() - new Date()) / 1000;
  if (targetLifeLengthSeconds > targetUser.get("longestLifeSeconds")) {
    transaction.update(targetUserRef, { longestLifeSeconds: targetLifeLength });
  }
  transaction.update(targetUserRef, { deaths: targetUser.get("deaths") + 1 });
  transaction.update(sniperUserRef, { kills: sniperUser.get("kills") + 1 });
  transaction.update(targetPlayerRef, { alive: false, timeOfDeath: admin.firestore.FieldValue.serverTimestamp() });
  transaction.update(sniperPlayerRef, { kills: sniperPlayer.get("kills") + 1, target: targetPlayer.get("target") });
  transaction.update(game.ref, { numberAlive: game.get("numberAlive") - 1 });
  transaction.update(snipe.ref, { status: constants.snipeStatus.success });
  transaction.update(playersRef.doc(targetPlayer.get("target")), { sniper: snipe.get("sniper") });

  if (game.get("numberAlive") - 1 === 1) {
    // sniperPlayerRef is the winner because we know they are alive at this point
    await handleGameEnded(transaction, game.ref, sniperPlayerRef, targetPlayerRef);
  }
}

async function handleGameEnded(transaction, gameRef, winnerPlayerRef, targetPlayerRef) {
  // Note: winner doesn't have timeOfDeath, so they aren't included in this query result
  // No need to do this reads with the transaction because none of the fields being read
  // can change at this points
  const deadPlayersPromise = gameRef.collection("players").orderBy("timeOfDeath", "desc").get();
  const deadPlayers = await deadPlayersPromise;
  // Note: place is 1-indexed
  transaction.update(winnerPlayerRef, { place: 1 });
  transaction.update(targetPlayerRef, { place: 2 });
  for (let i = 0; i < deadPlayers.docs.length; ++i) {
    const player = deadPlayers.docs[i];
    transaction.update(player.ref, { place: i + 3 })
  }

  transaction.update(gameRef, { endTime: admin.firestore.FieldValue.serverTimestamp(), status: constants.gameStatus.ended });
  const playerRefs = await gameRef.collection("players").listDocuments();
  playerRefs.forEach(playerRef => {
    transaction.update(usersRef.doc(playerRef.id),
      {
        currentGames: admin.firestore.FieldValue.arrayRemove(gameRef.id),
        completedGames: admin.firestore.FieldValue.arrayUnion(gameRef.id)
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
  const uid = player.get("uid");

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

  // TODO: should we notify client of this in the response?
  if (snipe.get("status") !== constants.snipeStatus.voting) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      `Snipe with snipeID ${snipeID} does not have status voting in game with gameID ${gameID}`
    );
  }

  if (snipe.get("sniper") === uid) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      `Sniper with uid ${uid} tried to vote on their own snipe with snipeID ${snipeID}`
    );
  }
}
