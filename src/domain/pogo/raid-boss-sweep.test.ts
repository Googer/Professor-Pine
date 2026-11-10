import { describe, expect, it } from 'vitest';
import { catalogueFixture } from '../../../test/support/game-data.js';
import type { PokemonEntry } from './game-master.js';
import { feedLookup } from './feed-lookup.js';
import { identifyBoss, parseRaidBossFeed } from './raid-boss-feed.js';
import { resolveBoss } from './raid-bosses.js';

const catalogue = catalogueFixture();
const lookup = feedLookup(catalogue);
const ICONS = 'https://cdn.leekduck.com/assets/img/pokemon_icons/';

/** The picture and heading the feed would naturally give an entry of the catalogue. */
function natural(entry: PokemonEntry): { file: string; heading: string } {
  if (entry.tempEvolution) {
    return {
      file: `pm${entry.dex}.f${entry.tempEvolution}.icon.png`,
      heading: entry.tempEvolution === 'PRIMAL' ? 'Primal Raids' : 'Mega Raids',
    };
  }
  const part = entry.form?.startsWith(`${entry.pokemonId}_`)
    ? entry.form.slice(entry.pokemonId.length + 1)
    : entry.form;
  return {
    file: part ? `pm${entry.dex}.f${part}.icon.png` : `pm${entry.dex}.icon.png`,
    heading: '5-Star Raids',
  };
}

function sweep(prefix: string, entries: readonly PokemonEntry[]) {
  const wrong: string[] = [];
  let checked = 0;
  for (const entry of entries) {
    const { file, heading } = natural(entry);
    const feed = [
      {
        name: `${prefix}${entry.name}`,
        tier: heading,
        canBeShiny: false,
        image: `${ICONS}${file}`,
      },
    ];
    const parsed = parseRaidBossFeed(feed, lookup).bosses[0];
    checked += 1;
    if (!parsed) {
      wrong.push(`${entry.key}: not parsed`);
      continue;
    }
    const mega = entry.kind === 'mega';
    const identity = identifyBoss(entry.name, feed[0]?.image, lookup, { mega });
    const viaParser = identity?.resolved
      ? catalogue.byGameMasterId(identity.resolved.pokemonId, identity.resolved.form)
      : undefined;
    const viaRow = resolveBoss(catalogue, parsed);
    if (viaParser?.key !== entry.key) wrong.push(`${entry.key}: parser gave ${viaParser?.key}`);
    if (viaRow?.key !== entry.key) wrong.push(`${entry.key}: resolveBoss gave ${viaRow?.key}`);
    if (parsed.tier.shadow !== (prefix !== '')) wrong.push(`${entry.key}: shadow flag`);
  }
  return { wrong, checked };
}

describe('the whole catalogue as the feed would name it', () => {
  it('resolves every entry to itself', () => {
    const { wrong, checked } = sweep('', catalogue.all);
    expect(checked).toBe(catalogue.all.length);
    expect(wrong).toEqual([]);
  });

  it('resolves every entry that can be shadow to itself as a shadow boss', () => {
    const shadow = catalogue.all.filter((entry) => entry.shadow && entry.kind !== 'mega');
    const { wrong, checked } = sweep('Shadow ', shadow);
    expect(checked).toBeGreaterThan(100);
    expect(wrong).toEqual([]);
  });
});
