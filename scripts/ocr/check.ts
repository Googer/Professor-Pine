/**
 * Reads a folder of raid screenshots through the bot's own reading process and prints what was
 * read and what Pine made of it, per screenshot, with the time and memory it took:
 *
 *   npm run ocr:check -- <folder> [--device cpu|cuda|directml] [--threads <n>]
 *                                 [--priority low|normal] [--labels <file>]
 *                                 [--baseline <file>] [--write-baseline <file>]
 *                                 [--bosses <file>] [--write-bosses <file>]
 *
 * With labels, each element is scored right or wrong. Labels come from `labels.json` in the
 * folder (or `--labels`: per file name `clock` "h:mm" or null, `countdown` "h:mm:ss", `gym` the
 * name as shown, `egg`, `tier` 1, 3, 5, "mega" or the count of heads, `shadow`, `boss`, `cp`;
 * a max battle's screen `kind` "max", `clock`, `countdown`, `species`, `powerSpot`, `heads`),
 * and from the record beside a screenshot of a review folder (`<id>.json`, `var/ocr/review/`):
 * its `label`, which a member's "All right" made (`source: 'member'`: only the gym, by the name
 * of the gym decided, egg or hatched, the heads, shadow and the boss are scored, and of those only
 * what the member did not type; a pane's record, plan 7P, scores its own pane only, and nothing
 * when the picture is not cut into it; a whole picture's record whose picture is cut scores its
 * first pane that shows a screen); a screenshot somebody said was wrong has none and is
 * listed, not scored. It is how a change of the reader is judged (every sample, before and after), and
 * how a machine is measured before Pine runs on it: the device and threads of the command line
 * win over the settings.
 *
 * `--write-baseline <file>` writes what was right and wrong per sample and element (file names
 * and booleans only: no text read, nothing a member wrote); `--baseline <file>` compares with
 * such a file (`compareBaseline`) and lists every sample whose element went from right to wrong
 * or was not read, with exit status 1 when there is one.
 *
 * The boss is decided among a boss list: a review record's own (the bosses at its read), else
 * `--bosses <file>` (a list written by `--write-bosses <file>` from the live feed, so that a
 * check can be repeated later against the same list), else the live feed. The gym is compared as
 * text: the gym search needs the database's gyms, which the bot has. Each clock is printed with
 * the confidence of its line (`CLOCK_SURE` was chosen from these).
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { pino } from 'pino';
import { instanceZone, loadSettings } from '../../src/config/settings.js';
import { OCR_DEVICES, type OcrDevice } from '../../src/domain/ocr/assets.js';
import {
  bossesOfSnapshot,
  compareBaseline,
  type BossSnapshot,
  type Results,
} from '../../src/domain/ocr/baseline.js';
import {
  clockText,
  countdownText,
  memberLabelOfUnit,
  type MemberLabel,
  type SampleLabel,
} from '../../src/domain/ocr/screenshot-record.js';
import { nameSimilarity, screenshotReport } from '../../src/domain/ocr/screenshot-report.js';
import { paneShows, screenAnchors, type PaneShows } from '../../src/domain/ocr/panes.js';
import { screenBody, statusBandOf } from '../../src/domain/ocr/raid-screen.js';
import type { ScreenReading } from '../../src/ocr/screen-reader.js';
import { PokemonCatalogue } from '../../src/domain/pogo/catalogue.js';
import { feedLookup } from '../../src/domain/pogo/feed-lookup.js';
import { GAME_DATA_VERSION, type GameData } from '../../src/domain/pogo/game-master.js';
import { parseRaidBossFeed } from '../../src/domain/pogo/raid-boss-feed.js';
import { effectiveBosses, type RaidBoss } from '../../src/domain/pogo/raid-bosses.js';
import { OcrAssets } from '../../src/services/ocr-assets.js';
import { OcrService } from '../../src/services/ocr-service.js';

const repoRoot = path.resolve(import.meta.dirname, '../..');
const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    device: { type: 'string' },
    threads: { type: 'string' },
    priority: { type: 'string' },
    labels: { type: 'string' },
    baseline: { type: 'string' },
    'write-baseline': { type: 'string' },
    bosses: { type: 'string' },
    'write-bosses': { type: 'string' },
    'no-divider': { type: 'boolean' },
  },
});
const folder = positionals[0];
if (!folder) {
  process.stderr.write('Usage: npm run ocr:check -- <folder> [--device …] [--threads …]\n');
  process.exit(2);
}

const settings = loadSettings(path.join(repoRoot, 'data/settings.json'));
const device = (values.device ?? settings.ocr.device) as OcrDevice;
if (!OCR_DEVICES.includes(device))
  throw new Error(`--device must be one of ${OCR_DEVICES.join(', ')}`);
const threads = values.threads === undefined ? settings.ocr.threads : Number(values.threads);
if (!Number.isInteger(threads) || threads < 0) throw new Error('--threads must be a whole number');
const priority =
  values.priority === 'normal'
    ? 'normal'
    : values.priority === 'low'
      ? 'low'
      : settings.ocr.priority;
const log = pino({ level: 'warn' }, pino.destination(2));

const labelsFile = values.labels ?? path.join(folder, 'labels.json');
type Label = SampleLabel | MaxLabel | NoneLabel;
const labels: Record<string, Label | undefined> = existsSync(labelsFile)
  ? (JSON.parse(readFileSync(labelsFile, 'utf8')) as Record<string, Label>)
  : {};

/** The answer key of a pane that shows no GO screen (a map, a chat): `<file>#<n>` (plan 7P). */
interface NoneLabel {
  none: true;
}

