import sharp from "sharp";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(__dirname, "..", "public", "summer-slam", "seals");
const files = ["traveller", "competitor", "summer_spirit", "team_player", "community"];

// Flood-fill the connected black background from the image borders so that
// dark details *inside* the seal artwork are never made transparent.
const BG_THRESHOLD = 36; // max channel value still considered "background black"
const RAMP_LOW = 16; // boundary feather: fully transparent at/under this
const RAMP_HIGH = 80; // boundary feather: fully opaque at/over this

for (const name of files) {
  const file = path.join(dir, `${name}.png`);
  const { data, info } = await sharp(file)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  const n = width * height;
  const maxCh = new Uint8Array(n);
  for (let p = 0; p < n; p++) {
    const i = p * channels;
    maxCh[p] = Math.max(data[i], data[i + 1], data[i + 2]);
  }

  // BFS flood fill from every border pixel that is dark enough.
  const bg = new Uint8Array(n); // 1 = background
  const stack = [];
  const pushIf = (p) => {
    if (!bg[p] && maxCh[p] <= BG_THRESHOLD) {
      bg[p] = 1;
      stack.push(p);
    }
  };
  for (let x = 0; x < width; x++) {
    pushIf(x);
    pushIf((height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    pushIf(y * width);
    pushIf(y * width + width - 1);
  }
  while (stack.length) {
    const p = stack.pop();
    const x = p % width;
    const y = (p - x) / width;
    if (x > 0) pushIf(p - 1);
    if (x < width - 1) pushIf(p + 1);
    if (y > 0) pushIf(p - width);
    if (y < height - 1) pushIf(p + width);
  }

  const isBgNeighbor = (p, x, y) =>
    (x > 0 && bg[p - 1]) ||
    (x < width - 1 && bg[p + 1]) ||
    (y > 0 && bg[p - width]) ||
    (y < height - 1 && bg[p + width]);

  for (let p = 0; p < n; p++) {
    const i = p * channels;
    if (bg[p]) {
      data[i + 3] = 0;
      continue;
    }
    const x = p % width;
    const y = (p - x) / width;
    if (isBgNeighbor(p, x, y)) {
      const m = maxCh[p];
      let a;
      if (m <= RAMP_LOW) a = 0;
      else if (m >= RAMP_HIGH) a = data[i + 3];
      else a = Math.round(((m - RAMP_LOW) / (RAMP_HIGH - RAMP_LOW)) * data[i + 3]);
      data[i + 3] = a;
    }
  }

  await sharp(data, { raw: { width, height, channels } })
    .png()
    .toFile(file + ".tmp.png");
  fs.renameSync(file + ".tmp.png", file);

  console.log(`keyed ${name} (${width}x${height})`);
}

console.log("DONE");
