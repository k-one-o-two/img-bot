import { utils } from "./utils.js";

const run = async (): Promise<void> => {
  await utils.addWatermark("./contest_pic.png", "Your best shot 2025");
};

run();
