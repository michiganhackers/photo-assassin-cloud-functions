// Imports
const admin = require("firebase-admin");
const functions = require("firebase-functions");
const path = require("path");

// Globals
const firestore = admin.firestore();
const usersRef = firestore.collection("users");

module.exports = functions.storage.object().onFinalize(async (object) => {
  if(!object.contentType.startsWith("image/")){
      return console.log("Not an image");
  }
  const filePath = object.name;
  const dirPath = filePath.substring(0, filePath.lastIndexOf("/"));
  if(dirPath !== "images/profile_pictures"){
      return console.log("Not a profile picture");
  }

  const bucket = admin.storage().bucket(object.bucket);
  // Cannot get download url like you can with the client SDK
  // Only difference is that you can't revoke the url from the Firebase Console
  await bucket.file(filePath).makePublic();
  // url is in the following format:
  // http://storage.googleapis.com/[BUCKET_NAME]/[OBJECT_NAME]
  const url = `https://storage.googleapis.com/${object.bucket}/${filePath}`
  const uid = path.basename(filePath);
  usersRef.doc(uid).update({profilePicUrl: url});
  return null;

});
