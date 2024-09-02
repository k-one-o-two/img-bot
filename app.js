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

console.log(new Date().toString(), ' BOT started');

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
  console.log(new Date().toString(), ' BOT got photo');
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

  try {
    bot.forwardMessage(nerdsbayPhotoAdmins, msg.chat.id, msg.message_id);
  } catch (e) {
    console.log('forward failed: ', e);
  }
});

bot.on('video', (msg) => {
  console.log(new Date().toString(), ' BOT got vide');
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
    console.log('forward failed: ', e);
  }
});

// confirm
bot.onText(/ok (.+)/, (msg, match) => {
  console.log(new Date().toString(), ' BOT got message');
  const isAdminGroupMessage = msg.chat.id.toString() === nerdsbayPhotoAdmins;
  const comment = match[1]; // the captured "comment"

  if (isAdminGroupMessage) {
    if (!checkMessage(msg)) {
      return;
    }

    const original = msg.reply_to_message;
    const fileId = getFileId(original);

    try {
      bot.forwardMessage(nerdsbayPhoto, msg.chat.id, original.message_id);
    } catch (e) {
      console.log('forward failed: ', e);
    }
    approvedArray.insert({ fileId });

    const savedUser = getUserByFile(fileId);
    if (savedUser) {
      try {
        bot.sendMessage(
          savedUser.user,
          `Материал опубликован! ${comment ? `Комментарий: "${comment}"` : ''}`,
          {
            reply_to_message_id: savedUser.msgId,
          },
        );
      } catch (e) {
        console.log('replying to user failed: ', e);
      }
    }
  }
});

// reject
bot.onText(/no (.+)/, (msg, match) => {
  console.log(new Date().toString(), ' BOT got reject text');
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
        console.log('replying to user failed: ', e);
      }
    }
  }
});
