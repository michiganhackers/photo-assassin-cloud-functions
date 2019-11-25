// Imports
const admin = require("firebase-admin");
const testFunc = require("firebase-functions-test")();
const functions = require("../index");
const testUtils = require("./testUtilities");

// Globals
const firestore = admin.firestore();

afterEach(() => {
    testFunc.cleanup();
    return testUtils.clearFirestoreData();
});

describe("clearFirestoreData", () => {
    test("clearFirestoreData() deletes all documents in tests collection", async () => {
        expect.assertions(6);

        const testsRef = firestore.collection("tests");
        const addDocPromises = [];
        for (let testNum = 0; testNum < 3; ++testNum) {
            addDocPromises.push(testsRef.add({ na: "na" }));
        }
        const docRefs = await Promise.all(addDocPromises);

        const docsBefore = await Promise.all(docRefs.map(ref => ref.get()));
        docsBefore.forEach(doc => expect(doc.exists).toBe(true));

        await testUtils.clearFirestoreData();
        const docsAfter = await Promise.all(docRefs.map(ref => ref.get()));
        docsAfter.forEach(doc => expect(doc.exists).toBe(false));
    });

    test("clearFirestoreData() deletes docs in tests collection and subtests subcollections", async () => {
        expect.assertions(12)

        const testsRef = firestore.collection("tests");
        const addDocPromises = [];
        for (let testNum = 0; testNum < 3; ++testNum) {
            addDocPromises.push(testsRef.add({ na: "na" }));
        }
        const docRefs = await Promise.all(addDocPromises);

        const subDocRefs = await Promise.all(docRefs.map(ref => ref.collection("subtests").add({ na: "na" })));
        const allDocRefs = [...docRefs, ...subDocRefs];
        const docsBefore = await Promise.all(allDocRefs.map(ref => ref.get()));
        docsBefore.forEach(doc => expect(doc.exists).toBe(true));
        const addUserWrapped = testFunc.wrap(functions.addUser);

        await testUtils.clearFirestoreData();
        const docsAfter = await Promise.all(allDocRefs.map(ref => ref.get()));
        docsAfter.forEach(doc => expect(doc.exists).toBe(false));
    });

    test("clearFirestoreData() deletes all root collections", async () => {
        expect.assertions(6)

        const addDocPromises = []
        for (let collectionNum = 0; collectionNum < 3; ++collectionNum) {
            const testsRef = firestore.collection(`tests${collectionNum}`);
            addDocPromises.push(testsRef.add({ na: "na" }));
        }
        const docRefs = await Promise.all(addDocPromises);

        const docsBefore = await Promise.all(docRefs.map(ref => ref.get()));
        docsBefore.forEach(doc => expect(doc.exists).toBe(true));

        await testUtils.clearFirestoreData();
        const docsAfter = await Promise.all(docRefs.map(ref => ref.get()));
        docsAfter.forEach(doc => expect(doc.exists).toBe(false));
    });
});

describe("addUsers", () => {
    const usersRef = firestore.collection("users");
    const addUserWrapped = testFunc.wrap(functions.addUser);

    test("addUsers(3, addUser) creates 3 user documents", async () => {
        expect.assertions(4);

        const uids = await testUtils.addUsers(3, addUserWrapped);
        expect(uids.length).toBe(3);

        const userDocRefs = await usersRef.listDocuments();
        const userDocPromises = userDocRefs.map(ref => ref.get());
        const userDocs = await Promise.all(userDocPromises);
        userDocs.forEach(doc => expect(doc.exists).toBe(true));
    });
});

describe("createGame", () => {
    const addUserWrapped = testFunc.wrap(functions.addUser);
    const createGameWrapped = testFunc.wrap(functions.createGame);
    const gamesRef = firestore.collection("games");

    test("createGame() creates a game document", async () => {
        expect.assertions(1);

        const [ownerUID, ...invitedUIDs] = await testUtils.addUsers(3, addUserWrapped);
        const gameID = await testUtils.createGame(ownerUID, invitedUIDs, 5, createGameWrapped);
        const game = await gamesRef.doc(gameID).get();
        expect(game.exists).toBe(true);
    });
});