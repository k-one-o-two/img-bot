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

    // if (isRejected || isApproved) {
    console.info(`Removing chat ${cid}`);
    chatsArray.remove(cid);
    chatsArray.save();
    // }

    // chatsArray.remove(entry.cid);
  });

  // console.log(entries);
};

run();
