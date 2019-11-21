// Exports

// Implementation of Fisher-Yates shuffle, based on
//  https://en.wikipedia.org/wiki/Fisher%E2%80%93Yates_shuffle
exports.shuffle = (array) => {
  let temp, swapIndex;
  for (let i = array.length - 1; i >= 0; --i) {
    swapIndex = Math.floor(Math.random() * (i + 1));
    temp = array[i];
    array[i] = array[swapIndex];
    array[swapIndex] = temp;
  }
};

const uniqueStringDictionary =
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789".split("");
// The string length should allow for about 10^32 possiblities.
const uniqueStringLength =
  Math.ceil(73.68 / Math.log(uniqueStringDictionary.length));

exports.generateUniqueString = () => {
  let string = "";
  for (let i = 0; i < uniqueStringLength; ++i) {
    string += uniqueStringDictionary[
      Math.floor(Math.random() * uniqueStringDictionary.length)
    ];
  }
  return string;
};

exports.isValidUniqueString = (string) => {
  return typeof string === "string" &&
    string.length === uniqueStringLength &&
    !(/[^0-9a-zA-Z]/).test(string);
};

exports.assert = (condition) => {
  if (!condition) {
    throw new Error("Assertion failed");
  }
};

const minDisplayNameLength = 5;
const maxDisplayNameLength = 20;
exports.isValidDisplayName = (displayName) => {
  // Reference https://regex101.com/r/gY7rO4/348 for the regex
  // Display name must have only alphanumeric characters, spaces, hyphens, and apostrophes. 
  // It also can’t begin or end with a space, hyphen, or apostrophe.
  const re = RegExp("^(?![- '])(?![×Þß÷þø])[- '0-9a-zÀ-ÿ]+(?<![- '])$", "i");
  return typeof displayName === "string" &&
    re.test(displayName) &&
    displayName.length >= minDisplayNameLength &&
    displayName.length <= maxDisplayNameLength;
}


exports.getReadableImageUrl = (bucket, remoteFilePath) => {
  // getSignedUrl returns the same url given the same input with
  // the same file, so partially randomize the expiration date
  // to produce a semi-unique url
  // Note that all urls that refer to the same remoteFilePath will
  // remain valid, even if the file changes
  const expires = `01-01-${Math.floor(Math.random() * 10000) + 2500}`
  const signedUrl = bucket.file(remoteFilePath).getSignedUrl({
    action: "read",
    expires: expires
  }).then(signedUrls => signedUrls[0]);
  signedUrl.catch(e => {
    console.error(`Failed to create signed url for file ${remoteFilePath}`);
    throw e;
  })
  return signedUrl;
}

// useful when you want Promise.all() to fulfill when all promises
// in the given iterable are no longer pending
// e.g.
// var arr = [ fetch('index.html'), fetch('http://does-not-exist') ]
// Promise.all(arr.map(reflect)).then(function(results){
//     var success = results.filter(x => x.status === "fulfilled");
// });
exports.reflect = (promise) => {
  return promise.then(
    v => ({ v, status: "fulfilled" }),
    e => ({ e, status: "rejected" }));
}

