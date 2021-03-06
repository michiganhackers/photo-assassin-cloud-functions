// Imports
const admin = require("firebase-admin");
const { Bucket } = require("@google-cloud/storage");
const testFunc = require("firebase-functions-test")();
const functions = require("../index");
const testUtils = require("./testUtilities");
const constants = require("../constants");
const { base64Encode } = require("../utilities");

// Globals
const firestore = admin.firestore();
const gamesRef = firestore.collection("games");
const usersRef = firestore.collection("users");
const snipePicsRef = firestore.collection("snipePictures");
const startGameWrapped = testFunc.wrap(functions.startGame);
const createGameWrapped = testFunc.wrap(functions.createGame);
const addUserWrapped = testFunc.wrap(functions.addUser);
const submitSnipeWrapped = testFunc.wrap(functions.submitSnipe);
const submitVoteWrapped = testFunc.wrap(functions.submitVote);

jest.setTimeout(30000);

beforeAll(() => {
    const mockUpload = jest.fn().mockResolvedValue(null);
    Bucket.prototype.upload = mockUpload;
    const mockDelete = jest.fn().mockResolvedValue(null);
    Bucket.prototype.deleteFiles = mockDelete;
});

afterEach(() => {
    testFunc.cleanup();
    Bucket.prototype.deleteFiles.mockClear()
    return testUtils.clearFirestoreData();
});

test("targets only vote that snipe was valid & only 1 person snipes", async () => {
    expect.assertions(130);
    const numPlayers = 6;
    const userIDs = await testUtils.addUsers(numPlayers, addUserWrapped);
    const [ownerUID, ...invitedUIDs] = userIDs;
    const gameID = await testUtils.createGame(ownerUID, invitedUIDs, 5, createGameWrapped);
    await startGameWrapped({ gameID: gameID }, { auth: { uid: ownerUID } });
    const gameRef = gamesRef.doc(gameID);

    const playersRef = gameRef.collection("players");
    const img = base64Encode("./__tests__/stock_img.jpg");
    const submitSnipeData = { gameIDs: [gameID], base64JPEG: img };

    const snipesRef = gameRef.collection("snipes");

    const playerPlaces = {};
    playerPlaces[ownerUID] = 1;
    for (let i = 0; i < numPlayers - 1; ++i) {
        /* eslint-disable no-await-in-loop */
        // owner will snipe everyone in the game until it ends
        const winner = await playersRef.doc(ownerUID).get();
        const { pictureID } = await submitSnipeWrapped(submitSnipeData, { auth: { uid: winner.get("uid") } });
        const snipeRefs = await snipesRef.listDocuments();
        const snipes = await Promise.all(snipeRefs.map(ref => ref.get()));
        let snipe = snipes.filter(s => s.get("pictureID") === pictureID)[0];
        expect(snipe.get("votesFor")).toBe(0);
        expect(snipe.get("votesAgainst")).toBe(0);
        expect(snipe.get("status")).toBe(constants.snipeStatus.voting);

        let targetPlayer = await playersRef.doc(winner.get("target")).get();
        expect(targetPlayer.get("pendingVotes").length).toBe(1);

        let snipePic = await snipePicsRef.doc(pictureID).get();
        expect(snipePic.exists).toBe(true);
        expect(snipePic.get("refCount")).toBe(1);

        const submitVoteData = { gameID: gameID, snipeID: snipe.get("snipeID"), vote: true };
        await submitVoteWrapped(submitVoteData, { auth: { uid: winner.get("target") } });

        snipe = await snipe.ref.get();
        expect(snipe.get("votesFor")).toBe(0);
        expect(snipe.get("votesAgainst")).toBe(0);
        expect(snipe.get("status")).toBe(constants.snipeStatus.success);
        playerPlaces[winner.get("target")] = numPlayers - i;

        targetPlayer = await targetPlayer.ref.get();
        expect(targetPlayer.get("pendingVotes").length).toBe(0);
        expect(targetPlayer.get("alive")).toBe(false);

        snipePic = await snipePic.ref.get();
        expect(snipePic.exists).toBe(true);
        expect(snipePic.get("refCount")).toBe(0);
        expect(Bucket.prototype.deleteFiles).toBeCalled();
        Bucket.prototype.deleteFiles.mockClear()

        let targetUser = await usersRef.doc(winner.get("target")).get();
        expect(targetUser.get("deaths")).toBe(1);
        expect(typeof targetUser.get("longestLifeSeconds")).toBe("number");

        let sniperUser = await usersRef.doc(winner.get("uid")).get();
        expect(sniperUser.get("kills")).toBe(i + 1);

        let sniperPlayer = await playersRef.doc(winner.get("uid")).get();
        expect(sniperPlayer.get("kills")).toBe(i + 1);
        expect(sniperPlayer.get("target")).toBe(targetPlayer.get("target"));

        let game = await gameRef.get();
        expect(game.get("numberAlive")).toBe(numPlayers - i - 1);

        let targetTargetPlayer = await playersRef.doc(targetPlayer.get("target")).get();
        expect(targetTargetPlayer.get("sniper")).toBe(winner.get("uid"));

        if (i === numPlayers - 2) {
            expect(game.get("status")).toBe(constants.gameStatus.ended);
        }
        /* eslint-enable no-await-in-loop */
    }

    const playerRefs = await playersRef.listDocuments();
    const players = await Promise.all(playerRefs.map(ref => ref.get()));
    players.forEach(player => {
        expect(player.get("place")).toBe(playerPlaces[player.get("uid")]);
    });

    const users = await Promise.all(userIDs.map(id => usersRef.doc(id).get()));
    await Promise.all(users.map(async user => {
        const currentGames = await user.ref.collection("currentGames").listDocuments();
        expect(currentGames.length).toBe(0);
        const completedGames = await user.ref.collection("completedGames").listDocuments();
        expect(completedGames.length).toBe(1);
        if(user.get("id") === ownerUID){
            expect(user.get("gamesWon")).toBe(1);
        } else{
            expect(user.get("gamesWon")).toBe(0);
        }
    }));
});

