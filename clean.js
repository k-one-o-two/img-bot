const locallydb = require("locallydb");
const db = new locallydb("./mydb");

const chatsArray = db.collection("chatsArray");
const approvedArray = db.collection("approvedArray");
const rejectedArray = db.collection("rejectedArray");

const run = () => {
  const entries = chatsArray.items;
  entries.forEach((entry) => {
    const { fileId } = entry;

    const isRejected = rejectedArray.where({ fileId }).length();
    const isApproved = approvedArray.where({ fileId }).length();

    console.info({ sid }, { isRejected }, { isApproved });

    // chatsArray.remove(entry.cid);
  });

  // chatsArray.save();

  // console.log(entries);
};

run();
