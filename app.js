// https://t.me/image_accept_bot
const dotenv = require('dotenv');

dotenv.config();

const TelegramBot = require('node-telegram-bot-api');
const express = require('express');

const app = express();

const logObject = (obj) => console.log(JSON.stringify(obj, undefined, 2));

app.get('/', function (req, res) {
  res.send('Hello World');
});

app.listen(3002);

const token = process.env.TOKEN;
const nerdsbayPhotoAdmins = process.env.ADMIN_GROUP_ID;
const nerdsbayPhoto = process.env.PHOTO_CHANNEL;
const confirmMessage = 'ok';

const bot = new TelegramBot(token, { polling: true });

const chatsArray = [];
const approvedArray = [];
const rejectedArray = [];

bot.on('photo', (msg) => {
  const chatId = msg.chat.id;

  bot.sendMessage(chatId, `Я получил фотографию и отправил её на рассмотрение`);

  chatsArray.push({
    user: chatId,
    file: msg.photo[0].file_unique_id,
  });

  bot.forwardMessage(nerdsbayPhotoAdmins, msg.chat.id, msg.message_id);
});

bot.on('message', (msg) => {
  const chatId = msg.chat.id;

  const isAdminGroupMessage = msg.chat.id.toString() === nerdsbayPhotoAdmins;

  if (isAdminGroupMessage && msg.text === confirmMessage) {
    const original = msg.reply_to_message;

    if (!original) {
      bot.sendMessage(chatId, 'Не найдено оригинальное сообщение');
      return;
    }

    const fileId = original.photo[0].file_unique_id;

    if (approvedArray.includes(fileId)) {
      bot.sendMessage(chatId, 'Эта фотография уже была принята');
      return;
    }

    if (rejectedArray.includes(fileId)) {
      bot.sendMessage(chatId, 'Эта фотография уже была отклонена');
      return;
    }

    bot.forwardMessage(nerdsbayPhoto, msg.chat.id, original.message_id);
    approvedArray.push(fileId);

    const savedUser = chatsArray.find((item) => item.file === fileId);
    if (savedUser) {
      bot.sendMessage(savedUser.user, 'Фотография была принята!');
    }
  }
});

bot.onText(/no (.+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const original = msg.reply_to_message;
  if (!original) {
    bot.sendMessage(chatId, 'No origin, sorry');
    return;
  }

  const isAdminGroupMessage = msg.chat.id.toString() === nerdsbayPhotoAdmins;

  const resp = match[1]; // the captured "reason"
  if (isAdminGroupMessage) {
    const original = msg.reply_to_message;

    if (!original) {
      bot.sendMessage(chatId, 'Не найдено оригинальное сообщение');
      return;
    }

    const fileId = original.photo[0].file_unique_id;

    if (approvedArray.includes(fileId)) {
      bot.sendMessage(chatId, 'Эта фотография уже была принята');
      return;
    }

    if (rejectedArray.includes(fileId)) {
      bot.sendMessage(chatId, 'Эта фотография уже была отклонена');
      return;
    }

    rejectedArray.push(fileId);

    const savedUser = chatsArray.find((item) => item.file === fileId);
    if (savedUser) {
      bot.sendMessage(
        savedUser.user,
        `Фотография была отклонена по причине "${resp}"`,
      );
    }
  }
});
