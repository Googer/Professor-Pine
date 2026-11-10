import { readFileSync } from 'node:fs';
import path from 'node:path';

const folder = path.resolve(import.meta.dirname, '../fixtures/raid-manifest');

/**
 * The rotations of Leek Duck's raid manifest of 2026-10-27 (17:40 UTC) whose pages are kept: the
 * Palkia week ending at 10:00 local that day, Halloween Part I from then until 20:00, the Giratina
 * week from 10-28, the Chandelure Super Mega Raid Day inside it on 10-31, and the shadow rotation
 * running beside them all. The two city Wild Areas (Sendai, Mexico City, zoned times) and the
 * Global one of 11-14 are in the manifest without a page here.
 */
export const ROTATION_SLUGS = [
  'palkia-mega-charizard-x-mega-charizard-y',
  'halloween-2026-part-1-palkia',
  'giratina-origin-mega-sableye',
  'chandelure-super-mega-raid-day-2026',
  'shadow-landorus-incarnate-october-november-2026',
] as const;

/** Leek Duck's `raids/manifest.json` of 2026-10-27, as downloaded. */
export function readRaidManifestFixture(): unknown {
  return JSON.parse(readRaidManifestText());
}

/** The same manifest as its text. */
export function readRaidManifestText(): string {
  return readFileSync(path.join(folder, 'manifest-2026-10-27.json'), 'utf8');
}

/** The page of one rotation (`raids/<slug>.html`), as downloaded the same day. */
export function readRotationFixture(slug: string): string {
  return readFileSync(path.join(folder, `${slug}.html`), 'utf8');
}

/**
 * ScrapedDuck's `raids.json` downloaded with the manifest: still the Palkia week's list (the 1-star
 * dragons) after Halloween Part I had begun, the lag of finding B1 of the 8R-9F staging.
 */
export function readScrapedDuckRaidsText(): string {
  return readFileSync(path.join(folder, 'scrapedduck-raids-2026-10-27.json'), 'utf8');
}
