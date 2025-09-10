import { setupBotEvents } from "./events.js";
import { utils } from "./utils.js";
import { settings } from "./settings.js";
import { collections } from "./storage.js";

const bot = utils.createBot();
setupBotEvents(bot);

const tick = () => {
  const messages = collections.fwdQueue.where().items;
  const laterMessages = collections.laterQueue.where().items;

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

    collections.laterQueue.remove(cid);
    collections.laterQueue.save();
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

  collections.fwdQueue.remove(cid);
  collections.fwdQueue.save();
};

setInterval(() => {
  tick();
}, settings.interval);
