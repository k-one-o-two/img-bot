// https://t.me/image_accept_bot
const dotenv = require('dotenv');

dotenv.config();

const TelegramBot = require('node-telegram-bot-api');

const locallydb = require('locallydb');
const db = new locallydb('./mydb');

const logObject = (obj) => console.log(JSON.stringify(obj, undefined, 2));

const token = process.env.TOKEN;
const nerdsbayPhotoAdmins = process.env.ADMIN_GROUP_ID;
const nerdsbayPhoto = process.env.PHOTO_CHANNEL;
const confirmMessage = 'ok';

const bot = new TelegramBot(token, { polling: true });

const chatsArray = db.collection('chatsArray');
const approvedArray = db.collection('approvedArray');
const rejectedArray = db.collection('rejectedArray');

bot.on('polling_error', console.log);

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
    bot.sendMessage(chatId, 'Не найдено оригинальное сообщение');
    return false;
  }

  const fileId = getFileId(original);
  if (approvedArray.where({ fileId }).length()) {
    bot.sendMessage(chatId, 'Эта фотография уже была принята');
    return false;
  }

  if (rejectedArray.where({ fileId }).length()) {
    bot.sendMessage(chatId, 'Эта фотография уже была отклонена');
    return false;
  }

  return true;
};

bot.on('photo', (msg) => {
  const chatId = msg.chat.id;

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

  bot.forwardMessage(nerdsbayPhotoAdmins, msg.chat.id, msg.message_id);
});

bot.on('video', (msg) => {
  const chatId = msg.chat.id;

  bot.sendMessage(chatId, `Я получил видео и отправил его на рассмотрение`, {
    reply_to_message_id: msg.message_id,
  });

  chatsArray.insert({
    user: chatId,
    fileId: msg.video.file_unique_id,
    msgId: msg.message_id,
  });

  bot.forwardMessage(nerdsbayPhotoAdmins, msg.chat.id, msg.message_id);
});

// confirm
bot.on('message', (msg) => {
  const isAdminGroupMessage = msg.chat.id.toString() === nerdsbayPhotoAdmins;

  if (isAdminGroupMessage && msg.text === confirmMessage) {
    if (!checkMessage(msg)) {
      return;
    }

    const original = msg.reply_to_message;
    const fileId = getFileId(original);

    bot.forwardMessage(nerdsbayPhoto, msg.chat.id, original.message_id);
    approvedArray.insert({ fileId });

    const savedUser = getUserByFile(fileId);
    if (savedUser) {
      bot.sendMessage(savedUser.user, 'Материал опубликован!', {
        reply_to_message_id: savedUser.msgId,
      });
    }
  }
});

// reject
bot.onText(/no (.+)/, (msg, match) => {
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
      bot.sendMessage(
        savedUser.user,
        `Материал не опубликован, причина: "${resp}"`,
        { reply_to_message_id: savedUser.msgId },
      );
    }
  }
});
