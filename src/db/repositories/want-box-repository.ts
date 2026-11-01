import type { Kysely } from 'kysely';
import {
  parseTargetWantToken,
  targetWantToken,
  withCostume,
  type TargetWant,
} from '../../domain/notify/target-wants.js';
import {
  tierCode,
  type EncodedNotification,
  type NotificationScope,
  type NotificationTarget,
} from '../../domain/pogo/notification-target.js';
import {
  baseTarget,
  shadowTarget,
  targetWantsOf,
  type BoxSubject,
} from '../../domain/pogo/want-boxes.js';
import {
  heldRows,
  planAnswer,
  type AnswerScope,
  type BoxAnswer,
  type HeldRow,
} from '../../domain/pogo/species-answer.js';
import {
  planSetWant,
  readWants,
  rowsOfWant,
  type FormReader,
  type WantRow,
} from '../../domain/pogo/wants.js';
import { raidTier } from '../../domain/pogo/raid-tier.js';
import type { DB } from '../types.js';
import { findMemberInGuild, withMemberLocked, type MemberInGuild } from './member-rows.js';
import { notificationColumns } from './pokemon-notification-repository.js';
import { RowIds } from './row-ids.js';
import { changeTargetWants } from './target-want-repository.js';

/** What a Submit of `/want`'s dialog changed: the rows of its scope before and after. */
export interface BoxChange {
  before: HeldRow[];
  after: HeldRow[];
}

/**
 * The boxes of `/want`'s dialog over the rows they map onto (plan 8R-1; design 9.1): a subject's
 * `PokemonNotification` rows (its own, its shadow one) and its `TargetWant` rows; since plan 8R-4
 * one answer per species (`AnswerScope`: every row of its Pokédex number, in both tables, unless
 * it is no wide scope). Its twin in memory is `MemoryWantBoxes` (`test/support/want-boxes.ts`);
 * both run `wantBoxCases`.
 */
export interface WantBoxStorage {
  /**
   * The rows a member holds of a scope in a server, by form, with their boxes and costume: the
   * dialog's read, by the keys of both tables.
   */
  held(memberId: string, guildId: string, scope: AnswerScope): Promise<HeldRow[]>;
  /**
   * Writes a Submit (`planAnswer`): the boxes and costume to every form ticked, every other row of
   * the scope away, the boxes the dialog did not show as each row had them, in one transaction
   * under the member's lock (`withMemberLocked`). `at` is when, for a `TargetWant` row that is
   * made.
   */
  set(memberId: string, guildId: string, answer: BoxAnswer, at: number): Promise<BoxChange>;
}

/** The numbers of `PokemonNotification.pokemon` a subject's rows may hold. */
function numbersOf(subject: BoxSubject): number[] {
  if (subject.kind === 'pokemon') return [subject.dex];
  return [false, true].flatMap((shadow) => {
    const tier = raidTier(subject.level, shadow);
    const code = tier && tierCode(tier);
    return code === undefined ? [] : [code];
  });
}

/** The `PokemonNotification` and `TargetWant` tables, for the boxes of a subject. */
export class WantBoxRepository implements WantBoxStorage {
  /** `forms` reads a stored form (`formReader`); `ids` the process's memory of rows. */
  constructor(
    private readonly db: Kysely<DB>,
    private readonly forms: FormReader,
    private readonly ids: RowIds = RowIds.none,
  ) {}

  private async rows(
    db: Kysely<DB>,
    member: MemberInGuild,
    subject: BoxSubject,
  ): Promise<WantRow[]> {
    const rows = await db
      .selectFrom('PokemonNotification')
      .select(['id', 'pokemon', 'type', 'form', 'shadow', 'costumed'])
      .where('userId', '=', member.userId)
      .where('guildId', '=', member.guildId)
      .where('pokemon', 'in', numbersOf(subject))
      .orderBy('id')
      .execute();
    return rows.map((row) => ({
      id: row.id,
      pokemon: row.pokemon ?? 0,
      type: row.type,
      form: row.form,
      shadow: row.shadow !== 0,
      costumed: row.costumed !== 0,
    }));
  }

