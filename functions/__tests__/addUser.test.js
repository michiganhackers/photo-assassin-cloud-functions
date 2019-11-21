// Imports
const admin = require("firebase-admin");
const testFunc = require("firebase-functions-test")();
const functions = require("../index");
const testUtils = require("./testUtilities");

// Globals
const firestore = admin.firestore();
const usersRef = firestore.collection("users");
const addUserWrapped = testFunc.wrap(functions.addUser);

afterEach(() => {
    testFunc.cleanup();
    return testUtils.clearFirestoreData();;
});

test("addUser creates a user with given display name and correct default values", async () => {
    expect.assertions(1);

    const displayName = "testDisplayName";
    const uid = "testUserID";
    const data = { displayName: displayName };
    const context = { auth: { uid: uid } };
    await addUserWrapped(data, context)

    const userExpected = {
        deaths: 0,
        displayName: displayName,
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