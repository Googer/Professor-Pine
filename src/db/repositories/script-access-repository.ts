import type { Kysely, Selectable } from 'kysely';
import {
  decidedState,
  decisionFits,
  FETCH_RECORD_MS,
  REASK_MS,
  SCRIPT_ACCESS_STATES,
  type AccessRequest,
  type AskOutcome,
  type DecideOutcome,
  type DecisionTaken,
  type ScriptAccess,
  type ScriptAccessState,
  type ScriptAccessStore,
} from '../../domain/script-access/access.js';
import { isDuplicateEntry } from '../errors.js';
import type { DB, ScriptAccess as ScriptAccessRow } from '../types.js';

const isState = (value: string): value is ScriptAccessState =>
  (SCRIPT_ACCESS_STATES as readonly string[]).includes(value);

const time = (value: string | null): number | null => (value === null ? null : Number(value));

/** A row as the domain has it; a state the code does not know reads as `revoked` (no access). */
function accessOf(row: Selectable<ScriptAccessRow>): ScriptAccess {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    community: row.community,
    state: isState(row.state) ? row.state : 'revoked',
    key: row.key,
    askedAt: Number(row.askedAt),
    decidedAt: time(row.decidedAt),
    lastFetchAt: time(row.lastFetchAt),
    lastVersion: row.lastVersion,
  };
}

/** An error with every copy of `key` taken out (its statement, its texts, its causes'). */
function keyless(err: unknown, key: string): unknown {
  if (typeof err !== 'object' || err === null) return err;
  const fields = err as Record<string, unknown>;
  delete fields.sql;
  for (const name of ['message', 'sqlMessage', 'stack']) {
    const text = fields[name];
    if (typeof text === 'string') fields[name] = text.split(key).join('[key]');
  }
  if (err instanceof Error && err.cause !== undefined) keyless(err.cause, key);
  return err;
}

/**
 * Runs a query that carries a key, keeping the key out of an error it throws: mysql2 copies the
 * statement onto the error as `sql`, its values written in, and a duplicate's message names the
 * value. The logger hides `sql` too (`src/log.ts`); this also covers whoever reads the error.
 */
async function withKey<T>(key: string | null, work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (err) {
    throw key === null ? err : keyless(err, key);
  }
}

/**
 * Who may have the Wayfarer export tool, in the table `ScriptAccess` (migration 024). Every
 * change is one statement conditioned on the row as the caller saw it, so that two decisions
 * at once (the owner's DM and page) take effect once. Its twin in memory is
 * `MemoryScriptAccess`; both run `scriptAccessCases` (`test/support/script-access-cases.ts`).
 */
export class ScriptAccessRepository implements ScriptAccessStore {
  constructor(private readonly db: Kysely<DB>) {}

  private async one(
    where: { id: number } | { userId: string } | { key: string },
  ): Promise<ScriptAccess | undefined> {
    let query = this.db.selectFrom('ScriptAccess').selectAll();
    if ('id' in where) query = query.where('id', '=', where.id);
    else if ('userId' in where) query = query.where('userId', '=', where.userId);
    else query = query.where('key', '=', where.key);
    const row = await query.executeTakeFirst();
    return row && accessOf(row);
  }

  byId(id: number) {
    return this.one({ id });
  }

  byUser(userId: string) {
    return this.one({ userId });
  }

  byKey(key: string) {
    return withKey(key, () => this.one({ key }));
  }

  async ask(request: AccessRequest): Promise<AskOutcome> {
    const row = await this.byUser(request.userId);
    if (!row) {
      try {
        await this.db
          .insertInto('ScriptAccess')
          .values({
            userId: request.userId,
            name: request.name,
            community: request.community,
            state: 'asked',
            key: null,
            askedAt: String(request.at),
          })
          .execute();
      } catch (err) {
        // The same member asked at the same moment: the other request made the row.
        if (!isDuplicateEntry(err, 'scriptaccess_userid_unique')) throw err;
        return { kind: 'standing', access: await this.must(request.userId) };
      }
      return { kind: 'asked', access: await this.must(request.userId) };
    }
    if (row.state !== 'refused' || row.decidedAt === null) return { kind: 'standing', access: row };
    const [result] = await this.db
      .updateTable('ScriptAccess')
      .set({
        name: request.name,
        community: request.community,
        state: 'asked',
        key: null,
        askedAt: String(request.at),
        decidedAt: null,
      })
      .where('id', '=', row.id)
      .where('state', '=', 'refused')
      .where('decidedAt', '<=', String(request.at - REASK_MS))
      .execute();
    const renewed = Number(result?.numUpdatedRows ?? 0) > 0;
    return { kind: renewed ? 'asked' : 'standing', access: await this.must(request.userId) };
  }

