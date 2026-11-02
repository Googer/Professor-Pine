import { ringContains } from '@pine/wayspot-core/region-membership';
import type { Kysely } from 'kysely';
import { GuildRepository } from '../db/repositories/guild-repository.js';
import { GymRepository } from '../db/repositories/gym-repository.js';
import { RegionRepository } from '../db/repositories/region-repository.js';
import { RowIds } from '../db/repositories/row-ids.js';
import { WayfarerRepository } from '../db/repositories/wayfarer-repository.js';
import type { DB } from '../db/types.js';
import { nearestBlockChanges } from '../domain/gyms/nearest.js';
import { planGymSeed, readGymSeedCsv, type GymSeedOutcome } from '../domain/gyms/seed.js';
import type { Logger } from '../log.js';
import { DUPLICATE_METRES } from '../services/gym-admin-service.js';
import { RegionDirectory } from '../services/region-directory.js';
import { seedArgs } from './stop-seed.js';

export const GYM_SEED_USAGE =
  'Usage: npm run gyms:seed -- <file> --server <server id> [--apply]\n' +
  '   or: ./pine seed-gyms <file> --server <server id> [--apply]\n' +
  'Without --apply it only says what it would do.';

/** Who marked a seeded gym (`GymWayfarer.notInWayfarerBy`, a member's id where staff did): no member. */
export const GYM_SEED_MAKER = 'gyms-seed';

export interface GymSeedDeps {
  db: Kysely<DB>;
  /** The file's text (the CLI reads it as UTF-8). */
  readText: (path: string) => string;
  say: (line: string) => void;
  log: Logger;
  now?: () => number;
}

function where(outcome: GymSeedOutcome): string {
  const { row } = outcome;
  return `line ${String(row.line)}  ${row.name} (${String(row.lat)}, ${String(row.lon)})`;
}

/**
 * Seeds a server's sponsored gyms from a file (`readGymSeedCsv`), before its first Wayfarer
 * import: a row naming a gym marks it "not in Wayfarer", a row in a region of the server with no
 * gym within `DUPLICATE_METRES` adds a gym and marks it. Says what becomes of each row. Without
 * `--apply` it writes nothing. Safe to run again: an added gym holds its row's `id`. The database
 * only: Discord is not contacted, and a running bot reads the gyms at its next start, which also
 * puts them in the line for Google. Exit codes: 0 done, 1 a failure or a row naming the wrong
 * gym, 2 the usage.
 */
export async function gymSeedStep(args: readonly string[], deps: GymSeedDeps): Promise<number> {
  const { db, say, log } = deps;
  const now = deps.now ?? (() => Date.now());
  const parsed = seedArgs(args);
  if (!parsed) {
    say(GYM_SEED_USAGE);
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
  const { rows, problems } = readGymSeedCsv(text);
  for (const problem of problems) say(`unreadable  ${problem}`);
  if (rows.length === 0) {
    say(`${file} holds no gym.`);
    return problems.length > 0 ? 1 : 0;
  }
  const guildRow = await new GuildRepository(db, new RowIds()).idFor(server);
  if (guildRow === undefined) {
    say(`The database has no server ${server}: name a server the bot is in.`);
    return 1;
  }
  const regions = new RegionDirectory({ regions: new RegionRepository(db), log });
  await regions.load();
  const outlined = regions
    .all()
    .filter((region) => region.guildId === guildRow && region.bounds !== null);
  if (outlined.length === 0) {
    say(`The server ${server} has no region with an outline: no gym can be placed.`);
    return 1;
  }
  const gyms = new GymRepository(db);
  const wayfarer = new WayfarerRepository(db);
  const all = await gyms.listAll();
  const records = await wayfarer.records(all.map((gym) => gym.id));
  const plan = planGymSeed(
    rows,
    {
      gyms: all.map((gym) => ({
        id: gym.id,
        name: gym.name,
        lat: gym.lat,
        lon: gym.lon,
        pogoId: gym.pogoId,
        marked: records.get(gym.id)?.notInWayfarer ?? false,
      })),
      regionsAt: (point) =>
        outlined.flatMap((region) =>
          region.bounds !== null && ringContains(region.bounds, point) ? [region.channelId] : [],
        ),
    },
    DUPLICATE_METRES,
  );

  const toAdd = plan.flatMap((outcome) => (outcome.kind === 'add' ? [outcome] : []));
  /** The numbers of the gyms added, by the row's `id`. */
  const madeBy = new Map<string, number>();
  if (apply && toAdd.length > 0) {
    try {
      const made = await gyms.createBlock(
        toAdd.map(({ row }) => ({ name: row.name, lat: row.lat, lon: row.lon, pogoId: row.id })),
        (created) =>
          nearestBlockChanges([...all, ...created], new Set(created.map((gym) => gym.id))),
      );
      for (const gym of made) if (gym.pogoId !== null) madeBy.set(gym.pogoId, gym.id);
    } catch (err) {
      say(`failed      adding the gyms: ${err instanceof Error ? err.message : String(err)}`);
      return 1;
    }
  }

  const counts = { added: 0, marked: 0, wrong: 0, skipped: 0 };
  for (const outcome of plan) {
    let toMark: number | undefined;
    switch (outcome.kind) {
      case 'marked':
        counts.skipped += 1;
        say(`skipped     ${where(outcome)}: gym ${String(outcome.gym.id)} is marked already`);
        break;
      case 'outside':
        counts.skipped += 1;
        say(`skipped     ${where(outcome)}: outside every region of the server`);
        break;
      case 'near':
        counts.skipped += 1;
        say(
          `skipped     ${where(outcome)}: a gym is ${String(outcome.metres)} m away (${outcome.gym})`,
        );
        break;
      case 'no-gym':
        counts.wrong += 1;
        say(`wrong       ${where(outcome)}: there is no gym ${String(outcome.row.gym)}`);
        break;
      case 'far':
        counts.wrong += 1;
        say(
          `wrong       ${where(outcome)}: gym ${String(outcome.gym.id)} (${outcome.gym.name}) is ${String(outcome.metres)} m away`,
        );
        break;
      case 'mark':
        counts.marked += 1;
        if (!apply) say(`would mark  ${where(outcome)} as gym ${String(outcome.gym.id)}`);
        else toMark = outcome.gym.id;
        break;
      case 'add':
        counts.added += 1;
        if (!apply) say(`would add   ${where(outcome)}`);
        else toMark = madeBy.get(outcome.row.id);
        break;
    }
    if (toMark !== undefined) {
      try {
        await wayfarer.markNotInWayfarer(toMark, GYM_SEED_MAKER, now());
        say(
          `${outcome.kind === 'add' ? 'added' : 'marked'}      ${where(outcome)} as gym ${String(toMark)}`,
        );
      } catch (err) {
        say(`failed      ${where(outcome)}: ${err instanceof Error ? err.message : String(err)}`);
        return 1;
      }
    }
  }
  const unreadable = problems.length > 0 ? `, ${String(problems.length)} unreadable` : '';
  const wrong = counts.wrong > 0 ? `, ${String(counts.wrong)} wrong` : '';
  say(
    apply
      ? `${String(counts.added)} added, ${String(counts.marked)} marked, ${String(counts.skipped)} skipped${wrong}${unreadable}.`
      : `${String(counts.added)} to add, ${String(counts.marked)} to mark, ${String(counts.skipped)} skipped${wrong}${unreadable}. Nothing was written: add --apply to write them.`,
  );
  return counts.wrong > 0 ? 1 : 0;
}
