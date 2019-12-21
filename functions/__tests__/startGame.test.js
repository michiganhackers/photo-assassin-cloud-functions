// Imports
const admin = require("firebase-admin");
const testFunc = require("firebase-functions-test")();
const functions = require("../index");
const testUtils = require("./testUtilities");
const constants = require("../constants");

// Globals
const firestore = admin.firestore();
const gamesRef = firestore.collection("games");
const usersRef = firestore.collection("users");
const startGameWrapped = testFunc.wrap(functions.startGame);
const createGameWrapped = testFunc.wrap(functions.createGame);
const addUserWrapped = testFunc.wrap(functions.addUser);

afterEach(() => {
    testFunc.cleanup();
    return testUtils.clearFirestoreData();
});

test("game started w/ 4 players has valid default values", async () => {
    expect.assertions(44);

    const userIDs = await testUtils.addUsers(4, addUserWrapped);
    const [ownerUID, ...invitedUIDs] = userIDs;
    const maxPlayers = 5;
    const name = "testGame";
    const invitedUsersPromises = invitedUIDs.map(uid => usersRef.doc(uid).get());
    const invitedUsernames = await Promise.all(invitedUsersPromises)
        .then(vals => vals.map(user => user.get("username")));

    const createGamData = {
        maxPlayers: maxPlayers,
        name: name,
        invitedUsernames: invitedUsernames
    };
    const context = { auth: { uid: ownerUID } };
    const { gameID } = await createGameWrapped(createGamData, context);

    const startGameData = { gameID: gameID };
    const timeBeforeGameStarted = new Date();
    await startGameWrapped(startGameData, context);
    const game = await gamesRef.doc(gameID).get();

    const gameExpected = {
        maxPlayers: maxPlayers,
        name: name,
        status: constants.gameStatus.started,
        gameID: gameID,
        numberAlive: userIDs.length,
        numPlayers: userIDs.length
    };
    for (prop in gameExpected) {
        if (Object.prototype.hasOwnProperty.call(gameExpected, prop)) {
            expect(gameExpected[prop]).toEqual(game.get(prop));
        }
    }
    expect(game.get("startTime").toDate() >= timeBeforeGameStarted).toBe(true);

    const playersRefs = await game.ref.collection("players").listDocuments();
    expect(playersRefs.length).toBe(4);
    const players = await Promise.all(playersRefs.map(p => p.get()));
    players.forEach(player => {
        expect(player.get("kills")).toBe(0);
        expect(player.get("alive")).toBe(true);
        expect(player.get("pendingVotes").length).toBe(0);
        expect(player.get("target")).not.toBe(player.get("uid"));
        expect(player.get("sniper")).not.toBe(player.get("uid"));
        const target = players.filter(p => p.get("uid") === player.get("target"))[0];
        const sniper = players.filter(p => p.get("uid") === player.get("sniper"))[0];
        expect(target.get("sniper")).toBe(player.get("uid"));
        expect(sniper.get("target")).toBe(player.get("uid"));
    });

    const playerUserPromises = await userIDs.map(uid => usersRef.doc(uid).get());
    const playerUsers = await Promise.all(playerUserPromises);
    playerUsers.forEach(user => {
        const currentGames = user.get("currentGames");
        expect(currentGames.length).toBe(1);
        expect(currentGames).toContain(gameID);
    });
});

test("error thrown if same game started 2x", async () => {
    expect.assertions(1);

    const userIDs = await testUtils.addUsers(4, addUserWrapped);
    const [ownerUID, ...invitedUIDs] = userIDs;
    const gameID = await testUtils.createGame(ownerUID, invitedUIDs, 5, createGameWrapped);

    const startGameData = { gameID: gameID };
    const context = { auth: { uid: ownerUID } };
    await startGameWrapped(startGameData, context);

    let errorThrown = false;
    try {
        await startGameWrapped(startGameData, context);
    } catch (e) {
        errorThrown = true;
    }
    expect(errorThrown).toBe(true);
});

test("error thrown if non-owner tries to start game", async () => {
    expect.assertions(1);

    const userIDs = await testUtils.addUsers(4, addUserWrapped);
    const [ownerUID, ...invitedUIDs] = userIDs;
    const gameID = await testUtils.createGame(ownerUID, invitedUIDs, 5, createGameWrapped);

    const startGameData = { gameID: gameID };
    const context0 = { auth: { uid: ownerUID } };
    await startGameWrapped(startGameData, context0);

    let errorThrown = false;
    try {
        const context1 = { auth: { uid: invitedUIDs[0] } };
        await startGameWrapped(startGameData, context1);
    } catch (e) {
        errorThrown = true;
    }
    expect(errorThrown).toBe(true);
});

test("make sure starting multiple games show up in currentGames", async () => {
    expect.assertions(12);

    const userIDs = await testUtils.addUsers(4, addUserWrapped);
    const [ownerUID, ...invitedUIDs] = userIDs;
    const createGamePromises = [1, 2, 3].map(_ => testUtils.createGame(ownerUID, invitedUIDs, 5, createGameWrapped));
    const gameIDs = await Promise.all(createGamePromises);

    const context = { auth: { uid: ownerUID } };
    await Promise.all(gameIDs.map(id => startGameWrapped({ gameID: id }, context)))

    const users = await Promise.all(userIDs.map(id => usersRef.doc(id).get()));
    users.forEach(user => {
        gameIDs.forEach(gameID => {
            expect(user.get("currentGames")).toContain(gameID);
        });
    });
});
