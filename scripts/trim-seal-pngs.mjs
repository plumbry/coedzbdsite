import { rename, unlink } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const SEAL_FILES = [
  "traveller.png",
  "competitor.png",
  "summer_spirit.png",
  "team_player.png",
  "community.png",
];

const TARGET_DIRS = [
  path.join("public", "summer-slam", "seals"),
  ".seals-src",
];

async function trimSeal(filePath) {
  const image = sharp(filePath);
  const before = await image.metadata();
  const trimmed = await image
    .trim({ threshold: 12 })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer({ resolveWithObject: true });

  const tmpPath = `${filePath}.trim.tmp`;
  await sharp(trimmed.data).toFile(tmpPath);
  await unlink(filePath);
  await rename(tmpPath, filePath);

  return {
    file: filePath,
    before: `${before.width}x${before.height}`,
    after: `${trimmed.info.width}x${trimmed.info.height}`,
  };
}

for (const dir of TARGET_DIRS) {
  for (const file of SEAL_FILES) {
    const filePath = path.join(dir, file);
    try {
      const result = await trimSeal(filePath);
      console.log(`${result.file}: ${result.before} -> ${result.after}`);
    } catch (error) {
      if (error.code === "ENOENT") {
        console.warn(`skip missing ${filePath}`);
        continue;
      }
      throw error;
    }
  }
}
