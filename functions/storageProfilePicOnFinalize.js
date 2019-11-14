// Imports
const admin = require("firebase-admin");
const functions = require("firebase-functions");
const path = require("path");
const { getReadableImageUrl } = require("./utilities");

// Globals
const firestore = admin.firestore();
const usersRef = firestore.collection("users");

module.exports = functions.storage.object().onFinalize(async (object) => {
  if (!object.contentType.startsWith("image/")) {
    return console.log("Not an image");
  }
  const filePath = object.name;
  const dirPath = filePath.substring(0, filePath.lastIndexOf("/"));
  if (dirPath !== "images/profile_pictures") {
    return console.log("Not a profile picture");
  }

  const bucket = admin.storage().bucket(object.bucket);
  const uid = path.basename(filePath);
  try {
    const url = await getReadableImageUrl(bucket, filePath);
    await usersRef.doc(uid).update({ profilePicUrl: url });
  }
  catch (e) {
    return console.error(`Failed to update profilePicUrl for user with id ${uid}`);
  }
  return null;
});