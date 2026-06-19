import sharp from "sharp";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(__dirname, "..", "public", "summer-slam", "seals");
const files = ["traveller", "competitor", "summer_spirit", "team_player", "community"];

// Black background -> transparent, with a soft feathered edge to avoid halos.
const LOW = 14; // fully transparent at/under this max-channel value
const HIGH = 60; // fully opaque at/over this value

for (const name of files) {
  const file = path.join(dir, `${name}.png`);
  const { data, info } = await sharp(file)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  for (let i = 0; i < data.length; i += channels) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const m = Math.max(r, g, b);
    let alpha;
    if (m <= LOW) alpha = 0;
    else if (m >= HIGH) alpha = data[i + 3];
    else alpha = Math.round(((m - LOW) / (HIGH - LOW)) * data[i + 3]);
    data[i + 3] = alpha;
  }

  await sharp(data, { raw: { width, height, channels } })
    .png()
    .toFile(file + ".tmp.png");
  fs.renameSync(file + ".tmp.png", file);

  console.log(`keyed ${name} (${width}x${height})`);
}

console.log("DONE");
