import { MongoClient } from "mongodb";
import { settings } from "./settings.js";

const client = new MongoClient(settings.uri);

let database;

export const init = async () => {
  database = client.db("img_bot");
  await client.connect();
  console.log("Connected to MongoDB");
};

export const getCollections = async () => {
  try {
    const approved = database.collection("approved");
    const fwd = database.collection("fwd");
    const later = database.collection("later");
    const queue = database.collection("queue");
    const rejected = database.collection("rejected");
    const contest = database.collection("contest");
    const voters = database.collection("voters");
    const users = database.collection("users");

    return {
      approved,
      fwd,
      later,
      queue,
      rejected,
      contest,
      voters,
      users,
    };
  } catch (error) {
    console.error("Error connecting to MongoDB:", error);

    return null;
  }
};
