import { sql, type Kysely, type Selectable } from 'kysely';
import { approvalFailureOf, REQUEST_DECISIONS } from '../../domain/meetups/records.js';
import type {
  ApprovalOutcome,
  AppealStatus,
  AskStatus,
  Decider,
  MeetupAppeal,
  MeetupBlock,
  MeetupRequestRecord,
  MeetupSafetyStore,
  NewMeetupAppeal,
  NewMeetupRequest,
  NewPlaceAsk,
  PlaceAskRecord,
  PlaceRulingRecord,
  RequestDecision,
  RequestStatus,
  RulingMore,
  RulingSource,
} from '../../domain/meetups/records.js';
import type { PlaceRuling, RulingKey } from '../../domain/meetups/safety.js';
import { placeDocument } from '../../domain/party/party-state.js';
import { TEAMS, type Team } from '../../domain/party/party.js';
import type { Logger } from '../../log.js';
import { inTransaction, retryOnDeadlock } from '../transaction.js';
import type {
  DB,
  MeetupAppeal as AppealRow,
  MeetupPlaceAsk as AskRow,
  MeetupPlaceRuling as RulingRow,
  MeetupRequest as RequestRow,
} from '../types.js';
import { isDuplicateEntry } from '../errors.js';

const STATUSES: readonly RequestStatus[] = [
  'pending',
  'approved',
  'refused',
  'expired',
  'failed',
  'withdrawn',
];
const APPEAL_STATUSES: readonly AppealStatus[] = ['open', 'lifted', 'kept', 'expired'];

/** The kept reason of a failed request (`MeetupRequest.failure`), or null. */
function failureOf(stored: unknown): MeetupRequestRecord['failure'] {
  if (typeof stored !== 'string') return approvalFailureOf(stored);
  try {
    return approvalFailureOf(JSON.parse(stored));
  } catch {
    return null;
  }
}

const epoch = (value: string | null): number | null => (value === null ? null : Number(value));

/**
 * What meetup safety keeps (plan 8S-1), in the tables of migration 019: `MeetupRequest`,
 * `MeetupPlaceRuling`, `MeetupBlock`, `MeetupAppeal`. Its twin in memory is
 * `MemoryMeetupSafety`; both run `meetupSafetyCases` (`test/support/meetup-safety-cases.ts`).
 * A request whose row cannot be read (its place is no place) is logged and left alone, as if it
 * were not there.
 */
export class MeetupSafetyRepository implements MeetupSafetyStore {
  constructor(
    private readonly db: Kysely<DB>,
    private readonly log?: Logger,
  ) {}

  async ruling(serverId: string, key: RulingKey): Promise<PlaceRuling | undefined> {
    const row = await this.db
      .selectFrom('MeetupPlaceRuling')
      .select('ruling')
      .where('serverId', '=', serverId)
      .where('placeKind', '=', key.kind)
      .where('placeId', '=', key.id)
      .executeTakeFirst();
    return row?.ruling === 'allow' || row?.ruling === 'refuse' ? row.ruling : undefined;
  }

  async rulingRecord(serverId: string, key: RulingKey): Promise<PlaceRulingRecord | undefined> {
    const row = await this.db
      .selectFrom('MeetupPlaceRuling')
      .selectAll()
      .where('serverId', '=', serverId)
      .where('placeKind', '=', key.kind)
      .where('placeId', '=', key.id)
      .executeTakeFirst();
    return row && readRuling(row);
  }

  rule(
    serverId: string,
    key: RulingKey,
    ruling: PlaceRuling,
    by: Decider,
    more: RulingMore = {},
  ): Promise<void> {
    return ruleIn(this.db, serverId, key, ruling, by, more);
  }

  undoRuling(
    serverId: string,
    key: RulingKey,
  ): Promise<{ ruling: PlaceRulingRecord; ask: PlaceAskRecord | undefined } | undefined> {
    return inTransaction(this.db, async (trx) => {
      const row = await trx
        .selectFrom('MeetupPlaceRuling')
        .selectAll()
        .where('serverId', '=', serverId)
        .where('placeKind', '=', key.kind)
        .where('placeId', '=', key.id)
        .forUpdate()
        .executeTakeFirst();
      if (!row) return undefined;
      await trx
        .deleteFrom('MeetupPlaceRuling')
        .where('serverId', '=', serverId)
        .where('placeKind', '=', key.kind)
        .where('placeId', '=', key.id)
        .execute();
      const ruling = readRuling(row);
      if (!ruling) return undefined;
      // Nothing is left to ask about: the place's open ask is closed with the ruling.
      const open = await trx
        .selectFrom('MeetupPlaceAsk')
        .select('id')
        .where('openKey', '=', askKey(serverId, key))
        .executeTakeFirst();
      if (open) await decideAskIn(trx, open.id, 'undone', null);
      const asked = open
        ? await trx
            .selectFrom('MeetupPlaceAsk')
            .selectAll()
            .where('id', '=', open.id)
            .executeTakeFirst()
        : undefined;
      return { ruling, ask: asked && this.readAsk(asked) };
    });
  }

