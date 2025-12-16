import { MongoClient } from "mongodb";
import { settings } from "./settings.js";

const client = new MongoClient(settings.uri);

let database;

export const init = async () => {
  database = client.db("img_bot");
  await client.connect();
  return database;
};

export const getCollections = async () => {
  return {
    get approved() {
      return database.collection("approved");
    },
    get fwd() {
      return database.collection("fwd2");
    },
    get later() {
      return database.collection("later");
    },
    get queue() {
      return database.collection("queue");
    },
    get rejected() {
      return database.collection("rejected");
    },
    get contest() {
      return database.collection("contest");
    },
    get voters() {
      return database.collection("voters");
    },
    get users() {
      return database.collection("users");
    },
  };
};
