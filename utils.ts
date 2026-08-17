import fs from "fs";
import { Readable } from "stream";
import { getCollections } from "./db.js";
import { Jimp, loadFont, type JimpInstance } from "jimp";
import { rgbaToInt } from "@jimp/utils";
import { settings } from "./settings.js";
import { subMonths, startOfWeek, startOfMonth } from "date-fns";
import { StoreSession } from "telegram/sessions/index.js";
import { Api, TelegramClient } from "telegram";
import {
  Bot,
  InputFile,
  type Api as BotApi,
  type Message,
} from "node-telegram-bot-api";
import input from "input";
import { fileURLToPath } from "url";
import path, { dirname } from "path";

const THRESHOLD = 0.2;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface Color {
  red: number;
  green: number;
  blue: number;
}

interface PaletteEntry {
  avg: Color;
  count: number;
}

interface DownloadFileOptions {
  isUserPicture?: boolean;
  isContest?: boolean;
}

interface AddWatermarkOptions {
  replace?: boolean;
  contestTarget?: boolean;
}

interface FileInfoResponse {
  ok: boolean;
  result: {
    file_id: string;
    file_unique_id: string;
    file_size?: number;
    file_path: string;
  };
}

const getFileInfo = async (file_id: string): Promise<FileInfoResponse> => {
  const url = `https://api.telegram.org/bot${settings.token}/getFile?file_id=${file_id}`;

  const result = await fetch(url);
  const fileData = (await result.json()) as FileInfoResponse;

  return fileData;
};

const downloadUserPicture = async (
  avatarFileId: string,
  userId: number | string,
): Promise<string> => {
  const avatarFileInfo = await getFileInfo(avatarFileId);

  return await utils.downloadFile(avatarFileInfo.result.file_path, userId, {
    isUserPicture: true,
  });
};

const downloadFile = async (
  file_path: string,
  chatId: number | string,
  options?: DownloadFileOptions,
): Promise<string> => {
  const url = `https://api.telegram.org/file/bot${settings.token}/${file_path}`;
  const fileName = file_path.replaceAll("/", "_");

  const isContest = !!options?.isContest;

  const dir = isContest ? "contest" : "output";

  const targetFileName = options?.isUserPicture
    ? `./${dir}/user_${chatId}_${fileName}`
    : `./${dir}/file_${chatId}_${fileName}`;

  const response = await fetch(url);
  const readStream = Readable.fromWeb(response.body as any);
  const writeStream = fs.createWriteStream(targetFileName);

  readStream.pipe(writeStream);

  return new Promise((resolve) => {
    writeStream.on("close", function () {
      resolve(targetFileName);
    });
  });
};

const isDark = (image: JimpInstance): boolean => {
  const { width, height } = image.bitmap;

  let colorSum = 0;

  image.scan((_x: number, _y: number, idx: number) => {
    const r = image.bitmap.data[idx];
    const g = image.bitmap.data[idx + 1];
    const b = image.bitmap.data[idx + 2];

    const avg = Math.floor((r + g + b) / 3);
    colorSum += avg;
  });

  const brightness = Math.floor(colorSum / (width * height));

  return brightness < 50;
};

