import {
  membersOfGymTarget,
  readGymTargets,
  rowsOfGymTarget,
  type GymTargetList,
  type GymTargetRow,
  type GymTargetStorage,
  type GymTargetUpkeep,
} from '../../src/db/repositories/gym-notification-repository.js';

interface Row extends GymTargetRow {
  memberId: string;
  guildId: string;
}

/**
 * The targets kept in memory as `GymNotificationRepository` keeps them, whose behaviour
 * gym-notification-repository.db.test.ts pins down: rows per member and server, read through
 * the same functions. `addRow` puts a row as the legacy bot may have left it. Set `failing` to
 * make every call reject.
 */
export class MemoryGymTargets implements GymTargetStorage, GymTargetUpkeep {
  failing: Error | undefined;
  readonly rows: Row[] = [];
  private nextId = 1;

  private attempt<T>(work: () => T): Promise<T> {
    return new Promise((resolve, reject) => {
      // Like a real query, the answer never comes in the same turn of the event loop.
      setImmediate(() => {
        if (this.failing) reject(this.failing);
        else resolve(work());
      });
    });
  }

  private of(memberId: string, guildId: string): Row[] {
    return this.rows.filter((row) => row.memberId === memberId && row.guildId === guildId);
  }

  private drop(ids: readonly number[]): void {
    for (const id of ids) {
      const index = this.rows.findIndex((row) => row.id === id);
      if (index >= 0) this.rows.splice(index, 1);
    }
  }

  /** A row as it may stand in the table, for a test: any text as its gym. */
  addRow(memberId: string, guildId: string, gym: string | null): number {
    const id = this.nextId++;
    this.rows.push({ id, memberId, guildId, gym });
    return id;
  }

  list(memberId: string, guildId: string): Promise<GymTargetList> {
    return this.attempt(() => readGymTargets(this.of(memberId, guildId)));
  }

  count(memberId: string, guildId: string): Promise<number> {
    return this.attempt(() => {
      const { gymIds, unreadable } = readGymTargets(this.of(memberId, guildId));
      return gymIds.length + unreadable;
    });
  }

  targeting(guildId: string, gymId: number): Promise<string[]> {
    return this.attempt(() =>
      membersOfGymTarget(
        // As the repository's query finds them: by the id spelled as this bot writes it.
        this.rows.filter((row) => row.guildId === guildId && row.gym === String(gymId)),
        gymId,
      ),
    );
  }

  add(memberId: string, guildId: string, gymId: number): Promise<'added' | 'exists'> {
    return this.attempt(() => {
      const [kept, ...duplicates] = rowsOfGymTarget(this.of(memberId, guildId), gymId);
      this.drop(duplicates);
      if (kept !== undefined) return 'exists';
      this.addRow(memberId, guildId, String(gymId));
      return 'added';
    });
  }

  remove(memberId: string, guildId: string, gymId: number): Promise<boolean> {
    return this.attempt(() => {
      const ids = rowsOfGymTarget(this.of(memberId, guildId), gymId);
      this.drop(ids);
      return ids.length > 0;
    });
  }

  removeAll(memberId: string, guildId: string): Promise<number> {
    return this.attempt(() => {
      const ids = this.of(memberId, guildId).map((row) => row.id);
      this.drop(ids);
      return ids.length;
    });
  }

  membersTargeting(gymId: number): Promise<number> {
    return this.attempt(
      () =>
        new Set(this.rows.filter((row) => row.gym === String(gymId)).map((row) => row.memberId))
          .size,
    );
  }

  removeGym(gymId: number): Promise<number> {
    return this.attempt(() => {
      const ids = this.rows.filter((row) => row.gym === String(gymId)).map((row) => row.id);
      this.drop(ids);
      return ids.length;
    });
  }
}