  async addAsk(ask: NewPlaceAsk): Promise<'added' | 'open'> {
    try {
      await this.db
        .insertInto('MeetupPlaceAsk')
        .values({
          id: ask.id,
          serverId: ask.serverId,
          placeKind: ask.key.kind,
          placeId: ask.key.id,
          place: JSON.stringify(ask.place),
          memberId: ask.memberId,
          memberName: ask.memberName,
          text: ask.text,
          createdAt: String(ask.createdAt),
          status: 'open',
          openKey: askKey(ask.serverId, ask.key),
        })
        .execute();
      return 'added';
    } catch (err) {
      if (isDuplicateEntry(err, 'meetupplaceask_openkey_unique')) return 'open';
      throw err;
    }
  }

  async discardAsk(id: string): Promise<void> {
    await this.db.deleteFrom('MeetupPlaceAsk').where('id', '=', id).execute();
  }

  async setAskPost(id: string, channelId: string, messageId: string): Promise<void> {
    await this.db
      .updateTable('MeetupPlaceAsk')
      .set({ channelId, messageId })
      .where('id', '=', id)
      .execute();
  }

  async ask(id: string): Promise<PlaceAskRecord | undefined> {
    const row = await this.db
      .selectFrom('MeetupPlaceAsk')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    return row && this.readAsk(row);
  }

  async openAsk(serverId: string, key: RulingKey): Promise<PlaceAskRecord | undefined> {
    const row = await this.db
      .selectFrom('MeetupPlaceAsk')
      .selectAll()
      .where('openKey', '=', askKey(serverId, key))
      .executeTakeFirst();
    return row && this.readAsk(row);
  }

  expireAsk(id: string): Promise<boolean> {
    return decideAskIn(this.db, id, 'expired', null);
  }

  allowOnAsk(ask: PlaceAskRecord, by: Decider): Promise<boolean> {
    return inTransaction(this.db, async (trx) => {
      // The ruling first, locked, as Undo ruling and Keep refused lock it: else an Undo ruling
      // at the same moment, which locks the ruling and then the ask, deadlocks with this.
      await trx
        .selectFrom('MeetupPlaceRuling')
        .select('ruling')
        .where('serverId', '=', ask.serverId)
        .where('placeKind', '=', ask.key.kind)
        .where('placeId', '=', ask.key.id)
        .forUpdate()
        .execute();
      if (!(await decideAskIn(trx, ask.id, 'allowed', by))) return false;
      const posted = await trx
        .selectFrom('MeetupPlaceAsk')
        .select(['channelId', 'messageId'])
        .where('id', '=', ask.id)
        .executeTakeFirst();
      const source =
        posted?.channelId && posted.messageId
          ? {
              kind: 'ask' as const,
              id: ask.id,
              channelId: posted.channelId,
              messageId: posted.messageId,
            }
          : undefined;
      await ruleIn(trx, ask.serverId, ask.key, 'allow', by, {
        place: ask.place,
        ...(source === undefined ? {} : { source }),
      });
      return true;
    });
  }

  keepOnAsk(ask: PlaceAskRecord, by: Decider): Promise<'kept' | 'not-open' | 'not-refused'> {
    return inTransaction(this.db, async (trx) => {
      // The ruling first, locked: an Undo ruling or an allowance at the same moment waits.
      const ruling = await trx
        .selectFrom('MeetupPlaceRuling')
        .select('ruling')
        .where('serverId', '=', ask.serverId)
        .where('placeKind', '=', ask.key.kind)
        .where('placeId', '=', ask.key.id)
        .forUpdate()
        .executeTakeFirst();
      const open = await trx
        .selectFrom('MeetupPlaceAsk')
        .select('status')
        .where('id', '=', ask.id)
        .executeTakeFirst();
      if (open?.status !== 'open') return 'not-open';
      if (ruling?.ruling !== 'refuse') return 'not-refused';
      if (!(await decideAskIn(trx, ask.id, 'kept', by))) return 'not-open';
      await trx
        .updateTable('MeetupPlaceRuling')
        .set({ keptAt: String(by.at) })
        .where('serverId', '=', ask.serverId)
        .where('placeKind', '=', ask.key.kind)
        .where('placeId', '=', ask.key.id)
        .execute();
      return 'kept';
    });
  }

