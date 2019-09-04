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


