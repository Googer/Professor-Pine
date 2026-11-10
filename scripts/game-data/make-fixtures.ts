/**
 * Builds the game-data test fixtures from a downloaded game master and English text file:
 * - test/fixtures/game-master-sample.json: the raw items for a few species, for parser tests
 * - test/fixtures/english-sample.txt: the text entries those items need
 * - test/fixtures/game-data.json: the whole game master parsed, for catalogue and parity tests
 * - test/fixtures/pokemon-icons.json: the names of the game's icon files that exist, from the
 *   listing of PokeMiners' picture files (see src/domain/pogo/pokemon-icons.ts)
 *
 * Run it with `npm run fixtures:game-data`. It reuses the files var/game-data-source/gamemaster.json,
 * English.txt and pokemon-icons-tree.json; `npm run fixtures:game-data -- --download` fetches fresh
 * ones first, overwriting them (and is the only way they are fetched).
 *
 * After refreshing to a newer game master: tests that assert exact stats, move lists or names of
 * real Pokémon (in game-master.test.ts, catalogue.test.ts, cp.test.ts) and the lists in
 * legacy-names.test.ts may need their expected values updated when the game rebalances. Check each
 * failure against the new data before changing an expectation. Bump GAME_DATA_VERSION
 * (src/domain/pogo/game-master.ts) only if the parser changed.
 */
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseGameMaster } from '../../src/domain/pogo/game-master.js';
import { iconNamesOf } from '../../src/domain/pogo/pokemon-icons.js';
import { parseTextFile } from '../../src/domain/pogo/text.js';

const GAME_MASTER_URL =
  'https://raw.githubusercontent.com/PokeMiners/game_masters/master/latest/latest.json';
const TEXT_URL =
  'https://raw.githubusercontent.com/PokeMiners/pogo_assets/master/Texts/Latest%20APK/English.txt';

/** Species that between them exercise every rule in the parser. */
const SAMPLE_SPECIES = [
  'VENUSAUR', // mega, shadow, a cosmetic COPY_2019 form
  'CHARIZARD', // two megas
  'RATTATA', // regional form
  'PIKACHU', // costumes
  'NIDORAN_FEMALE', // shares the form id NIDORAN_NORMAL with NIDORAN_MALE
  'NIDORAN_MALE',
  'DUGTRIO', // the formless entry and the NORMAL form have different stats
  'TAUROS', // regional forms with a second part
  'MEWTWO', // a flagged costume that is a real form (Armored)
  'SMEARGLE', // no moves
  'UNOWN', // forms without text
  'LATIAS', // cosmetic S form, mega
  'KYOGRE', // primal
  'DEOXYS', // forms; NORMAL differs from the formless entry in moves
  'GIRATINA', // no NORMAL form
  'DARMANITAN', // regional forms with a mode
  'ZERAORA', // a move referenced by number
  'WALKINGWAKE', // no English name in the text file yet
  'RAYQUAZA', // a move that cannot be taught by TM
  'GENGAR', // a temporary-evolution element with no id
  'DIANCIE', // an untradable mythical with a mega
  'MELTAN', // a tradable mythical
  'KYUREM', // a tradable legendary whose fusions are not tradable
  'ETERNATUS', // an untradable legendary
];

/** GitHub's listing of the folder with the game's pictures of Pokémon (about 1 MB). */
const ICONS_URL =
  'https://api.github.com/repos/PokeMiners/pogo_assets/git/trees/master:Images/Pokemon/Addressable%20Assets';

const repoRoot = path.resolve(import.meta.dirname, '../..');
const sourceDir = path.join(repoRoot, 'var/game-data-source');
const fixtureDir = path.join(repoRoot, 'test/fixtures');

const download = process.argv.includes('--download');

