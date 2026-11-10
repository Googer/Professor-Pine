import type { PokemonCatalogue } from '../pogo/catalogue.js';
import type { RaidBoss } from '../pogo/raid-bosses.js';
import type { RaidTier } from '../pogo/raid-tier.js';

/**
 * What `npm run ocr:check` compares and keeps: per sample (by file name) and element, right or
 * wrong. Numbers and file names only, never what was read (the baseline is committed).
 */
export type Results = Record<string, Record<string, boolean>>;

export interface Comparison {
  /** `file: element` that was right in the baseline and is wrong now, or was not read now. */
  worse: string[];
  /** `file: element` that was wrong in the baseline and is right now. */
  better: string[];
}

/**
 * How `now` compares with `before`, over every sample and element of the baseline: one that was
 * right and is wrong, or that was not scored at all now (the sample unread, the element not
 * checked), is worse; a sample that is new is not compared.
 */
export function compareBaseline(before: Results, now: Results): Comparison {
  const worse: string[] = [];
  const better: string[] = [];
  for (const [file, elements] of Object.entries(before)) {
    for (const [element, was] of Object.entries(elements)) {
      const is = now[file]?.[element];
      if (was && is !== true)
        worse.push(`${file}: ${element}${is === undefined ? ' (not read)' : ''}`);
      if (!was && is === true) better.push(`${file}: ${element}`);
    }
  }
  return { worse, better };
}

/** A boss list as it is kept: by key, with its name and tier (a record's `bosses`, `--write-bosses`). */
export type BossSnapshot = readonly { key: string; name: string; tier: RaidTier }[];

/**
 * The bosses of a snapshot, for deciding a boss among them as the bot did: each with its
 * catalogue entry when the catalogue knows its key (a boss without one is never decided by its
 * CP, as in the bot).
 */
export function bossesOfSnapshot(snapshot: BossSnapshot, catalogue: PokemonCatalogue): RaidBoss[] {
  return snapshot.map(({ key, name, tier }) => {
    const entry = catalogue.byKey(key);
    return {
      key,
      name,
      tier,
      entry,
      shiny: false,
      source: 'feed',
      autoset: false,
      pokemonId: entry?.pokemonId ?? key,
      form: null,
    };
  });
}
