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
    expect.assertions(124);
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
    users.forEach(user => {
        expect(user.get("currentGames").length).toBe(0);
        expect(user.get("completedGames").length).toBe(1);
    });
});

test("unsuccessful snipe", async () => {
    expect.assertions(76);
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

    otherPlayerUIDs = userIDs.filter(uid => uid !== targetPlayer.get("uid") && uid !== sniper.get("uid"));
    otherPlayers = await Promise.all(otherPlayerUIDs.map(uid => playersRef.doc(uid).get()));
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

    for (let i = 0; i < otherPlayers.length; ++i) {
        let player = otherPlayers[i];
        /* eslint-disable no-await-in-loop */
        const submitVoteData = { gameID: gameID, snipeID: snipe.get("snipeID"), vote: false };
        await submitVoteWrapped(submitVoteData, { auth: { uid: player.get("uid") } });

        snipe = await snipe.ref.get();
        expect(snipe.get("votesFor")).toBe(0);
        expect(snipe.get("votesAgainst")).toBe(i + 1);
        // - 2 because don't include sniper or target
        if (i + 1 > numPlayers - 2) {
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
    users.forEach(user => {
        expect(user.get("currentGames").length).toBe(1);
        expect(typeof user.get("completedGames") === "undefined" || !user.get("completedGames").length).toBe(true);
    });
});
