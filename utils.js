import fs from "fs";
import { Readable } from "stream";
import { connectToDatabase } from "./db.js";
import { Jimp, loadFont } from "jimp";
import * as fonts from "jimp/fonts";
import { settings } from "./settings.js";
import { subMonths, startOfWeek, startOfMonth } from "date-fns";
import { StoreSession } from "telegram/sessions/index.js";
import { Api, TelegramClient } from "telegram";
import TelegramBot from "node-telegram-bot-api";
import input from "input";
import { fileURLToPath } from "url";
import path, { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const getFileInfo = async (file_id) => {
  const url = `https://api.telegram.org/bot${settings.token}/getFile?file_id=${file_id}`;

  const result = await fetch(url);
  const fileData = await result.json();

  return fileData;
};

const downloadUserPicture = async (avatarFileId, userId) => {
  const avatarFileInfo = await getFileInfo(avatarFileId);

  return await utils.downloadFile(
    avatarFileInfo.result.file_path,
    userId,
    true,
  );
};

const downloadFile = async (file_path, chatId, options) => {
  const url = `https://api.telegram.org/file/bot${settings.token}/${file_path}`;
  const fileName = file_path.replaceAll("/", "_");

  const isContest = !!options?.isContest;

  const dir = isContest ? "contest" : "output";

  const targetFileName = options?.isUserPicture
    ? `./${dir}/user_${chatId}_${fileName}`
    : `./${dir}/file_${chatId}_${fileName}`;

  const response = await fetch(url);
  const readStream = Readable.fromWeb(response.body);
  const writeStream = fs.createWriteStream(targetFileName);

  readStream.pipe(writeStream);

  return new Promise((resolve) => {
    writeStream.on("close", function () {
      resolve(targetFileName);
    });
  });
};

const addWatermark = async (fileName, watermark, avatarFileName) => {
  console.info({ fileName }, { watermark });
  const image = await Jimp.read(path.join(__dirname, fileName));
  const border = 80;
  const { width, height } = image.bitmap;

  const target = new Jimp({
    width,
    height: height + border,
    color: 0xffffffff,
  });
  target.composite(image, 0, 0);

  const logo = await Jimp.read(`assets/logo.jpg`);
  logo.circle();
  target.composite(logo, 10, height + 10);

  if (avatarFileName) {
    const avatar = await Jimp.read(path.join(__dirname, avatarFileName));

    avatar.resize({ w: 60, h: 60 }).circle();
    target.composite(avatar, 80, height + 10);
  }

  const font = await loadFont(fonts.SANS_32_BLACK);

  target.print({
    font,
    x: 150,
    y: height + 32,
    text: watermark,
  });

  await target.write(path.join(__dirname, fileName));
};

const deleteFile = (fileName) => {
  fs.rmSync(path.join(__dirname, fileName));
};

const getUserByFile = async (fileId) => {
  const collections = await connectToDatabase();
  const item = await collections.queue.findOne({ fileId });

  return item;
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

const checkMessage = async (msg, bot) => {
  const collections = await connectToDatabase();
  const chatId = msg.chat.id;
  const original = msg.reply_to_message;

  if (!original) {
    bot.sendMessage(chatId, "Не найдено оригинальное сообщение");
    return false;
  }
  const fileId = getFileId(original);

  const approveCount = await collections.approved.countDocuments({ fileId });
  const rejectCount = await collections.rejected.countDocuments({ fileId });

  if (approveCount) {
    bot.sendMessage(chatId, "Эта фотография уже была принята");
    return false;
  }

  if (rejectCount) {
    bot.sendMessage(chatId, "Эта фотография уже была отклонена");
    return false;
  }

  return true;
};

const makePostcard = async () => {
  const prevMonth = subMonths(new Date(), 1);
  const monthIndex = prevMonth.getMonth();

  const months = [
    "tammikuun paras",
    "helmikuun paras",
    "Maaliskuun paras",
    "huhtikuun paras",
    "paras toukokuuta",
    "kesäkuun paras",
    "heinäkuun paras",
    "elokuun paras",
    "syyskuun paras",
    "lokakuun paras",
    "marraskuun paras",
    "joulukuun paras",
  ];

  const border = 20;

  const stampXOffset = randomIntFromInterval(border, 50);
  const stampYOffset = randomIntFromInterval(border * 2, 15);

  const stampRotate = randomIntFromInterval(0, 20);

  const image = await Jimp.read("output.jpg");
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

    const font = await loadFont("./font/18.fnt");

    // image.rotate(90);

    image.print({
      font,
      x: border,
      y: height - 50,
      text: `postikortti suomesta, ${months[monthIndex]}`,
    });
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

    const font = await loadFont("./font/18.fnt");

    image.rotate(90);

    image.print({
      font,
      x: border,
      y: width - 50,
      text: `postikortti suomesta, ${months[monthIndex]}`,
    });

    image.rotate(-90);
  }

  await image.write("output_stamp.jpg");
};

const squareImages = async (n, size) => {
  fs.rmSync("square", { recursive: true, force: true });

  fs.mkdirSync("square", { recursive: true });

  return await Promise.all(
    [...Array(n).keys()].map(async (i) => {
      if (!fs.existsSync(path.join(__dirname, `output/output_${i}.jpg`))) {
        console.error(`File output_${i}.jpg does not exist`);
        return;
      }

      const image = await Jimp.read(
        path.join(__dirname, `output/output_${i}.jpg`),
      );
      const { width, height } = image.bitmap;

      const isVertical = height > width;

      if (isVertical) {
        const diff = height - width;
        image.crop({ x: 0, y: diff / 2, h: width, w: width });
      } else {
        const diff = width - height;
        image.crop({ y: 0, x: diff / 2, h: height, w: height });
      }

      image.resize({ w: Number(size) || 512, h: Number(size) || 512 }); // resize

      return image.write(path.join(__dirname, `square/output_square_${i}.jpg`));
    }),
  );
};

const downloadPhoto = async (photo, client, name) => {
  await client.connect();

  const file = new Api.InputPhotoFileLocation({
    id: photo.id,
    accessHash: photo.accessHash,
    fileReference: photo.fileReference,
    thumbSize: "y",
  });
  try {
    const buffer = await client.downloadFile(file, {
      dcId: photo.dcId,
    });

    fs.writeFileSync(name ? name : "output.jpg", buffer);
  } catch (error) {
    console.error("Error downloading photo:", error, file);
  }
};

const getBestOfCurrentMonth = async (client) => {
  await client.connect();

  const req = {
    peer: settings.photoChannel,
    limit: 1000, // we hope it is more than one month
  };

  const result = await client.invoke(new Api.messages.GetHistory(req));

  let mappedMessages = await Promise.all(
    result.messages.map(async (message) => {
      let reactionsCnt = 0;

      if (message.reactions) {
        const reactions = message.reactions.results;
        reactionsCnt = reactions.map((i) => i.count).reduce((i, j) => i + j, 0);
      }

      if (message && message.fwdFrom && message.media && message.media.photo) {
        return {
          title: message.message,
          from: message.fwdFrom.fromName,
          fromId: message.fwdFrom.fromId ? message.fwdFrom.fromId.userId : "",
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

  const bestOfTheMonth = mappedMessages[0];
  await downloadPhoto(bestOfTheMonth.photo, client);

  return bestOfTheMonth;
};

const getBestOfCurrentWeek = async (client) => {
  await client.connect();

  fs.rmSync("output", { recursive: true, force: true });
  fs.mkdirSync("output", { recursive: true });

  const req = {
    peer: settings.photoChannel,
    limit: 100,
  };

  const result = await client.invoke(new Api.messages.GetHistory(req));

  let mappedMessages = await Promise.all(
    result.messages.map(async (message) => {
      let reactionsCnt = 0;

      if (message.reactions) {
        const reactions = message.reactions.results;
        reactionsCnt = reactions.map((i) => i.count).reduce((i, j) => i + j, 0);
      }

      if (message && message.fwdFrom && message.media && message.media.photo) {
        return {
          title: message.message,
          from: message.fwdFrom.fromName,
          fromId: message.fwdFrom.fromId ? message.fwdFrom.fromId.userId : "",
          dateFormatted: new Date(message.date * 1000).toDateString(),
          date: message.date,
          photo: message.media.photo,
          reactionsCnt,
        };
      }

      return null;
    }),
  );

  const now = new Date();
  const startOfWeekDate = startOfWeek(now);

  mappedMessages = mappedMessages
    .filter((message) => !!message)
    .filter((message) => {
      return (
        message &&
        message.date &&
        new Date(message.date * 1000) >= new Date(startOfWeekDate)
      );
    })
    .sort((mA, mB) => mB.reactionsCnt - mA.reactionsCnt);

  let length = 0;
  if (mappedMessages.length >= 9) {
    length = 9;
  } else if (mappedMessages.length >= 6) {
    length = 6;
  } else if (mappedMessages.length >= 4) {
    length = 4;
  } else if (mappedMessages.length >= 2) {
    length = 2;
  }

  for (let i = 0; i < length; i++) {
    const message = mappedMessages[i];
    if (message) {
      await downloadPhoto(
        message.photo,
        client,
        path.join(__dirname, `/output/output_${i}.jpg`),
      );
    }
  }

  return length;
};

const randomIntFromInterval = (min, max) => {
  // min and max included
  return Math.floor(Math.random() * (max - min + 1) + min);
};

const isInAdminGroup = (msg) => msg.chat.id.toString() === settings.adminGroup;

const login = async () => {
  console.info({
    phoneNumber: settings.phone,
    password: settings.password,
    phoneCode: settings.phoneCode,
  });
  const storeSession = new StoreSession("my_session");
  const client = new TelegramClient(
    storeSession,
    Number(settings.apiId),
    settings.apiHash,
    { connectionRetries: 5 },
  );

  await client.start({
    phoneNumber: settings.phone,
    password: async () => await input.text("password?"),
    phoneCode: async () => await input.text("Code ?"),
    onError: (err) => console.log(err),
  });

  console.log("You should now be connected.");

  return client;
};

const createBot = () => {
  const bot = new TelegramBot(settings.token, { polling: true });
  console.info("Started");
  bot.on("polling_error", console.log);

  return bot;
};

export const utils = {
  randomIntFromInterval,
  getBestOfCurrentWeek,
  getBestOfCurrentMonth,
  downloadPhoto,
  squareImages,
  makePostcard,
  checkMessage,
  getUserByFile,
  downloadFile,
  getFileInfo,
  getFileId,
  isInAdminGroup,
  login,
  createBot,
  addWatermark,
  deleteFile,
  downloadUserPicture,
};
