const locallydb = require('locallydb');
const db = new locallydb('./mydb');

const bestOf24Array = db.collection('bestOf24Array');

const run = () => {
  collection.remove(0);
  collection.remove(0);

  const entries = bestOf24Array.items;

  console.log(entries);
};

run();
