import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { EGG_PICTURE_NAMES } from '../domain/pogo/raid-eggs.js';
import { EGG_FOLDER, EggPictures } from './egg-pictures.js';

describe('the egg pictures the bot carries', () => {
  it('has a square picture of every egg a post can show, with the egg whole in it', async () => {
    for (const name of EGG_PICTURE_NAMES) {
      const file = path.join(EGG_FOLDER, `${name}.png`);
      expect(existsSync(file), file).toBe(true);
      const { data, info } = await sharp(file).raw().toBuffer({ resolveWithObject: true });
      expect(info.width, name).toBe(info.height);
      expect(info.channels, name).toBe(4);
      // The padding is transparent: the corners are, and the egg (128 high) is not cut.
      const alpha = (x: number, y: number) => data[(y * info.width + x) * 4 + 3];
      const side = info.width - 1;
      expect([alpha(0, 0), alpha(side, 0), alpha(0, side), alpha(side, side)], name).toEqual([
        0, 0, 0, 0,
      ]);
      expect(info.width, name).toBeGreaterThanOrEqual(128);
    }
  });
});

describe('EggPictures', () => {
  const web = (publicUrl: string) => ({
    web: { port: 8080, host: '127.0.0.1', publicUrl, trustProxy: false, tiles: 'osm' as const },
  });
  const carried = {
    url: 'attachment://raid_egg_2_icon.png',
    file: path.join(EGG_FOLDER, 'raid_egg_2_icon.png'),
  };
  /** The first 8 hex digits of the SHA-256 of the egg's file: a re-made egg is a new address. */
  const version = createHash('sha256')
    .update(readFileSync(path.join(EGG_FOLDER, 'raid_egg_2_icon.png')))
    .digest('hex')
    .slice(0, 8);

  it('names the web server’s picture, versioned by its file, once it listens where Discord can reach it', () => {
    const eggs = new EggPictures(web('https://map.example.test'));
    // Before the web server listens (or when it could not), the message carries the file.
    expect(eggs.picture('raid_egg_2_icon')).toEqual(carried);
    eggs.serving();
    expect(eggs.picture('raid_egg_2_icon')).toEqual({
      url: `https://map.example.test/eggs/raid_egg_2_icon.png?v=${version}`,
    });
  });

  it('carries the file in the message without the web pages, or with them on this machine', () => {
    const none = new EggPictures({});
    none.serving();
    expect(none.picture('raid_egg_2_icon')).toEqual(carried);
    const local = new EggPictures(web('http://localhost:8080'));
    local.serving();
    expect(local.picture('raid_egg_2_icon')).toEqual(carried);
  });
});