  /**
   * The `TargetWant` rows of a scope: of a wide one every token of the Pokédex number
   * (`<kind>:<dex>` exactly or `<kind>:<dex>:<form>`, so that 25 never reads 251's), else the
   * subject's own.
   */
  private async tokens(db: Kysely<DB>, member: MemberInGuild, scope: AnswerScope) {
    const { subject } = scope;
    const own = targetWantsOf(subject).map(([, want]) => targetWantToken(want));
    if (own.length === 0) return [];
    const rows = await db
      .selectFrom('TargetWant')
      .select(['target', 'costumed'])
      .where('guildId', '=', member.guildId)
      .where('userId', '=', member.userId)
      .where((eb) =>
        scope.wide
          ? eb.or([
              eb('target', 'in', own),
              ...own.map((token) => eb('target', 'like', `${token}:%`)),
            ])
          : eb('target', 'in', own),
      )
      .orderBy('id')
      .execute();
    return rows.flatMap((row) => {
      const want = parseTargetWantToken(row.target);
      return want ? [withCostume(want, row.costumed !== 0)] : [];
    });
  }

  private async heldIn(db: Kysely<DB>, member: MemberInGuild, scope: AnswerScope) {
    const rows = await this.rows(db, member, scope.subject);
    const { wants } = readWants(rows, this.forms);
    return { rows, held: heldRows(scope, wants, await this.tokens(db, member, scope)) };
  }

  async held(memberId: string, guildId: string, scope: AnswerScope): Promise<HeldRow[]> {
    const member = await findMemberInGuild(this.db, memberId, guildId, this.ids);
    if (!member) return [];
    return (await this.heldIn(this.db, member, scope)).held;
  }

  set(memberId: string, guildId: string, answer: BoxAnswer, at: number): Promise<BoxChange> {
    const { scope } = answer;
    const adds =
      !answer.remove &&
      answer.forms.length > 0 &&
      answer.shown.some((box) => answer.ticked.has(box));
    const dex = scope.subject.kind === 'pokemon' ? scope.subject.dex : 0;
    return withMemberLocked(
      this.db,
      memberId,
      guildId,
      adds,
      async (trx, member) => {
        if (!member) return { before: [], after: [] };
        const { rows, held } = await this.heldIn(trx, member, scope);
        const plan = planAnswer(scope, held, answer, (form) => this.forms(dex, form).mega);
        const targets: { add: TargetWant[]; remove: TargetWant[] } = { add: [], remove: [] };
        for (const row of plan.rows) {
          await this.setRow(trx, member, rows, baseTarget(row.subject), row.base, row.costumed);
          const shadow = shadowTarget(row.subject);
          if (shadow) {
            const scopeOf = row.shadow ? 'raid' : null;
            await this.setRow(trx, member, rows, shadow, scopeOf, row.costumed);
          }
          targets.add.push(...row.targets.add);
          targets.remove.push(...row.targets.remove);
        }
        await changeTargetWants(trx, member, targets, at);
        return { before: held, after: plan.after };
      },
      this.ids,
    );
  }

  /** Makes a target's rows say `scope`, or takes them away for null (as `WantStorage` does). */
  private async setRow(
    trx: Kysely<DB>,
    member: MemberInGuild,
    rows: readonly WantRow[],
    target: NotificationTarget,
    scope: NotificationScope | null,
    costumed: boolean,
  ): Promise<void> {
    if (scope === null) {
      const ids = rowsOfWant(rows, target, this.forms);
      if (ids.length > 0)
        await trx.deleteFrom('PokemonNotification').where('id', 'in', ids).execute();
      return;
    }
    const plan = planSetWant(rows, target, scope, this.forms, costumed);
    const columns = (values: EncodedNotification) => notificationColumns(values);
    if (plan.insert) {
      await trx
        .insertInto('PokemonNotification')
        .values({ ...columns(plan.insert), userId: member.userId, guildId: member.guildId })
        .execute();
    }
    if (plan.update) {
      await trx
        .updateTable('PokemonNotification')
        .set(columns(plan.update.values))
        .where('id', '=', plan.update.id)
        .execute();
    }
    if (plan.remove.length > 0) {
      await trx.deleteFrom('PokemonNotification').where('id', 'in', plan.remove).execute();
    }
  }
}
