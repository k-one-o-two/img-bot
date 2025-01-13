// https://t.me/image_accept_bot
const dotenv = require('dotenv');

dotenv.config();

const fs = require('fs');
const { writeFile } = require('node:fs/promises');
const { Readable } = require('node:stream');

const TelegramBot = require('node-telegram-bot-api');

const { TelegramClient, Api } = require('telegram');
const { StoreSession } = require('telegram/sessions');

const { subMonths, startOfMonth, format } = require('date-fns');

const input = require('input');

const locallydb = require('locallydb');
const db = new locallydb('./mydb');

const logObject = (obj) => console.log(JSON.stringify(obj, undefined, 2));

const createBot = () => {
  const bot = new TelegramBot(token, { polling: true });
  bot.on('polling_error', console.log);

  return bot;
};

const token = process.env.TOKEN;
const nerdsbayPhotoAdmins = process.env.ADMIN_GROUP_ID;
const nerdsbayPhoto = process.env.PHOTO_CHANNEL;
const confirmMessage = 'ok';

console.log(new Date().toString(), ' BOT started');

const chatsArray = db.collection('chatsArray');
const approvedArray = db.collection('approvedArray');
const rejectedArray = db.collection('rejectedArray');

const bestOf24Array = db.collection('bestOf24Array');
const votedList = db.collection('votedList');

// contest dates
const contestAcceptEnds = new Date('2024-12-22T20:00:00.000Z'); // 22 декабря, 22:00 UTC+2
const voteStartDate = new Date('2024-12-23T07:00:00.000Z'); // 23 декабря, 9:00

const getFileInfo = async (file_id) => {
  const url = `https://api.telegram.org/bot${token}/getFile?file_id=${file_id}`;

  const result = await fetch(url);
  const fileData = await result.json();

  return fileData;
};