/** The answer key of a max battle's screen. */
interface MaxLabel {
  kind: 'max';
  clock: string | null;
  countdown: string | null;
  species: string;
  powerSpot: string;
  heads: number;
}

/** What is read of the record beside a screenshot of a review folder. */
interface KeptRecord {
  label?: MemberLabel;
  /** The pane of a split screenshot the record is of (plan 7P): its label is that pane's. */
  pane?: { index: number };
  feedback?: { verdict: string }[];
  bosses?: BossSnapshot;
}

function recordOf(file: string): KeptRecord | undefined {
  const record = path.join(folder ?? '', `${file.replace(/\.[^.]+$/, '')}.json`);
  if (!existsSync(record)) return undefined;
  try {
    return JSON.parse(readFileSync(record, 'utf8')) as KeptRecord;
  } catch {
    return undefined;
  }
}

/** The saved game data's catalogue, or undefined (said so): without it no boss is decided. */
function savedCatalogue(): PokemonCatalogue | undefined {
  const cache = path.join(repoRoot, 'var/game-data-cache.json');
  if (!existsSync(cache)) {
    process.stdout.write(
      'No saved game data (var/game-data-cache.json): the boss is not decided.\n',
    );
    return undefined;
  }
  const saved = JSON.parse(readFileSync(cache, 'utf8')) as { version?: number; data: GameData };
  if (saved.version !== GAME_DATA_VERSION) {
    process.stdout.write('The saved game data has another version: the boss is not decided.\n');
    return undefined;
  }
  return new PokemonCatalogue(saved.data);
}

/** The bosses of `--bosses`, or of the live feed (or none, said so). */
async function currentBosses(catalogue: PokemonCatalogue | undefined): Promise<RaidBoss[]> {
  if (!catalogue) return [];
  if (values.bosses) {
    const snapshot = JSON.parse(readFileSync(values.bosses, 'utf8')) as BossSnapshot;
    return bossesOfSnapshot(snapshot, catalogue);
  }
  try {
    const response = await fetch(settings.raidBosses.url, { signal: AbortSignal.timeout(30_000) });
    const { bosses } = parseRaidBossFeed(await response.json(), feedLookup(catalogue));
    return effectiveBosses(bosses, [], catalogue, Date.now());
  } catch {
    process.stdout.write('The raid boss feed could not be read: the boss is not decided.\n');
    return [];
  }
}