test("half vote no leads to failed snipe", async () => {
    expect.assertions(67);
    const numPlayers = 5;
    const userIDs = await testUtils.addUsers(numPlayers, addUserWrapped);
    const [ownerUID, ...invitedUIDs] = userIDs;
    const gameID = await testUtils.createGame(ownerUID, invitedUIDs, 5, createGameWrapped);
    await startGameWrapped({ gameID: gameID }, { auth: { uid: ownerUID } });
    const gameRef = gamesRef.doc(gameID);

    const playersRef = gameRef.collection("players");
    const img = base64Encode("./__tests__/stock_img.jpg");
    const submitSnipeData = { gameIDs: [gameID], base64JPEG: img };

    const snipesRef = gameRef.collection("snipes");

    const sniper = await playersRef.doc(ownerUID).get();
    const { pictureID } = await submitSnipeWrapped(submitSnipeData, { auth: { uid: sniper.get("uid") } });
    const snipeRefs = await snipesRef.listDocuments();
    const snipes = await Promise.all(snipeRefs.map(ref => ref.get()));
    let snipe = snipes.filter(s => s.get("pictureID") === pictureID)[0];
    expect(snipe.get("votesFor")).toBe(0);
    expect(snipe.get("votesAgainst")).toBe(0);
    expect(snipe.get("status")).toBe(constants.snipeStatus.voting);

    let targetPlayer = await playersRef.doc(sniper.get("target")).get();
    expect(targetPlayer.get("pendingVotes").length).toBe(1);

    let snipePic = await snipePicsRef.doc(pictureID).get();
    expect(snipePic.exists).toBe(true);
    expect(snipePic.get("refCount")).toBe(1);

    const submitVoteData = { gameID: gameID, snipeID: snipe.get("snipeID"), vote: false };
    await submitVoteWrapped(submitVoteData, { auth: { uid: sniper.get("target") } });

    snipe = await snipe.ref.get();
    expect(snipe.get("votesFor")).toBe(0);
    expect(snipe.get("votesAgainst")).toBe(0);
    expect(snipe.get("status")).toBe(constants.snipeStatus.voting);

    targetPlayer = await targetPlayer.ref.get();
    expect(targetPlayer.get("pendingVotes").length).toBe(0);
    expect(targetPlayer.get("alive")).toBe(true);

    const otherPlayerUIDs = userIDs.filter(uid => uid !== targetPlayer.get("uid") && uid !== sniper.get("uid"));
    const otherPlayers = await Promise.all(otherPlayerUIDs.map(uid => playersRef.doc(uid).get()));
    otherPlayers.forEach(player => {
        expect(player.get("pendingVotes").length).toBe(1);
    });

    snipePic = await snipePic.ref.get();
    expect(snipePic.exists).toBe(true);
    expect(snipePic.get("refCount")).toBe(1);
    expect(Bucket.prototype.deleteFiles).not.toBeCalled();
    Bucket.prototype.deleteFiles.mockClear()

    let targetUser = await usersRef.doc(sniper.get("target")).get();
    expect(targetUser.get("deaths")).toBe(0);

    let sniperUser = await usersRef.doc(sniper.get("uid")).get();
    expect(sniperUser.get("kills")).toBe(0);

    let sniperPlayer = await playersRef.doc(sniper.get("uid")).get();
    expect(sniperPlayer.get("kills")).toBe(0);
    expect(sniperPlayer.get("target")).toBe(targetPlayer.get("uid"));
    expect(sniperPlayer.get("pendingVotes").length).toBe(0);

    let game = await gameRef.get();
    expect(game.get("numberAlive")).toBe(numPlayers);

    expect(game.get("status")).toBe(constants.gameStatus.started);

    for (let i = 0; i < otherPlayers.length / 2; ++i) {
        let player = otherPlayers[i];
        /* eslint-disable no-await-in-loop */
        const submitVoteData = { gameID: gameID, snipeID: snipe.get("snipeID"), vote: false };
        await submitVoteWrapped(submitVoteData, { auth: { uid: player.get("uid") } });

        snipe = await snipe.ref.get();
        expect(snipe.get("votesFor")).toBe(0);
        expect(snipe.get("votesAgainst")).toBe(i + 1);
        if (i + 1 >= otherPlayers.length / 2) {
            expect(snipe.get("status")).toBe(constants.snipeStatus.failure);
        } else {
            expect(snipe.get("status")).toBe(constants.snipeStatus.voting);
        }

        player = await player.ref.get();
        expect(player.get("pendingVotes").length).toBe(0);

        snipePic = await snipePic.ref.get();
        expect(snipePic.exists).toBe(true);
        expect(snipePic.get("refCount")).toBe(1);
        expect(Bucket.prototype.deleteFiles).not.toBeCalled();
        Bucket.prototype.deleteFiles.mockClear()

        let targetUser = await usersRef.doc(sniper.get("target")).get();
        expect(targetUser.get("deaths")).toBe(0);

        let sniperUser = await usersRef.doc(sniper.get("uid")).get();
        expect(sniperUser.get("kills")).toBe(0);

        let sniperPlayer = await playersRef.doc(sniper.get("uid")).get();
        expect(sniperPlayer.get("kills")).toBe(0);
        expect(sniperPlayer.get("target")).toBe(targetPlayer.get("uid"));
        expect(sniperPlayer.get("pendingVotes").length).toBe(0);

        let game = await gameRef.get();
        expect(game.get("numberAlive")).toBe(numPlayers);

        expect(game.get("status")).toBe(constants.gameStatus.started);
        /* eslint-enable no-await-in-loop */
    }

    const users = await Promise.all(userIDs.map(id => usersRef.doc(id).get()));
    await Promise.all(users.map(async user => {
        const currentGames = await user.ref.collection("currentGames").listDocuments();
        expect(currentGames.length).toBe(1);
        const completedGames = await user.ref.collection("completedGames").listDocuments();
        expect(completedGames.length).toBe(0);
        expect(user.get("gamesWon")).toBe(0);
    }));
});


