const locallydb = require("locallydb");
const db = new locallydb("./mydb");

const chatsArray = db.collection("chatsArray");
const approvedArray = db.collection("approvedArray");
const rejectedArray = db.collection("rejectedArray");

const run = () => {
  const entries = chatsArray.items;
  entries.forEach((entry) => {
    const { fileId, cid } = entry;

    const isRejected = rejectedArray.where({ fileId }).length();
    const isApproved = approvedArray.where({ fileId }).length();

    console.info({ cid }, { isRejected }, { isApproved });

    if (isRejected || isApproved) {
      chatsArray.remove(cid);
    }

    // chatsArray.remove(entry.cid);
  });

  chatsArray.save();

  // console.log(entries);
};

run();
