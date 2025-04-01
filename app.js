// https://t.me/image_accept_bot
const dotenv = require('dotenv');

dotenv.config();

const {CronJob} = require('cron');
const fs = require('fs');
const { writeFile } = require('node:fs/promises');
const { Readable } = require('node:stream');
const TelegramBot = require('node-telegram-bot-api');
const { TelegramClient, Api } = require('telegram');
const { StoreSession } = require('telegram/sessions');
const { subMonths, startOfMonth, format } = require('date-fns');
const input = require('input');
const { Jimp, loadFont } = require('jimp');
const locallydb = require('locallydb');

const db = new locallydb('./mydb');

const logObject = (obj) => console.log(JSON.stringify(obj, undefined, 2));

const createBot = () => {
  const bot = new TelegramBot(token, { polling: true });
  bot.on('polling_error', console.log);

    bot.sendMessage(
    nerdsbayPhotoAdmins,
    `hi there' I've been started`,
  );

  return bot;
};

const token = process.env.TOKEN;
const nerdsbayPhotoAdmins = process.env.ADMIN_GROUP_ID;
const nerdsbayPhoto = process.env.PHOTO_CHANNEL;
const confirmMessage = 'ok';

const fwdQueue = db.collection('fwdQueue');

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

const messWithImages = async () => {
  const prevMonth = subMonths(new Date(), 1);
  const monthIndex = prevMonth.getMonth();

  const months = [
    'tammikuun paras',
    'helmikuun paras',
    'Maaliskuun paras',
    'huhtikuun paras',
    'paras toukokuuta',
    'kesäkuun paras',
    'heinäkuun paras',
    'elokuun paras',
    'syyskuun paras',
    'lokakuun paras',
    'marraskuun paras',
    'joulukuun paras',
  ];

  const border = 20;

  const stampXOffset = randomIntFromInterval(border, 50);
  const stampYOffset = randomIntFromInterval(border * 2, 15);

  const stampRotate = randomIntFromInterval(0, 20);

  const image = await Jimp.read('output.jpg');
  const { width, height } = image.bitmap;

  const isVertical = height > width;

  const stamp = await Jimp.read(`stamps/${randomIntFromInterval(1, 5)}.png`);

  if (isVertical) {
    stamp.resize({ w: width / 5 });
    const { width: stampWidth, height: stampHeight } = stamp.bitmap;

    // apply borders
    const borderH = new Jimp({ width, height: border, color: 0xffffffff });
    image.composite(borderH, 0, 0);

    const borderV = new Jimp({ width: border, height, color: 0xffffffff });
    image.composite(borderV, width - border, 0);
    image.composite(borderV, 0, 0);

    const borderB = new Jimp({ width, height: border * 4, color: 0xffffffff });
    image.composite(borderB, 0, height - border * 4);

    const overlay = new Jimp({
      width,
      height: height - border * 3,
      color: 0x000000ff,
    });
    overlay.opacity(0.1);

    image.composite(overlay, 0, 0);

    const stampBg = new Jimp({
      width: stampWidth,
      height: stampHeight,
      color: 0xffffffff,
    });

    stampBg.opacity(0.1);

    stamp.composite(stampBg, 0, 0);
    stamp.rotate(stampRotate);

    image.composite(stamp, width - stampWidth - stampXOffset, stampYOffset);

    const font = await loadFont('./font/18.fnt');

    // image.rotate(90);

    image.print({
      font,
      x: border,
      y: height - 50,
      text: `postikortti suomesta, ${months[monthIndex]}`,
    });

    // image.rotate(-90);
  } else {
    stamp.resize({ h: height / 5 });
    const { width: stampWidth, height: stampHeight } = stamp.bitmap;

    // apply borders
    const borderH = new Jimp({ width, height: border, color: 0xffffffff });
    image.composite(borderH, 0, 0);
    image.composite(borderH, 0, height - border);

    const borderR = new Jimp({ width: border, height, color: 0xffffffff });
    image.composite(borderR, width - border, 0);

    const borderL = new Jimp({ width: border * 4, height, color: 0xffffffff });
    image.composite(borderL, 0, 0);

    const overlay = new Jimp({ width, height, color: 0x000000ff });
    overlay.opacity(0.1);

    image.composite(overlay, border * 3, 0);

    const stampBg = new Jimp({
      width: stampWidth,
      height: stampHeight,
      color: 0xffffffff,
    });

    stampBg.opacity(0.1);

    stamp.composite(stampBg, 0, 0);
    stamp.rotate(stampRotate);

    image.composite(stamp, width - stampWidth - stampXOffset, stampYOffset);

    const font = await loadFont('./font/18.fnt');

    image.rotate(90);

    image.print({
      font,
      x: border,
      y: width - 50,
      text: `postikortti suomesta, ${months[monthIndex]}`,
    });

    image.rotate(-90);
  }

  await image.write('output_stamp.jpg');
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
    limit: 1000, // we hope it is more than one month
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
    .sort((mA, mB) => mB.reactionsCnt - mA.reactionsCnt);

  // console.info(
  //   mappedMessages.map((message) => {
  //     return {
  //       title: message.title,
  //       from: message.from,
  //       fromId: message.fromId,
  //       dateFormatted: message.dateFormatted,
  //       date: message.date,
  //       // photo: message.media.photo,
  //       reactionsCnt: message.reactionsCnt,
  //     };
  //   }),
  // );

  const bestOfTheMonth = mappedMessages[0];
  await downloadPhoto(bestOfTheMonth.photo, client);

  return bestOfTheMonth;
};

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
        fwdQueue.insert({ chatId: msg.chat.id, messageId: original.message_id})
      } catch (e) {
        console.log('forward failed: ', e);
      }
      approvedArray.insert({ fileId });

      const savedUser = getUserByFile(fileId);
      if (savedUser) {
        try {
          bot.sendMessage(
            savedUser.user,
            `Спасибо, материал одобрен, возможна очередь отправки. ${
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

  

  bot.onText(/^get_best_of_month$/i, async (msg) => {
    const chatId = msg.chat.id;

    const prevMonth = subMonths(new Date(), 1);

    const client = await login();
    const bestOfTheMonth = await getBestOfCurrentMonth(client);

    await messWithImages();

    const buffer = fs.readFileSync(`./output_stamp.jpg`);

    bot.sendPhoto(chatId, buffer, {
      caption: `Top photo for ${format(prevMonth, 'MMMM yyyy')} with ${
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

    bot.sendMessage(
      chatId,
      `I have ${messages.length} in my fwdQueue`,
    );
  });
};


function randomIntFromInterval(min, max) {
  // min and max included
  return Math.floor(Math.random() * (max - min + 1) + min);
}

const bot = createBot();
setupBotEvents();

const tick = () => {
  const messages = fwdQueue.where().items;

  // bot.sendMessage(
  //   nerdsbayPhotoAdmins,
  //   `У меня ${messages.length} в очереди`,
  // );

  if (!messages || !messages.length) {
    return;
  }

  const message = messages[0];
  const cid = message.cid;

  // bot.sendMessage(
  //   nerdsbayPhotoAdmins,
  //   `Отправляю ${message.messageId}, cid: ${cid}`,
  // );

  // {
  //   chatId: -4226153478,
  //   messageId: 9525,
  //   cid: 0,
  //   '$created': '2025-04-01T15:32:59.348Z',
  //   '$updated': '2025-04-01T15:32:59.348Z'
  // }

  bot.forwardMessage(nerdsbayPhoto, message.chatId, message.messageId);

  fwdQueue.remove(cid);
  fwdQueue.save();
  // bot.forwardMessage
}
const job = new CronJob(
	'* */30 * * * *', // every half an hour
  // '*/30 * * * * *', // every half a minute
	() => {
    tick();
  }, // onTick
	null, // onComplete
	true, // start
	'America/Los_Angeles' // timeZone
);

// messWithImages();