  async staleAsks(stale: {
    unpostedBefore: number;
    openedBefore: number;
  }): Promise<PlaceAskRecord[]> {
    const rows = await this.db
      .selectFrom('MeetupPlaceAsk')
      .selectAll()
      .where('status', '=', 'open')
      .where((eb) =>
        eb.or([
          eb.and([
            eb('messageId', 'is', null),
            eb('createdAt', '<=', String(stale.unpostedBefore)),
          ]),
          eb('createdAt', '<=', String(stale.openedBefore)),
        ]),
      )
      .orderBy('createdAt')
      .orderBy('id')
      .execute();
    return rows.flatMap((row) => {
      const ask = this.readAsk(row);
      return ask ? [ask] : [];
    });
  }

  async rulings(serverId: string): Promise<PlaceRulingRecord[]> {
    const rows = await this.db
      .selectFrom('MeetupPlaceRuling')
      .selectAll()
      .where('serverId', '=', serverId)
      .orderBy('ruledAt')
      .orderBy('placeId')
      .execute();
    return rows.flatMap((row) => {
      const ruling = readRuling(row);
      return ruling ? [ruling] : [];
    });
  }

  async pendingIn(serverId: string): Promise<MeetupRequestRecord[]> {
    const rows = await this.db
      .selectFrom('MeetupRequest')
      .selectAll()
      .where('serverId', '=', serverId)
      .where('status', '=', 'pending')
      .orderBy('createdAt')
      .orderBy('id')
      .execute();
    return this.readRequests(rows);
  }

  async openAsks(serverId: string): Promise<PlaceAskRecord[]> {
    const rows = await this.db
      .selectFrom('MeetupPlaceAsk')
      .selectAll()
      .where('serverId', '=', serverId)
      .where('status', '=', 'open')
      .orderBy('createdAt')
      .orderBy('id')
      .execute();
    return rows.flatMap((row) => {
      const ask = this.readAsk(row);
      return ask ? [ask] : [];
    });
  }

  async blocks(serverId: string): Promise<MeetupBlock[]> {
    const rows = await this.db
      .selectFrom('MeetupBlock')
      .select(['serverId', 'memberId', 'memberName', 'blockedBy', 'blockedByName', 'blockedAt'])
      .where('serverId', '=', serverId)
      .where('liftedAt', 'is', null)
      .orderBy('blockedAt')
      .orderBy('memberId')
      .execute();
    return rows.map((row) => ({ ...row, blockedAt: Number(row.blockedAt) }));
  }

  async openAppeals(serverId: string): Promise<MeetupAppeal[]> {
    const rows = await this.db
      .selectFrom('MeetupAppeal')
      .selectAll()
      .where('serverId', '=', serverId)
      .where('status', '=', 'open')
      .orderBy('createdAt')
      .orderBy('id')
      .execute();
    return rows.map(readAppeal);
  }

  /** An ask as it was stored; undefined (logged) for one whose place does not read. */
  private readAsk(row: Selectable<AskRow>): PlaceAskRecord | undefined {
    const place = placeDocument.safeParse(
      typeof row.place === 'string' ? JSON.parse(row.place) : row.place,
    );
    const kind = PLACE_KINDS.find((one) => one === row.placeKind);
    if (!place.success || place.data.kind === 'pin' || kind === undefined) {
      this.log?.error({ ask: row.id }, 'an ask about a place cannot be read; it is left alone');
      return undefined;
    }
    return {
      id: row.id,
      serverId: row.serverId,
      key: { kind, id: row.placeId },
      place: place.data,
      memberId: row.memberId,
      memberName: row.memberName,
      text: row.text,
      createdAt: Number(row.createdAt),
      // A status the code does not know is read as decided: it is never offered again.
      status: ASK_STATUSES.find((one) => one === row.status) ?? 'kept',
      channelId: row.channelId,
      messageId: row.messageId,
      decidedBy: row.decidedBy,
      decidedByName: row.decidedByName,
      decidedAt: epoch(row.decidedAt),
    };
  }

  async block(serverId: string, memberId: string): Promise<MeetupBlock | undefined> {
    const row = await this.db
      .selectFrom('MeetupBlock')
      .select(['serverId', 'memberId', 'memberName', 'blockedBy', 'blockedByName', 'blockedAt'])
      .where('serverId', '=', serverId)
      .where('memberId', '=', memberId)
      .where('liftedAt', 'is', null)
      .executeTakeFirst();
    return row && { ...row, blockedAt: Number(row.blockedAt) };
  }

  addBlock(
    serverId: string,
    memberId: string,
    by: Decider,
    memberName?: string | null,
  ): Promise<boolean> {
    // Tried again on a deadlock (see `blockIn`): its two statements are each their own.
    return retryOnDeadlock(this.db, () =>
      blockIn(this.db, serverId, memberId, by, memberName ?? null),
    );
  }