async function source(file: string, url: string): Promise<string> {
  const target = path.join(sourceDir, file);
  if (download) {
    process.stdout.write(`Downloading ${url}\n`);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${url} answered ${response.status}`);
    await mkdir(sourceDir, { recursive: true });
    await writeFile(target, await response.text());
  } else if (!existsSync(target)) {
    throw new Error(`${target} is missing; run with --download to fetch it`);
  }
  return readFile(target, 'utf8');
}

type Item = { templateId: string; data: Record<string, unknown> };

const textContent = await source('English.txt', TEXT_URL);
const gameMaster = JSON.parse(await source('gamemaster.json', GAME_MASTER_URL)) as Item[];
const texts = parseTextFile(textContent);

const speciesOf = (item: Item): string | undefined => {
  const pokemon = item.data['pokemonSettings'] as { pokemonId?: string } | undefined;
  const forms = item.data['formSettings'] as { pokemon?: string } | undefined;
  // The extended settings that hold modes of max battles (`GameData.maxBattles`, plan 8X-2);
  // the others say only sizes, which the parser does not read.
  const extended = item.data['pokemonExtendedSettings'] as
    { uniqueId?: string; breadOverrides?: unknown } | undefined;
  const maxModes = extended?.breadOverrides === undefined ? undefined : extended.uniqueId;
  return pokemon?.pokemonId ?? forms?.pokemon ?? maxModes;
};
const sampled = gameMaster.filter((item) => SAMPLE_SPECIES.includes(speciesOf(item) ?? ''));
const MOVE_FIELDS = [
  'quickMoves',
  'cinematicMoves',
  'eliteQuickMove',
  'eliteCinematicMove',
  'nonTmCinematicMoves',
];
const referencedMoves = new Set<string | number>();
for (const item of sampled) {
  const settings = (item.data['pokemonSettings'] ?? {}) as Record<string, unknown>;
  for (const field of MOVE_FIELDS) {
    for (const move of (settings[field] ?? []) as Array<string | number>) referencedMoves.add(move);
  }
}
const sample = gameMaster.filter((item) => {
  if (sampled.includes(item)) return true;
  if ('typeEffective' in item.data || 'weatherAffinities' in item.data) return true;
  if ('playerLevel' in item.data) return true;
  const move = /^V(\d{4})_MOVE_(.+)$/.exec(item.templateId);
  return (
    'moveSettings' in item.data &&
    move !== null &&
    (referencedMoves.has(move[2] ?? '') || referencedMoves.has(Number(move[1])))
  );
});

const sampleDex = new Set(sampled.map((item) => /^V(\d{4})_/.exec(item.templateId)?.[1]));
const sampleMoves = new Set(sample.map((item) => /^V(\d{4})_MOVE_/.exec(item.templateId)?.[1]));
const sampleText = [...texts]
  .filter(([key]) => {
    const pokemon = /^pokemon_name_(\d{4})/.exec(key)?.[1];
    const move = /^move_name_(\d{4})$/.exec(key)?.[1];
    return (
      (pokemon !== undefined && sampleDex.has(pokemon) && !key.startsWith('pokemon_name_1009')) ||
      (move !== undefined && sampleMoves.has(move)) ||
      key.startsWith('form_')
    );
  })
  .map(([key, value]) => `RESOURCE ID: ${key}\nTEXT: ${value}\n`)
  .join('\n');

await mkdir(fixtureDir, { recursive: true });
await writeFile(
  path.join(fixtureDir, 'game-master-sample.json'),
  `${JSON.stringify(sample, null, 1)}\n`,
);
await writeFile(path.join(fixtureDir, 'english-sample.txt'), sampleText);
const warnings: string[] = [];
const parsed = parseGameMaster(gameMaster, texts, (message) => warnings.push(message));
// One Pokémon and one move per line, so a refresh gives a reviewable diff.
const lines = Object.entries(parsed).map(([key, value]) =>
  key === 'pokemon' || key === 'moves'
    ? `"${key}":[\n${(value as unknown[]).map((element) => JSON.stringify(element)).join(',\n')}\n]`
    : `"${key}":${JSON.stringify(value)}`,
);
const snapshotPath = path.join(fixtureDir, 'game-data.json');
await writeFile(snapshotPath, `{\n${lines.join(',\n')}\n}\n`);
if (JSON.stringify(JSON.parse(await readFile(snapshotPath, 'utf8'))) !== JSON.stringify(parsed)) {
  throw new Error('game-data.json does not parse back to the parsed game master');
}
// The listing of the icons is kept by few checkouts (it is fetched only with --download):
// without it the icons fixture stays as it is, and the rest is rebuilt all the same.
const ICONS_TREE = 'pokemon-icons-tree.json';
let iconsWritten = 'the icons fixture left as it is';
if (download || existsSync(path.join(sourceDir, ICONS_TREE))) {
  // One name per line, sorted, so a refresh gives a reviewable diff.
  const icons = iconNamesOf(JSON.parse(await source(ICONS_TREE, ICONS_URL)));
  await writeFile(
    path.join(fixtureDir, 'pokemon-icons.json'),
    `[\n${icons.map((name) => JSON.stringify(name)).join(',\n')}\n]\n`,
  );
  iconsWritten = `${icons.length} icon names`;
} else {
  process.stdout.write(
    `Skipped the icons fixture: ${path.join(sourceDir, ICONS_TREE)} is missing (run with --download to fetch it)\n`,
  );
}
for (const message of warnings) process.stdout.write(`Warning: ${message}\n`);
process.stdout.write(
  `Wrote ${sample.length} sample items, ${sampleText.split('RESOURCE ID').length - 1} texts, the parsed snapshot and ${iconsWritten} to ${fixtureDir}\n`,
);
