// Imports
const admin = require("firebase-admin");
const test_func = require("firebase-functions-test")();
const functions = require("../index");
const testUtils = require("./utilities");

// Globals
const firestore = admin.firestore();
const usersRef = firestore.collection("users");
const addUserWrapped = test_func.wrap(functions.addUser);

afterEach(() => {
    test_func.cleanup();
    return testUtils.deleteFirestore(firestore);
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