  blockMaker(
    request: Pick<MeetupRequestRecord, 'id' | 'serverId' | 'makerName'> & { makerId: string },
    by: Decider,
  ): Promise<{ decided: boolean; newBlock: boolean }> {
    // Read committed: the block's row may not be there yet, and gap locks on it would deadlock
    // two blocks of one maker over two requests. So never inside a caller's transaction. Tried
    // again, all of it, on a deadlock (see `blockIn`): a request decided meanwhile is left alone.
    return retryOnDeadlock(this.db, () =>
      inTransaction(
        this.db,
        async (trx) => {
          const [result] = await trx
            .updateTable('MeetupRequest')
            .set({
              status: 'refused',
              decision: 'block',
              decidedBy: by.id,
              decidedByName: by.name,
              decidedAt: String(by.at),
            })
            .where('id', '=', request.id)
            .where('status', '=', 'pending')
            .execute();
          if (Number(result?.numUpdatedRows ?? 0) === 0) return { decided: false, newBlock: false };
          return {
            decided: true,
            newBlock: await blockIn(trx, request.serverId, request.makerId, by, request.makerName),
          };
        },
        { isolation: 'read committed' },
      ),
    );
  }

  liftOnAppeal(
    appeal: Pick<MeetupAppeal, 'id' | 'serverId'> & { memberId: string },
    by: Decider,
  ): Promise<boolean> {
    return inTransaction(this.db, async (trx) => {
      const [decided] = await trx
        .updateTable('MeetupAppeal')
        .set({
          status: 'lifted',
          openKey: null,
          decidedBy: by.id,
          decidedByName: by.name,
          decidedAt: String(by.at),
        })
        .where('id', '=', appeal.id)
        .where('status', '=', 'open')
        .execute();
      if (Number(decided?.numUpdatedRows ?? 0) === 0) return false;
      await liftIn(trx, appeal.serverId, appeal.memberId, by);
      return true;
    });
  }

  liftBlock(serverId: string, memberId: string, by: Decider): Promise<boolean> {
    return liftIn(this.db, serverId, memberId, by);
  }

  liftWithAppeal(
    serverId: string,
    memberId: string,
    by: Decider,
  ): Promise<{ lifted: boolean; appeal: MeetupAppeal | undefined }> {
    return inTransaction(this.db, async (trx) => {
      // The appeal locked before the block, in liftOnAppeal's order: the other way round, a lift
      // from here and one on the appeal's post at the same moment would deadlock.
      // Found by its key, locked by its id (a lock on the key's index as well could deadlock with
      // a decision, which changes the key), and still open once locked: an appeal a moderator
      // decided meanwhile is left as decided.
      const found = await trx
        .selectFrom('MeetupAppeal')
        .select('id')
        .where('openKey', '=', `${serverId} ${memberId}`)
        .executeTakeFirst();
      const open =
        found &&
        (await trx
          .selectFrom('MeetupAppeal')
          .selectAll()
          .where('id', '=', found.id)
          .where('status', '=', 'open')
          .forUpdate()
          .executeTakeFirst());
      if (!(await liftIn(trx, serverId, memberId, by))) return { lifted: false, appeal: undefined };
      if (!open) return { lifted: true, appeal: undefined };
      await trx
        .updateTable('MeetupAppeal')
        .set({
          status: 'lifted',
          openKey: null,
          decidedBy: by.id,
          decidedByName: by.name,
          decidedAt: String(by.at),
        })
        .where('id', '=', open.id)
        .where('status', '=', 'open')
        .execute();
      return {
        lifted: true,
        appeal: {
          ...readAppeal(open),
          status: 'lifted',
          decidedBy: by.id,
          decidedByName: by.name,
          decidedAt: by.at,
        },
      };
    });
  }

  async addRequest(request: NewMeetupRequest): Promise<void> {
    await this.db
      .insertInto('MeetupRequest')
      .values({
        id: request.id,
        serverId: request.serverId,
        regionChannelId: request.regionChannelId,
        makerId: request.makerId,
        makerName: request.makerName,
        makerTeam: request.makerTeam,
        place: JSON.stringify(request.place),
        name: request.name,
        startTime: String(request.startTime),
        endTime: request.endTime === null ? null : String(request.endTime),
        description: request.description,
        createdAt: String(request.createdAt),
        expiresAt: String(request.expiresAt),
        status: 'pending',
        channelId: request.channelId,
        messageId: request.messageId,
        source: request.source,
      })
      .execute();
  }

  async request(id: string): Promise<MeetupRequestRecord | undefined> {
    const row = await this.db
      .selectFrom('MeetupRequest')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    return row && this.readRequest(row);
  }

  async decideRequest(
    id: string,
    status: Exclude<RequestStatus, 'pending' | 'failed'>,
    decision: RequestDecision | null,
    by: Decider | null,
  ): Promise<boolean> {
    const [result] = await this.db
      .updateTable('MeetupRequest')
      .set({
        status,
        decision,
        decidedBy: by?.id ?? null,
        decidedByName: by?.name ?? null,
        decidedAt: by === null ? null : String(by.at),
      })
      .where('id', '=', id)
      .where('status', '=', 'pending')
      .execute();
    return Number(result?.numUpdatedRows ?? 0) > 0;
  }

