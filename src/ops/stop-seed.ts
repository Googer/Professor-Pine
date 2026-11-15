import { ringContains } from '@pine/wayspot-core/region-membership';
import type { Kysely } from 'kysely';
import { GuildRepository } from '../db/repositories/guild-repository.js';
import { PineStopRepository } from '../db/repositories/pine-stop-repository.js';
import { RegionRepository } from '../db/repositories/region-repository.js';
import { RowIds } from '../db/repositories/row-ids.js';
import { WayspotRepository } from '../db/repositories/wayspot-repository.js';
import { isSnowflake } from '../db/snowflake.js';
import type { DB } from '../db/types.js';
import { planSeed, readSeedCsv, type SeedOutcome } from '../domain/stops/seed.js';
import type { Logger } from '../log.js';
import { PINE_STOP_NEAR_METRES, PineStopService } from '../services/pine-stops.js';
import { RegionDirectory } from '../services/region-directory.js';
import { WayspotDirectory } from '../services/wayspot-directory.js';

export const SEED_USAGE =
  'Usage: npm run stops:seed -- <file> --server <server id> [--apply]\n' +
  '   or: ./pine seed-stops <file> --server <server id> [--apply]\n' +
  'Without --apply it only says what it would add.';

/**
 * Who a seeded stop was made by (`PineStop.createdBy`, a member's id where `/pokestop add` made
 * it): no member, the seed. Nothing shows it to members; the log and the table tell them apart.
 */
export const SEED_MAKER = 'stops-seed';

export interface SeedStepDeps {
  db: Kysely<DB>;
  /** The file's text (the CLI reads it as UTF-8). */
  readText: (path: string) => string;
  say: (line: string) => void;
  log: Logger;
  now?: () => number;
}

/** The arguments, or undefined where they are not as `SEED_USAGE` says. */
export function seedArgs(
  args: readonly string[],
): { file: string; server: string; apply: boolean } | undefined {
  let file: string | undefined;
  let server: string | undefined;
  let apply = false;
  for (let at = 0; at < args.length; at++) {
    const arg = args[at] ?? '';
    if (arg === '--apply') apply = true;
    else if (arg === '--server') {
      server = args[++at];
      if (server === undefined || !isSnowflake(server)) return undefined;
    } else if (arg.startsWith('-') || file !== undefined) return undefined;
    else file = arg;
  }
  return file === undefined || server === undefined ? undefined : { file, server, apply };
}

function where(outcome: SeedOutcome): string {
  const { row } = outcome;
  return `line ${String(row.line)}  ${row.name} (${String(row.lat)}, ${String(row.lon)})`;
}

/**
 * Seeds the stops of Pine's own of a server from a file of sponsored stops (`readSeedCsv`;
 * a follow-up of plan 8R-1): each row in a region of the server and with no known stop (a kept
 * Wayspot of kind stop, or a stop of Pine's own of the server) within `PINE_STOP_NEAR_METRES`
 * is added through `PineStopService`, as `/pokestop add` adds one, made by `SEED_MAKER`. Says
 * what becomes of each row. Without `--apply` it writes nothing. Safe to run again: what it
 * added is a known stop then. The database only: Discord is not contacted (a running bot reads
 * the new stops at its next start). Exit codes: 0 done, 1 a failure, 2 the usage.
 */
export async function seedStep(args: readonly string[], deps: SeedStepDeps): Promise<number> {
  const { db, say, log } = deps;
  const now = deps.now ?? (() => Date.now());
  const parsed = seedArgs(args);
  if (!parsed) {
    say(SEED_USAGE);
    return 2;
  }
  const { file, server, apply } = parsed;
  let text: string;
  try {
    text = deps.readText(file);
  } catch (err) {
    say(`Cannot read ${file}: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
  const { rows, problems } = readSeedCsv(text);
  for (const problem of problems) say(`unreadable  ${problem}`);
  if (rows.length === 0) {
    say(`${file} holds no stop to add.`);
    return problems.length > 0 ? 1 : 0;
  }
  const guilds = new GuildRepository(db, new RowIds());
  const guildRow = await guilds.idFor(server);
  if (guildRow === undefined) {
    say(`The database has no server ${server}: name a server the bot is in.`);
    return 1;
  }
  const regions = new RegionDirectory({ regions: new RegionRepository(db), log });
  const wayspots = new WayspotDirectory({ wayspots: new WayspotRepository(db), regions, log });
  const pineStops = new PineStopService({
    storage: new PineStopRepository(db),
    wayspots,
    guilds,
    log,
  });
  await regions.load();
  await wayspots.load();
  await pineStops.load();
  const outlined = regions
    .all()
    .filter((region) => region.guildId === guildRow && region.bounds !== null);
  if (outlined.length === 0) {
    say(`The server ${server} has no region with an outline: no stop can be placed.`);
    return 1;
  }
  const plan = planSeed(
    rows,
    {
      regionsAt: (point) =>
        outlined.flatMap((region) =>
          region.bounds !== null && ringContains(region.bounds, point) ? [region.channelId] : [],
        ),
      nearestStop: (point) => {
        // The server's own stops alone (plan 19B-3): its kept ones and its stops of Pine's own.
        const [nearest] = wayspots.of(guildRow).near(point, PINE_STOP_NEAR_METRES, ['stop']);
        return nearest && { name: nearest.wayspot.title, metres: nearest.metres };
      },
    },
    PINE_STOP_NEAR_METRES,
  );
  let added = 0;
  for (const outcome of plan) {
    switch (outcome.kind) {
      case 'outside':
        say(`skipped     ${where(outcome)}: outside every region of the server`);
        break;
      case 'near':
        say(
          `skipped     ${where(outcome)}: a stop is ${String(outcome.metres)} m away (${outcome.stop})`,
        );
        break;
      case 'add': {
        if (!apply) {
          say(`would add   ${where(outcome)}`);
          break;
        }
        const { row } = outcome;
        try {
          const made = await pineStops.add({
            serverId: server,
            name: row.name,
            lat: row.lat,
            lon: row.lon,
            address: null,
            createdBy: SEED_MAKER,
            createdAt: now(),
          });
          added += 1;
          say(`added       ${where(outcome)} as pine-${String(made.id)}`);
        } catch (err) {
          say(`failed      ${where(outcome)}: ${err instanceof Error ? err.message : String(err)}`);
          return 1;
        }
        break;
      }
    }
  }
  const adds = plan.filter((outcome) => outcome.kind === 'add').length;
  const skipped = plan.length - adds;
  const unreadable = problems.length > 0 ? `, ${String(problems.length)} unreadable` : '';
  say(
    apply
      ? `${String(added)} added, ${String(skipped)} skipped${unreadable}.`
      : `${String(adds)} to add, ${String(skipped)} skipped${unreadable}. Nothing was written: add --apply to add them.`,
  );
  return 0;
}
