import fs from "fs";
import { connectToDatabase } from "./db.js";
import { utils } from "./utils.js";
import { settings } from "./settings.js";
import { subMonths, format } from "date-fns";
import { fileURLToPath } from "url";
import path, { dirname } from "path";
import { fi } from "date-fns/locale";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const setupBotEvents = (bot) => {
  console.log("setupBotEvents");
  bot.on("text", async (msg) => {
    if (utils.isInAdminGroup(msg)) {
      return;
    }

    const text = `User ${msg.from.first_name || msg.from.username} (@${msg.from.username || msg.from.id}) sent a message:\n${msg.text}`;
    bot.sendMessage(settings.adminGroup, text);
  });
  bot.on("photo", async (msg) => {
    // console.info(msg);

    if (utils.isInAdminGroup(msg)) {
      return;
    }

    const file = await utils.getFileInfo(msg.photo.pop().file_id);
    const filename = await utils.downloadFile(
      file.result.file_path,
      msg.chat.id,
    );

    const name = msg.from.first_name || msg.from.username;

    const avatar = await bot.getUserProfilePhotos(msg.from.id, { limit: 1 });
    let avatarFileName = null;

    if (avatar.photos.length) {
      const firstAvatar = avatar.photos[0][0];

      avatarFileName = await utils.downloadUserPicture(
        firstAvatar.file_id,
        msg.chat.id,
      );
    }

    const watermark = name
      ? `By ${name} for Postikortti Suomesta`
      : "Postikortti Suomesta";
    await utils.addWatermark(filename, watermark, avatarFileName);

    const collections = await connectToDatabase();

    const chatId = msg.chat.id;

    if (msg.caption === "#24best") {
      bot.sendMessage(
        chatId,
        `Прием фотографий уже закончен, я передам фотографию обычным образом`,
        { reply_to_message_id: msg.message_id },
      );
    }

    console.log(new Date().toString(), " BOT got photo");

    bot.sendMessage(chatId, `The photo has been sent for approval`, {
      reply_to_message_id: msg.message_id,
    });

    try {
      const buffer = fs.readFileSync(filename);

      const newMessage = await bot.sendPhoto(settings.adminGroup, buffer, {
        caption: `${msg.caption || ""}\n${watermark}\n@nerdsbayPhoto`,
      });

      await collections.queue.insertOne({
        user: chatId,
        fileId: newMessage.photo[0].file_unique_id,
        msgId: msg.message_id,
      });

      const recordedUser = await collections.users.findOne({ id: chatId });

      if (!recordedUser) {
        await collections.users.insertOne({
          id: chatId,
          handle: msg.from.username,
          photos: 1,
          approved: 0,
          rejected: 0,
        });
      } else {
        await collections.users.updateOne(
          { id: chatId },
          { $inc: { photos: 1 } },
        );
      }

      utils.deleteFile(filename);
    } catch (e) {
      console.log("forward failed: ", e);
    }
  });

  bot.on("video", async (msg) => {
    if (utils.isInAdminGroup(msg)) {
      return;
    }
    const collections = await connectToDatabase();

    console.log(new Date().toString(), " BOT got vide");
    const chatId = msg.chat.id;

    bot.sendMessage(chatId, `The video has been sent for approval`, {
      reply_to_message_id: msg.message_id,
    });

    await collections.queue.insertOne({
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
  bot.onText(/^ok\s?(.*)/i, async (msg, match) => {
    console.log(new Date().toString(), " BOT got message");
    const comment = match[1]; // the captured "comment"

    if (utils.isInAdminGroup(msg)) {
      if (!(await utils.checkMessage(msg, bot))) {
        return;
      }

      const collections = await connectToDatabase();

      const original = msg.reply_to_message;
      const fileId = utils.getFileId(original);

      try {
        await collections.fwd.insertOne({
          chatId: msg.chat.id,
          messageId: original.message_id,
        });
      } catch (e) {
        console.log("forward failed: ", e);
      }
      await collections.approved.insertOne({ fileId });

      const savedUser = await utils.getUserByFile(fileId);
      if (savedUser) {
        try {
          await collections.queue.deleteOne({ fileId });
          await collections.users.updateOne(
            { id: savedUser.user },
            { $inc: { approved: 1 } },
          );
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
  bot.onText(/^later\s?(.*)/i, async (msg, match) => {
    console.log(new Date().toString(), " BOT got message");
    const comment = match[1]; // the captured "comment"

    if (utils.isInAdminGroup(msg)) {
      if (!(await utils.checkMessage(msg, bot))) {
        return;
      }

      const collections = await connectToDatabase();

      const original = msg.reply_to_message;
      const fileId = utils.getFileId(original);

      try {
        await collections.later.insertOne({
          chatId: msg.chat.id,
          messageId: original.message_id,
        });
      } catch (e) {
        console.log("forward failed: ", e);
      }
      await collections.approved.insertOne({ fileId });

      const savedUser = await utils.getUserByFile(fileId);
      if (savedUser) {
        try {
          await collections.queue.deleteOne({ fileId });
          await collections.users.updateOne(
            { id: savedUser.user },
            { $inc: { approved: 1 } },
          );

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
  bot.onText(/^no (.+)/i, async (msg, match) => {
    console.log(new Date().toString(), " BOT got reject text");

    const resp = match[1]; // the captured "reason"
    if (utils.isInAdminGroup(msg)) {
      if (!(await utils.checkMessage(msg, bot))) {
        return;
      }

      const original = msg.reply_to_message;
      const fileId = utils.getFileId(original);

      const collections = await connectToDatabase();

      await collections.rejected.insertOne({ fileId });

      const savedUser = await utils.getUserByFile(fileId);

      if (savedUser) {
        try {
          await collections.queue.deleteOne({ fileId });
          await collections.users.updateOne(
            { id: savedUser.user },
            { $inc: { rejected: 1 } },
          );

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
  bot.onText(/^forget$/i, async (msg) => {
    console.log(new Date().toString(), " BOT got reject text");

    if (utils.isInAdminGroup(msg)) {
      if (!(await utils.checkMessage(msg, bot))) {
        return;
      }

      const collections = await connectToDatabase();

      const original = msg.reply_to_message;
      const fileId = utils.getFileId(original);
      ``;
      await collections.rejected.insertOne({ fileId });

      await collections.queue.deleteOne({ fileId });

      const savedUser = await utils.getUserByFile(fileId);

      if (savedUser) {
        try {
          await collections.users.updateOne(
            { id: savedUser.user },
            { $inc: { rejected: 1 } },
          );

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
    console.log("get_best_of_week");
    const chatId = msg.chat.id;

    const size = 512;

    const client = await utils.login();
    // console.log(client);
    const imagesLength = await utils.getBestOfCurrentWeek(client);

    await utils.squareImages(imagesLength, size);

    const buffers = [];
    for (let i = 0; i < imagesLength; i++) {
      if (
        !fs.existsSync(path.join(__dirname, `square/output_square_${i}.jpg`))
      ) {
        console.error(`File output_square_${i}.jpg does not exist`);
        continue;
      }

      const buffer = fs.readFileSync(
        path.join(__dirname, `square/output_square_${i}.jpg`),
      );
      buffers.push(buffer);
      console.info(`Sending photo ${i + 1} of ${imagesLength}`);
      bot.sendPhoto(chatId, buffer);
    }
  });

  bot.onText(/^get_best_of_week\s(.+)$/i, async (msg, match) => {
    console.log("get_best_of_week");
    const chatId = msg.chat.id;

    const size = match[1];

    const client = await utils.login();
    // console.log(client);
    const imagesLength = await utils.getBestOfCurrentWeek(client);

    await utils.squareImages(imagesLength, size);

    const buffers = [];
    for (let i = 0; i < imagesLength; i++) {
      if (
        !fs.existsSync(path.join(__dirname, `square/output_square_${i}.jpg`))
      ) {
        console.error(`File output_square_${i}.jpg does not exist`);
        continue;
      }

      const buffer = fs.readFileSync(
        path.join(__dirname, `square/output_square_${i}.jpg`),
      );
      buffers.push(buffer);
      console.info(`Sending photo ${i + 1} of ${imagesLength}`);
      bot.sendPhoto(chatId, buffer);
    }
  });

  bot.onText(/^show_fwd_queue$/i, async (msg) => {
    const chatId = msg.chat.id;

    if (!utils.isInAdminGroup(msg)) {
      return;
    }

    const collections = await connectToDatabase();

    const messages = await collections.fwd.find({}).toArray();
    const delayedMessages = await collections.later.find({}).toArray();

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

    const collections = await connectToDatabase();

    const messages = await collections.queue.find({}).toArray();

    console.info(`found ${messages.length} messages`);

    if (!messages.length) {
      bot.sendMessage(chatId, "all good, no unchecked messages");
    }

    messages.forEach((message) => {
      bot.forwardMessage(chatId, message.user, message.msgId);
    });
  });
};
