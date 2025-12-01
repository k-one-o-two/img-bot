import { getCollections } from "./db.js";

const init = async () => {
  // const txt = database.collection("txt");
  // await txt.createIndex({ text: "text" });
};

const setValue = async (key, value) => {
  const collections = await getCollections();

  const existing = await collections.txt.findOne({ key });
  if (existing) {
    await collections.txt.updateOne({ key }, { $set: { value } });
  } else {
    await collections.txt.insertOne({ key, value });
  }
};

const t = () => {};

export const txt = {
  init,
  t,
  setValue,
};
