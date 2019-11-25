// Imports
const admin = require("firebase-admin");
const { Bucket } = require("@google-cloud/storage");
const testFunc = require("firebase-functions-test")();
const functions = require("../index");
const testUtils = require("./testUtilities");
const constants = require("../constants");
const { base64Encode, isValidUniqueString } = require("../utilities");

// Globals
const firestore = admin.firestore();
const gamesRef = firestore.collection("games");
const usersRef = firestore.collection("users");
const snipePicsRef = firestore.collection("snipePictures");
const startGameWrapped = testFunc.wrap(functions.startGame);
const createGameWrapped = testFunc.wrap(functions.createGame);
const addUserWrapped = testFunc.wrap(functions.addUser);
const submitSnipeWrapped = testFunc.wrap(functions.submitSnipe);


beforeAll(() => {
    const mockUpload = jest.fn().mockResolvedValue(null);
    Bucket.prototype.upload = mockUpload;
    const mockDelete = jest.fn().mockResolvedValue(null);
    Bucket.prototype.deleteFiles = mockDelete;
});

afterEach(() => {
    testFunc.cleanup();
    Bucket.prototype.upload.mockClear()
    Bucket.prototype.deleteFiles.mockClear()
    return testUtils.clearFirestoreData();
});

test("submitting snipe to one game has valid default values", async () => {
    expect.assertions(17);

    const userIDs = await testUtils.addUsers(4, addUserWrapped);
    const [ownerUID, ...invitedUIDs] = userIDs;
    const gameID = await testUtils.createGame(ownerUID, invitedUIDs, 5, createGameWrapped);
    const context = { auth: { uid: ownerUID } };
    await startGameWrapped({ gameID: gameID }, context);

    const playersRef = gamesRef.doc(gameID).collection("players");
    const ownerPlayer = await playersRef.doc(ownerUID).get();
    const img = base64Encode("./__tests__/stock_img.jpg");
    const timeBeforeSnipe = new Date();
    const data = { gameIDs: [gameID], base64JPEG: img };
    const { pictureID } = await submitSnipeWrapped(data, context);
    expect(Bucket.prototype.upload).toBeCalled();
    Bucket.prototype.upload.mockClear()
    expect(isValidUniqueString(pictureID)).toBe(true);

    const snipesRef = gamesRef.doc(gameID).collection("snipes");
    const snipeRefs = await snipesRef.listDocuments();
    expect(snipeRefs.length).toBe(1);
    const snipe = await snipeRefs[0].get();
    const snipeExpected = {
        sniper: ownerUID,
        status: constants.snipeStatus.voting,
        target: ownerPlayer.get("target"),
        votesAgainst: 0,
        votesFor: 0,
        pictureID: pictureID
    };
    for (prop in snipeExpected) {
        if (Object.prototype.hasOwnProperty.call(snipeExpected, prop)) {
            expect(snipeExpected[prop]).toEqual(snipe.get(prop));
        }
    }
    expect(isValidUniqueString(snipe.get("snipeID"))).toBe(true);
    expect(typeof snipe.get("snipePicUrl")).toBe("string");
    expect(snipe.get("time").toDate() >= timeBeforeSnipe).toBe(true);

    const targetPlayer = await playersRef.doc(ownerPlayer.get("target")).get();
    expect(targetPlayer.get("pendingVotes").length).toBe(1);
    expect(targetPlayer.get("pendingVotes")).toContain(snipe.get("snipeID"));

    const snipePic = await snipePicsRef.doc(pictureID).get();
    expect(snipePic.exists).toBe(true);
    expect(isValidUniqueString(snipePic.get("pictureID"))).toBe(true);
    expect(snipePic.get("refCount")).toBe(1);
});

test("submitting snipe to 3 games has valid default values", async () => {
    expect.assertions(41);

    const userIDs = await testUtils.addUsers(4, addUserWrapped);
    const [ownerUID, ...invitedUIDs] = userIDs;
    const createGamePromises = [1, 2, 3].map(_ => testUtils.createGame(ownerUID, invitedUIDs, 5, createGameWrapped));
    let gameIDs = await Promise.all(createGamePromises);

    const context = { auth: { uid: ownerUID } };
    const startGamePromises = gameIDs.map(id => startGameWrapped({ gameID: id }, context));
    await Promise.all(startGamePromises);

    const img = base64Encode("./__tests__/stock_img.jpg");
    const timeBeforeSnipe = new Date();
    const data = { gameIDs: gameIDs, base64JPEG: img };
    const { pictureID } = await submitSnipeWrapped(data, context);
    expect(Bucket.prototype.upload).toBeCalled();
    Bucket.prototype.upload.mockClear()
    expect(isValidUniqueString(pictureID)).toBe(true);

    const checkSnipePromises = gameIDs.map(async gameID => {
        const playersRef = gamesRef.doc(gameID).collection("players");
        const ownerPlayer = await playersRef.doc(ownerUID).get();

        const snipesRef = gamesRef.doc(gameID).collection("snipes");
        const snipeRefs = await snipesRef.listDocuments();
        expect(snipeRefs.length).toBe(1);
        const snipe = await snipeRefs[0].get();
        const snipeExpected = {
            sniper: ownerUID,
            status: constants.snipeStatus.voting,
            target: ownerPlayer.get("target"),
            votesAgainst: 0,
            votesFor: 0,
            pictureID: pictureID
        };
        for (prop in snipeExpected) {
            if (Object.prototype.hasOwnProperty.call(snipeExpected, prop)) {
                expect(snipeExpected[prop]).toEqual(snipe.get(prop));
            }
        }
        expect(isValidUniqueString(snipe.get("snipeID"))).toBe(true);
        expect(typeof snipe.get("snipePicUrl")).toBe("string");
        expect(snipe.get("time").toDate() >= timeBeforeSnipe).toBe(true);

        const targetPlayer = await playersRef.doc(ownerPlayer.get("target")).get();
        expect(targetPlayer.get("pendingVotes").length).toBe(1);
        expect(targetPlayer.get("pendingVotes")).toContain(snipe.get("snipeID"));
    });

    await Promise.all(checkSnipePromises);

    const snipePic = await snipePicsRef.doc(pictureID).get();
    expect(snipePic.exists).toBe(true);
    expect(isValidUniqueString(snipePic.get("pictureID"))).toBe(true);
    expect(snipePic.get("refCount")).toBe(3);
});


