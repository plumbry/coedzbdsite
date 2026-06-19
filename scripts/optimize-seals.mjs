import sharp from "sharp";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(__dirname, "..", "public", "summer-slam", "seals");
const files = ["traveller", "competitor", "summer_spirit", "team_player", "community"];

// Seals never render larger than ~128px (2x retina => ~256px). 512px keeps a
// comfortable margin while dropping the source from 1024px. Full-colour RGBA
// PNG with max compression avoids palette banding on the gradient artwork.
const SIZE = 512;

for (const name of files) {
  const file = path.join(dir, `${name}.png`);
  const before = fs.statSync(file).size;

  const buf = await sharp(file)
    .resize(SIZE, SIZE, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9, effort: 10, palette: false })
    .toBuffer();

  fs.writeFileSync(file + ".tmp.png", buf);
  fs.renameSync(file + ".tmp.png", file);

  const after = fs.statSync(file).size;
  console.log(
    `${name}: ${(before / 1024).toFixed(0)}KB -> ${(after / 1024).toFixed(0)}KB`,
  );
}

console.log("DONE");
