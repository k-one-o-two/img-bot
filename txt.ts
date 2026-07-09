import { getCollections } from "./db.js";

const init = async (): Promise<void> => {
  // const txt = database.collection("txt");
  // await txt.createIndex({ text: "text" });
};

const setValue = async (key: string, value: unknown): Promise<void> => {
  const collections = await getCollections();
  // Note: `txt` collection is not declared in db.ts's Collections type;
  // we access it dynamically here.
  const txt = (collections as any).txt;

  const existing = await txt.findOne({ key });
  if (existing) {
    await txt.updateOne({ key }, { $set: { value } });
  } else {
    await txt.insertOne({ key, value });
  }
};

const t = (): void => {};

export const txt = {
  init,
  t,
  setValue,
};
