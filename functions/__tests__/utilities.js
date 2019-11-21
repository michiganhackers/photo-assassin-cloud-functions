// deletes all documents at and the below the given document or collection reference
exports.recursiveDelete = async (path, firestore) => {
    const segments = path.split("/");
    // Document
    if (segments.length % 2 === 0) {
        const docRef = firestore.doc(path);
        const subCollections = await docRef.listCollections();
        const recDelPromises = subCollections.map(collection => this.recursiveDelete(collection.path, firestore));
        return Promise.all([...recDelPromises, docRef.delete()]);
    }
    // Collection
    else {
        const docRefs = await firestore.collection(path).listDocuments();
        const recDelPromises = docRefs.map(docRef => this.recursiveDelete(docRef.path, firestore))
        return Promise.all(recDelPromises)
    }
}

// deletes all the data in firestore
exports.deleteFirestore = async (firestore) => {
    const rootCollections = await firestore.listCollections();
    const deletePromises = rootCollections.map(collection => this.recursiveDelete(collection.path, firestore));
    return Promise.all(deletePromises);
}


// calls addUserFunc numUsers times and returns the uids
// of the users created
exports.addUsers = (numUsers, addUserFunc) => {
    const addUserPromises = []
    for (let userNum = 0; userNum < numUsers; ++userNum) {
        const data = { displayName: `testUser${userNum}` };
        const context = { auth: { uid: `testUserID${userNum}` } };
        addUserPromises.push(addUserFunc(data, context));
    }
    return Promise.all(addUserPromises)
        .then(values => values.map((_, idx) => `testUserID${idx}`));
}
