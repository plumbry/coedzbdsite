import sharp from "sharp";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "..", "public", "summer-slam");
const stashDir = path.join(__dirname, "..", ".header-src");

// Source can be passed as an argv, otherwise read the stashed original.
const srcArg = process.argv[2];
const srcFile = srcArg
  ? path.resolve(srcArg)
  : path.join(stashDir, "passport-header.png");

// The logo is a distressed parchment banner sitting on a flat background. The
// background can be near-white OR near-black, but the artwork itself contains
// both warm cream (close to white) and dark inks (close to black). A naive
// per-pixel key would punch holes in the artwork (e.g. the white "PASSPORT"
// lettering). Instead we FLOOD FILL from the image border so only the
// connected outer background is cleared; interior pixels are always preserved.

const { data, info } = await sharp(srcFile)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

const { width, height, channels } = info;
const px = width * height;

// Sample the corners to decide whether the background is light or dark.
const cornerIdx = [
  0,
  (width - 1) * channels,
  (height - 1) * width * channels,
  ((height - 1) * width + (width - 1)) * channels,
];
let cornerLum = 0;
for (const c of cornerIdx) {
  cornerLum += (data[c] + data[c + 1] + data[c + 2]) / 3;
}
cornerLum /= cornerIdx.length;
const lightBg = cornerLum > 128;

let cornerMin = 255;
for (const c of cornerIdx) {
  cornerMin = Math.min(cornerMin, data[c], data[c + 1], data[c + 2]);
}

// A pixel counts as background when it matches the flat colour: very bright &
// neutral (low saturation) for a white field, or very dark for a black field.
const WHITE_MIN = Math.max(228, cornerMin - 4);
const WHITE_SAT = 18;
const BLACK_MAX = 42;
const INK_MAX = 210;
const COLOR_SAT_MIN = 24;
const isBg = (i) => {
  const r = data[i],
    g = data[i + 1],
    b = data[i + 2];
  if (lightBg) {
    const min = Math.min(r, g, b);
    const max = Math.max(r, g, b);
    return min >= WHITE_MIN && max - min <= WHITE_SAT;
  }
  return Math.max(r, g, b) <= BLACK_MAX;
};

// --- flood fill from the border (4-connected BFS via an explicit stack) ---
const bg = new Uint8Array(px);
const stack = [];
const pushIf = (x, y) => {
  if (x < 0 || y < 0 || x >= width || y >= height) return;
  const p = y * width + x;
  if (bg[p]) return;
  if (!isBg(p * channels)) return;
  bg[p] = 1;
  stack.push(p);
};
for (let x = 0; x < width; x++) {
  pushIf(x, 0);
  pushIf(x, height - 1);
}
for (let y = 0; y < height; y++) {
  pushIf(0, y);
  pushIf(width - 1, y);
}
while (stack.length) {
  const p = stack.pop();
  const x = p % width;
  const y = (p - x) / width;
  pushIf(x + 1, y);
  pushIf(x - 1, y);
  pushIf(x, y + 1);
  pushIf(x, y - 1);
}

// --- build alpha from the flood mask only ---
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    const p = y * width + x;
    const i = p * channels;
    data[i + 3] = bg[p] ? 0 : 255;
  }
}

// Crop to content with padding — never trim into the artwork.
let minX = width;
let minY = height;
let maxX = 0;
let maxY = 0;
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    const i = (y * width + x) * channels;
    if (data[i + 3] < 16) continue;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
}

const PAD = 20;
const cropLeft = Math.max(0, minX - PAD);
const cropTop = Math.max(0, minY - PAD);
const cropWidth = Math.min(width - cropLeft, maxX - minX + PAD * 2);
const cropHeight = Math.min(height - cropTop, maxY - minY + PAD * 2);

if (!fs.existsSync(stashDir)) fs.mkdirSync(stashDir, { recursive: true });
if (srcArg) fs.copyFileSync(srcFile, path.join(stashDir, "passport-header.png"));

const tmp = path.join(outDir, "passport-header.png.tmp");
await sharp(data, { raw: { width, height, channels } })
  .extract({ left: cropLeft, top: cropTop, width: cropWidth, height: cropHeight })
  .png({ compressionLevel: 6 })
  .toFile(tmp);
fs.renameSync(tmp, path.join(outDir, "passport-header.png"));

console.log(
  `keyed passport header (${width}x${height} -> ${cropWidth}x${cropHeight}, ${lightBg ? "light" : "dark"} bg, white>=${WHITE_MIN})`,
);
console.log("DONE");
