import sharp from "sharp";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "..", "public", "summer-slam", "seals");
const stashDir = path.join(__dirname, "..", ".seals-src");
// Read pristine raw originals from .seals-src when available, otherwise process
// the files in place inside public/summer-slam/seals.
// For the flat rubber-stamp sheet artwork, use scripts/split-stamp-sheet.mjs instead.
const srcDir = fs.existsSync(stashDir) ? stashDir : outDir;
const files = ["traveller", "competitor", "summer_spirit", "team_player", "community"];

// The seals are circular medallions on a solid black square. We keep the ENTIRE
// medallion (including its dark coloured interior) and clear only the black
// OUTSIDE it. The rims are distressed/irregular, so a single-radius circle
// either leaves a black halo or clips the rim. Instead we trace the medallion's
// outline per-angle and cut transparency exactly at that boundary.
const EDGE_T = 42; // brightness that marks real rim artwork vs black background
const ANGLES = 1440; // angular resolution of the traced outline
const SMOOTH = 6; // +/- window for circular median smoothing (rejects specks)
const FEATHER = 1.5; // soft edge in px

for (const name of files) {
  const { data, info } = await sharp(path.join(srcDir, `${name}.png`))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  const cx = (width - 1) / 2;
  const cy = (height - 1) / 2;
  const maxR = Math.hypot(cx, cy);

  const maxChAt = (x, y) => {
    const i = (y * width + x) * channels;
    return Math.max(data[i], data[i + 1], data[i + 2]);
  };

  // --- trace the outermost rim radius for each angle ---
  const rad = new Float64Array(ANGLES);
  for (let a = 0; a < ANGLES; a++) {
    const theta = (a / ANGLES) * Math.PI * 2;
    const dx = Math.cos(theta);
    const dy = Math.sin(theta);
    let found = 0;
    for (let r = Math.floor(maxR); r >= 0; r--) {
      const x = Math.round(cx + dx * r);
      const y = Math.round(cy + dy * r);
      if (x < 0 || y < 0 || x >= width || y >= height) continue;
      if (maxChAt(x, y) >= EDGE_T) {
        found = r;
        break;
      }
    }
    rad[a] = found;
  }

  // --- circular median smoothing to reject distress specks / fill gaps ---
  const smooth = new Float64Array(ANGLES);
  const win = [];
  for (let a = 0; a < ANGLES; a++) {
    win.length = 0;
    for (let k = -SMOOTH; k <= SMOOTH; k++) {
      win.push(rad[(a + k + ANGLES) % ANGLES]);
    }
    win.sort((p, q) => p - q);
    smooth[a] = win[win.length >> 1];
  }

  // --- build alpha from the traced boundary ---
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * channels;
      const ddx = x - cx;
      const ddy = y - cy;
      const d = Math.hypot(ddx, ddy);
      let theta = Math.atan2(ddy, ddx);
      if (theta < 0) theta += Math.PI * 2;
      const boundary = smooth[Math.round((theta / (Math.PI * 2)) * ANGLES) % ANGLES];
      if (d <= boundary - FEATHER) continue; // inside medallion -> keep opaque
      if (d >= boundary + FEATHER) {
        data[i + 3] = 0;
        continue;
      }
      const t = (boundary + FEATHER - d) / (2 * FEATHER);
      data[i + 3] = Math.round(255 * Math.max(0, Math.min(1, t)));
    }
  }

  await sharp(data, { raw: { width, height, channels } })
    .png()
    .toFile(path.join(outDir, `${name}.png.tmp`));
  fs.renameSync(path.join(outDir, `${name}.png.tmp`), path.join(outDir, `${name}.png`));

  console.log(`traced ${name} (${width}x${height})`);
}

console.log("DONE");
