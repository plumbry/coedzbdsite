import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const defaultSheet = path.join(root, ".seals-src", "stamp-sheet.png");
const sheetPath = process.argv[2] ? path.resolve(process.argv[2]) : defaultSheet;
const outDir = path.join(root, "public", "summer-slam", "seals");
const stashDir = path.join(root, ".seals-src");

// Measured outer-scallop bounds on the 600×338 stamp sheet (+ CROP_PAD).
const CROP_PAD = 14;
const STAMP_BOUNDS = {
  traveller: { minX: 32, maxX: 185, minY: 19, maxY: 172 },
  summer_spirit: { minX: 212, maxX: 365, minY: 19, maxY: 172 },
  competitor: { minX: 393, maxX: 546, minY: 19, maxY: 173 },
  team_player: { minX: 121, maxX: 274, minY: 174, maxY: 328 },
  community: { minX: 303, maxX: 456, minY: 174, maxY: 328 },
};

const SHEET_WIDTH = 600;
const SHEET_HEIGHT = 338;
const TOP_ROW_MAX_Y = 173;
const BOTTOM_ROW_MIN_Y = 174;

function boundsToCrop(bounds) {
  const left = Math.max(0, bounds.minX - CROP_PAD);
  let top = Math.max(0, bounds.minY - CROP_PAD);
  const right = Math.min(SHEET_WIDTH, bounds.maxX + CROP_PAD);
  let bottom = Math.min(SHEET_HEIGHT, bounds.maxY + CROP_PAD);

  if (bounds.maxY <= TOP_ROW_MAX_Y) {
    bottom = Math.min(bottom, BOTTOM_ROW_MIN_Y - 1);
  }
  if (bounds.minY >= BOTTOM_ROW_MIN_Y) {
    top = Math.max(top, BOTTOM_ROW_MIN_Y);
  }

  return { left, top, width: right - left, height: bottom - top };
}

const CROPS = Object.fromEntries(
  Object.entries(STAMP_BOUNDS).map(([name, bounds]) => [name, boundsToCrop(bounds)]),
);

const OUTPUT_SIZE = 512;
const STAMP_PAD = 48;

function isPaper(r, g, b) {
  return r > 225 && g > 225 && b > 218;
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

async function processStamp(name, region) {
  const cropped = await sharp(sheetPath).extract(region).png().toBuffer();
  const { data, info } = await sharp(cropped).ensureAlpha().raw().toBuffer({
    resolveWithObject: true,
  });

  removePaperBackground(data, info.width, info.height, info.channels);

  fs.mkdirSync(stashDir, { recursive: true });
  await sharp(cropped).png().toFile(path.join(stashDir, `${name}.png`));

  const keyed = await sharp(data, {
    raw: { width: info.width, height: info.height, channels: info.channels },
  })
    .png()
    .toBuffer();

  const padded = await sharp(keyed)
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

  console.log(`wrote ${name}`);
}

if (!fs.existsSync(sheetPath)) {
  console.error(`Stamp sheet not found: ${sheetPath}`);
  process.exit(1);
}

fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(stashDir, { recursive: true });
fs.copyFileSync(sheetPath, path.join(stashDir, "stamp-sheet.png"));

for (const [name, region] of Object.entries(CROPS)) {
  await processStamp(name, region);
}

console.log("DONE");
