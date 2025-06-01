const _ = require("lodash");

const locallydb = require("locallydb");
const db = new locallydb("./mydb");

const dotenv = require("dotenv");
dotenv.config();

const token = process.env.TOKEN;
const nerdsbayPhotoAdmins = process.env.ADMIN_GROUP_ID;
const nerdsbayPhoto = process.env.PHOTO_CHANNEL;

const chatsArray = db.collection("chatsArray");
const approvedArray = db.collection("approvedArray");
const mediaGroups = db.collection("mediaGroups");
const fwdQueue = db.collection("fwdQueue");

const { messWithImages } = require("./img");

const logObject = (obj) => console.log(JSON.stringify(obj, undefined, 2));

const getFileInfo = async (file_id) => {
  const url = `https://api.telegram.org/bot${token}/getFile?file_id=${file_id}`;

  const result = await fetch(url);
  const fileData = await result.json();

  return fileData;
};

const downloadFile = async (file_path, chatId) => {
  const url = `https://api.telegram.org/file/bot${token}/${file_path}`;
  const fileName = file_path.replaceAll("/", "_");

  const response = await fetch(url);
  const stream = Readable.fromWeb(response.body);
  const result = await writeFile(`./24/${chatId}_${fileName}`, stream);

  return result;
};

const userHasVoted = (msg) => {
  const user = msg.from.id;
  const foundInCollection = votedList.where({ user_id: user }).items;

  if (foundInCollection.length) {
    return true;
  }

  return false;
};

const getUserByFile = (fileId) => {
  const list = chatsArray.where({ fileId });
  if (list.length() === 0) {
    return null;
  }

  return list.items[0];
};

const getFileId = (msg) => {
  const isPhoto = !!msg.photo;
  const isVideo = !!msg.video;

  if (isPhoto) {
    return msg.photo[0].file_unique_id;
  } else if (isVideo) {
    return msg.video.file_unique_id;
  } else {
    // noting to reply to
    return;
  }
};

const checkMessage = (msg) => {
  const chatId = msg.chat.id;
  const original = msg.reply_to_message;

  if (!original) {
    bot.sendMessage(chatId, "Не найдено оригинальное сообщение");
    return false;
  }

  const fileId = getFileId(original);
  if (approvedArray.where({ fileId }).length()) {
    bot.sendMessage(chatId, "Эта фотография уже была принята");
    return false;
  }

  if (rejectedArray.where({ fileId }).length()) {
    bot.sendMessage(chatId, "Эта фотография уже была отклонена");
    return false;
  }

  return true;
};

// const getLastGroupId = () => {
//   const last = mediaGroups.items[mediaGroups.items.length - 1];
//   return last.media_group_id;
// };
//
const sendGroup = (group_id) => {
  console.info("sendGroup", group_id);
  const messages = mediaGroups.where({ media_group_id: group_id }).items;

  console.log(messages);

  const cids = messages.map((m) => m.cid);

  // mediaGroups
  // const chatId = messages[0].msg.chat.id;

  bot.sendMediaGroup(
    chatId,
    messages.map((m) => m.msg),
  );

  cids.forEach((cid) => {
    mediaGroups.remove(cid);
  });
};

