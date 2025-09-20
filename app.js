import { setupBotEvents } from "./events.js";
import { utils } from "./utils.js";
import { settings } from "./settings.js";
// import { collections } from "./storage.js"
// const express = require("express");
import express from "express";
const app = express();
app.get("/", (req, res) => {
  res.send("Express on Vercel");
});
const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

import { connectToDatabase } from "./db.js";

const bot = utils.createBot();
setupBotEvents(bot);

const collections = await connectToDatabase();

const tick = async () => {
  // const messages = collections.fwdQueue.where().items;
  // const laterMessages = collections.laterQueue.where().items;
  //
  const messages = await collections.fwd.find();
  const laterMessages = await collections.later.find();

  const isSaturday = new Date().getDay() === 6;

  if (isSaturday && laterMessages && laterMessages.length) {
    const message = laterMessages[0];
    const cid = message.cid;

    bot.sendMessage(
      settings.adminGroup,
      `Sending from delayed ${message.messageId}, cid: ${cid}`,
    );

    bot.forwardMessage(
      settings.photoChannel,
      message.chatId,
      message.messageId,
    );

    const fileId = utils.getFileId(message);
    await collections.later.deleteOne({ fileId });

    // collections.laterQueue.remove(cid);
    // collections.laterQueue.save();
  }

  if (!messages || !messages.length) {
    return;
  }

  const message = messages[0];
  const cid = message.cid;

  bot.sendMessage(
    settings.adminGroup,
    `Sending ${message.messageId}, cid: ${cid}`,
  );

  bot.forwardMessage(settings.photoChannel, message.chatId, message.messageId);

  const fileId = utils.getFileId(message);
  await collections.fwd.deleteOne({ fileId });

  // collections.fwdQueue.remove(cid);
  // collections.fwdQueue.save();
};

setInterval(() => {
  tick();
}, settings.interval);

export default app;
