import { setupBotEvents } from "./events.js";
import { utils } from "./utils.js";
import { settings } from "./settings.js";
// import { collections } from "./storage.js"
// const express = require("express");
import express from "express";
const app = express();
app.get("/", (req, res) => {
  res.send("Express");
});
const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

import { getCollections, init } from "./db.js";

const bot = utils.createBot();
setupBotEvents(bot);

const tick = async () => {
  const collections = await getCollections();

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

    const deleteRes = await collections.later.deleteOne({
      messageId: message.messageId,
    });
    console.info({ deleteRes });
  }

  console.log("tick", { messages });

  if (!messages || !messages.length) {
    console.log("nothing to send this time");
    return;
  }

  const message = messages[0];

  const notify = await bot.sendMessage(
    settings.adminGroup,
    `Sending ${message.messageId}`,
  );

  console.info({ notify });

  const forward = await bot.forwardMessage(
    settings.photoChannel,
    message.chatId,
    message.messageId,
  );

  console.info({ forward });

  if (!notify || !forward) {
    console.error("Failed to send message or forward");
    return;
  }

  const deleteRes = await collections.fwd.deleteOne({
    messageId: message.messageId,
  });
  console.info({ deleteRes });
};

const run = async () => {
  await init();
  setInterval(() => {
    tick();
  }, settings.interval);
};

run();

export default app;