const addWatermark = async (
  fileName: string,
  watermark: string,
  avatarFileName?: string | null,
  options?: AddWatermarkOptions,
): Promise<void> => {
  const image = (await Jimp.read(
    path.join(__dirname, fileName),
  )) as JimpInstance;
  const border = 80;
  const { width, height } = image.bitmap;

  const palette = await extractPalette(image);

  const isDarkImage = isDark(image);

  const color = isDarkImage ? 0x00000000 : 0xffffffff;

  const target = new Jimp({
    width,
    height: options && options.replace ? height : height + border,
    color,
  }) as JimpInstance;
  target.composite(image, 0, 0);

  const { height: targetHeight } = target.bitmap;

  if (options && options.replace) {
    const borderB = new Jimp({ width, height: border, color }) as JimpInstance;
    target.composite(borderB, 0, targetHeight - border);
  }

  const logo = (await Jimp.read(`assets/logo.jpg`)) as JimpInstance;
  logo.circle();
  target.composite(logo, 10, targetHeight - 70);

  if (avatarFileName) {
    const avatar = (await Jimp.read(
      path.join(__dirname, avatarFileName),
    )) as JimpInstance;

    avatar.resize({ w: 60, h: 60 }).circle();
    target.composite(avatar, 80, targetHeight - 70);
  }

  const fontWhite = await loadFont("./font/j-white.fnt");
  const fontBlack = await loadFont("./font/j-black.fnt");

  target.print({
    font: isDarkImage ? fontWhite : fontBlack,
    x: 150,
    y: targetHeight - 48,
    text: watermark,
  });

  palette
    .sort(
      (a, b) =>
        rgbaToInt(a.avg.red, a.avg.green, a.avg.blue, 255) -
        rgbaToInt(b.avg.red, b.avg.green, b.avg.blue, 255),
    )
    .forEach((color, index) => {
      const square = new Jimp({
        width: 40,
        height: 80,
        color: rgbaToInt(color.avg.red, color.avg.green, color.avg.blue, 255),
      }) as JimpInstance;
      target.composite(
        square,
        width - index * 40,
        options && options.contestTarget ? height - 80 : height,
      );
    });

  if (options && options.contestTarget) {
    await target.write(
      ("./contest_result/" +
        fileName.replace("./contest/", "")) as `${string}.${string}`,
    );
  } else {
    await target.write(path.join(__dirname, fileName) as `${string}.${string}`);
  }
};

const deleteFile = (fileName: string): void => {
  fs.rmSync(path.join(__dirname, fileName));
};

const getUserByFile = async (fileId: string | undefined) => {
  const collections = await getCollections();
  const item = await collections.queue.findOne({ fileId });

  return item;
};

const getFileId = (msg: Message): string | undefined => {
  const isPhoto = !!msg.photo;
  const isVideo = !!msg.video;

  if (isPhoto) {
    return msg.photo![0].file_unique_id;
  } else if (isVideo) {
    return msg.video!.file_unique_id;
  } else {
    // nothing to reply to
    return;
  }
};

const checkMessage = async (msg: Message, api: BotApi): Promise<boolean> => {
  const collections = await getCollections();
  const chatId = msg.chat.id;
  const original = msg.reply_to_message;

  if (!original) {
    api.sendMessage({
      chat_id: chatId,
      text: "Не найдено оригинальное сообщение",
    });
    return false;
  }
  const fileId = getFileId(original);

  const approveCount = await collections.approved.countDocuments({ fileId });
  const rejectCount = await collections.rejected.countDocuments({ fileId });

  if (approveCount) {
    api.sendMessage({
      chat_id: chatId,
      text: "Эта фотография уже была принята",
    });
    return false;
  }

  if (rejectCount) {
    api.sendMessage({
      chat_id: chatId,
      text: "Эта фотография уже была отклонена",
    });
    return false;
  }

  return true;
};