test("invalid snipes don't prevent other snipes from going through", async () => {
    expect.assertions(6);

    const userIDs = await testUtils.addUsers(4, addUserWrapped);
    const [ownerUID, ...invitedUIDs] = userIDs;
    const createGamePromises = [1, 2, 3].map(_ => testUtils.createGame(ownerUID, invitedUIDs, 5, createGameWrapped));
    let gameIDs = await Promise.all(createGamePromises);

    const context = { auth: { uid: ownerUID } };
    const startGamePromises = gameIDs.map(id => startGameWrapped({ gameID: id }, context));
    await Promise.all(startGamePromises);

    // One game has ended
    const endedGameRef = gamesRef.doc(gameIDs[0]);
    await endedGameRef.update({ status: constants.gameStatus.ended });

    // Owner isn't alive in one game
    const deadOwnerGameRef = gamesRef.doc(gameIDs[1]);
    const deadOwnerPlayersRef = deadOwnerGameRef.collection("players");
    await deadOwnerPlayersRef.doc(ownerUID).update({ alive: false });

    // One game the snipe should actually go through
    const validSnipeGameRef = gamesRef.doc(gameIDs[2]);

    const img = base64Encode("./__tests__/stock_img.jpg");
    const data = { gameIDs: gameIDs, base64JPEG: img };
    const { pictureID } = await submitSnipeWrapped(data, context);
    expect(Bucket.prototype.upload).toBeCalled();
    Bucket.prototype.upload.mockClear()

    // Snipes shouldn't go through for ended game or game where sniper isn't alive
    const checkInvalidSnipePromises = [endedGameRef, deadOwnerGameRef].map(async gameRef => {
        const snipesRef = gameRef.collection("snipes");
        const snipeRefs = await snipesRef.listDocuments();
        expect(snipeRefs.length).toBe(0);
    });
    await Promise.all(checkInvalidSnipePromises)

    // Snipe should go through on validSnipeGame
    const validSnipesRef = validSnipeGameRef.collection("snipes");
    const validSnipeRefs = await validSnipesRef.listDocuments();
    expect(validSnipeRefs.length).toBe(1);

    const snipePic = await snipePicsRef.doc(pictureID).get();
    expect(snipePic.exists).toBe(true);
    expect(snipePic.get("refCount")).toBe(1);
});

test("delete snipe pic if all snipes are invalid", async () => {
    expect.assertions(4);

    const userIDs = await testUtils.addUsers(4, addUserWrapped);
    const [ownerUID, ...invitedUIDs] = userIDs;
    const createGamePromises = [1, 2, 3].map(_ => testUtils.createGame(ownerUID, invitedUIDs, 5, createGameWrapped));
    let gameIDs = await Promise.all(createGamePromises);

    const context = { auth: { uid: ownerUID } };
    const startGamePromises = gameIDs.map(id => startGameWrapped({ gameID: id }, context));
    await Promise.all(startGamePromises);

    const setDeadPromises = gameIDs.map(async gameID => {
        const playersRef = gamesRef.doc(gameID).collection("players");
        await playersRef.doc(ownerUID).update({ alive: false });
    });
    await Promise.all(setDeadPromises);

    const img = base64Encode("./__tests__/stock_img.jpg");
    const data = { gameIDs: gameIDs, base64JPEG: img };
    const { pictureID } = await submitSnipeWrapped(data, context);
    expect(Bucket.prototype.upload).toBeCalled();
    Bucket.prototype.upload.mockClear()
    expect(Bucket.prototype.deleteFiles).toBeCalled();
    Bucket.prototype.deleteFiles.mockClear()

    const snipePic = await snipePicsRef.doc(pictureID).get();
    expect(snipePic.exists).toBe(true);
    expect(snipePic.get("refCount")).toBe(0);
});