// Imports
const admin = require("firebase-admin");
const testFunc = require("firebase-functions-test")();
const functions = require("../index");
const testUtils = require("./testUtilities");
const { isValidUniqueString } = require("../utilities");
const constants = require("../constants");

// Globals
const firestore = admin.firestore();
const gamesRef = firestore.collection("games");
const usersRef = firestore.collection("users");
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
    const { gameID } = await createGameWrapped(data, context);

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

    const playersRefs = await game.ref.collection("players").listDocuments();
    expect(playersRefs.length).toBe(1);
    expect(playersRefs[0].id).toBe(uid);

    const player = await playersRefs[0].get();
    const playerExpected = { isOwner: true, uid: uid };
    expect(player.data()).toEqual(playerExpected);
});

test("game created w/ 3 invited players contains 4 players w/ valid default values", async () => {
    expect.assertions(12);

    const userIDs = await testUtils.addUsers(4, addUserWrapped);
    const [ownerUID, ...invitedUIDs] = userIDs;
    const maxPlayers = 5;
    const name = "testGame";
    const invitedUsersPromises = invitedUIDs.map(uid => usersRef.doc(uid).get());
    const invitedUsernames = await Promise.all(invitedUsersPromises)
        .then(vals => vals.map(user => user.get("username")));

    const data = {
        maxPlayers: maxPlayers,
        name: name,
        invitedUsernames: invitedUsernames
    };
    const context = { auth: { uid: ownerUID } };
    const { gameID } = await createGameWrapped(data, context);

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

    const playersRefs = await game.ref.collection("players").listDocuments();
    expect(playersRefs.length).toBe(4);
    playersRefs.forEach(playerRef => {
        expect(userIDs).toContain(playerRef.id);
    });

    const players = await Promise.all(playersRefs.map(p => p.get()));
    const playersExpected = userIDs.map(uid => { return { isOwner: uid === ownerUID, uid: uid } });
    players.forEach(player => {
        expect(playersExpected).toContainEqual(player.data());
    });
});
