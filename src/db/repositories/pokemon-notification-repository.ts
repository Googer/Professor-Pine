import type { Kysely } from 'kysely';
import type {
  EncodedNotification,
  NotificationScope,
  NotificationTarget,
} from '../../domain/pogo/notification-target.js';
import {
  planSetWant,
  readWants,
  rowsOfWant,
  wantsByMember,
  type FormReader,
  type MemberWants,
  type SetWantOutcome,
  type WantList,
  type WantRow,
} from '../../domain/pogo/wants.js';
import type { DB } from '../types.js';
import { findMemberInGuild, withMemberLocked, type MemberInGuild } from './member-rows.js';
import { RowIds } from './row-ids.js';

/**
 * What the commands need of the wants (`ctx.wants`); lets tests keep them in memory. A member
 * and a server are named by their snowflakes. A want is per member and server.
 */
export interface WantStorage {
  /** The member's wants in a server, and how many of their rows there cannot be read. */
  list(memberId: string, guildId: string): Promise<WantList>;
  /**
   * Sets a want: a new one, or the scope of the one the member has for this target. The scope
   * is corrected as the codec does (a tier is `raid`, an IV target `spawn`); the outcome says
   * what is stored. `costumed` (plan 8R-4) makes a Pokémon's want costumed only, else plain.
   */
  set(
    memberId: string,
    guildId: string,
    target: NotificationTarget,
    scope: NotificationScope,
    costumed?: boolean,
  ): Promise<SetWantOutcome>;
  /** Removes the want for a target; false when the member had none. */
  remove(memberId: string, guildId: string, target: NotificationTarget): Promise<boolean>;
  /**
   * Removes every row the member has in a server, also those that cannot be read (the member
   * asked for all of them); gives how many rows went.
   */
  removeAll(memberId: string, guildId: string): Promise<number>;
  /**
   * How many wants the member has in a server: each target once, and the rows that cannot be
   * read, which `removeAll` would remove with them.
   */
  count(memberId: string, guildId: string): Promise<number>;
  /**
   * The read by event: the members who have, in this server, a row with one of these numbers
   * (`PokemonNotification.pokemon`: a Pokédex number, the code of a tier or of an IV target),
   * each with the wants those rows mean. A number says who may want what happened, never that
   * they do: ask the matcher about each want. Rows that cannot be read are left out, and so is
   * a row without a member. No numbers ask nothing.
   */
  wanting(guildId: string, numbers: readonly number[]): Promise<MemberWants[]>;
}

/**
 * A row's values as the columns of `PokemonNotification` hold them: the flags as 0 or 1, and
 * `costumed` always said (a plain want written over a costumed row makes it plain).
 */
export function notificationColumns(values: EncodedNotification) {
  return {
    pokemon: values.pokemon,
    type: values.type,
    form: values.form,
    shadow: values.shadow ? 1 : 0,
    costumed: values.costumed === true ? 1 : 0,
  };
}

/**
 * The legacy table `PokemonNotification`: `userId` and `guildId` are row ids of `User` and
 * `Guild`; `pokemon` and `type`, and the columns `form` and `shadow` this bot added, are read
 * and written only through the codec of `notification-target.ts` (here through `wants.ts`,
 * which is built on it). The table has no unique key, and the legacy bot kept one row per
 * member and number across all servers, moving it to the server a want was last typed in; here
 * a want belongs to a member and a server, and is one per target: a species, one form of it
 * and the shadow raids of either are wants of their own. Several rows for one target can exist
 * in legacy data: they are read as one want, and the next `set` of that target leaves one row.
 *
 * `forms` says what the game data makes of a stored form (`formReader`): the key of the entry
 * it stands for today, so that two keys of one entry are one want, and whether it is a mega,
 * whose want is about raids whatever its row says.
 */
export class PokemonNotificationRepository implements WantStorage {
  /** `ids` is the process's memory of `User` and `Guild` rows it has seen (`RowIds`). */
  constructor(
    private readonly db: Kysely<DB>,
    private readonly forms: FormReader,
    private readonly ids: RowIds = RowIds.none,
  ) {}

  /** `withMemberLocked` over this repository's database and its memory of rows. */
  private locked<T>(
    memberId: string,
    guildId: string,
    create: boolean,
    work: (trx: Kysely<DB>, member: MemberInGuild | undefined) => Promise<T>,
  ): Promise<T> {
    return withMemberLocked(this.db, memberId, guildId, create, work, this.ids);
  }