  async settleApproval(id: string, outcome: ApprovalOutcome): Promise<boolean> {
    const [result] = await this.db
      .updateTable('MeetupRequest')
      .set(
        typeof outcome === 'string'
          ? { status: outcome }
          : 'failed' in outcome
            ? { status: 'failed', failure: JSON.stringify(outcome.failed) }
            : { partyId: outcome.partyId },
      )
      .where('id', '=', id)
      .where('status', '=', 'approved')
      .where('partyId', 'is', null)
      .execute();
    return Number(result?.numUpdatedRows ?? 0) > 0;
  }

  async strandedApprovals(decidedBefore: number): Promise<MeetupRequestRecord[]> {
    const rows = await this.db
      .selectFrom('MeetupRequest')
      .selectAll()
      .where('status', '=', 'approved')
      .where('partyId', 'is', null)
      .where('decidedAt', '<=', String(decidedBefore))
      .orderBy('createdAt')
      .orderBy('id')
      .execute();
    return this.readRequests(rows);
  }

  async pendingOf(serverId: string, makerId: string): Promise<MeetupRequestRecord[]> {
    const rows = await this.db
      .selectFrom('MeetupRequest')
      .selectAll()
      .where('serverId', '=', serverId)
      .where('makerId', '=', makerId)
      .where('status', '=', 'pending')
      .orderBy('createdAt')
      .orderBy('id')
      .execute();
    return this.readRequests(rows);
  }

  async approvedRequestOf(
    serverId: string,
    makerId: string,
    partyId: string,
  ): Promise<MeetupRequestRecord | undefined> {
    const row = await this.db
      .selectFrom('MeetupRequest')
      .selectAll()
      .where('serverId', '=', serverId)
      .where('makerId', '=', makerId)
      .where('status', '=', 'approved')
      .where('partyId', '=', partyId)
      .executeTakeFirst();
    return row && this.readRequest(row);
  }

  async duePending(now: number): Promise<MeetupRequestRecord[]> {
    const rows = await this.db
      .selectFrom('MeetupRequest')
      .selectAll()
      .where('status', '=', 'pending')
      .where('expiresAt', '<=', String(now))
      .orderBy('createdAt')
      .orderBy('id')
      .execute();
    const due: MeetupRequestRecord[] = [];
    for (const row of rows) {
      const request = this.readRequest(row, false);
      if (request) {
        due.push(request);
        continue;
      }
      // Never expired otherwise: failed once, so that it is said once and not at every tick.
      const [result] = await this.db
        .updateTable('MeetupRequest')
        .set({ status: 'failed' })
        .where('id', '=', row.id)
        .where('status', '=', 'pending')
        .execute();
      if (Number(result?.numUpdatedRows ?? 0) > 0) {
        this.log?.error({ request: row.id }, 'a due meetup request cannot be read; it is failed');
      }
    }
    return due;
  }

  async addAppeal(appeal: NewMeetupAppeal): Promise<'added' | 'open'> {
    try {
      await this.db
        .insertInto('MeetupAppeal')
        .values({
          id: appeal.id,
          serverId: appeal.serverId,
          memberId: appeal.memberId,
          memberName: appeal.memberName,
          text: appeal.text,
          createdAt: String(appeal.createdAt),
          status: 'open',
          openKey: `${appeal.serverId} ${appeal.memberId}`,
        })
        .execute();
      return 'added';
    } catch (err) {
      if (isDuplicateEntry(err, 'meetupappeal_openkey_unique')) return 'open';
      throw err;
    }
  }

  async discardAppeal(id: string): Promise<void> {
    await this.db.deleteFrom('MeetupAppeal').where('id', '=', id).execute();
  }

  async setAppealPost(id: string, channelId: string, messageId: string): Promise<void> {
    await this.db
      .updateTable('MeetupAppeal')
      .set({ channelId, messageId })
      .where('id', '=', id)
      .execute();
  }

  async appeal(id: string): Promise<MeetupAppeal | undefined> {
    const row = await this.db
      .selectFrom('MeetupAppeal')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    return row && readAppeal(row);
  }

  async openAppeal(serverId: string, memberId: string): Promise<MeetupAppeal | undefined> {
    const row = await this.db
      .selectFrom('MeetupAppeal')
      .selectAll()
      .where('openKey', '=', `${serverId} ${memberId}`)
      .executeTakeFirst();
    return row && readAppeal(row);
  }

  async lastKept(serverId: string, memberId: string): Promise<number | undefined> {
    const row = await this.db
      .selectFrom('MeetupAppeal')
      .select((eb) => eb.fn.max('decidedAt').as('last'))
      .where('serverId', '=', serverId)
      .where('memberId', '=', memberId)
      .where('status', '=', 'kept')
      .executeTakeFirst();
    return row?.last === null || row?.last === undefined ? undefined : Number(row.last);
  }

