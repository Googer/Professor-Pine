/**
 * Reads the raid bosses as the bot does and prints the boss list Pine would make of them. It
 * writes nothing and needs neither the database nor Discord: run it with
 * `npm run raid-bosses:check` to see which source a read uses (Leek Duck's raid manifest, or the
 * fallback feed and why, plan 8B-L), the rotations in force with their local start and end and
 * the next change, whether the documents still have the format Pine expects, which headings it
 * does not know, how each entry was identified (by its picture, by its name, by both, by
 * neither), which bosses the game data does not know (with the ids the feed gave them) and which
 * entries were left out.
 *
 * The manifest is `raidBosses.manifestUrl` in data/settings.json, read in its `timezone`; the
 * fallback feed is `raidBosses.url`, or the first argument that is no option. `--fallback` reads
 * the fallback feed only. The game data is the bot's saved copy (var/game-data-cache.json) when
 * there is one, otherwise the test fixture.
 *
 * The test fixtures test/fixtures/raid-boss-feed.json (the feed of 2026-10-11) and
 * test/fixtures/raid-manifest/ (the manifest of 2026-10-27) are not refreshed by this script: the
 * tests name their bosses.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { loadSettings, type Settings } from '../../src/config/settings.js';
import type { GetText } from '../../src/services/boss-feed-service.js';
import { readRaidRotations } from '../../src/services/raid-rotations.js';
import { PokemonCatalogue } from '../../src/domain/pogo/catalogue.js';
import { GAME_DATA_VERSION, type GameData } from '../../src/domain/pogo/game-master.js';
import { feedLookup } from '../../src/domain/pogo/feed-lookup.js';
import {
  cleanBossName,
  howIdentified,
  isMegaLevel,
  parseRaidBossFeed,
  pictureIds,
  readEntry,
  readHeading,
  splitShadow,
  type ParsedFeed,
} from '../../src/domain/pogo/raid-boss-feed.js';
import { autosetBoss, effectiveBosses } from '../../src/domain/pogo/raid-bosses.js';
import { raidTierLabel, sameRaidTier } from '../../src/domain/pogo/raid-tier.js';
import { minuteStamp, zoned } from '../../src/domain/time/zoned.js';

const repoRoot = path.resolve(import.meta.dirname, '../..');

function loadGameData(): { data: GameData; source: string; note?: string } {
  const cache = path.join(repoRoot, 'var/game-data-cache.json');
  let note: string | undefined;
  if (existsSync(cache)) {
    const saved = JSON.parse(readFileSync(cache, 'utf8')) as { version?: number; data: GameData };
    if (saved.version === GAME_DATA_VERSION) return { data: saved.data, source: cache };
    note = '(the saved game data has another version; using the test fixture)';
  }
  const fixture = path.join(repoRoot, 'test/fixtures/game-data.json');
  return { data: JSON.parse(readFileSync(fixture, 'utf8')) as GameData, source: fixture, note };
}

const args = process.argv.slice(2);
const fallbackOnly = args.includes('--fallback');
const feedArgument = args.find((arg) => !arg.startsWith('--'));
// Read only when needed, as before: `--fallback` with an address needs no settings file.
let loaded: Settings | undefined;
const settings = (): Settings =>
  (loaded ??= loadSettings(path.join(repoRoot, 'data/settings.json')));
const now = Date.now();
const lines: string[] = [];

const { data, source, note } = loadGameData();
const catalogue = new PokemonCatalogue(data);
const lookup = feedLookup(catalogue);

/** A download as the bot makes it for the manifest and the rotations' pages. */
const get: GetText = async (address, { accept, maxChars }) => {
  const response = await fetch(address, {
    signal: AbortSignal.timeout(30_000),
    headers: { Accept: accept },
  });
  if (!response.ok) throw new Error(`${address} answered ${response.status}`);
  const text = await response.text();
  if (text.length > maxChars) throw new Error(`${address} sent ${text.length} characters`);
  return text;
};

