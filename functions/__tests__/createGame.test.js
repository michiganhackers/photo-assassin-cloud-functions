// Imports
const admin = require("firebase-admin");
const testFunc = require("firebase-functions-test")();
const functions = require("../index");
const testUtils = require("./testUtilities");
const {isValidUniqueString} = require("../utilities");
const constants = require("../constants");

// Globals
const firestore = admin.firestore();
const gamesRef = firestore.collection("games");
const createGameWrapped = testFunc.wrap(functions.createGame);
const addUserWrapped = testFunc.wrap(functions.addUser);

afterEach(() => {
    testFunc.cleanup();
    return testUtils.clearFirestoreData();;
});

test("game created w/ single user has valid default values", async () => {
    expect.assertions(6);

    const [uid] = await testUtils.addUsers(1, addUserWrapped);
    const maxPlayers = 5;
    const name = "testGame";
    const invitedUsernames = [];
    const data = {
        maxPlayers: maxPlayers,
        name: name,
        invitedUsernames: invitedUsernames
    };
    const context = { auth: { uid: uid } };
    const {gameID} = await createGameWrapped(data, context);

    expect(isValidUniqueString(gameID)).toBe(true);
    const game = await gamesRef.doc(gameID).get();
    expect(game.exists).toBe(true);

    const gameExpected = {
        maxPlayers: maxPlayers,
        name: name,
        status: constants.gameStatus.notStarted,
        gameID: gameID
    };
    expect(game.data()).toEqual(gameExpected);

    const players = await game.ref.collection("players").listDocuments();
    expect(players.length).toBe(1);
    expect(players[0].id).toBe(uid);

    const player = await players[0].get();
    const playerExpected = {isOwner: true, uid: uid};
    expect(player.data()).toEqual(playerExpected);
});