const catalogue = savedCatalogue();
const bosses = await currentBosses(catalogue);
if (values['write-bosses']) {
  const snapshot = bosses.map((boss) => ({ key: boss.key, name: boss.name, tier: boss.tier }));
  writeFileSync(values['write-bosses'], `${JSON.stringify(snapshot, null, 2)}\n`);
  process.stdout.write(`Wrote the boss list to ${values['write-bosses']}.\n`);
}
const assets = new OcrAssets({
  dir: path.join(repoRoot, 'var/ocr'),
  modelsUrl: settings.ocr.modelsUrl,
  headIconUrl: settings.ocr.headIconUrl,
  fetch: (url, init) => fetch(url, init),
  log,
});
const ocr = new OcrService({
  assets,
  device,
  threads,
  priority,
  queue: 1000,
  timeoutMs: settings.ocr.timeoutSeconds * 1000,
  log,
});

const files = readdirSync(folder)
  .filter((file) => /\.(png|jpe?g|webp)$/i.test(file))
  .sort();
const right = new Map<string, [number, number]>();
const results: Results = {};
const disputed: string[] = [];
let readMs = 0;
let wallMs = 0;
let summed = 0;
let peakMb = 0;
let first = true;
process.stdout.write(
  `Device ${device}, threads ${threads || 'all'}, priority ${priority}; ${files.length} screenshots.\n\n`,
);
/** One screen scored: the whole picture, or a pane of it (plan 7P), under its results key. */
interface Scored {
  key: string;
  reading: ScreenReading;
  shows: PaneShows;
  /** The index of the pane read, null for the whole reading. */
  pane: number | null;
  /** The pane is the first of the picture's that shows a screen. */
  firstScreen: boolean;
  /** What the bot would do with the whole picture: refuse it as two screens. */
  refused: boolean;
}

/** What a reading shows, as a pane's is judged (`paneShows` over its anchors). */
function showsOf(reading: ScreenReading): PaneShows {
  const body = screenBody(reading.lines, reading.status, statusBandOf(reading), reading.width);
  return paneShows(reading.text, screenAnchors(body));
}

