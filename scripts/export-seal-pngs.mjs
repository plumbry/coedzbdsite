import { execSync } from "node:child_process";
import { mkdir, writeFileSync, unlinkSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const SEAL_FILES = [
  "traveller.png",
  "competitor.png",
  "summer_spirit.png",
  "team_player.png",
  "community.png",
];

const GIT_REF = "b2e3841";
/** Pre-scaled widths for responsive srcSet (single Lanczos step from trimmed art). */
const RESPONSIVE_WIDTHS = [160, 256, 320, 512];
const TARGET_DIRS = [
  path.join("public", "summer-slam", "seals"),
  ".seals-src",
];

for (const dir of TARGET_DIRS) {
  mkdir(dir, { recursive: true }, () => {});
}

for (const fileName of SEAL_FILES) {
  const tmpIn = `.tmp-seal-in-${fileName}`;
  const data = execSync(
    `git show ${GIT_REF}:public/summer-slam/seals/${fileName}`,
    { encoding: "buffer", maxBuffer: 10 * 1024 * 1024 },
  );
  writeFileSync(tmpIn, data);

  const before = await sharp(tmpIn).metadata();
  const trimmed = await sharp(tmpIn)
    .trim({ threshold: 12 })
    .png()
    .toBuffer();

  unlinkSync(tmpIn);

  const stem = fileName.replace(/\.png$/, "");

  for (const dir of TARGET_DIRS) {
    for (const width of RESPONSIVE_WIDTHS) {
      const scaled = await sharp(trimmed)
        .resize(width, width, {
          fit: "contain",
          background: { r: 0, g: 0, b: 0, alpha: 0 },
          kernel: sharp.kernel.lanczos3,
        })
        .png({ compressionLevel: 6, adaptiveFiltering: true })
        .toBuffer();
      const outName = width === 512 ? fileName : `${stem}@${width}.png`;
      writeFileSync(path.join(dir, outName), scaled);
    }
  }

  const trimmedMeta = await sharp(trimmed).metadata();
  console.log(
    `${fileName}: ${before.width}x${before.height} trimmed ${trimmedMeta.width}x${trimmedMeta.height} -> [${RESPONSIVE_WIDTHS.join(", ")}]`,
  );
}
