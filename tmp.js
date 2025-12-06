import { Jimp } from "jimp";
import { rgbaToInt } from "@jimp/utils";
import path, { dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const THRESHOLD = 0.2;

const d = (colorA, colorB) => {
  return (
    (Math.abs(colorB.red - colorA.red) +
      Math.abs(colorB.green - colorA.green) +
      Math.abs(colorB.blue - colorA.blue)) /
    (3 * 0xff)
  );
};

const middle = (colorA, colorB) => {
  return {
    red: Math.round((colorA.red + colorB.red) / 2),
    green: Math.round((colorA.green + colorB.green) / 2),
    blue: Math.round((colorA.blue + colorB.blue) / 2),
  };
};

const getClosest = (palette, currentColor) => {
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

const extract = async (fileName) => {
  const image = await Jimp.read(path.join(__dirname, fileName));
  const { width, height } = image.bitmap;

  const palette = [];

  image.scan((_x, _y, idx) => {
    const currentColor = {
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
      // console.info(_x, _y, currentColor, closestPaletteAverage);

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

  const target = new Jimp({
    width: palette.length * 100,
    height: 100,
    color: 0xffffffff,
  });

  palette
    .sort(
      (a, b) =>
        rgbaToInt(a.avg.red, a.avg.green, a.avg.blue, 255) -
        rgbaToInt(b.avg.red, b.avg.green, b.avg.blue, 255),
    )
    .forEach((color, index) => {
      const square = new Jimp({
        width: 100,
        height: 100,
        color: rgbaToInt(color.avg.red, color.avg.green, color.avg.blue, 255),
      });
      target.composite(square, index * 100, 0);
    });

  await target.write("tmp.jpg");
  console.info(JSON.stringify(palette, null, 2));
};

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

extract("52434432602_dfc8981e20_o.jpg");
// isDark("image2.jpg");
