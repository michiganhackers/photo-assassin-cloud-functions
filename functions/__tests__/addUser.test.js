// Imports
const admin = require("firebase-admin");
const testFunc = require("firebase-functions-test")();
const functions = require("../index");
const testUtils = require("./testUtilities");
const constants = require("../constants");

// Globals
const firestore = admin.firestore();
const usersRef = firestore.collection("users");
const addUserWrapped = testFunc.wrap(functions.addUser);

afterEach(() => {
    testFunc.cleanup();
    return testUtils.clearFirestoreData();;
});

test("addUser creates a user with given display name & username (lowercased) and correct default values", async () => {
    expect.assertions(2);

    const displayName = "testDisplayName";
    const username = "testUsername";
    const uid = "testUserID";
    const data = { displayName: displayName, username: username };
    const context = { auth: { uid: uid } };

    const resultExpected = {
        errorCode: constants.errorCode.ok
    };
    const result = await addUserWrapped(data, context);
    expect(result).toEqual(resultExpected);

    const userExpected = {
        deaths: 0,
        displayName: displayName,
        username: username.toLowerCase(),
        id: uid,
        kills: 0,
        longestLifeSeconds: 0
    };
    const user = await usersRef.doc("testUserID").get();
    expect(user.data()).toEqual(userExpected);
});

test("error thrown if unauthenticated", async () => {
    expect.assertions(1);

    let errorThrown = false;
    try {
        await addUserWrapped({ displayName: "test" }, { auth: null });
    } catch (e) {
        errorThrown = true;
    }
    expect(errorThrown).toBe(true);

});

test("addUser doesn't allow duplicate usernames", async () => {
    expect.assertions(2);

    const displayName = "testDisplayName";
    const username = "testUsername";
    const uid0 = "testUserID0";
    const data = { displayName: displayName, username: username };
    const context0 = { auth: { uid: uid0 } };

    const resultExpected0 = {
        errorCode: constants.errorCode.ok
    };
    const result0 = await addUserWrapped(data, context0);
    expect(result0).toEqual(resultExpected0);

    const uid1 = "testUserID1";
    const context1 = { auth: { uid: uid1 } };
    const resultExpected1 = {
        errorCode: constants.errorCode.duplicateUsername
    };
    const result1 = await addUserWrapped(data, context1);
    expect(result1).toEqual(resultExpected1);
});


test("addUser doesn't allow usernames differing only in case", async () => {
    expect.assertions(2);

    const displayName = "testDisplayName";
    const username0 = "testUsername";
    const uid0 = "testUserID0";
    const data0 = { displayName: displayName, username: username0 };
    const context0 = { auth: { uid: uid0 } };

    const resultExpected0 = {
        errorCode: constants.errorCode.ok
    };
    const result0 = await addUserWrapped(data0, context0);
    expect(result0).toEqual(resultExpected0);

    const username1 = "testusername";
    const uid1 = "testUserID1";
    const data1 = { displayName: displayName, username: username1 };
    const context1 = { auth: { uid: uid1 } };
    const resultExpected1 = {
        errorCode: constants.errorCode.duplicateUsername
    };
    const result1 = await addUserWrapped(data1, context1);
    expect(result1).toEqual(resultExpected1);
});