let slowest = { file: '', ms: 0 };
let twoWhole = 0;
const twoFiles: string[] = [];
const lateFiles: string[] = [];
for (const file of files) {
  const started = performance.now();
  const outcome = await ocr.read(readFileSync(path.join(folder, file)), {
    ...(values['no-divider'] ? { divider: false } : {}),
  });
  const took = performance.now() - started;
  if (outcome.kind !== 'read') {
    process.stdout.write(`${file}: ${outcome.kind}\n`);
    continue;
  }
  const { reading, panes } = outcome;
  // The first screenshot also starts the process and loads the models: it is not counted.
  if (!first) {
    readMs += reading.ms;
    wallMs += took;
    summed++;
    if (reading.ms > slowest.ms) slowest = { file, ms: reading.ms };
  }
  first = false;
  peakMb = Math.max(peakMb, reading.peakMb);
  if (outcome.twoScreens) {
    twoWhole++;
    twoFiles.push(file);
  }
  const record = recordOf(file);
  // A review record's own bosses: the list the bot decided among.
  const bossesHere =
    record?.bosses && catalogue ? bossesOfSnapshot(record.bosses, catalogue) : bosses;
  const wrongVerdict = record?.feedback?.some((f) => f.verdict === 'wrong') ?? false;
  if (wrongVerdict) disputed.push(file);
  const paneKeys = Object.keys(labels).filter((key) => key.startsWith(`${file}#`));
  const refused = !panes && outcome.twoScreens === true;
  // A member's label of the whole picture (a record kept before 7P, or read late; review F1).
  const wholeMember = Boolean(record?.label && !record.pane && !wrongVerdict);
  // What is scored: each pane (its own label `#n`, or the picture's label, from labels.json or
  // a member's, on the first pane that shows a screen, under the picture's key); without panes
  // the whole reading, against the picture's label or each pane's.
  const scoredUnits: Scored[] = [];
  if (panes) {
    const firstScreen = panes.find((pane) => pane.shows === 'raid' || pane.shows === 'max');
    for (const pane of panes) {
      const own = `${file}#${pane.index}`;
      const whole = !labels[own] && pane === firstScreen && (Boolean(labels[file]) || wholeMember);
      scoredUnits.push({
        key: whole ? file : own,
        reading: pane.reading,
        shows: pane.shows,
        pane: pane.index,
        firstScreen: pane === firstScreen,
        refused: false,
      });
    }
  } else if (labels[file] || paneKeys.length === 0) {
    scoredUnits.push({
      key: file,
      reading,
      shows: showsOf(reading),
      pane: null,
      firstScreen: false,
      refused,
    });
  } else {
    for (const key of paneKeys) {
      scoredUnits.push({
        key,
        reading,
        shows: showsOf(reading),
        pane: null,
        firstScreen: false,
        refused,
      });
    }
  }
  const how = panes
    ? `cut by the ${outcome.cut ?? 'divider'} into ${panes.length} panes`
    : refused
      ? 'two screens: refused'
      : '';
  const late = outcome.late ? '  late: its panes not read for lack of time' : '';
  if (outcome.late) lateFiles.push(file);
  process.stdout.write(`${file}  ${reading.ms} ms${how ? `  ${how}` : ''}${late}\n`);
  // The clocks of the picture's pane labels: a fake's panes may show two (fold-two-*).
  const labelClocks = paneKeys.flatMap((key) => {
    const one = labels[key];
    return one && 'clock' in one ? [one.clock] : [];
  });
  for (const unit of scoredUnits) {
    const t = unit.reading.text;
    // Uploaded now: the time of a sample is not scored, only its clock and countdown as read.
    const report = screenshotReport(unit.reading, {
      bosses: bossesHere,
      pokemon: catalogue?.all ?? [],
      searchGym: () => [],
      uploadedAt: Date.now(),
      zone: instanceZone(settings),
      standardIncubate: settings.standardRaidIncubateDuration,
      standardHatched: settings.standardRaidHatchedDuration,
      maxHatched: settings.maxRaidHatchedDuration,
      guessOffsetSeconds: settings.screenshotMessageOffsetTime,
    });
    const shown = {
      shows: unit.shows,
      clock: clockText(t.clock),
      clockConfidence:
        t.clock?.confidence === undefined ? null : Number(t.clock.confidence.toFixed(3)),
      countdown: countdownText(t.countdown),
      gym: t.gym,
      stage: report.stage,
      heads: report.heads,
      tier: report.tier ? `${report.tier.shadow ? 'Shadow ' : ''}${report.tier.level}` : null,
      cp: t.cp,
      bossName: t.bossName,
      boss: report.boss?.name ?? null,
      purple: Number((unit.reading.purple * 100).toFixed(2)),
      max: t.max ? { species: t.max.species, powerSpot: t.max.powerSpot } : null,
      doubts: report.doubts,
    };
    const wrong: string[] = [];
    const scored: Record<string, boolean> = {};
    // A picture refused as two screens reports nothing: every element of it is wrong.
    const check = (element: string, ok: boolean) => {
      const good = ok && !unit.refused;
      const [count, all] = right.get(element) ?? [0, 0];
      right.set(element, [count + (good ? 1 : 0), all + 1]);
      scored[element] = good;
      if (!good) wrong.push(element);
    };
    const bossRight = (name: string | null) =>
      report.boss !== null &&
      (report.boss.name.includes(name ?? '') ||
        nameSimilarity(report.boss.name, name ?? '') >= 0.75);
    const clockRight = (clock: string | null) =>
      shown.clock === clock || (labelClocks.length > 1 && labelClocks.includes(shown.clock));
    const label = labels[unit.key];
    // A member's "All right": a pane record's against its own pane only (review S2), a whole
    // picture's against the whole reading or its first pane that shows a screen (review F1).
    const member = !label && !wrongVerdict ? memberLabelOfUnit(record, unit) : undefined;
    if (label && 'none' in label) {
      check('none', unit.shows === 'none');
    } else if (label && 'kind' in label) {
      check('clock', clockRight(label.clock));
      check('countdown', shown.countdown === label.countdown);
      check('kind', Boolean(t.max));
      check('species', nameSimilarity(t.max?.species ?? '', label.species) >= 0.9);
      check('spot', nameSimilarity(t.max?.powerSpot ?? '', label.powerSpot) >= 0.9);
      check('heads', report.heads === label.heads);
    } else if (label) {
      check('clock', clockRight(label.clock));
      check('countdown', shown.countdown === label.countdown);
      check('gym', nameSimilarity(t.gym ?? '', label.gym ?? '') >= 0.9);
      check('stage', shown.stage === (label.egg ? 'egg' : 'hatched'));
      check('heads', report.heads === (label.tier === 'mega' ? 4 : label.tier));
      check('shadow', (report.tier?.shadow ?? false) === label.shadow);
      if (!label.egg) {
        check('cp', t.cp === label.cp);
        if (bossesHere.length > 0) check('boss', bossRight(label.boss));
      }
    } else if (member) {
      // What a member said was right: only what the reader decided, by itself.
      if (member.gym !== undefined) check('gym', nameSimilarity(t.gym ?? '', member.gym) >= 0.9);
      if (member.egg !== undefined) {
        check('stage', shown.stage === (member.egg ? 'egg' : 'hatched'));
      }
      if (member.tier !== undefined) {
        check('heads', report.heads === (member.tier === 'mega' ? 4 : member.tier));
      }
      if (member.shadow !== undefined) {
        check('shadow', (report.tier?.shadow ?? false) === member.shadow);
      }
      if (member.boss !== undefined && bossesHere.length > 0) {
        check('boss', bossRight(member.boss));
      }
    }
    if (Object.keys(scored).length > 0) results[unit.key] = scored;
    const verdict = Object.keys(scored).length
      ? wrong.length
        ? `  WRONG: ${wrong.join(', ')}`
        : '  all right'
      : '';
    const name = panes || unit.key !== file ? `  ${unit.key}` : '';
    process.stdout.write(`${name}${verdict}\n  ${JSON.stringify(shown)}\n`);
  }
}
await ocr.close();

