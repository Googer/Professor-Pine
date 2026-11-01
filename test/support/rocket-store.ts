import type {
  GruntMessageRow,
  GruntMessageStorage,
} from '../../src/db/repositories/grunt-message-repository.js';
import type {
  KeptRocketList,
  RocketLineupStorage,
} from '../../src/db/repositories/rocket-lineup-repository.js';
import {
  lineupFingerprint,
  type RocketChoice,
  type RocketLineupChoice,
} from '../../src/domain/rocket/lineups.js';

/**
 * The grunts' messages in memory (`GruntMessageStorage`), the twin of `GruntMessageRepository`;
 * `failing` per method. Like a real query, an answer never comes in the same turn.
 */
export class MemoryGruntMessages implements GruntMessageStorage {
  readonly rows: GruntMessageRow[] = [];
  readonly failing = new Map<keyof GruntMessageStorage, Error>();

  private attempt<T>(method: keyof GruntMessageStorage, work: () => T): Promise<T> {
    return new Promise((resolve, reject) => {
      setImmediate(() => {
        const err = this.failing.get(method);
        if (err) reject(err);
        else resolve(work());
      });
    });
  }

  add(row: GruntMessageRow): Promise<void> {
    return this.attempt('add', () => {
      if (!this.rows.some((one) => one.messageId === row.messageId)) this.rows.push({ ...row });
    });
  }

  remove(messageId: string): Promise<void> {
    return this.attempt('remove', () => {
      const index = this.rows.findIndex((one) => one.messageId === messageId);
      if (index >= 0) this.rows.splice(index, 1);
    });
  }

  retime(messageId: string, deleteAt: number): Promise<void> {
    return this.attempt('retime', () => {
      const row = this.rows.find((one) => one.messageId === messageId);
      if (row) row.deleteAt = deleteAt;
    });
  }

  all(): Promise<GruntMessageRow[]> {
    return this.attempt('all', () =>
      this.rows
        .map((row) => ({ ...row }))
        .sort((a, b) => a.deleteAt - b.deleteAt || a.messageId.localeCompare(b.messageId)),
    );
  }

  ofReport(reportId: number): Promise<GruntMessageRow[]> {
    return this.attempt('ofReport', () =>
      this.rows
        .filter((row) => row.reportId === reportId)
        .map((row) => ({ ...row }))
        .sort((a, b) => a.messageId.localeCompare(b.messageId)),
    );
  }

  ofReports(reportIds: readonly number[]): Promise<GruntMessageRow[]> {
    return this.attempt('ofReports', () =>
      this.rows
        .filter((row) => reportIds.includes(row.reportId))
        .map((row) => ({ ...row }))
        .sort((a, b) => a.reportId - b.reportId || a.messageId.localeCompare(b.messageId)),
    );
  }
}

/** A choice as the kept list holds it: its lineups without their fingerprints. */
type KeptChoice = Omit<RocketChoice, 'lineups'> & {
  lineups?: Omit<RocketLineupChoice, 'fingerprint'>[];
};

/** The kept Rocket lineups in memory (`RocketLineupStorage`), the twin of `RocketLineupRepository`. */
export class MemoryRocketLineups implements RocketLineupStorage {
  readonly rows = new Map<
    string,
    { choice: KeptChoice; firstSeen: number; lastSeen: number; active: boolean; position: number }
  >();
  readonly failing = new Map<keyof RocketLineupStorage, Error>();

  private fail(method: keyof RocketLineupStorage): void {
    const err = this.failing.get(method);
    if (err) throw err;
  }

  kept(): Promise<KeptRocketList> {
    this.fail('kept');
    const active = [...this.rows.values()]
      .filter((row) => row.active)
      .sort((a, b) => a.position - b.position || a.choice.key.localeCompare(b.choice.key));
    const readAt = active.length === 0 ? undefined : Math.max(...active.map((row) => row.lastSeen));
    // The fingerprints are worked out again, as the repository does (review L3).
    const choices = active.map(({ choice }): RocketChoice => {
      const { lineups, ...rest } = structuredClone(choice);
      return lineups === undefined
        ? rest
        : {
            ...rest,
            lineups: lineups.map((one) => ({ ...one, fingerprint: lineupFingerprint(one) })),
          };
    });
    return Promise.resolve({ choices, readAt });
  }

  replace(choices: readonly RocketChoice[], at: number): Promise<void> {
    this.fail('replace');
    for (const row of this.rows.values()) row.active = false;
    for (const [position, choice] of choices.entries()) {
      const firstSeen = this.rows.get(choice.key)?.firstSeen ?? at;
      // Kept without the fingerprints, as the repository keeps them (review L3).
      const { lineups, ...rest } = choice;
      const kept: KeptChoice =
        lineups === undefined
          ? rest
          : {
              ...rest,
              lineups: lineups.map(({ lineup, first, catches }) => ({ lineup, first, catches })),
            };
      this.rows.set(choice.key, {
        choice: structuredClone(kept),
        firstSeen,
        lastSeen: at,
        active: true,
        position,
      });
    }
    return Promise.resolve();
  }
}
