/**
 * One-off: copies the search nicknames out of the legacy data/pokemon.json into
 * src/domain/pogo/nicknames.ts, keyed by catalogue key. Run it once, format the result with
 * Prettier and maintain the module by hand from then on; data/pokemon.json is retired.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { PokemonCatalogue } from '../../src/domain/pogo/catalogue.js';
import type { GameData } from '../../src/domain/pogo/game-master.js';
import { keyForLegacyName } from '../../src/domain/pogo/legacy-names.js';

const repoRoot = path.resolve(import.meta.dirname, '../..');
const legacy = JSON.parse(readFileSync(path.join(repoRoot, 'data/pokemon.json'), 'utf8')) as Array<{
  name?: string;
  nickname?: string[];
}>;
const catalogue = new PokemonCatalogue(
  JSON.parse(readFileSync(path.join(repoRoot, 'test/fixtures/game-data.json'), 'utf8')) as GameData,
);

const nicknames: Record<string, string[]> = {};
const skipped: string[] = [];
for (const entry of legacy) {
  if (!entry.nickname?.length) continue;
  const pokemon = entry.name ? catalogue.byKey(keyForLegacyName(entry.name)) : undefined;
  if (!pokemon) {
    skipped.push(entry.name ?? '(unnamed)');
    continue;
  }
  const clean = entry.nickname.map((nickname) => nickname.trim().toLowerCase()).filter(Boolean);
  nicknames[pokemon.key] = [...new Set([...(nicknames[pokemon.key] ?? []), ...clean])];
}

const lines = Object.entries(nicknames)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([key, names]) => `  ${JSON.stringify(key)}: ${JSON.stringify(names)},`);
writeFileSync(
  path.join(repoRoot, 'src/domain/pogo/nicknames.ts'),
  `/**
 * Extra names people search Pokémon by, keyed by catalogue key. Copied once from the legacy
 * data/pokemon.json (scripts/game-data/make-nicknames.ts); maintained here by hand since.
 * Nicknames added by moderators live in the Pokemon table (PokemonRepository).
 */
export const CURATED_NICKNAMES: Readonly<Record<string, readonly string[]>> = {
${lines.join('\n')}
};
`,
);
process.stdout.write(
  `Wrote ${lines.length} entries. Skipped (not Pokémon): ${skipped.join(', ')}\n`,
);
