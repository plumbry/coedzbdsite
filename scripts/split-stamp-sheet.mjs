import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const defaultSheet = path.join(
  root,
  ".seals-src",
  "stamp-sheet.png",
);
const sheetPath = process.argv[2] ? path.resolve(process.argv[2]) : defaultSheet;
const outDir = path.join(root, "public", "summer-slam", "seals");
const stashDir = path.join(root, ".seals-src");

const CROPS = {
  traveller: { left: 8, top: 8, width: 188, height: 160 },
  summer_spirit: { left: 206, top: 8, width: 188, height: 160 },
  competitor: { left: 404, top: 8, width: 188, height: 160 },
  team_player: { left: 100, top: 170, width: 188, height: 160 },
  community: { left: 312, top: 170, width: 188, height: 160 },
};

function isPaper(r, g, b) {
  return r > 228 && g > 228 && b > 222;
}

function removePaperBackground(data, width, height, channels) {
  const total = width * height;
  const visited = new Uint8Array(total);
  const queue = [];

  const pushIfPaper = (x, y) => {
    const idx = y * width + x;
    if (visited[idx]) return;
    const i = idx * channels;
    if (!isPaper(data[i], data[i + 1], data[i + 2])) return;
    visited[idx] = 1;
    queue.push(idx);
  };

  for (let x = 0; x < width; x++) {
    pushIfPaper(x, 0);
    pushIfPaper(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    pushIfPaper(0, y);
    pushIfPaper(width - 1, y);
  }

  while (queue.length > 0) {
    const idx = queue.pop();
    const x = idx % width;
    const y = (idx - x) / width;
    const i = idx * channels;
    data[i + 3] = 0;

    if (x > 0) pushIfPaper(x - 1, y);
    if (x < width - 1) pushIfPaper(x + 1, y);
    if (y > 0) pushIfPaper(x, y - 1);
    if (y < height - 1) pushIfPaper(x, y + 1);
  }
}

async function processStamp(name, region, size = 512) {
  const cropped = await sharp(sheetPath).extract(region).png().toBuffer();
  const { data, info } = await sharp(cropped).ensureAlpha().raw().toBuffer({
    resolveWithObject: true,
  });

  removePaperBackground(data, info.width, info.height, info.channels);

  const stashPath = path.join(stashDir, `${name}.png`);
  fs.mkdirSync(stashDir, { recursive: true });
  await sharp(cropped).png().toFile(stashPath);

  const outPath = path.join(outDir, `${name}.png`);
  await sharp(data, {
    raw: { width: info.width, height: info.height, channels: info.channels },
  })
    .trim({ threshold: 8 })
    .resize(size, size, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
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
