/**
 * Compares the names `/rank`'s links use with pvpivs.com's own list of Pokémon, which the site
 * reads only exactly and whose author changes (`_SPECULATIVE` marks, new Pokémon): run it with
 * `npm run pvpivs:check` when a link opens no ranking, or after a big game update. It writes
 * nothing and needs neither the database nor Discord; the list is read as text, never run. Exits 1
 * when a link would fail.
 *
 * The game data is the bot's saved copy (var/game-data-cache.json) when there is one, otherwise
 * the test fixture.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { PokemonCatalogue } from '../../src/domain/pogo/catalogue.js';
import { GAME_DATA_VERSION, type GameData } from '../../src/domain/pogo/game-master.js';
import { PVPIVS_SPECULATIVE, pvpivsName } from '../../src/render/pvp-rank.js';

const LIST_URL = 'https://pvpivs.com/includes/pokeListObj.js';
const MARK = '_SPECULATIVE';
const repoRoot = path.resolve(import.meta.dirname, '../..');
/** In the game data, but only met as a max battle's boss, never owned; the site has no page for it. */
const NO_PAGE: ReadonlySet<string> = new Set(['eternatus_eternamax']);
const say = (text: string): void => {
  process.stdout.write(`${text}\n`);
};

function loadGameData(): { data: GameData; source: string } {
  const cache = path.join(repoRoot, 'var/game-data-cache.json');
  if (existsSync(cache)) {
    const saved = JSON.parse(readFileSync(cache, 'utf8')) as { version?: number; data: GameData };
    if (saved.version === GAME_DATA_VERSION) return { data: saved.data, source: cache };
  }
  const fixture = path.join(repoRoot, 'test/fixtures/game-data.json');
  return { data: JSON.parse(readFileSync(fixture, 'utf8')) as GameData, source: fixture };
}

const response = await fetch(LIST_URL, { signal: AbortSignal.timeout(30_000) });
if (!response.ok) throw new Error(`${LIST_URL} answered ${String(response.status)}`);
const listText = await response.text();
/** The site's names, with `attack/defense/stamina` as it has them. */
const site = new Map<string, string>();
for (const match of listText.matchAll(
  /(?:^|[,{])\s*"?([A-Z][A-Za-z0-9_]*)"?\s*:\s*"\d[^,"]*,(\d+),(\d+),(\d+)/g,
)) {
  site.set(match[1] ?? '', `${match[2] ?? ''}/${match[3] ?? ''}/${match[4] ?? ''}`);
}
if (site.size === 0) throw new Error(`${LIST_URL} no longer has the format this script reads`);

const { data, source } = loadGameData();
const catalogue = new PokemonCatalogue(data);

const unknown: string[] = [];
const otherStats: string[] = [];
const checked = new Set<string>();
for (const entry of catalogue.all) {
  const name = pvpivsName(entry, catalogue.byDex(entry.dex));
  const stats = site.get(name);
  if (stats === undefined) {
    if (NO_PAGE.has(entry.key)) continue;
    unknown.push(`${name} (${entry.key})`);
    continue;
  }
  if (checked.has(name)) continue;
  checked.add(name);
  const ours = `${String(entry.stats.attack)}/${String(entry.stats.defense)}/${String(entry.stats.stamina)}`;
  if (stats !== ours) otherStats.push(`${name}: Pine ${ours}, the site ${stats}`);
}
const noMoreMarked = [...PVPIVS_SPECULATIVE].filter((name) => !site.has(`${name}${MARK}`));
const newlyMarked = [...site.keys()]
  .filter((name) => name.endsWith(MARK))
  .map((name) => name.slice(0, -MARK.length))
  .filter((name) => !PVPIVS_SPECULATIVE.has(name));

const section = (title: string, names: readonly string[]): void => {
  say(`\n${title}: ${names.length === 0 ? 'none' : String(names.length)}`);
  for (const name of names) say(`  ${name}`);
};
say(`${String(site.size)} names on the site; ${String(catalogue.all.length)} entries in ${source}`);
section(`In PVPIVS_SPECULATIVE, but the site has no such name with ${MARK}`, noMoreMarked);
section(`On the site with ${MARK}, but not in PVPIVS_SPECULATIVE`, newlyMarked);
section('Entries whose link names nothing on the site', unknown);
section('Stats the site has otherwise, so its ranks differ from Pine’s', otherStats);

if (noMoreMarked.length > 0 || newlyMarked.length > 0 || unknown.length > 0) process.exitCode = 1;
