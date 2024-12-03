const locallydb = require('locallydb');
const db = new locallydb('./mydb');

const bestOf24Array = db.collection('bestOf24Array');

const run = () => {
  bestOf24Array.remove(0);
  bestOf24Array.remove(1);

  const entries = bestOf24Array.items;

  console.log(entries);
};

run();