  async decideAppeal(
    id: string,
    status: Exclude<AppealStatus, 'open'>,
    by: Decider | null,
  ): Promise<boolean> {
    const [result] = await this.db
      .updateTable('MeetupAppeal')
      .set({
        status,
        openKey: null,
        decidedBy: by?.id ?? null,
        decidedByName: by?.name ?? null,
        decidedAt: by === null ? null : String(by.at),
      })
      .where('id', '=', id)
      .where('status', '=', 'open')
      .execute();
    return Number(result?.numUpdatedRows ?? 0) > 0;
  }

  async staleAppeals(stale: {
    unpostedBefore: number;
    openedBefore: number;
  }): Promise<MeetupAppeal[]> {
    const rows = await this.db
      .selectFrom('MeetupAppeal')
      .selectAll()
      .where('status', '=', 'open')
      .where((eb) =>
        eb.or([
          eb.and([
            eb('messageId', 'is', null),
            eb('createdAt', '<=', String(stale.unpostedBefore)),
          ]),
          eb('createdAt', '<=', String(stale.openedBefore)),
        ]),
      )
      .orderBy('createdAt')
      .orderBy('id')
      .execute();
    return rows.map(readAppeal);
  }

  private readRequests(rows: Selectable<RequestRow>[]): MeetupRequestRecord[] {
    return rows.flatMap((row) => {
      const request = this.readRequest(row);
      return request ? [request] : [];
    });
  }

  /** A request as it was stored; undefined (logged, unless `say` is false) for one that does not read. */
  private readRequest(row: Selectable<RequestRow>, say = true): MeetupRequestRecord | undefined {
    const place = placeDocument.safeParse(
      typeof row.place === 'string' ? JSON.parse(row.place) : row.place,
    );
    const status = STATUSES.find((one) => one === row.status);
    const decision =
      row.decision === null ? null : REQUEST_DECISIONS.find((one) => one === row.decision);
    if (!place.success || status === undefined || decision === undefined) {
      if (say) {
        this.log?.error({ request: row.id }, 'a meetup request cannot be read; it is left alone');
      }
      return undefined;
    }
    return {
      id: row.id,
      serverId: row.serverId,
      regionChannelId: row.regionChannelId,
      makerId: row.makerId,
      makerName: row.makerName,
      makerTeam: teamOf(row.makerTeam),
      place: place.data,
      name: row.name,
      startTime: Number(row.startTime),
      endTime: epoch(row.endTime),
      description: row.description,
      createdAt: Number(row.createdAt),
      expiresAt: Number(row.expiresAt),
      status,
      channelId: row.channelId,
      messageId: row.messageId,
      decision,
      decidedBy: row.decidedBy,
      decidedByName: row.decidedByName,
      decidedAt: epoch(row.decidedAt),
      partyId: row.partyId,
      // Anything but the one source known is `/meetup`'s.
      source: row.source === 'map' ? 'map' : null,
      // A reason that does not read is none: the post says what it said before reasons.
      failure: row.status === 'failed' ? failureOf(row.failure) : null,
    };
  }

  /**
   * What meetup safety holds of a member in every server (plan 8G: the look of `/admin forget`):
   * their blocks, lifted or not, and their own requests, appeals and asks about places that
   * carry their id, those still open and those decided and over (`REQUEST_OVER`, `APPEAL_OVER`,
   * `ASK_OVER`). The tables are read whole: their indexes begin with the server, they are small,
   * and only the owner asks.
   */
  async heldOf(memberId: string): Promise<MeetupRecordsHeld> {
    const counted = await sql<Record<'blocks' | 'records' | 'closed', number | string>>`
      select
        (select count(*) from MeetupBlock where memberId = ${memberId}) as blocks,
        count(*) as records,
        coalesce(sum(r.isOver), 0) as closed
      from (
        select ${REQUEST_OVER} as isOver from MeetupRequest where makerId = ${memberId}
        union all
        select ${APPEAL_OVER} from MeetupAppeal where memberId = ${memberId}
        union all
        select ${ASK_OVER} from MeetupPlaceAsk where memberId = ${memberId}) r`.execute(this.db);
    const row = counted.rows[0];
    const over = Number(row?.closed ?? 0);
    return {
      blocks: Number(row?.blocks ?? 0),
      open: Number(row?.records ?? 0) - over,
      over,
    };
  }

