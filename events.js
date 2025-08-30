import fs from "fs";
import { collections } from "./storage";
import { utils } from "./utils";
import { settings } from "./settings";
import { subMonths, format } from "date-fns";

export const setupBotEvents = (bot) => {
  bot.on("photo", (msg) => {
    if (utils.isInAdminGroup(msg)) {
      return;
    }

    const chatId = msg.chat.id;

    if (msg.caption === "#24best") {
      bot.sendMessage(
        chatId,
        `Прием фотографий уже закончен, я передам фотографию обычным образом`,
        { reply_to_message_id: msg.message_id },
      );
    }

    // normal photo

    console.log(new Date().toString(), " BOT got photo");

    bot.sendMessage(chatId, `The photo has been sent for approval`, {
      reply_to_message_id: msg.message_id,
    });

    collections.chatsArray.insert({
      user: chatId,
      fileId: msg.photo[0].file_unique_id,
      msgId: msg.message_id,
    });

    try {
      bot.forwardMessage(settings.adminGroup, msg.chat.id, msg.message_id);
    } catch (e) {
      console.log("forward failed: ", e);
    }
  });

  bot.on("video", (msg) => {
    if (utils.isInAdminGroup(msg)) {
      return;
    }

    console.log(new Date().toString(), " BOT got vide");
    const chatId = msg.chat.id;

    bot.sendMessage(chatId, `The video has been sent for approval`, {
      reply_to_message_id: msg.message_id,
    });

    collections.chatsArray.insert({
      user: chatId,
      fileId: msg.video.file_unique_id,
      msgId: msg.message_id,
    });

    try {
      bot.forwardMessage(settings.adminGroup, msg.chat.id, msg.message_id);
    } catch (e) {
      console.log("forward failed: ", e);
    }
  });

  // confirm
  bot.onText(/^ok\s?(.*)/i, (msg, match) => {
    console.log(new Date().toString(), " BOT got message");
    const comment = match[1]; // the captured "comment"

    if (utils.isInAdminGroup(msg)) {
      if (!utils.checkMessage(msg)) {
        return;
      }

      const original = msg.reply_to_message;
      const fileId = utils.getFileId(original);

      try {
        collections.fwdQueue.insert({
          chatId: msg.chat.id,
          messageId: original.message_id,
        });
      } catch (e) {
        console.log("forward failed: ", e);
      }
      collections.approvedArray.insert({ fileId });

      const savedUser = utils.getUserByFile(fileId);
      if (savedUser) {
        try {
          const cid = savedUser.cid;
          collections.chatsArray.remove(cid);
          collections.chatsArray.save();

          bot.sendMessage(
            savedUser.user,
            `The photo has been approved and added to the queue. ${
              comment ? `Comment from admins: "${comment}"` : ""
            }`,
            {
              reply_to_message_id: savedUser.msgId,
            },
          );
        } catch (e) {
          console.log("replying to user failed: ", e);
        }
      }
    }
  });

  // confirm: later
  bot.onText(/^later\s?(.*)/i, (msg, match) => {
    console.log(new Date().toString(), " BOT got message");
    const comment = match[1]; // the captured "comment"

    if (utils.isInAdminGroup(msg)) {
      if (!utils.checkMessage(msg)) {
        return;
      }

      const original = msg.reply_to_message;
      const fileId = utils.getFileId(original);

      try {
        collections.laterQueue.insert({
          chatId: msg.chat.id,
          messageId: original.message_id,
        });
      } catch (e) {
        console.log("forward failed: ", e);
      }
      collections.approvedArray.insert({ fileId });

      const savedUser = utils.getUserByFile(fileId);
      if (savedUser) {
        try {
          const cid = savedUser.cid;
          collections.chatsArray.remove(cid);
          collections.chatsArray.save();

          bot.sendMessage(
            savedUser.user,
            `The photo has been approved to be send next Saturday (off-topic day). ${
              comment ? `Comment from admins: "${comment}"` : ""
            }`,
            {
              reply_to_message_id: savedUser.msgId,
            },
          );
        } catch (e) {
          console.log("replying to user failed: ", e);
        }
      }
    }
  });

  // reject
  bot.onText(/^no (.+)/i, (msg, match) => {
    console.log(new Date().toString(), " BOT got reject text");

    const resp = match[1]; // the captured "reason"
    if (utils.isInAdminGroup(msg)) {
      if (!utils.checkMessage(msg)) {
        return;
      }

      const original = msg.reply_to_message;
      const fileId = utils.getFileId(original);

      collections.rejectedArray.insert({ fileId });

      const savedUser = utils.getUserByFile(fileId);

      if (savedUser) {
        try {
          const cid = savedUser.cid;
          collections.chatsArray.remove(cid);
          collections.chatsArray.save();

          bot.sendMessage(
            savedUser.user,
            `The photo has been rejected, reason: "${resp}"`,
            { reply_to_message_id: savedUser.msgId },
          );
        } catch (e) {
          console.log("replying to user failed: ", e);
        }
      }
    }
  });

  // reject
  bot.onText(/^forget$/i, (msg) => {
    console.log(new Date().toString(), " BOT got reject text");

    if (utils.isInAdminGroup(msg)) {
      if (!utils.checkMessage(msg)) {
        return;
      }

      const original = msg.reply_to_message;
      const fileId = utils.getFileId(original);
      ``;
      collections.rejectedArray.insert({ fileId });

      const savedUser = utils.getUserByFile(fileId);

      if (savedUser) {
        try {
          const cid = savedUser.cid;
          collections.chatsArray.remove(cid);
          collections.chatsArray.save();
        } catch (e) {
          console.log("removing chat failed: ", e);
        }
      }
    }
  });

  bot.onText(/^get_best_of_month$/i, async (msg) => {
    const chatId = msg.chat.id;

    const prevMonth = subMonths(new Date(), 1);

    const client = await utils.login();
    const bestOfTheMonth = await utils.getBestOfCurrentMonth(client);

    await utils.makePostcard();

    const buffer = fs.readFileSync(`./output_stamp.jpg`);

    bot.sendPhoto(chatId, buffer, {
      caption: `Top photo of ${format(prevMonth, "MMMM yyyy")} with ${
        bestOfTheMonth.reactionsCnt
      } likes`,
    });
  });

  bot.onText(/^get_best_of_week$/i, async (msg) => {
    const chatId = msg.chat.id;

    const client = await utils.login();
    const imagesLength = await utils.getBestOfCurrentWeek(client);

    await utils.squareImages(imagesLength);

    const buffers = [];
    for (let i = 0; i < imagesLength; i++) {
      const buffer = fs.readFileSync(`output_square_${i}.jpg`);
      buffers.push(buffer);

      bot.sendPhoto(chatId, buffer);
    }
  });

  bot.onText(/^show_fwd_queue$/i, async (msg) => {
    const chatId = msg.chat.id;

    if (!utils.isInAdminGroup(msg)) {
      return;
    }

    const messages = collections.fwdQueue.where().items;
    const delayedMessages = collections.laterQueue.where().items;

    bot.sendMessage(
      chatId,
      `I have ${messages.length} in my fwdQueue and ${delayedMessages.length} in my laterQueue`,
    );
  });

  bot.onText(/^rules$/i, async (msg) => {
    const chatId = msg.chat.id;

    const rulesContent = fs.readFileSync("rules.txt", "utf8");

    bot.sendMessage(chatId, rulesContent);
  });

  bot.onText(/^show_chats_array$/i, async (msg) => {
    const chatId = msg.chat.id;

    if (!utils.isInAdminGroup(msg)) {
      return;
    }

    const messages = collections.chatsArray.where().items;

    console.info(`found ${messages.length} messages`);

    if (!messages.length) {
      bot.sendMessage(chatId, "all good, no unchecked messages");
    }

    messages.forEach((message) => {
      bot.forwardMessage(chatId, message.user, message.msgId);
    });
  });
};
