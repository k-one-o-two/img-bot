import { Jimp } from "jimp";
import path, { dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const isDark = async (fileName) => {
  const image = await Jimp.read(path.join(__dirname, fileName));
  const { width, height } = image.bitmap;

  let colorSum = 0;

  image.scan((_x, _y, idx) => {
    const r = image.bitmap.data[idx];
    const g = image.bitmap.data[idx + 1];
    const b = image.bitmap.data[idx + 2];

    const avg = Math.floor((r + g + b) / 3);
    colorSum += avg;
  });

  const brightness = Math.floor(colorSum / (width * height));

  console.info(fileName, { brightness }, brightness < 128);

  return brightness < 128;
};

isDark("image.jpg");
isDark("image2.jpg");
