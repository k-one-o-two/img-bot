import locallydb from "locallydb";

const db = new locallydb("./mydb");

const fwdQueue = db.collection("fwdQueue");
const laterQueue = db.collection("laterQueue");

const themes = db.collection("themes");
const constraints = db.collection("constraints");

const topics = db.collection("topics");

const chatsArray = db.collection("chatsArray");
const approvedArray = db.collection("approvedArray");
const rejectedArray = db.collection("rejectedArray");

const bannedArray = db.collection("bannedArray");

const bestOf24Array = db.collection("bestOf24Array");
const votedList = db.collection("votedList");

export const collections = {
  fwdQueue,
  laterQueue,
  themes,
  constraints,
  topics,
  chatsArray,
  approvedArray,
  rejectedArray,
  bannedArray,
  bestOf24Array,
  votedList,
};
