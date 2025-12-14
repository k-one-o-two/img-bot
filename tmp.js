import { Jimp } from "jimp";
import { rgbaToInt } from "@jimp/utils";
import path, { dirname } from "path";
import { fileURLToPath } from "url";
import { utils } from "./utils.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const run = async () => {
  await utils.addWatermark("./contest_pic.png", "Your best shot 2025");
};

run();
