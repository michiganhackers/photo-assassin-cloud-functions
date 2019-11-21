// Imports
const admin = require("firebase-admin");
const test_func = require("firebase-functions-test")();
const functions = require("../index");
const testUtils = require("./utilities");

// Globals
const firestore = admin.firestore();

afterEach(() => {
    test_func.cleanup();
    return testUtils.deleteFirestore(firestore);
});

describe("recursiveDelete", () => {
    test("recursiveDelete('tests') deletes all documents in tests collection", async () => {
        expect.assertions(6);

        const testsRef = firestore.collection("tests");
        const addDocPromises = [];
        for (let testNum = 0; testNum < 3; ++testNum) {
            addDocPromises.push(testsRef.add({ na: "na" }));
        }
        const docRefs = await Promise.all(addDocPromises);

        const docsBefore = await Promise.all(docRefs.map(ref => ref.get()));
        docsBefore.forEach(doc => expect(doc.exists).toBe(true));

        await testUtils.recursiveDelete(testsRef.path, firestore);
        const docsAfter = await Promise.all(docRefs.map(ref => ref.get()));
        docsAfter.forEach(doc => expect(doc.exists).toBe(false));
    });

    test("recursiveDelete('tests') deletes docs in tests collection and subtests subcollections", async () => {
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

        await testUtils.recursiveDelete(testsRef.path, firestore);
        const docsAfter = await Promise.all(allDocRefs.map(ref => ref.get()));
        docsAfter.forEach(doc => expect(doc.exists).toBe(false));
    });

    test("deleteFirestore(firestore) deletes all root collections", async () => {
        expect.assertions(6)

        const addDocPromises = []
        for (let collectionNum = 0; collectionNum < 3; ++collectionNum) {
            const testsRef = firestore.collection(`tests${collectionNum}`);
            addDocPromises.push(testsRef.add({ na: "na" }));
        }
        const docRefs = await Promise.all(addDocPromises);

        const docsBefore = await Promise.all(docRefs.map(ref => ref.get()));
        docsBefore.forEach(doc => expect(doc.exists).toBe(true));

        await testUtils.deleteFirestore(firestore);
        const docsAfter = await Promise.all(docRefs.map(ref => ref.get()));
        docsAfter.forEach(doc => expect(doc.exists).toBe(false));
    });
});

describe("addUsers", () => {
    const usersRef = firestore.collection("users");
    const addUserWrapped = test_func.wrap(functions.addUser);

    test("addUsers(3, addUser) returns 3 uids", async () => {
        expect.assertions(1);

        const uids = await testUtils.addUsers(3, addUserWrapped);
        expect(uids.length).toBe(3);
    });

    test("addUsers(3, addUser) creates 3 user documents", async () => {
        expect.assertions(3);

        await testUtils.addUsers(3, addUserWrapped);
        const userDocRefs = await usersRef.listDocuments();
        const userDocPromises = userDocRefs.map(ref => ref.get());
        const userDocs = await Promise.all(userDocPromises);
        userDocs.forEach(doc => expect(doc.exists).toBe(true));
    });
});