test("minority vote no & majority vote yes leads to successful snipe", async () => {
    expect.assertions(9);
    const numPlayers = 6;
    const userIDs = await testUtils.addUsers(numPlayers, addUserWrapped);
    const [ownerUID, ...invitedUIDs] = userIDs;
    const gameID = await testUtils.createGame(ownerUID, invitedUIDs, 5, createGameWrapped);
    await startGameWrapped({ gameID: gameID }, { auth: { uid: ownerUID } });
    const gameRef = gamesRef.doc(gameID);

    const playersRef = gameRef.collection("players");
    const img = base64Encode("./__tests__/stock_img.jpg");
    const submitSnipeData = { gameIDs: [gameID], base64JPEG: img };
    const sniper = await playersRef.doc(ownerUID).get();
    const { pictureID } = await submitSnipeWrapped(submitSnipeData, { auth: { uid: sniper.get("uid") } });

    const snipesRef = gameRef.collection("snipes");
    const snipeRefs = await snipesRef.listDocuments();
    const snipes = await Promise.all(snipeRefs.map(ref => ref.get()));
    let snipe = snipes.filter(s => s.get("pictureID") === pictureID)[0];

    const voteNoData = { gameID: gameID, snipeID: snipe.get("snipeID"), vote: false };
    const voteYesData = { gameID: gameID, snipeID: snipe.get("snipeID"), vote: true };
    await submitVoteWrapped(voteNoData, { auth: { uid: sniper.get("target") } });

    snipe = await snipe.ref.get();
    expect(snipe.get("votesFor")).toBe(0);
    expect(snipe.get("votesAgainst")).toBe(0);
    expect(snipe.get("status")).toBe(constants.snipeStatus.voting);

    const voterUIDs = userIDs.filter(id => id !== sniper.get("uid") && id !== sniper.get("target"));
    const numMajority = voterUIDs.length / 2 + 1;
    const majorityVoters = voterUIDs.filter((_, idx) => idx < numMajority);
    const minorityVoters = voterUIDs.filter((_, idx) => idx >= numMajority);

    // submit votes sequentially to reduce chance of contention
    for (uid of minorityVoters) {
        /* eslint-disable no-await-in-loop */
        await submitVoteWrapped(voteNoData, { auth: { uid: uid } });
        /* eslint-enable no-await-in-loop */
    }

    snipe = await snipe.ref.get();
    expect(snipe.get("votesFor")).toBe(0);
    expect(snipe.get("votesAgainst")).toBe(minorityVoters.length);
    expect(snipe.get("status")).toBe(constants.snipeStatus.voting);

    // submit votes sequentially to reduce chance of contention
    for (uid of majorityVoters) {
        /* eslint-disable no-await-in-loop */
        await submitVoteWrapped(voteYesData, { auth: { uid: uid } });
        /* eslint-enable no-await-in-loop */
    }

    snipe = await snipe.ref.get();
    expect(snipe.get("votesFor")).toBe(majorityVoters.length);
    expect(snipe.get("votesAgainst")).toBe(minorityVoters.length);
    expect(snipe.get("status")).toBe(constants.snipeStatus.success);
});


