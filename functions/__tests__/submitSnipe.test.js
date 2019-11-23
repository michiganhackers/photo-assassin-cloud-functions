// Imports
const admin = require("firebase-admin");
const testFunc = require("firebase-functions-test")();
const functions = require("../index");
const testUtils = require("./testUtilities");
const constants = require("../constants");
const {base64Encode, isValidUniqueString} = require("../utilities.js");

// Globals
const firestore = admin.firestore();
const gamesRef = firestore.collection("games");
const usersRef = firestore.collection("users");
const snipePicsRef = firestore.collection("snipePictures");
const startGameWrapped = testFunc.wrap(functions.startGame);
const createGameWrapped = testFunc.wrap(functions.createGame);
const addUserWrapped = testFunc.wrap(functions.addUser);
const submitSnipeWrapped = testFunc.wrap(functions.submitSnipe);

afterEach(() => {
    testFunc.cleanup();
    return testUtils.clearFirestoreData();
});

test("submitting snipe to one game has valid default values", async () => {
    expect.assertions(16);

    const userIDs = await testUtils.addUsers(4, addUserWrapped);
    const [ownerUID, ...invitedUIDs] = userIDs;
    const gameID = await testUtils.createGame(ownerUID, invitedUIDs, 5, createGameWrapped);
    const context = {auth: {uid: ownerUID}};
    await startGameWrapped({ gameID: gameID }, context);
    
    const playersRef = gamesRef.doc(gameID).collection("players");
    const ownerPlayer = await playersRef.doc(ownerUID).get();
    const img = base64Encode("./__tests__/stock_img.jpg");
    const timeBeforeSnipe = new Date();
    const data = {gameIDs: [gameID], base64JPEG: img};
    const {pictureID} = await submitSnipeWrapped(data, context);
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
