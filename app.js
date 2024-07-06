// https://t.me/image_accept_bot
const TelegramBot = require('node-telegram-bot-api');
const express = require('express');

const app = express();

app.get('/', function (req, res) {
  res.send('Hello World');
});

app.listen(3000);

const token = '7344765885:AAFqnAotFzxc-jevztuBrrbZrSab1qajtbM';
const nerdsbayPhotoAdmins = -4226153478;
const nerdsbayPhoto = '@nerdsbayPhoto';
const confirmMessage = 'ok';

const bot = new TelegramBot(token, { polling: true });

const chatsArray = [];

bot.on('photo', (msg) => {
  console.log('got image');
  const chatId = msg.chat.id;

  bot.sendMessage(
    chatId,
    `thanks, I've got your image and forwarded it for approval`,
  );

  chatsArray.push({
    chat_id: msg.chat.id,
    message_id: msg.message_id,
  });

  bot.forwardMessage(nerdsbayPhotoAdmins, msg.chat.id, msg.message_id);
});

bot.on('message', (msg) => {
  const chatId = msg.chat.id;

  const isAdminGroupMessage = msg.chat.id === nerdsbayPhotoAdmins;

  if (isAdminGroupMessage && msg.text === confirmMessage) {
    const original = msg.reply_to_message;
    if (!original) {
      bot.sendMessage(chatId, 'no origin, sorry');
      return;
    }
    bot.forwardMessage(nerdsbayPhoto, msg.chat.id, original.message_id);
  }
});
