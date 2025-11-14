import fs from "fs";
import { Readable } from "stream";
import { connectToDatabase } from "./db.js";

import { utils } from "./utils.js";

const addPhoto = async (filename, userId, userName) => {
  const collections = await connectToDatabase();
  const existingRecord = await collections.contest.findOne({ userId });
  return new Promise(async (resolve, reject) => {
    if (existingRecord) {
      // we already have this persons photo
      reject("");
    }

    const photoFileName = await utils.downloadFile(filename, userId, {
      isContest: true,
    });

    await collections.contest.insertOne({
      userId,
      userName,
      photoFileName,
      votes: 0,
    });
  });
};
const getContestList = async () => {
  const collections = await connectToDatabase();
  const files = await collections.contest.find().toArray();

  return files;
};
const recordVote = async (voterUserId, photoIndex) => {
  const collections = await connectToDatabase();

  const hasVoted = await collections.voters.findOne({ voterUserId });
  if (hasVoted) {
    return;
  }

  const photo = await collections.contest.findOne({ photoIndex });

  if (!photo) {
    return null;
  }

  await collections.contest.updateOne(
    { _id: photo._id },
    { $inc: { votes: 1 } },
  );
};

export const contest = {
  addPhoto,
  getContestList,
  recordVote,
};
