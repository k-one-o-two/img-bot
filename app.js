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

bot.setMyCommands({
  command: 'start',
  description: `Привет, я бот для отправки авторских фотографий в канал https://t.me/nerdsbayPhoto
  Просто отправьте мне фотографию и я её передам админам.
  Я сообщу когда фотографию примут или отклонят.
  Пожалуйста, отправляйте только свои фотографии, указывайте место и время съемки для контекста.`,
});

const chatsArray = db.collection('chatsArray');
const approvedArray = db.collection('approvedArray');
const rejectedArray = db.collection('rejectedArray');

const getUserByFile = (fileId) => {
  const list = chatsArray.where({ fileId });
  if (list.length() === 0) {
    return null;
  }

  return list.items[0];
};

const checkMessage = (msg) => {
  const chatId = msg.chat.id;
  const original = msg.reply_to_message;

  if (!original) {
    bot.sendMessage(chatId, 'Не найдено оригинальное сообщение');
    return false;
  }

  const fileId = original.photo[0].file_unique_id;
  if (approvedArray.where({ fileId }).length()) {
    bot.sendMessage(chatId, 'Эта фотография уже была принята');
    // return false;
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

bot.on('message', (msg) => {
  const isAdminGroupMessage = msg.chat.id.toString() === nerdsbayPhotoAdmins;

  if (isAdminGroupMessage && msg.text === confirmMessage) {
    if (!checkMessage(msg)) {
      return;
    }

    const original = msg.reply_to_message;
    const fileId = original.photo[0].file_unique_id;

    bot.forwardMessage(nerdsbayPhoto, msg.chat.id, original.message_id);
    approvedArray.insert({ fileId });

    const savedUser = getUserByFile(fileId);
    if (savedUser) {
      bot.sendMessage(savedUser.user, 'Фотография опубликована!', {
        reply_to_message_id: savedUser.msgId,
      });
    }
  }
});

bot.onText(/no (.+)/, (msg, match) => {
  const isAdminGroupMessage = msg.chat.id.toString() === nerdsbayPhotoAdmins;

  const resp = match[1]; // the captured "reason"
  if (isAdminGroupMessage) {
    if (!checkMessage(msg)) {
      return;
    }

    const original = msg.reply_to_message;
    const fileId = original.photo[0].file_unique_id;

    rejectedArray.insert({ fileId });

    const savedUser = getUserByFile(fileId);
    console.info({ savedUser });
    if (savedUser) {
      bot.sendMessage(
        savedUser.user,
        `Фотография не опубликована, причина: "${resp}"`,
        { reply_to_message_id: savedUser.msgId },
      );
    }
  }
});
