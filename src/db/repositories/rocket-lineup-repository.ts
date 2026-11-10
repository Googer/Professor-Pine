import { sql, type Kysely } from 'kysely';
import { z } from 'zod';
import { lineupFingerprint, type RocketChoice } from '../../domain/rocket/lineups.js';
import type { Logger } from '../../log.js';
import { inTransaction } from '../transaction.js';
import type { DB } from '../types.js';

/** The last good list of `/rocket`'s choices, and when it was read (undefined: never). */
export interface KeptRocketList {
  choices: RocketChoice[];
  readAt: number | undefined;
}

/** A choice's catchable Pokémon as a document keeps them (`RocketLineup.catches`, a report's). */
export const catchesDocument = z.array(
  z.object({
    name: z.string(),
    key: z.string().nullable(),
    dex: z.number().int().nullable(),
    shiny: z.boolean(),
    image: z.string().nullable(),
  }),
);

/**
 * What `RocketLineup.catches` holds: the catches as a list (a row of before plan 8R-4L, or a
 * choice without lineups), or the catches with the grunt type's two lineups beside them (plan
 * 8R-4L, B1; no migration: the key column would not hold a lineup's key). The lineups are read
 * apart (`lineupsDocument`), so that ones it cannot read leave the merged choice (B11).
 */
const choiceDocument = catchesDocument.or(
  z.object({ catches: catchesDocument, lineups: z.unknown() }),
);

/**
 * A grunt type's two lineups as the row keeps them: without their fingerprints (B6), and only as
 * the parser keeps them apart (review L2): of the two genders, with different first slots, neither
 * empty (L-2).
 */
const lineupsDocument = z
  .array(
    z.object({
      lineup: z.enum(['male', 'female']),
      first: z.array(z.string()).min(1),
      catches: catchesDocument,
    }),
  )
  .length(2)
  .refine(
    ([one, other]) =>
      one !== undefined &&
      other !== undefined &&
      one.lineup !== other.lineup &&
      one.first.join('\n') !== other.first.join('\n'),
    'two lineups of the two genders and different first slots',
  );

/**
 * The last good Rocket lineups read from ScrapedDuck (plan 8R-2; design 5.1; table
 * `RocketLineup` of migration 028), as the task list is kept: a start without the network still
 * offers them. Twin `MemoryRocketLineups` (`test/support/rocket-store.ts`), both running
 * `rocketLineupCases`.
 */
export interface RocketLineupStorage {
  /** The choices of the last good read, in its order, and when it was. */
  kept(): Promise<KeptRocketList>;
  /**
   * Makes `choices` the kept list, in one transaction: a choice kept before keeps when it was
   * first read, every choice listed is read `at` in its place, and one not listed is no longer
   * kept as current.
   */
  replace(choices: readonly RocketChoice[], at: number): Promise<void>;
}

/** The `RocketLineup` table. */
export class RocketLineupRepository implements RocketLineupStorage {
  /** `log` hears of a row whose catches cannot be read (left out). */
  constructor(
    private readonly db: Kysely<DB>,
    private readonly log?: Logger,
  ) {}

  async kept(): Promise<KeptRocketList> {
    const rows = await this.db
      .selectFrom('RocketLineup')
      .selectAll()
      .where('active', '=', 1)
      .orderBy('position')
      .orderBy('rocketKey')
      .execute();
    const choices: RocketChoice[] = [];
    let readAt: number | undefined;
    for (const row of rows) {
      readAt = Math.max(readAt ?? 0, Number(row.lastSeen));
      const kept = choiceDocument.safeParse(
        typeof row.catches === 'string' ? JSON.parse(row.catches) : row.catches,
      );
      if (!kept.success) {
        this.log?.warn({ lineup: row.rocketKey }, 'a kept Rocket lineup cannot be read; left out');
        continue;
      }
      const choice = { key: row.rocketKey, name: row.name };
      if (Array.isArray(kept.data)) {
        choices.push({ ...choice, catches: kept.data });
        continue;
      }
      const lineups = lineupsDocument.safeParse(kept.data.lineups);
      if (!lineups.success) {
        this.log?.warn(
          { lineup: row.rocketKey },
          'the lineups of a kept Rocket choice cannot be read; merged',
        );
      }
      choices.push({
        ...choice,
        catches: kept.data.catches,
        ...(lineups.success
          ? {
              lineups: lineups.data.map((one) => ({
                ...one,
                fingerprint: lineupFingerprint(one),
              })),
            }
          : {}),
      });
    }
    return { choices, readAt };
  }

  replace(choices: readonly RocketChoice[], at: number): Promise<void> {
    return inTransaction(this.db, async (trx) => {
      await trx.updateTable('RocketLineup').set({ active: 0 }).execute();
      if (choices.length === 0) return;
      const document = (choice: RocketChoice): string =>
        JSON.stringify(
          choice.lineups === undefined
            ? choice.catches
            : {
                catches: choice.catches,
                lineups: choice.lineups.map(({ lineup, first, catches }) => ({
                  lineup,
                  first,
                  catches,
                })),
              },
        );
      const values = sql.join(
        choices.map(
          (choice, position) =>
            sql`(${choice.key}, ${choice.name}, ${document(choice)},
              ${String(at)}, ${String(at)}, 1, ${position})`,
        ),
      );
      await sql`
        insert into RocketLineup
          (rocketKey, name, catches, firstSeen, lastSeen, active, position)
        values ${values} as new
        on duplicate key update name = new.name, catches = new.catches,
          lastSeen = new.lastSeen, active = 1, position = new.position`.execute(trx);
    });
  }
}
