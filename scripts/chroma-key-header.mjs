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

// The logo is a distressed parchment banner on a solid black field. We map the
// pixel brightness to alpha so the cream artwork stays opaque while the black
// background drops out, with a soft ramp to preserve the worn/torn edges.
const LOW = 18; // <= this brightness is treated as pure background -> transparent
const HIGH = 70; // >= this brightness is treated as solid artwork -> opaque

const { data, info } = await sharp(srcFile)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

const { width, height, channels } = info;

for (let i = 0; i < data.length; i += channels) {
  const max = Math.max(data[i], data[i + 1], data[i + 2]);
  let alpha;
  if (max <= LOW) alpha = 0;
  else if (max >= HIGH) alpha = 255;
  else alpha = Math.round((255 * (max - LOW)) / (HIGH - LOW));
  // Keep the original alpha if the image already had cut-outs.
  data[i + 3] = Math.min(data[i + 3], alpha);
}

if (!fs.existsSync(stashDir)) fs.mkdirSync(stashDir, { recursive: true });
if (srcArg && !fs.existsSync(path.join(stashDir, "passport-header.png"))) {
  fs.copyFileSync(srcFile, path.join(stashDir, "passport-header.png"));
}

const tmp = path.join(outDir, "passport-header.png.tmp");
await sharp(data, { raw: { width, height, channels } })
  .trim({ threshold: 1 }) // crop away the fully transparent border
  .png()
  .toFile(tmp);
fs.renameSync(tmp, path.join(outDir, "passport-header.png"));

console.log(`keyed passport header (${width}x${height} -> trimmed)`);
console.log("DONE");