const counted = Math.max(1, summed);
process.stdout.write('\n');
if (right.size > 0) {
  process.stdout.write(
    `${[...right].map(([element, [good, all]]) => `${element} ${good}/${all}`).join(', ')}\n`,
  );
}
if (disputed.length > 0) {
  process.stdout.write(
    `Not scored, a member said they were read wrong (see ocr:review): ${disputed.join(', ')}\n`,
  );
}
process.stdout.write(
  `${Math.round(readMs / counted)} ms a screenshot in the reading process (${Math.round(wallMs / counted)} ms with the handing over); its peak memory ${peakMb} MB.\n`,
);
if (slowest.file) process.stdout.write(`The slowest: ${slowest.file}, ${slowest.ms} ms.\n`);
process.stdout.write(
  `The whole reading shows two screens (twoScreens) on ${twoWhole} of ${files.length}${twoFiles.length ? `: ${twoFiles.join(', ')}` : ''}.\n`,
);
process.stdout.write(
  `Read late, without the panes of a cut: ${lateFiles.length}${lateFiles.length ? ` (${lateFiles.join(', ')})` : ''}.\n`,
);

if (values.baseline) {
  const before = (JSON.parse(readFileSync(values.baseline, 'utf8')) as { samples: Results })
    .samples;
  const { worse, better } = compareBaseline(before, results);
  process.stdout.write(
    `\nAgainst ${values.baseline}: ${worse.length} from right to wrong, ${better.length} from wrong to right.\n`,
  );
  for (const line of worse) process.stdout.write(`  WORSE  ${line}\n`);
  for (const line of better) process.stdout.write(`  better ${line}\n`);
  if (worse.length > 0) process.exitCode = 1;
}
if (values['write-baseline']) {
  const totals = Object.fromEntries(
    [...right].map(([element, [good, all]]) => [element, { right: good, of: all }]),
  );
  writeFileSync(
    values['write-baseline'],
    `${JSON.stringify({ samples: results, totals }, null, 2)}\n`,
  );
  process.stdout.write(`Wrote the baseline to ${values['write-baseline']}.\n`);
}
