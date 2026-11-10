import { describe, expect, it } from 'vitest';
import { takenAtFromFileName } from './file-time.js';
import { zonedAt } from '../../../test/support/time.js';

const ZONE = 'America/New_York';
const at = (text: string) => zonedAt(text, ZONE);

describe('takenAtFromFileName', () => {
  it('reads the names Android gives a screenshot, in the zone of the phone', () => {
    for (const name of [
      'Screenshot_20261014-132301.jpg',
      'Screenshot_20261014-132301_Pokemon GO.jpg',
      'Screenshot_20261014_132301.png',
      'Screenshot_2026-10-14-13-23-01-123_com.nianticlabs.pokemongo.jpg',
      'screenshot_20261014-132301.webp',
      'SCREENSHOT-20261014-132301.png',
      'Screenshot_20261014-132301_Pokmon_GO.jpg',
      'Screenshot_20261014-132301~2.png',
      'Screenshot_20261014_132301(1).png',
    ]) {
      expect(takenAtFromFileName(name, ZONE), name).toBe(at('2026-10-14T13:23:01'));
    }
  });

  it('reads nothing else, nor a date or time that does not exist', () => {
    for (const name of [
      'image.png',
      'IMG_20261014_132301.jpg',
      'Screenshot 2026-10-14 at 13.23.01.png',
      'Screenshot_20261314-132301.jpg',
      'Screenshot_20261014-256001.jpg',
      'Screenshot_2026101-132301.jpg',
      'MyScreenshot_20261014-132301.jpg',
      'image0.jpg',
      // 2:30 on the night the clocks spring forward does not exist.
      'Screenshot_20260308-023000.png',
      // 1:30 on the night they fall back is two moments: no hint.
      'Screenshot_20261101-013000.png',
    ]) {
      expect(takenAtFromFileName(name, ZONE), name).toBeUndefined();
    }
  });
});
