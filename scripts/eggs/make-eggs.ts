/**
 * Makes the square raid egg pictures the bot carries (`pictures/eggs/`, plan 8D-F): PokeMiners'
 * egg icons are 112 by 128, and a phone crops a thumbnail to a square, which cut the bottom off
 * the egg. Each picture `raidEggName` can name is downloaded from `RAID_EGG_PICTURES_URL` (a
 * fixed commit of pogo_assets), padded with transparency to a square of its longer side, the
 * original centred and unscaled, and written as PNG.
 *
 * Run once with `npm run eggs:make` (it needs the network); the files are committed, and the bot
 * never downloads them. Run it again only for a new egg or another commit, and commit what it
 * wrote.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { EGG_PICTURE_NAMES, RAID_EGG_PICTURES_URL } from '../../src/domain/pogo/raid-eggs.js';
import { EGG_FOLDER } from '../../src/services/egg-pictures.js';

/** The padding that makes a picture of this size a square, the picture in the middle. */
function squarePadding(width: number, height: number) {
  const side = Math.max(width, height);
  const left = Math.floor((side - width) / 2);
  const top = Math.floor((side - height) / 2);
  return { left, right: side - width - left, top, bottom: side - height - top };
}

mkdirSync(EGG_FOLDER, { recursive: true });
for (const name of EGG_PICTURE_NAMES) {
  const url = `${RAID_EGG_PICTURES_URL}${name}.png`;
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  const original = Buffer.from(await response.arrayBuffer());
  const { width, height } = await sharp(original).metadata();
  const square = await sharp(original)
    .ensureAlpha()
    .extend({ ...squarePadding(width, height), background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toBuffer();
  const file = path.join(EGG_FOLDER, `${name}.png`);
  writeFileSync(file, square);
  process.stdout.write(
    `${name}: ${width}×${height} → ${Math.max(width, height)} square, ${file}\n`,
  );
}