let document: unknown;
let parsed: ParsedFeed | undefined;
let manifestSkipped = 0;
if (fallbackOnly) {
  lines.push('Source: the fallback feed (--fallback)');
} else {
  const { manifestUrl } = settings().raidBosses;
  const zone = settings().timezone;
  const local = (time: number): string => minuteStamp(zoned(time, zone));
  const read = await readRaidRotations(get, manifestUrl, zone, now);
  if (read.status === 'read') {
    // As the bot: merged entries that give no boss Pine can read are a fallback too.
    try {
      parsed = parseRaidBossFeed(read.entries, lookup);
      document = read.entries;
      manifestSkipped = read.skipped;
      lines.push(`Source: Leek Duck's raid manifest, ${manifestUrl}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      lines.push(`Source: the fallback feed, because the manifest gave no usable list: ${message}`);
    }
  } else {
    lines.push(`Source: the fallback feed, because ${read.reason}`);
  }
  lines.push(`Rotations in force (local times, ${zone}):`);
  const inForce = read.inForce ?? [];
  if (inForce.length === 0) lines.push('  none');
  for (const rotation of inForce) {
    const kind = rotation.kind === 'shadow' ? ' (shadow)' : '';
    const kept = rotation.end <= now ? ', ended, kept until the next of its kind starts' : '';
    lines.push(
      `  ${rotation.title}${kind}: ${local(rotation.start)} to ${local(rotation.end)}${kept}`,
    );
  }
  const elsewhere = read.elsewhere ?? 0;
  if (elsewhere > 0) lines.push(`Left out at a city's own times: ${elsewhere}`);
  lines.push(
    `Next change: ${read.nextChange === undefined ? 'none listed' : local(read.nextChange)}`,
  );
}
if (document === undefined || parsed === undefined) {
  const url = feedArgument ?? settings().raidBosses.url;
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  document = await response.json();
  parsed = parseRaidBossFeed(document, lookup);
  lines.push(`Feed: ${url}`);
}

const { bosses: feed, unknownLevels } = parsed;
const skipped = parsed.skipped + manifestSkipped;
const bosses = effectiveBosses(feed, [], catalogue, now);

lines.push(`Game data: ${source}`);
if (note) lines.push(note);
lines.push('');
let previous = '';
for (const boss of bosses) {
  const label = raidTierLabel(boss.tier);
  if (label !== previous) {
    const only = autosetBoss(bosses, boss.tier);
    lines.push(`${label}${only ? ' (eggs hatch as this boss)' : ''}`);
    previous = label;
  }
  const known = boss.entry ? boss.key : 'NOT IN THE GAME DATA';
  lines.push(`  ${boss.name}${boss.shiny ? ' (shiny)' : ''}  [${known}]`);
}
const tiers = bosses.filter(
  (boss, index) => bosses.findIndex((other) => sameRaidTier(other.tier, boss.tier)) === index,
).length;
lines.push('', `${bosses.length} bosses in ${tiers} tiers.`);
if (unknownLevels.length > 0) {
  lines.push(
    `Headings Pine does not know (their bosses were left out): ${unknownLevels.join(', ')}`,
  );
}
lines.push(`Entries left out: ${skipped}`);

/** The catalogue entry some ids name as they stand, as a key (or the ids themselves when it has none). */
const keyOf = (ids: { pokemonId: string; form: string | null }): string =>
  catalogue.byGameMasterId(ids.pokemonId, ids.form)?.key ?? `? ${ids.form ?? ids.pokemonId}`;

// How each entry of the raw document was identified. Picture and name must not contradict each
// other (matchBoss): when they point at different entries the boss is placed by the rule of
// matchBoss (the name's entry for a picture that names no form or a costume, otherwise nothing).
const how: string[] = [];
const disagree: string[] = [];
const entries: unknown[] = Array.isArray(document) ? (document as unknown[]) : [];
for (const raw of entries) {
  const entry = readEntry(raw);
  const cleaned = entry ? cleanBossName(entry.name) : undefined;
  if (!entry || cleaned === undefined) continue;
  const heading = readHeading(entry.heading);
  const { name, shadow } = splitShadow(cleaned, entry.image, lookup);
  const { how: identified, used } = howIdentified(name, entry.image, lookup, {
    mega: heading ? isMegaLevel(heading.level) : false,
  });
  const label = `${shadow ? 'Shadow ' : ''}${name} (${entry.heading.trim()})`;
  const kind = {
    agree: 'picture and name agree',
    'new-form': 'a form of the named species the game data does not know yet',
    disagree: 'picture and name DISAGREE',
    picture: 'picture',
    name: 'name',
    neither: 'neither (an id made of the name)',
  }[identified];
  const picture = pictureIds(entry.image, lookup);
  const named = lookup.findByName(name);
  if (identified === 'disagree' && picture && named) {
    const outcome = used?.resolved
      ? `used ${keyOf(used.resolved)}`
      : 'left unresolved (listed by the feed name)';
    disagree.push(`${label}: picture ${keyOf(picture)}, name ${keyOf(named)}: ${outcome}`);
  }
  const ids = used ? `${used.pokemonId}/${used.form ?? '-'}` : 'no id';
  const placed = used?.resolved ? keyOf(used.resolved) : 'unresolved';
  how.push(`  ${label}: ${kind} -> ${ids} (${placed})`);
}
if (how.length > 0) lines.push('', 'How each entry was identified:', ...how);
if (disagree.length > 0) {
  lines.push(
    '',
    'Picture and name point at different catalogue entries (which was used is said):',
    ...disagree,
  );
}
const unknown = bosses.filter((boss) => !boss.entry);
if (unknown.length > 0) {
  lines.push(
    '',
    'Not in the game data (listed by the name the feed gives; the ids are the feed ids):',
    ...unknown.map((boss) => `  ${boss.name}: ${boss.pokemonId}/${boss.form ?? '-'}`),
  );
}
process.stdout.write(`${lines.join('\n')}\n`);