test("half vote yes & half vote no leads to failed snipe", async () => {
    expect.assertions(9);
    const numPlayers = 6;
    const userIDs = await testUtils.addUsers(numPlayers, addUserWrapped);
    const [ownerUID, ...invitedUIDs] = userIDs;
    const gameID = await testUtils.createGame(ownerUID, invitedUIDs, 5, createGameWrapped);
    await startGameWrapped({ gameID: gameID }, { auth: { uid: ownerUID } });
    const gameRef = gamesRef.doc(gameID);

    const playersRef = gameRef.collection("players");
    const img = base64Encode("./__tests__/stock_img.jpg");
    const submitSnipeData = { gameIDs: [gameID], base64JPEG: img };
    const sniper = await playersRef.doc(ownerUID).get();
    const { pictureID } = await submitSnipeWrapped(submitSnipeData, { auth: { uid: sniper.get("uid") } });

    const snipesRef = gameRef.collection("snipes");
    const snipeRefs = await snipesRef.listDocuments();
    const snipes = await Promise.all(snipeRefs.map(ref => ref.get()));
    let snipe = snipes.filter(s => s.get("pictureID") === pictureID)[0];

    const voteNoData = { gameID: gameID, snipeID: snipe.get("snipeID"), vote: false };
    const voteYesData = { gameID: gameID, snipeID: snipe.get("snipeID"), vote: true };
    await submitVoteWrapped(voteNoData, { auth: { uid: sniper.get("target") } });

    snipe = await snipe.ref.get();
    expect(snipe.get("votesFor")).toBe(0);
    expect(snipe.get("votesAgainst")).toBe(0);
    expect(snipe.get("status")).toBe(constants.snipeStatus.voting);

    const voterUIDs = userIDs.filter(id => id !== sniper.get("uid") && id !== sniper.get("target"));
    const halfVoters = voterUIDs.filter((_, idx) => idx < voterUIDs.length / 2);
    const otherHalfVoters = voterUIDs.filter((_, idx) => idx >= voterUIDs.length / 2);

    // submit votes sequentially to reduce chance of contention
    for (uid of halfVoters) {
        /* eslint-disable no-await-in-loop */
        await submitVoteWrapped(voteYesData, { auth: { uid: uid } });
        /* eslint-enable no-await-in-loop */
    }

    snipe = await snipe.ref.get();
    expect(snipe.get("votesFor")).toBe(halfVoters.length);
    expect(snipe.get("votesAgainst")).toBe(0);
    expect(snipe.get("status")).toBe(constants.snipeStatus.voting);

    // submit votes sequentially to reduce chance of contention
    for (uid of otherHalfVoters) {
        /* eslint-disable no-await-in-loop */
        await submitVoteWrapped(voteNoData, { auth: { uid: uid } });
        /* eslint-enable no-await-in-loop */
    }

    snipe = await snipe.ref.get();
    expect(snipe.get("votesFor")).toBe(halfVoters.length);
    expect(snipe.get("votesAgainst")).toBe(halfVoters.length);
    expect(snipe.get("status")).toBe(constants.snipeStatus.failure);
});

