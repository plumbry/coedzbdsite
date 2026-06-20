import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const srcDir = path.join(root, ".seals-src");
const outDir = path.join(root, "public", "summer-slam", "seals");

const STAMP_FILES = {
  traveller: "traveller.png",
  summer_spirit: "summer_spirit.png",
  competitor: "competitor.png",
  team_player: "team_player.png",
  community: "community.png",
};

const OUTPUT_SIZE = 512;
const CONTENT_PAD = 20;
const STAMP_PAD = 48;

function isPaper(r, g, b) {
  return r > 220 && g > 220 && b > 212;
}

function removePaperBackground(data, width, height, channels) {
  const total = width * height;
  const visited = new Uint8Array(total);
  const stack = [];

  const pushIfPaper = (x, y) => {
    const idx = y * width + x;
    if (visited[idx]) return;
    const i = idx * channels;
    if (!isPaper(data[i], data[i + 1], data[i + 2])) return;
    visited[idx] = 1;
    stack.push(idx);
  };

  for (let x = 0; x < width; x++) {
    pushIfPaper(x, 0);
    pushIfPaper(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    pushIfPaper(0, y);
    pushIfPaper(width - 1, y);
  }

  while (stack.length > 0) {
    const idx = stack.pop();
    const x = idx % width;
    const y = (idx - x) / width;
    const i = idx * channels;
    data[i + 3] = 0;

    if (x > 0) pushIfPaper(x - 1, y);
    if (x < width - 1) pushIfPaper(x + 1, y);
    if (y > 0) pushIfPaper(x, y - 1);
    if (y < height - 1) pushIfPaper(x, y + 1);
  }

  for (let i = 0; i < data.length; i += channels) {
    if (isPaper(data[i], data[i + 1], data[i + 2])) data[i + 3] = 0;
  }
}

function contentBounds(data, width, height, channels) {
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const alpha = data[(y * width + x) * channels + 3];
      if (alpha > 10) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  if (maxX < minX) return null;
  return { minX, minY, maxX, maxY };
}

async function processStamp(name, inputPath) {
  const source = await sharp(inputPath).ensureAlpha().png().toBuffer();
  const { data, info } = await sharp(source).raw().toBuffer({ resolveWithObject: true });

  removePaperBackground(data, info.width, info.height, info.channels);

  const bounds = contentBounds(data, info.width, info.height, info.channels);
  if (!bounds) {
    throw new Error(`No visible stamp content found in ${inputPath}`);
  }

  const contentWidth = bounds.maxX - bounds.minX + 1;
  const contentHeight = bounds.maxY - bounds.minY + 1;
  const squareSide = Math.max(contentWidth, contentHeight) + CONTENT_PAD * 2;
  const offsetX = Math.floor((squareSide - contentWidth) / 2);
  const offsetY = Math.floor((squareSide - contentHeight) / 2);

  const keyed = await sharp(data, {
    raw: { width: info.width, height: info.height, channels: info.channels },
  })
    .png()
    .toBuffer();

  const trimmed = await sharp(keyed)
    .extract({
      left: bounds.minX,
      top: bounds.minY,
      width: contentWidth,
      height: contentHeight,
    })
    .extend({
      top: offsetY,
      bottom: squareSide - contentHeight - offsetY,
      left: offsetX,
      right: squareSide - contentWidth - offsetX,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();

  const padded = await sharp(trimmed)
    .extend({
      top: STAMP_PAD,
      bottom: STAMP_PAD,
      left: STAMP_PAD,
      right: STAMP_PAD,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();

  const outPath = path.join(outDir, `${name}.png`);
  await sharp(padded)
    .resize({
      width: OUTPUT_SIZE,
      height: OUTPUT_SIZE,
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png({ compressionLevel: 6 })
    .toFile(outPath);

  console.log(`wrote ${name} (${contentWidth}x${contentHeight} -> ${OUTPUT_SIZE})`);
}

fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(srcDir, { recursive: true });

for (const [name, fileName] of Object.entries(STAMP_FILES)) {
  const inputPath = path.join(srcDir, fileName);
  if (!fs.existsSync(inputPath)) {
    console.error(`Missing stamp source: ${inputPath}`);
    process.exit(1);
  }
  await processStamp(name, inputPath);
}

console.log("DONE");