  /**
   * Takes a member's id and name (and a request's team) off their own requests, appeals and asks
   * about places that are decided and over, in every server (plan 8G, `/admin forget`; migration
   * 051 lets the ids be null); from how many. Their words stay, for the moderators, without who
   * wrote them. What is still open keeps both: a request the moderators have not decided, an
   * approval whose meetup is not made yet (it is made by that member, with that name and team),
   * an open appeal or ask. Their blocks and the rulings stay as they are: the moderators' record.
   * The rows are read first, without a lock, and changed by their ids, each only while it is
   * still theirs and over: a change by the member alone would lock every row of the tables. One
   * transaction, the caller's when `db` is one.
   */
  forgetMember(memberId: string): Promise<number> {
    return inTransaction(this.db, async (trx) => {
      const requests = await trx
        .selectFrom('MeetupRequest')
        .select('id')
        .where('makerId', '=', memberId)
        .where(REQUEST_OVER)
        .execute();
      const appeals = await trx
        .selectFrom('MeetupAppeal')
        .select('id')
        .where('memberId', '=', memberId)
        .where(APPEAL_OVER)
        .execute();
      const asks = await trx
        .selectFrom('MeetupPlaceAsk')
        .select('id')
        .where('memberId', '=', memberId)
        .where(ASK_OVER)
        .execute();
      let cleared = 0;
      if (requests.length > 0) {
        const changed = await trx
          .updateTable('MeetupRequest')
          .set({ makerId: null, makerName: null, makerTeam: null })
          .where('id', 'in', ids(requests))
          .where('makerId', '=', memberId)
          .where(REQUEST_OVER)
          .executeTakeFirst();
        cleared += Number(changed.numUpdatedRows);
      }
      if (appeals.length > 0) {
        const changed = await trx
          .updateTable('MeetupAppeal')
          .set({ memberId: null, memberName: null })
          .where('id', 'in', ids(appeals))
          .where('memberId', '=', memberId)
          .where(APPEAL_OVER)
          .executeTakeFirst();
        cleared += Number(changed.numUpdatedRows);
      }
      if (asks.length > 0) {
        const changed = await trx
          .updateTable('MeetupPlaceAsk')
          .set({ memberId: null, memberName: null })
          .where('id', 'in', ids(asks))
          .where('memberId', '=', memberId)
          .where(ASK_OVER)
          .executeTakeFirst();
        cleared += Number(changed.numUpdatedRows);
      }
      return cleared;
    });
  }
}

const ids = (rows: readonly { id: string }[]): string[] => rows.map((row) => row.id);

/**
 * A request that is decided and over (plan 8G): refused, expired, failed or withdrawn, or
 * approved with its meetup made (`partyId`). Not one that waits for a moderator, nor an approval
 * whose meetup is still to be made (the sweep of stranded approvals makes it, with the maker's
 * name and team), nor a status this code does not know.
 */
const REQUEST_OVER = sql<boolean>`(status in ('refused', 'expired', 'failed', 'withdrawn')
  or (status = 'approved' and partyId is not null))`;
/** An appeal a moderator decided, or that expired. */
const APPEAL_OVER = sql<boolean>`(status in ('lifted', 'kept', 'expired'))`;
/** An ask about a place that a moderator decided, that expired, or whose ruling was undone. */
const ASK_OVER = sql<boolean>`(status in ('allowed', 'kept', 'expired', 'undone'))`;

/** What meetup safety holds of a member, counted (`MeetupSafetyRepository.heldOf`). */
export interface MeetupRecordsHeld {
  /** Their blocks, lifted or not. */
  blocks: number;
  /** Their requests, appeals and asks still open: with the moderators, or approved and not made. */
  open: number;
  /** Their requests, appeals and asks that are decided and over (which the removal clears). */
  over: number;
}

/**
 * Blocks a member without reading first (no lock on a row that is not there): a lifted block's
 * row is blocked again in its place (only the last lift is kept), else a row is made unless one
 * is there (a block that stands, or one made at the same moment: the first stands). True for a
 * new block. Two at once over a deleted row InnoDB has not purged yet deadlock: each insert locks
 * that row shared to see the duplicate, then exclusive to use it again. No block is deleted but
 * by a test, yet the callers try again on a deadlock (`retryOnDeadlock`).
 */
async function blockIn(
  db: Kysely<DB>,
  serverId: string,
  memberId: string,
  by: Decider,
  memberName: string | null,
): Promise<boolean> {
  const blocked = {
    memberName,
    blockedBy: by.id,
    blockedByName: by.name,
    blockedAt: String(by.at),
  };
  const [renewed] = await db
    .updateTable('MeetupBlock')
    .set({ ...blocked, liftedBy: null, liftedByName: null, liftedAt: null })
    .where('serverId', '=', serverId)
    .where('memberId', '=', memberId)
    .where('liftedAt', 'is not', null)
    .execute();
  if (Number(renewed?.numUpdatedRows ?? 0) > 0) return true;
  const [made] = await db
    .insertInto('MeetupBlock')
    .ignore()
    .values({ serverId, memberId, ...blocked })
    .execute();
  return Number(made?.numInsertedOrUpdatedRows ?? 0) > 0;
}

