import { connectToDatabase } from "./db.js";

import { utils } from "./utils.js";

const addPhoto = async (filename, userId, userName) => {
  const collections = await connectToDatabase();
  const existingRecord = await collections.contest.findOne({ userId });
  console.info({ existingRecord });
  // return new Promise(async (resolve, reject) => {
  if (existingRecord) {
    // we already have this persons photo
    return null;
  }

  // count to add to watermark
  const currentLength = await collections.contest.count({});
  console.info({ currentLength });
  await utils.addWatermark(
    filename,
    `Best of 2025 contest: ${currentLength + 1}`,
  );

  await collections.contest.insertOne({
    userId,
    userName,
    filename,
    photoIndex: currentLength + 1,
    votes: 0,
  });

  return await collections.contest.count({});
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
    return "You can only vote once";
  }

  const photo = await collections.contest.findOne({ photoIndex });

  if (!photo) {
    return "No such photo exists";
  }

  if (voterUserId === photo.userId) {
    return "You can not vote for yourself";
  }

  await collections.contest.updateOne(
    { _id: photo._id },
    { $inc: { votes: 1 } },
  );

  await collections.voters.insertOne({ voterUserId });

  return null;
};

export const contest = {
  addPhoto,
  getContestList,
  recordVote,
};
