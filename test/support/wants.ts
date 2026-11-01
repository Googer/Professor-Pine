import type { PokemonCatalogue } from '../../src/domain/pogo/catalogue.js';
import { catalogueFixture } from './game-data.js';
import type { WantStorage } from '../../src/db/repositories/pokemon-notification-repository.js';
import type {
  NotificationScope,
  NotificationTarget,
} from '../../src/domain/pogo/notification-target.js';
import {
  planSetWant,
  readWants,
  rowsOfWant,
  formReader,
  wantsByMember,
  type FormReader,
  type MemberWants,
  type SetWantOutcome,
  type WantList,
  type WantRow,
} from '../../src/domain/pogo/wants.js';

/** The reader of forms over the game-data fixture, which is read once, at the first form. */
export function fixtureForms(): FormReader {
  let catalogue: PokemonCatalogue | undefined;
  return formReader(() => (catalogue ??= catalogueFixture()));
}

interface Row extends WantRow {
  memberId: string;
  guildId: string;
}

/**
 * The wants kept in memory as `PokemonNotificationRepository` keeps them, whose behaviour
 * pokemon-notification-repository.db.test.ts pins down: rows per member and server, read and
 * changed through the same functions of `wants.ts`. `add` puts a row as it may stand in the
 * table: one the legacy bot left, or one with a form or for shadow raids. Set `failing` to make
 * every call reject.
 */
export class MemoryWants implements WantStorage {
  failing: Error | undefined;
  readonly rows: Row[] = [];
  private nextId = 1;

  /** `forms` is what the game data makes of a stored form: by default that of the fixture. */
  constructor(private readonly forms: FormReader = fixtureForms()) {}

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

  /**
   * A row as it may stand in the table, for a test: any number, any type, and with `more` any
   * form, the shadow flag and costumed (a row has no form, is not for shadow raids and is plain
   * otherwise).
   */
  add(
    memberId: string,
    guildId: string,
    pokemon: number,
    type: string,
    more: { form?: string | null; shadow?: boolean; costumed?: boolean } = {},
  ): number {
    const id = this.nextId++;
    const { form = null, shadow = false, costumed = false } = more;
    this.rows.push({ id, memberId, guildId, pokemon, type, form, shadow, costumed });
    return id;
  }

  list(memberId: string, guildId: string): Promise<WantList> {
    return this.attempt(() => readWants(this.of(memberId, guildId), this.forms));
  }

  count(memberId: string, guildId: string): Promise<number> {
    return this.attempt(() => {
      const { wants, unreadable } = readWants(this.of(memberId, guildId), this.forms);
      return wants.length + unreadable;
    });
  }

  wanting(guildId: string, numbers: readonly number[]): Promise<MemberWants[]> {
    return this.attempt(() =>
      wantsByMember(
        this.rows.filter((row) => row.guildId === guildId && numbers.includes(row.pokemon)),
        this.forms,
      ),
    );
  }

  set(
    memberId: string,
    guildId: string,
    target: NotificationTarget,
    scope: NotificationScope,
    costumed = false,
  ): Promise<SetWantOutcome> {
    return this.attempt(() => {
      const plan = planSetWant(this.of(memberId, guildId), target, scope, this.forms, costumed);
      if (plan.insert) {
        const { pokemon, type, form, shadow } = plan.insert;
        this.add(memberId, guildId, pokemon, type, {
          form,
          shadow,
          costumed: plan.insert.costumed === true,
        });
      }
      if (plan.update) {
        const { id, values } = plan.update;
        const row = this.rows.find((found) => found.id === id);
        // As the repository writes it: costumed always said.
        if (row) Object.assign(row, values, { costumed: values.costumed === true });
      }
      this.drop(plan.remove);
      return plan.outcome;
    });
  }

  remove(memberId: string, guildId: string, target: NotificationTarget): Promise<boolean> {
    return this.attempt(() => {
      const ids = rowsOfWant(this.of(memberId, guildId), target, this.forms);
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
}
