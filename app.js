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
  const messages = await collections.fwd.find({}).toArray();
  const laterMessages = await collections.later.find({}).toArray();

  const isSaturday = new Date().getDay() === 6;

  if (isSaturday && laterMessages && laterMessages.length) {
    const message = laterMessages[0];

    bot.sendMessage(
      settings.adminGroup,
      `Sending from delayed ${message.messageId}`,
    );

    bot.forwardMessage(
      settings.photoChannel,
      message.chatId,
      message.messageId,
    );

    const fileId = utils.getFileId(message);
    await collections.later.deleteOne({ fileId });
  }

  if (!messages || !messages.length) {
    return;
  }

  const message = messages[0];

  bot.sendMessage(settings.adminGroup, `Sending ${message.messageId}`);

  bot.forwardMessage(settings.photoChannel, message.chatId, message.messageId);

  const fileId = utils.getFileId(message);
  await collections.fwd.deleteOne({ fileId });
};

setInterval(() => {
  tick();
}, settings.interval);

tick();

export default app;