  /** The row of a member that is known to be there. */
  private async must(userId: string): Promise<ScriptAccess> {
    const row = await this.byUser(userId);
    if (!row) throw new Error(`the script access of ${userId} is gone`);
    return row;
  }

  decide(id: number, taken: DecisionTaken): Promise<DecideOutcome> {
    return withKey(taken.key, () => this.decideNow(id, taken));
  }

  private async decideNow(id: number, taken: DecisionTaken): Promise<DecideOutcome> {
    if (decisionFits(taken.decision, taken.from)) {
      const [result] = await this.db
        .updateTable('ScriptAccess')
        .set({
          state: decidedState(taken.decision),
          key: taken.decision === 'approve' ? taken.key : null,
          decidedAt: String(taken.at),
        })
        .where('id', '=', id)
        .where('state', '=', taken.from)
        .$if(taken.askedAt !== undefined, (query) =>
          query.where('askedAt', '=', String(taken.askedAt)),
        )
        .execute();
      if (Number(result?.numUpdatedRows ?? 0) > 0) {
        const access = await this.byId(id);
        if (access) return { kind: 'decided', access };
      }
    }
    const access = await this.byId(id);
    return access ? { kind: 'changed', access } : { kind: 'gone' };
  }

  newKey(userId: string, key: string): Promise<ScriptAccess | undefined> {
    return withKey(key, () => this.newKeyNow(userId, key));
  }

  private async newKeyNow(userId: string, key: string): Promise<ScriptAccess | undefined> {
    const [result] = await this.db
      .updateTable('ScriptAccess')
      .set({ key })
      .where('userId', '=', userId)
      .where('state', '=', 'approved')
      .execute();
    return Number(result?.numUpdatedRows ?? 0) > 0 ? this.byUser(userId) : undefined;
  }

  ownerLink(
    owner: { userId: string; name: string },
    key: string,
    at: number,
  ): Promise<ScriptAccess> {
    return withKey(key, () => this.ownerLinkNow(owner, key, at));
  }

  private async ownerLinkNow(
    owner: { userId: string; name: string },
    key: string,
    at: number,
  ): Promise<ScriptAccess> {
    const row = await this.byUser(owner.userId);
    if (row?.state === 'approved') return row;
    if (row) {
      await this.db
        .updateTable('ScriptAccess')
        .set({ state: 'approved', key, decidedAt: String(at) })
        .where('id', '=', row.id)
        .where('state', '<>', 'approved')
        .execute();
      return this.must(owner.userId);
    }
    try {
      await this.db
        .insertInto('ScriptAccess')
        .values({
          userId: owner.userId,
          name: owner.name,
          community: '',
          state: 'approved',
          key,
          askedAt: String(at),
          decidedAt: String(at),
        })
        .execute();
    } catch (err) {
      // Two presses of "Make my link" at once: the other one made the row.
      if (!isDuplicateEntry(err, 'scriptaccess_userid_unique')) throw err;
    }
    return this.must(owner.userId);
  }

  async recordFetch(id: number, version: string, at: number): Promise<boolean> {
    const [result] = await this.db
      .updateTable('ScriptAccess')
      .set({ lastFetchAt: String(at), lastVersion: version })
      .where('id', '=', id)
      .where('state', '=', 'approved')
      .where((eb) =>
        eb.or([
          eb('lastFetchAt', 'is', null),
          eb('lastFetchAt', '<=', String(at - FETCH_RECORD_MS)),
          eb('lastVersion', 'is', null),
          eb('lastVersion', '<>', version),
        ]),
      )
      .execute();
    return Number(result?.numUpdatedRows ?? 0) > 0;
  }

  async all(): Promise<ScriptAccess[]> {
    const rows = await this.db
      .selectFrom('ScriptAccess')
      .selectAll()
      .orderBy('askedAt', 'desc')
      .orderBy('id', 'desc')
      .execute();
    return rows.map(accessOf);
  }

  async openCount(): Promise<number> {
    const row = await this.db
      .selectFrom('ScriptAccess')
      .select((eb) => eb.fn.countAll<number>().as('n'))
      .where('state', '=', 'asked')
      .executeTakeFirst();
    return Number(row?.n ?? 0);
  }

  /**
   * Deletes the member's row (plan 8G, `/admin forget`): their name, their community, the state
   * of their request and their key, which stops working with it. True when there was one. One
   * statement, in the caller's transaction when `db` is one.
   */
  async forget(userId: string): Promise<boolean> {
    const gone = await this.db
      .deleteFrom('ScriptAccess')
      .where('userId', '=', userId)
      .executeTakeFirst();
    return gone.numDeletedRows > 0n;
  }
}
