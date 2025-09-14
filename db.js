import { MongoClient } from "mongodb";
import { settings } from "./settings.js";

const client = new MongoClient(settings.uri);

export const connectToDatabase = async () => {
  try {
    await client.connect();
    const database = client.db("img_bot");

    const approved = database.collection("approved");
    const fwd = database.collection("fwd");
    const later = database.collection("later");
    const queue = database.collection("queue");
    const rejected = database.collection("rejected");

    console.log("Connected to MongoDB");

    return {
      approved,
      fwd,
      later,
      queue,
      rejected,
    };
  } catch (error) {
    console.error("Error connecting to MongoDB:", error);

    return null;
  }
};