/** Lifts a member's block, keeping who lifted it; false when none stood. */
async function liftIn(
  db: Kysely<DB>,
  serverId: string,
  memberId: string,
  by: Decider,
): Promise<boolean> {
  const [result] = await db
    .updateTable('MeetupBlock')
    .set({ liftedBy: by.id, liftedByName: by.name, liftedAt: String(by.at) })
    .where('serverId', '=', serverId)
    .where('memberId', '=', memberId)
    .where('liftedAt', 'is', null)
    .execute();
  return Number(result?.numUpdatedRows ?? 0) > 0;
}

/** Rules a place, in place of a ruling it had (whose kept refusal goes with it). */
async function ruleIn(
  db: Kysely<DB>,
  serverId: string,
  key: RulingKey,
  ruling: PlaceRuling,
  by: Decider,
  more: RulingMore,
): Promise<void> {
  const made = {
    ruling,
    ruledBy: by.id,
    ruledByName: by.name,
    ruledAt: String(by.at),
    place: more.place === undefined ? null : JSON.stringify(more.place),
    sourceKind: more.source?.kind ?? null,
    sourceId: more.source?.id ?? null,
    sourceChannelId: more.source?.channelId ?? null,
    sourceMessageId: more.source?.messageId ?? null,
    keptAt: null,
  };
  await db
    .insertInto('MeetupPlaceRuling')
    .values({ serverId, placeKind: key.kind, placeId: key.id, ...made })
    .onDuplicateKeyUpdate(made)
    .execute();
}

/** Decides an open ask, the first press winning; false when it was not open. */
async function decideAskIn(
  db: Kysely<DB>,
  id: string,
  status: Exclude<AskStatus, 'open'>,
  by: Decider | null,
): Promise<boolean> {
  const [result] = await db
    .updateTable('MeetupPlaceAsk')
    .set({
      status,
      openKey: null,
      decidedBy: by?.id ?? null,
      decidedByName: by?.name ?? null,
      decidedAt: by === null ? null : String(by.at),
    })
    .where('id', '=', id)
    .where('status', '=', 'open')
    .execute();
  return Number(result?.numUpdatedRows ?? 0) > 0;
}

/** The unique key of an open ask: one per place and server. */
function askKey(serverId: string, key: RulingKey): string {
  return `${serverId} ${key.kind} ${key.id}`;
}

const PLACE_KINDS = ['gym', 'stop', 'powerspot'] as const;
const ASK_STATUSES: readonly AskStatus[] = ['open', 'allowed', 'kept', 'expired', 'undone'];
const SOURCE_KINDS: readonly RulingSource['kind'][] = ['request', 'report', 'ask'];

/** A ruling as it is kept; a place that does not read (or a pin) is left out of it. */
function readRuling(row: Selectable<RulingRow>): PlaceRulingRecord | undefined {
  const kind = PLACE_KINDS.find((one) => one === row.placeKind);
  if (kind === undefined || (row.ruling !== 'allow' && row.ruling !== 'refuse')) return undefined;
  const parsed =
    row.place === null
      ? undefined
      : placeDocument.safeParse(typeof row.place === 'string' ? JSON.parse(row.place) : row.place);
  const place = parsed?.success && parsed.data.kind !== 'pin' ? parsed.data : null;
  const sourceKind = SOURCE_KINDS.find((one) => one === row.sourceKind);
  return {
    serverId: row.serverId,
    key: { kind, id: row.placeId },
    ruling: row.ruling,
    ruledBy: row.ruledBy,
    ruledByName: row.ruledByName,
    ruledAt: Number(row.ruledAt),
    place,
    source:
      sourceKind !== undefined &&
      row.sourceId !== null &&
      row.sourceChannelId !== null &&
      row.sourceMessageId !== null
        ? {
            kind: sourceKind,
            id: row.sourceId,
            channelId: row.sourceChannelId,
            messageId: row.sourceMessageId,
          }
        : null,
    keptAt: epoch(row.keptAt),
  };
}

function teamOf(text: string | null): Team | null {
  return TEAMS.find((team) => team === text) ?? null;
}

function readAppeal(row: Selectable<AppealRow>): MeetupAppeal {
  return {
    id: row.id,
    serverId: row.serverId,
    memberId: row.memberId,
    memberName: row.memberName,
    text: row.text,
    createdAt: Number(row.createdAt),
    // A status the code does not know is read as decided: it is never offered again.
    status: APPEAL_STATUSES.find((one) => one === row.status) ?? 'kept',
    channelId: row.channelId,
    messageId: row.messageId,
    decidedBy: row.decidedBy,
    decidedByName: row.decidedByName,
    decidedAt: epoch(row.decidedAt),
  };
}