  /**
   * The member's rows of a server. A plain read, also inside `withMemberLocked`: there it is the
   * transaction's first, so it sees everything written before the member's lock was got, and a
   * locking read of rows that are not there would lock the gap other members insert into.
   */
  private async rows(db: Kysely<DB>, member: MemberInGuild): Promise<WantRow[]> {
    const rows = await db
      .selectFrom('PokemonNotification')
      .select(['id', 'pokemon', 'type', 'form', 'shadow', 'costumed'])
      .where('userId', '=', member.userId)
      .where('guildId', '=', member.guildId)
      .orderBy('id')
      .execute();
    // A row without a number means nothing: 0 is what the codec reads as unreadable.
    return rows.map((row) => ({
      id: row.id,
      pokemon: row.pokemon ?? 0,
      type: row.type,
      form: row.form,
      shadow: row.shadow !== 0,
      costumed: row.costumed !== 0,
    }));
  }

  /** The values of a row as the columns hold them. */
  private columns(values: EncodedNotification) {
    return notificationColumns(values);
  }

  async list(memberId: string, guildId: string): Promise<WantList> {
    const member = await findMemberInGuild(this.db, memberId, guildId, this.ids);
    if (!member) return { wants: [], unreadable: 0 };
    return readWants(await this.rows(this.db, member), this.forms);
  }

  async count(memberId: string, guildId: string): Promise<number> {
    const { wants, unreadable } = await this.list(memberId, guildId);
    return wants.length + unreadable;
  }

  /** One query over the index `(pokemon, guildId)`; the members come by their `User` row. */
  async wanting(guildId: string, numbers: readonly number[]): Promise<MemberWants[]> {
    const asked = [...new Set(numbers)].filter((number) => Number.isInteger(number));
    if (asked.length === 0) return [];
    const rows = await this.db
      .selectFrom('PokemonNotification as n')
      .innerJoin('Guild as g', 'g.id', 'n.guildId')
      .innerJoin('User as u', 'u.id', 'n.userId')
      .select([
        'u.userSnowflake as memberId',
        'n.pokemon',
        'n.type',
        'n.form',
        'n.shadow',
        'n.costumed',
      ])
      .where('g.snowflake', '=', guildId)
      .where('n.pokemon', 'in', asked)
      .orderBy('n.id')
      .execute();
    return wantsByMember(
      rows.flatMap((row) =>
        row.memberId === null
          ? []
          : [
              {
                memberId: row.memberId,
                pokemon: row.pokemon ?? 0,
                type: row.type,
                form: row.form,
                shadow: row.shadow !== 0,
                costumed: row.costumed !== 0,
              },
            ],
      ),
      this.forms,
    );
  }

  async set(
    memberId: string,
    guildId: string,
    target: NotificationTarget,
    scope: NotificationScope,
    costumed = false,
  ): Promise<SetWantOutcome> {
    return this.locked(memberId, guildId, true, async (trx, member) => {
      if (!member) throw new Error(`No rows for member ${memberId} in server ${guildId}`);
      const plan = planSetWant(await this.rows(trx, member), target, scope, this.forms, costumed);
      if (plan.insert) {
        await trx
          .insertInto('PokemonNotification')
          .values({
            ...this.columns(plan.insert),
            userId: member.userId,
            guildId: member.guildId,
          })
          .execute();
      }
      if (plan.update) {
        await trx
          .updateTable('PokemonNotification')
          .set(this.columns(plan.update.values))
          .where('id', '=', plan.update.id)
          .execute();
      }
      if (plan.remove.length > 0) {
        await trx.deleteFrom('PokemonNotification').where('id', 'in', plan.remove).execute();
      }
      return plan.outcome;
    });
  }

  async remove(memberId: string, guildId: string, target: NotificationTarget): Promise<boolean> {
    return this.locked(memberId, guildId, false, async (trx, member) => {
      if (!member) return false;
      const ids = rowsOfWant(await this.rows(trx, member), target, this.forms);
      if (ids.length === 0) return false;
      await trx.deleteFrom('PokemonNotification').where('id', 'in', ids).execute();
      return true;
    });
  }

  async removeAll(memberId: string, guildId: string): Promise<number> {
    return this.locked(memberId, guildId, false, async (trx, member) => {
      if (!member) return 0;
      const result = await trx
        .deleteFrom('PokemonNotification')
        .where('userId', '=', member.userId)
        .where('guildId', '=', member.guildId)
        .executeTakeFirst();
      return Number(result.numDeletedRows);
    });
  }
}