const setupBotEvents = (bot) => {
  bot.on("photo", (msg) => {
    // logObject(msg);

    const isAdminGroupMessage = msg.chat.id.toString() === nerdsbayPhotoAdmins;
    if (isAdminGroupMessage) {
      return;
    }

    const chatId = msg.chat.id;

    // const lastGroupId = getLastGroupId();
    const media_group_id = msg.media_group_id;

    if (media_group_id) {
      console.log(
        new Date().toString(),
        " BOT got media group ",
        media_group_id,
      );

      mediaGroups.insert({
        media_group_id,
        msg,
      });
      console.info("inserted, debouncing");
      // _.debounce(() => {
      //   console.info("debounced");
      setTimeout(() => {
        sendGroup(media_group_id);
      }, 300);
      // sendGroup(media_group_id);
      // }, 0);
    } else {
      console.log(new Date().toString(), " BOT got photo");

      bot.sendMessage(
        chatId,
        `Я получил фотографию и отправил её на рассмотрение`,
        { reply_to_message_id: msg.message_id },
      );

      chatsArray.insert({
        user: chatId,
        fileId: msg.photo[0].file_unique_id,
        msgId: msg.message_id,
      });

      try {
        bot.forwardMessage(nerdsbayPhotoAdmins, msg.chat.id, msg.message_id);
      } catch (e) {
        console.log("forward failed: ", e);
      }
    }

    // if (msg.caption === "#24best") {
    //   bot.sendMessage(
    //     chatId,
    //     `Прием фотографий уже закончен, я передам фотографию обычным образом`,
    //     { reply_to_message_id: msg.message_id },
    //   );
    // }

    // normal photo
  });

  bot.on("video", (msg) => {
    const isAdminGroupMessage = msg.chat.id.toString() === nerdsbayPhotoAdmins;
    if (isAdminGroupMessage) {
      return;
    }

    console.log(new Date().toString(), " BOT got vide");
    const chatId = msg.chat.id;

    bot.sendMessage(chatId, `Я получил видео и отправил его на рассмотрение`, {
      reply_to_message_id: msg.message_id,
    });

    chatsArray.insert({
      user: chatId,
      fileId: msg.video.file_unique_id,
      msgId: msg.message_id,
    });

    try {
      bot.forwardMessage(nerdsbayPhotoAdmins, msg.chat.id, msg.message_id);
    } catch {
      console.log("forward failed: ", e);
    }
  });

  // confirm
  bot.onText(/^ok\s?(.*)/i, (msg, match) => {
    console.log(new Date().toString(), " BOT got message");
    const isAdminGroupMessage = msg.chat.id.toString() === nerdsbayPhotoAdmins;
    const comment = match[1]; // the captured "comment"

    if (isAdminGroupMessage) {
      if (!checkMessage(msg)) {
        return;
      }

      const original = msg.reply_to_message;
      const fileId = getFileId(original);

      try {
        fwdQueue.insert({
          chatId: msg.chat.id,
          messageId: original.message_id,
        });
      } catch (e) {
        console.log("forward failed: ", e);
      }
      approvedArray.insert({ fileId });

      const savedUser = getUserByFile(fileId);
      if (savedUser) {
        try {
          bot.sendMessage(
            savedUser.user,
            `Спасибо, материал одобрен, возможна очередь отправки. ${
              comment ? `Комментарий: "${comment}"` : ""
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
    const isAdminGroupMessage = msg.chat.id.toString() === nerdsbayPhotoAdmins;

    const resp = match[1]; // the captured "reason"
    if (isAdminGroupMessage) {
      if (!checkMessage(msg)) {
        return;
      }

      const original = msg.reply_to_message;
      const fileId = getFileId(original);

      rejectedArray.insert({ fileId });

      const savedUser = getUserByFile(fileId);

      if (savedUser) {
        try {
          bot.sendMessage(
            savedUser.user,
            `Материал не опубликован, причина: "${resp}"`,
            { reply_to_message_id: savedUser.msgId },
          );
        } catch (e) {
          console.log("replying to user failed: ", e);
        }
      }
    }
  });

  bot.onText(/^get_best_of_month$/i, async (msg) => {
    const chatId = msg.chat.id;

    const prevMonth = subMonths(new Date(), 1);

    const client = await login();
    const bestOfTheMonth = await getBestOfCurrentMonth(client);

    await messWithImages();

    const buffer = fs.readFileSync(`./output_stamp.jpg`);

    bot.sendPhoto(chatId, buffer, {
      caption: `Top photo for ${format(prevMonth, "MMMM yyyy")} with ${
        bestOfTheMonth.reactionsCnt
      } likes`,
    });
  });

  bot.onText(/^show_fwd_queue$/i, async (msg) => {
    const chatId = msg.chat.id;
    const isAdminGroupMessage = msg.chat.id.toString() === nerdsbayPhotoAdmins;

    if (!isAdminGroupMessage) {
      return;
    }

    const messages = fwdQueue.where().items;

    bot.sendMessage(chatId, `I have ${messages.length} in my fwdQueue`);
  });

  // bot
};

module.exports = { setupBotEvents };