const downloadFile = async (file_path, chatId) => {
  const url = `https://api.telegram.org/file/bot${token}/${file_path}`;
  const fileName = file_path.replaceAll('/', '_');

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

const login = async () => {
  // const stringSession = 'my_session';
  const storeSession = new StoreSession('my_session');
  const client = new TelegramClient(
    storeSession,
    Number(process.env.API_ID),
    process.env.API_HASH,
    { connectionRetries: 5 },
  );
  // console.info({
  //   phoneNumber: process.env.PHONE,
  //   password: process.env.PASS,
  //   phoneCode: process.env.P_CODE,
  //   onError: (err) => console.log(err),

  //   // botAuthToken: token,
  // });
  await client.start({
    phoneNumber: process.env.PHONE,
    password: async () => await input.text('password?'),
    phoneCode: async () => await input.text('Code ?'),
    onError: (err) => console.log(err),

    // botAuthToken: token,
  });
  console.log(client.session.save());

  return client;
};

const downloadPhoto = async (photo, client) => {
  const buffer = await client.downloadFile(
    new Api.InputPhotoFileLocation({
      id: photo.id,
      accessHash: photo.accessHash,
      fileReference: photo.fileReference,
      thumbSize: 'y',
    }),
    {
      dcId: photo.dcId,
    },
  );

  fs.writeFileSync('output.jpg', buffer);
};

const getBestOfCurrentMonth = async (client) => {
  await client.connect();

  const req = {
    peer: process.env.PHOTO_CHANNEL,
    limit: 100, // we hope it is more than one month
  };

  const result = await client.invoke(new Api.messages.GetHistory(req));

  let mappedMessages = await Promise.all(
    result.messages.map(async (message) => {
      let reactionsCnt = 0;

      if (message.reactions) {
        const reactions = message.reactions.results;
        reactionsCnt = reactions.map((i) => i.count).reduce((i, j) => i + j);
      }

      if (message && message.fwdFrom && message.media && message.media.photo) {
        return {
          title: message.message,
          from: message.fwdFrom.fromName,
          fromId: message.fwdFrom.fromId ? message.fwdFrom.fromId.userId : '',
          dateFormatted: new Date(message.date * 1000).toDateString(),
          date: message.date,
          photo: message.media.photo,
          reactionsCnt,
        };
      }

      return null;
    }),
  );

  const prevMonth = subMonths(new Date(), 1);
  const startOfPrevMonth = startOfMonth(new Date(prevMonth));
  const startOfCurMonth = startOfMonth(new Date());

  mappedMessages = mappedMessages
    .filter((message) => {
      return (
        message &&
        message.date &&
        new Date(message.date * 1000) >= new Date(startOfPrevMonth) &&
        new Date(message.date * 1000) < new Date(startOfCurMonth)
      );
    })
    .sort((mA, mB) => mA - mB);

  const bestOfTheMonth = mappedMessages[0];
  downloadPhoto(bestOfTheMonth.photo, client);

  return bestOfTheMonth;
};

// const sendBestOfCurrentMonth = async (bot, bestOfTheMonth) => {
//   const buffer = fs.readFileSync(`./output.jpg`);

//   bot.sendPhoto(nerdsbayPhoto, buffer, {
//     caption: `Лучшая фотография ${bestOfTheMonth.reactionsCnt} likes`,
//   });
// };

// BOT event listeners
const setupBotEvents = () => {
  bot.on('photo', (msg) => {
    const isAdminGroupMessage = msg.chat.id.toString() === nerdsbayPhotoAdmins;
    if (isAdminGroupMessage) {
      return;
    }

    const chatId = msg.chat.id;

    if (msg.caption === '#24best') {
      bot.sendMessage(
        chatId,
        `Прием фотографий уже закончен, я передам фотографию обычным образом`,
        { reply_to_message_id: msg.message_id },
      );
    }

    // contest section

    // if (msg.caption === '#24best') {
    //   // contest photo

    //   const now = new Date();

    //   if (now >= contestAcceptEnds) {
    //     bot.sendMessage(
    //       chatId,
    //       `Прием фотографий уже закончен закончен (${contestAcceptEnds.toLocaleDateString(
    //         'ru',
    //       )})`,
    //       {
    //         reply_to_message_id: msg.message_id,
    //       },
    //     );

    //     return;
    //   }

    //   console.log(new Date().toString(), ' BOT got photo for contest');

    //   const fileId = msg.photo[msg.photo.length - 1].file_id;
    //   const fileUniqueId = msg.photo[0].file_unique_id;

    //   const userContestEntry = bestOf24Array.where({ user: msg.from.id }).items;

    //   if (userContestEntry.length) {
    //     bot.sendMessage(
    //       chatId,
    //       `На конкурс можно отправить только одну фотографию`,
    //       {
    //         reply_to_message_id: msg.message_id,
    //       },
    //     );
    //   } else {
    //     getFileInfo(fileId).then((data) => {
    //       if (data.ok) {
    //         downloadFile(data.result.file_path, chatId).then(() => {
    //           bestOf24Array.insert({
    //             user: msg.from.id,
    //             first_name: msg.from.first_name,
    //             username: msg.from.username,
    //             msgId: msg.message_id,
    //             file: `${chatId}_${data.result.file_path.replaceAll('/', '_')}`,
    //             fileId: fileUniqueId,
    //             votes: 0,
    //           });
    //         });
    //       }
    //     });
    //     bot.sendMessage(chatId, `Я получил фотографию на конкурс, удачи!`, {
    //       reply_to_message_id: msg.message_id,
    //     });
    //   }
    // } else {
    // normal photo

    console.log(new Date().toString(), ' BOT got photo');

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
    // }
  });

  bot.on('video', (msg) => {
    const isAdminGroupMessage = msg.chat.id.toString() === nerdsbayPhotoAdmins;
    if (isAdminGroupMessage) {
      return;
    }

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
  bot.onText(/^ok\s?(.*)/i, (msg, match) => {
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
            `Материал опубликован! ${
              comment ? `Комментарий: "${comment}"` : ''
            }`,
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
  bot.onText(/^no (.+)/i, (msg, match) => {
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

  bot.onText(/^#bestOf24$/i, (msg) => {
    bot.sendMessage(chatId, `Конкурс уже закончен и голосование закрыто`, {
      reply_to_message_id: msg.message_id,
    });

    return;

    // const entries = bestOf24Array.items;

    // const chatId = msg.chat.id;

    // if (msg.chat.type !== 'private') {
    //   bot.sendMessage(
    //     chatId,
    //     `Эта команда доступна только в личных сообщениях с ботом`,
    //     {
    //       reply_to_message_id: msg.message_id,
    //     },
    //   );

    //   return;
    // }

    // const now = new Date();

    // if (now < voteStartDate) {
    //   bot.sendMessage(
    //     chatId,
    //     `Подождите, голосование начнется ${voteStartDate.toLocaleDateString(
    //       'ru',
    //     )} ${voteStartDate.toLocaleTimeString('ru')}`,
    //     {
    //       reply_to_message_id: msg.message_id,
    //     },
    //   );

    //   return;
    // }

    // bot.sendMessage(
    //   chatId,
    //   `Сейчас я отправлю присланные на конкурс фотографии в случайном порядке.`,
    //   {
    //     reply_to_message_id: msg.message_id,
    //   },
    // );

    // const sorted = entries.sort(() => Math.random() - 0.5); // random sort

    // let i = 0;
    // const id = setInterval(function () {
    //   if (i >= sorted.length) {
    //     clearInterval(id);
    //     return;
    //   }

    //   const entry = sorted[i];
    //   const buffer = fs.readFileSync(`./24/${entry.file}`);

    //   bot.sendPhoto(chatId, buffer, {
    //     caption: `#${entry.cid}`,
    //   });
    //   i++;
    // }, 1000);

    // if (userHasVoted(msg)) {
    //   bot.sendMessage(chatId, `Твой голос уже записан`, {
    //     reply_to_message_id: msg.message_id,
    //   });
    // } else {
    //   bot.sendMessage(
    //     chatId,
    //     `Чтобы отдать свой голос, ответь на сообщение с понравившейся фотографией текстом vote`,
    //     {
    //       reply_to_message_id: msg.message_id,
    //     },
    //   );
    // }
  });

  bot.onText(/^vote$/i, (msg) => {
    const chatId = msg.chat.id;

    bot.sendMessage(chatId, `Конкурс уже закончен и голосование закрыто`, {
      reply_to_message_id: msg.message_id,
    });

    return;

    // if (msg.chat.type !== 'private') {
    //   bot.sendMessage(
    //     chatId,
    //     `Эта команда доступна только в личных сообщениях с ботом`,
    //     {
    //       reply_to_message_id: msg.message_id,
    //     },
    //   );

    //   return;
    // }

    // const now = new Date();

    // if (now < voteStartDate) {
    //   bot.sendMessage(
    //     chatId,
    //     `Подождите, голосование начнется ${voteStartDate.toLocaleDateString(
    //       'ru',
    //     )} ${voteStartDate.toLocaleTimeString('ru')}`,
    //     {
    //       reply_to_message_id: msg.message_id,
    //     },
    //   );

    //   return;
    // }

    // if (userHasVoted(msg)) {
    //   bot.sendMessage(chatId, `Голосовать можно только один раз`, {
    //     reply_to_message_id: msg.message_id,
    //   });
    //   return;
    // }

    // const original = msg.reply_to_message;
    // const cid = Number(/(#\d+)/.exec(original.caption)[0].replace('#', ''));
    // const user = msg.from.id;

    // const itemToVote = bestOf24Array.get(cid);

    // if (!itemToVote) {
    //   return;
    // }

    // if (itemToVote.user === user) {
    //   bot.sendMessage(chatId, `Нельзя голосовать за свою фотографию`, {
    //     reply_to_message_id: msg.message_id,
    //   });

    //   return;
    // }

    // bestOf24Array.update(cid, {
    //   votes: Number(itemToVote.votes) + 1,
    // });
    // votedList.insert({
    //   user_id: user,
    // });

    // bot.sendMessage(chatId, `Спасибо, твой голос учтен`, {
    //   reply_to_message_id: msg.message_id,
    // });
  });

  bot.onText(/^get_winners$/i, (msg) => {
    console.log(new Date().toString(), ' BOT got message');
    const chatId = msg.chat.id;
    const isAdminGroupMessage = msg.chat.id.toString() === nerdsbayPhotoAdmins;

    if (!isAdminGroupMessage) {
      return;
    }

    const entries = bestOf24Array.items;
    const sorted = entries.sort((a, b) => b.votes - a.votes);

    let i = 0;
    const id = setInterval(function () {
      if (i >= sorted.length) {
        clearInterval(id);
        return;
      }

      const entry = sorted[i];
      const buffer = fs.readFileSync(`./24/${entry.file}`);

      bot.sendPhoto(chatId, buffer, {
        caption: entry.username
          ? `#${entry.cid} votes: ${entry.votes}, author: ${entry.first_name} (@${entry.username})`
          : `#${entry.cid} votes: ${entry.votes}, author: ${entry.first_name}`,
      });
      i++;
    }, 1000);
  });

  bot.onText(/^get_best_of_month$/i, async (msg) => {
    const prevMonth = subMonths(new Date(), 1);

    const client = await login();
    const bestOfTheMonth = await getBestOfCurrentMonth(client);

    const buffer = fs.readFileSync(`./output.jpg`);

    bot.sendPhoto(nerdsbayPhoto, buffer, {
      caption: `Top photo for ${format(prevMonth, 'MMMM yyyy')} with ${
        bestOfTheMonth.reactionsCnt
      } likes`,
    });
  });
};

const bot = createBot();
setupBotEvents();
