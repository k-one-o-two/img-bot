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
import path from "path";
import quantize from "quantize";

// All on-disk artifacts (downloaded files, generated images, fonts, stamps,
// assets) are stored/read relative to the project root — the same directory
// the bot process is launched from. Using `__dirname` here would resolve to
// `dist/` after `tsc` builds and break every path.
const PROJECT_ROOT = process.cwd();

interface Color {
  red: number;
  green: number;
  blue: number;
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
    path.join(PROJECT_ROOT, fileName),
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
      path.join(PROJECT_ROOT, avatarFileName),
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

  palette.forEach((color, index) => {
    const square = new Jimp({
      width: 40,
      height: 80,
      color: rgbaToInt(color[0], color[1], color[2], 255),
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
    await target.write(
      path.join(PROJECT_ROOT, fileName) as `${string}.${string}`,
    );
  }
};

const deleteFile = (fileName: string): void => {
  fs.rmSync(path.join(PROJECT_ROOT, fileName));
};

/**
 * Fixed-columns justified-row layout for album previews.
 *
 * The column count is decided by `columnsFor(n)` so the visual grid stays
 * balanced (2×2 for 4 photos, 3×3 for 9, etc.). Within each row we then pick
 * the row height that makes the sum of aspect-preserving widths exactly equal
 * to the container width, i.e.
 *
 *     rowHeight = (containerWidth − (k+1)·margin) / Σ aspect_i
 *
 * That gives zero horizontal empty space per row and no cropping (each image
 * keeps its intrinsic aspect ratio). Rows can have different heights when a
 * row's photos have wildly different aspects, which is expected.
 *
 * A `maxRowHeight` cap prevents portrait-heavy rows from ballooning
 * vertically; when a row is capped the tiles keep their aspect and the row is
 * horizontally centered inside the container. The last row (if partial) uses
 * the height of the previous full row so it visually matches its neighbors and
 * is also centered.
 */
interface GridLayoutOptions {
  /** Output canvas width in pixels. */
  containerWidth?: number;
  /** Gutter/padding around each tile in pixels. */
  margin?: number;
  /**
   * Optional multiplier that decides how tall a single row is allowed to grow
   * before we cap it. The cap is `(containerWidth / cols) * maxRowHeightRatio`.
   * Defaults to 1.5, which keeps portrait-heavy rows readable.
   */
  maxRowHeightRatio?: number;
}

/** Column count that produces a balanced-looking grid for `n` items. */
const columnsFor = (n: number): number =>
  n <= 3 ? n : Math.ceil(Math.sqrt(n));

interface RowLayout {
  height: number;
  widths: number[];
  startX: number;
}

/**
 * Stitch the given images into a single JPEG at `outputPath`. Defaults produce
 * a 1280-wide canvas with 4-pixel gutters; the final height depends on the
 * album's aspect ratios.
 *
 * Paths are resolved against `PROJECT_ROOT`, matching the rest of the utils.
 */
const combineImagesGrid = async (
  filePaths: string[],
  outputPath: string,
  options?: GridLayoutOptions,
): Promise<void> => {
  if (!filePaths.length) {
    throw new Error("combineImagesGrid: no input files");
  }

  const containerWidth = options?.containerWidth ?? 2048;
  const margin = options?.margin ?? 4;
  const maxRowHeightRatio = options?.maxRowHeightRatio ?? 1.5;

  const images = (await Promise.all(
    filePaths.map((fp) => Jimp.read(path.join(PROJECT_ROOT, fp))),
  )) as JimpInstance[];

  // Vote on the overall theme before any mutation happens. If half or more of
  // the source photos come back dark, tint the background black so the
  // composite reads as a dark image — `addWatermark` will then pick that up
  // via its own brightness check and switch to the white-on-black variant.
  const darkVotes = images.reduce((n, img) => n + (isDark(img) ? 1 : 0), 0);
  const isDarkTheme = darkVotes * 2 >= images.length;
  const backgroundColor = isDarkTheme ? 0x000000ff : 0xcececeff;

  // Split into rows of `cols` (last row may be shorter).
  const n = images.length;
  const cols = columnsFor(n);
  const rows: JimpInstance[][] = [];
  for (let i = 0; i < n; i += cols) {
    rows.push(images.slice(i, i + cols));
  }

  const outerSpan = containerWidth - 2 * margin;
  const maxRowHeight = (containerWidth / cols) * maxRowHeightRatio;

  // Compute per-row height + tile widths.
  const layouts: RowLayout[] = [];
  let previousRowHeight = 0;

  for (const row of rows) {
    const k = row.length;
    const aspects = row.map((img) => img.bitmap.width / img.bitmap.height);
    const sumAspects = aspects.reduce((s, a) => s + a, 0);

    let height: number;
    if (k === cols) {
      // Full row: justify to container width, capping at maxRowHeight.
      const availWidth = containerWidth - (k + 1) * margin;
      height = Math.min(availWidth / sumAspects, maxRowHeight);
      previousRowHeight = height;
    } else {
      // Partial last row: reuse the previous row's height so heights match.
      height =
        previousRowHeight || Math.min(maxRowHeight, containerWidth / cols);
    }

    const widths = aspects.map((a) => a * height);
    const rowContentWidth =
      widths.reduce((s, w) => s + w, 0) + (k - 1) * margin;
    // Center each row inside the outer span. A justified full row has
    // rowContentWidth === outerSpan, so this reduces to startX === margin.
    const startX = margin + Math.max(0, (outerSpan - rowContentWidth) / 2);

    layouts.push({ height, widths, startX });
  }

  const totalHeight =
    margin + layouts.reduce((s, l) => s + l.height + margin, 0);

  const canvas = new Jimp({
    width: containerWidth,
    height: Math.round(totalHeight),
    color: backgroundColor,
  }) as JimpInstance;

  let y = margin;
  let imgIndex = 0;
  for (const layout of layouts) {
    let x = layout.startX;
    const h = Math.round(layout.height);
    for (const w of layout.widths) {
      const wRounded = Math.round(w);
      const tile = images[imgIndex].resize({
        w: wRounded,
        h,
      }) as JimpInstance;
      canvas.composite(tile, Math.round(x), Math.round(y));
      x += w + margin;
      imgIndex++;
    }
    y += layout.height + margin;
  }

  await canvas.write(
    path.join(PROJECT_ROOT, outputPath) as `${string}.${string}`,
  );
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
      if (!fs.existsSync(path.join(PROJECT_ROOT, `output/output_${i}.jpg`))) {
        console.error(`File output_${i}.jpg does not exist`);
        return;
      }

      const image = (await Jimp.read(
        path.join(PROJECT_ROOT, `output/output_${i}.jpg`),
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
          PROJECT_ROOT,
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

  const mappedMessages: (MappedMessage | null)[] = await Promise.all(
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

  const mappedMessages: (MappedMessage | null)[] = await Promise.all(
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
        path.join(PROJECT_ROOT, `/output/output_${i}.jpg`),
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

const extractPalette = async (image: JimpInstance): Promise<number[][]> => {
  const pixelArray = [];
  image.scan((_x: number, _y: number, idx: number) => {
    pixelArray.push([
      image.bitmap.data[idx],
      image.bitmap.data[idx + 1],
      image.bitmap.data[idx + 2],
    ]);
  });
  const maximumColorCount = 10;
  const colorMap = quantize(pixelArray, maximumColorCount);
  const palette = colorMap.palette();

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
  combineImagesGrid,
};
