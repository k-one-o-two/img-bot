import { getCollections, init } from "./db.js";
import { Jimp } from "jimp";
import { rgbaToInt } from "@jimp/utils";
import path, { dirname } from "path";
import { fileURLToPath } from "url";
import { utils } from "./utils.js";
import { contest } from "./contest.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const run = async () => {
  await init();

  const contestEntries = await contest.getContestList();

  console.info({ contestEntries });

  for (const entry of contestEntries) {
    const index = contestEntries.indexOf(entry);
    // const avatarFileName = await getUserPicture(entry.userId);

    await utils.addWatermark(
      entry.filename,
      `Best of 2025 contest: ${index + 1}`,
      undefined,
      {
        replace: true,
        contestTarget: true,
        noPalette: true,
      },
    );

    console.log(entry.filename, " done");
  }
};

run();
