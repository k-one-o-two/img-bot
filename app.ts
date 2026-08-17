import { run } from "node-telegram-bot-api/node";

import { setupBotEvents } from "./events.js";
import { utils } from "./utils.js";
import { settings } from "./settings.js";

import { getCollections, init } from "./db.js";

const bot = utils.createBot();
setupBotEvents(bot);

const tick = async (): Promise<void> => {
  console.info("tick");
  const collections = await getCollections();

  const messages = await collections.fwd.find({}).toArray();
  const laterMessages = await collections.later.find({}).toArray();

  const isSaturday = new Date().getDay() === 6;

  if (isSaturday && laterMessages && laterMessages.length) {
    const message = laterMessages[0];

    await bot.api.sendMessage({
      chat_id: settings.adminGroup,
      text: `Sending from delayed ${message.messageId}`,
    });

    await bot.api.forwardMessage({
      chat_id: settings.photoChannel,
      from_chat_id: message.chatId,
      message_id: message.messageId,
    });

    await collections.later.deleteOne({
      messageId: message.messageId,
    });
  }

  if (!messages || !messages.length) {
    return;
  }

  const message = messages[0];

  const notify = await bot.api.sendMessage({
    chat_id: settings.adminGroup,
    text: `Sending ${message.messageId}`,
  });

  const forward = await bot.api.forwardMessage({
    chat_id: settings.photoChannel,
    from_chat_id: message.chatId,
    message_id: message.messageId,
  });

  if (!notify || !forward) {
    console.error("Failed to send message or forward");
    return;
  }

  await collections.fwd.deleteOne({
    messageId: message.messageId,
  });
};

const start = async (): Promise<void> => {
  await init();

  console.info("inited");

  const runTick = () =>
    tick().catch((err) => console.error("tick failed:", err));

  // Kick off an initial tick so we don't wait a full interval on startup.
  runTick();
  setInterval(runTick, settings.interval);

  // `run` installs SIGINT / SIGTERM handlers and awaits the polling loop.
  await run(bot, {
    timeout: 30,
    limit: 100,
  });
};

start().catch((err) => {
  console.error("bot crashed:", err);
  process.exit(1);
});