const makePostcard = async (): Promise<void> => {
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

  const image = (await Jimp.read("output.jpg")) as JimpInstance;
  const { width, height } = image.bitmap;

  const isVertical = height > width;

  const stamp = (await Jimp.read(
    `stamps/${randomIntFromInterval(1, 5)}.png`,
  )) as JimpInstance;

  if (isVertical) {
    stamp.resize({ w: width / 5 });
    const { width: stampWidth, height: stampHeight } = stamp.bitmap;

    // apply borders
    const borderH = new Jimp({
      width,
      height: border,
      color: 0xffffffff,
    }) as JimpInstance;
    image.composite(borderH, 0, 0);

    const borderV = new Jimp({
      width: border,
      height,
      color: 0xffffffff,
    }) as JimpInstance;
    image.composite(borderV, width - border, 0);
    image.composite(borderV, 0, 0);

    const borderB = new Jimp({
      width,
      height: border * 4,
      color: 0xffffffff,
    }) as JimpInstance;
    image.composite(borderB, 0, height - border * 4);

    const overlay = new Jimp({
      width,
      height: height - border * 3,
      color: 0x000000ff,
    }) as JimpInstance;
    overlay.opacity(0.1);

    image.composite(overlay, 0, 0);

    const stampBg = new Jimp({
      width: stampWidth,
      height: stampHeight,
      color: 0xffffffff,
    }) as JimpInstance;

    stampBg.opacity(0.1);

    stamp.composite(stampBg, 0, 0);
    stamp.rotate(stampRotate);

    image.composite(stamp, width - stampWidth - stampXOffset, stampYOffset);

    const font = await loadFont("./font/18.fnt");

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
    const borderH = new Jimp({
      width,
      height: border,
      color: 0xffffffff,
    }) as JimpInstance;
    image.composite(borderH, 0, 0);
    image.composite(borderH, 0, height - border);

    const borderR = new Jimp({
      width: border,
      height,
      color: 0xffffffff,
    }) as JimpInstance;
    image.composite(borderR, width - border, 0);

    const borderL = new Jimp({
      width: border * 4,
      height,
      color: 0xffffffff,
    }) as JimpInstance;
    image.composite(borderL, 0, 0);

    const overlay = new Jimp({
      width,
      height,
      color: 0x000000ff,
    }) as JimpInstance;
    overlay.opacity(0.1);

    image.composite(overlay, border * 3, 0);

    const stampBg = new Jimp({
      width: stampWidth,
      height: stampHeight,
      color: 0xffffffff,
    }) as JimpInstance;

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

const squareImages = async (
  n: number,
  size: number | string,
): Promise<unknown[]> => {
  fs.rmSync("square", { recursive: true, force: true });

  fs.mkdirSync("square", { recursive: true });

  return await Promise.all(
    [...Array(n).keys()].map(async (i) => {
      if (!fs.existsSync(path.join(__dirname, `output/output_${i}.jpg`))) {
        console.error(`File output_${i}.jpg does not exist`);
        return;
      }

      const image = (await Jimp.read(
        path.join(__dirname, `output/output_${i}.jpg`),
      )) as JimpInstance;
      const { width, height } = image.bitmap;

      const cropped = image.crop({
        x: 0,
        y: 0,
        w: width,
        h: height - 80,
      });

      const { width: croppedWidth, height: croppedHeight } = cropped.bitmap;

      const isVertical = croppedHeight > croppedWidth;

      if (isVertical) {
        const diff = croppedHeight - croppedWidth;
        cropped.crop({ x: 0, y: diff / 2, h: croppedWidth, w: croppedWidth });
      } else {
        const diff = croppedWidth - croppedHeight;
        cropped.crop({ y: 0, x: diff / 2, h: croppedHeight, w: croppedHeight });
      }

      cropped.resize({ w: Number(size) || 512, h: Number(size) || 512 }); // resize

      return cropped.write(
        path.join(
          __dirname,
          `square/output_square_${i}.jpg`,
        ) as `${string}.${string}`,
      );
    }),
  );
};

const downloadPhoto = async (
  photo: any,
  client: TelegramClient,
  name?: string,
): Promise<void> => {
  const file = new Api.InputPhotoFileLocation({
    id: photo.id,
    accessHash: photo.accessHash,
    fileReference: photo.fileReference,
    thumbSize: "y",
  });
  try {
    const buffer = await client.downloadFile(file, {});

    fs.writeFileSync(name ? name : "output.jpg", buffer as Buffer);
  } catch (error) {
    console.error("Error downloading photo:", error, file);
  }
};

interface MappedMessage {
  title: string;
  from: string | undefined;
  fromId: any;
  dateFormatted: string;
  date: number;
  photo: any;
  reactionsCnt: number;
}

const getBestOfCurrentMonth = async (
  client: TelegramClient,
): Promise<MappedMessage> => {
  const req = {
    peer: settings.photoChannel,
    limit: 1000, // we hope it is more than one month
  };

  const result: any = await client.invoke(new Api.messages.GetHistory(req));

  let mappedMessages: (MappedMessage | null)[] = await Promise.all(
    result.messages.map(async (message: any) => {
      let reactionsCnt = 0;

      if (message.reactions) {
        const reactions = message.reactions.results;
        reactionsCnt = reactions
          .map((i: any) => i.count)
          .reduce((i: number, j: number) => i + j, 0);
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

  const filteredMessages: MappedMessage[] = mappedMessages
    .filter((message): message is MappedMessage => {
      return (
        !!message &&
        !!message.date &&
        new Date(message.date * 1000) >= new Date(startOfPrevMonth) &&
        new Date(message.date * 1000) < new Date(startOfCurMonth)
      );
    })
    .sort((mA, mB) => mB.reactionsCnt - mA.reactionsCnt);

  const bestOfTheMonth = filteredMessages[0];
  await downloadPhoto(bestOfTheMonth.photo, client);

  return bestOfTheMonth;
};

const getBestOfCurrentWeek = async (
  client: TelegramClient,
): Promise<number> => {
  fs.rmSync("output", { recursive: true, force: true });
  fs.mkdirSync("output", { recursive: true });

  const req = {
    peer: settings.photoChannel,
    limit: 100,
  };

  const result: any = await client.invoke(new Api.messages.GetHistory(req));

  let mappedMessages: (MappedMessage | null)[] = await Promise.all(
    result.messages.map(async (message: any) => {
      let reactionsCnt = 0;

      if (message.reactions) {
        const reactions = message.reactions.results;
        reactionsCnt = reactions
          .map((i: any) => i.count)
          .reduce((i: number, j: number) => i + j, 0);
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

  const filteredMessages: MappedMessage[] = mappedMessages
    .filter((message): message is MappedMessage => !!message)
    .filter((message) => {
      return (
        message &&
        message.date &&
        new Date(message.date * 1000) >= new Date(startOfWeekDate)
      );
    })
    .sort((mA, mB) => mB.reactionsCnt - mA.reactionsCnt);

  let length = 0;
  if (filteredMessages.length >= 9) {
    length = 9;
  } else if (filteredMessages.length >= 6) {
    length = 6;
  } else if (filteredMessages.length >= 4) {
    length = 4;
  } else if (filteredMessages.length >= 2) {
    length = 2;
  }

  for (let i = 0; i < length; i++) {
    const message = filteredMessages[i];
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

const randomIntFromInterval = (min: number, max: number): number => {
  // min and max included
  return Math.floor(Math.random() * (max - min + 1) + min);
};

const isInAdminGroup = (msg: Message): boolean =>
  msg.chat.id.toString() === settings.adminGroup;

const login = async (): Promise<TelegramClient> => {
  console.info({
    phoneNumber: settings.phone,
    password: settings.password,
    phoneCode: settings.phoneCode,
  });
  const storeSession = new StoreSession("my_session");

  storeSession.setDC(2, "149.154.167.41", 443);

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
    onError: (err: Error) => console.log(err),
  });

  return client;
};

const createBot = (): Bot => {
  const bot = new Bot(settings.token);
  console.info("Bot created");
  return bot;
};

/** Wrap a Buffer as an `InputFile` for the v2 Bot API. */
const bufferAsInputFile = (buffer: Buffer, filename = "photo.jpg"): InputFile =>
  new InputFile(buffer, { filename });

const d = (colorA: Color, colorB: Color): number => {
  return (
    (Math.abs(colorB.red - colorA.red) +
      Math.abs(colorB.green - colorA.green) +
      Math.abs(colorB.blue - colorA.blue)) /
    (3 * 0xff)
  );
};

const middle = (colorA: Color, colorB: Color): Color => {
  return {
    red: Math.round((colorA.red + colorB.red) / 2),
    green: Math.round((colorA.green + colorB.green) / 2),
    blue: Math.round((colorA.blue + colorB.blue) / 2),
  };
};

const getClosest = (
  palette: PaletteEntry[],
  currentColor: Color,
): { closest: PaletteEntry; distance: number } => {
  let closest = palette[0];
  let closestDistance = d(closest.avg, currentColor);

  for (let i = 1; i < palette.length; i++) {
    const distance = d(palette[i].avg, currentColor);
    if (distance < closestDistance) {
      closest = palette[i];
      closestDistance = distance;
    }
  }

  return { closest, distance: closestDistance };
};

const extractPalette = async (image: JimpInstance): Promise<PaletteEntry[]> => {
  const palette: PaletteEntry[] = [];

  image.scan((_x: number, _y: number, idx: number) => {
    const currentColor: Color = {
      red: image.bitmap.data[idx],
      green: image.bitmap.data[idx + 1],
      blue: image.bitmap.data[idx + 2],
    };

    if (!palette.length) {
      palette.push({
        avg: currentColor,
        count: 1,
      });
    } else {
      const closestPaletteAverage = getClosest(palette, currentColor);

      if (closestPaletteAverage.distance < THRESHOLD) {
        closestPaletteAverage.closest.count++;
        // closestPaletteAverage.closest.avg = middle(
        //   closestPaletteAverage.closest.avg,
        //   currentColor,
        // );
      } else {
        palette.push({
          avg: currentColor,
          count: 1,
        });
      }
    }
  });

  return palette;
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
  bufferAsInputFile,
};
