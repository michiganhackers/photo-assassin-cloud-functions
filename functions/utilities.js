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
  return typeof string === "string" && !(/[^0-9a-zA-Z]/).test(string);
};
