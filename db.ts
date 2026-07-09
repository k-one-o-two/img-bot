import { MongoClient, type Db, type Collection } from "mongodb";
import { settings } from "./settings.js";

const client = new MongoClient(settings.uri);

let database: Db;

export const init = async (): Promise<Db> => {
  database = client.db("img_bot");
  await client.connect();
  return database;
};

export interface Collections {
  approved: Collection;
  fwd: Collection;
  later: Collection;
  queue: Collection;
  rejected: Collection;
  contest: Collection;
  voters: Collection;
  users: Collection;
}

export const getCollections = async (): Promise<Collections> => {
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
