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
} from '../../src/domain/meetups/records.js';
import type { PlaceRuling, RulingKey } from '../../src/domain/meetups/safety.js';

/** The key of a ruling in memory. */
function rulingId(serverId: string, key: RulingKey): string {
  return `${serverId} ${key.kind} ${key.id}`;
}

/** A block as it is kept: while it stands, and who lifted it last once lifted. */
type KeptBlock = MeetupBlock & {
  liftedBy: string | null;
  liftedByName: string | null;
  liftedAt: number | null;
};

/**
 * `MeetupSafetyRepository` in memory, for tests: the same answers (`meetupSafetyCases` runs on
 * both). `failing` makes every method of that name reject.
 */
export class MemoryMeetupSafety implements MeetupSafetyStore {
  readonly rulingRows = new Map<string, PlaceRulingRecord>();
  readonly asks = new Map<string, PlaceAskRecord>();
  readonly blockRows = new Map<string, KeptBlock>();
  readonly requests = new Map<string, MeetupRequestRecord>();
  readonly appeals = new Map<string, MeetupAppeal>();
  readonly failing = new Set<keyof MeetupSafetyStore>();

  private check(method: keyof MeetupSafetyStore): Promise<void> {
    return this.failing.has(method)
      ? Promise.reject(new Error(`the database refused ${method}`))
      : Promise.resolve();
  }

  async ruling(serverId: string, key: RulingKey) {
    await this.check('ruling');
    return this.rulingRows.get(rulingId(serverId, key))?.ruling;
  }

  async rulingRecord(serverId: string, key: RulingKey) {
    await this.check('rulingRecord');
    const found = this.rulingRows.get(rulingId(serverId, key));
    return found && structuredClone(found);
  }

  async rule(
    serverId: string,
    key: RulingKey,
    ruling: PlaceRuling,
    by: Decider,
    more: RulingMore = {},
  ) {
    await this.check('rule');
    this.ruleNow(serverId, key, ruling, by, more);
  }

  private ruleNow(
    serverId: string,
    key: RulingKey,
    ruling: PlaceRuling,
    by: Decider,
    more: RulingMore,
  ): void {
    this.rulingRows.set(rulingId(serverId, key), {
      serverId,
      key: { ...key },
      ruling,
      ruledBy: by.id,
      ruledByName: by.name,
      ruledAt: by.at,
      place: more.place === undefined ? null : structuredClone(more.place),
      source: more.source === undefined ? null : { ...more.source },
      keptAt: null,
    });
  }

  async undoRuling(serverId: string, key: RulingKey) {
    await this.check('undoRuling');
    const id = rulingId(serverId, key);
    const found = this.rulingRows.get(id);
    if (!found) return undefined;
    this.rulingRows.delete(id);
    const open = [...this.asks.values()].find(
      (one) =>
        one.serverId === serverId &&
        one.key.kind === key.kind &&
        one.key.id === key.id &&
        one.status === 'open',
    );
    if (open) this.decideAskNow(open.id, 'undone', null);
    const ask = open && this.asks.get(open.id);
    return { ruling: structuredClone(found), ask: ask && structuredClone(ask) };
  }

  async addAsk(ask: NewPlaceAsk) {
    await this.check('addAsk');
    const open = [...this.asks.values()].some(
      (one) =>
        one.serverId === ask.serverId &&
        one.key.kind === ask.key.kind &&
        one.key.id === ask.key.id &&
        one.status === 'open',
    );
    if (open) return 'open' as const;
    this.asks.set(ask.id, {
      ...structuredClone(ask),
      status: 'open',
      channelId: null,
      messageId: null,
      decidedBy: null,
      decidedByName: null,
      decidedAt: null,
    });
    return 'added' as const;
  }

  async discardAsk(id: string) {
    await this.check('discardAsk');
    this.asks.delete(id);
  }

  async setAskPost(id: string, channelId: string, messageId: string) {
    await this.check('setAskPost');
    const found = this.asks.get(id);
    if (found) this.asks.set(id, { ...found, channelId, messageId });
  }

  async ask(id: string) {
    await this.check('ask');
    const found = this.asks.get(id);
    return found && structuredClone(found);
  }

  async openAsk(serverId: string, key: RulingKey) {
    await this.check('openAsk');
    const found = [...this.asks.values()].find(
      (one) =>
        one.serverId === serverId &&
        one.key.kind === key.kind &&
        one.key.id === key.id &&
        one.status === 'open',
    );
    return found && structuredClone(found);
  }

  private decideAskNow(id: string, status: Exclude<AskStatus, 'open'>, by: Decider | null) {
    const found = this.asks.get(id);
    if (!found || found.status !== 'open') return false;
    this.asks.set(id, {
      ...found,
      status,
      decidedBy: by?.id ?? null,
      decidedByName: by?.name ?? null,
      decidedAt: by?.at ?? null,
    });
    return true;
  }

  async expireAsk(id: string) {
    await this.check('expireAsk');
    return this.decideAskNow(id, 'expired', null);
  }

  async allowOnAsk(ask: PlaceAskRecord, by: Decider) {
    await this.check('allowOnAsk');
    if (!this.decideAskNow(ask.id, 'allowed', by)) return false;
    const posted = this.asks.get(ask.id);
    const source =
      posted?.channelId && posted.messageId
        ? {
            kind: 'ask' as const,
            id: ask.id,
            channelId: posted.channelId,
            messageId: posted.messageId,
          }
        : undefined;
    this.ruleNow(ask.serverId, ask.key, 'allow', by, {
      place: ask.place,
      ...(source === undefined ? {} : { source }),
    });
    return true;
  }

  async keepOnAsk(ask: PlaceAskRecord, by: Decider) {
    await this.check('keepOnAsk');
    const ruling = this.rulingRows.get(rulingId(ask.serverId, ask.key));
    if (this.asks.get(ask.id)?.status !== 'open') return 'not-open' as const;
    if (ruling?.ruling !== 'refuse') return 'not-refused' as const;
    this.decideAskNow(ask.id, 'kept', by);
    ruling.keptAt = by.at;
    return 'kept' as const;
  }

  async rulings(serverId: string) {
    await this.check('rulings');
    return [...this.rulingRows.values()]
      .filter((one) => one.serverId === serverId)
      .sort((a, b) => a.ruledAt - b.ruledAt || a.key.id.localeCompare(b.key.id))
      .map((one) => structuredClone(one));
  }

  async pendingIn(serverId: string) {
    await this.check('pendingIn');
    return this.sorted((one) => one.serverId === serverId && one.status === 'pending');
  }

  async openAsks(serverId: string) {
    await this.check('openAsks');
    return [...this.asks.values()]
      .filter((one) => one.serverId === serverId && one.status === 'open')
      .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))
      .map((one) => structuredClone(one));
  }

  async blocks(serverId: string) {
    await this.check('blocks');
    return [...this.blockRows.values()]
      .filter((one) => one.serverId === serverId && one.liftedAt === null)
      .sort((a, b) => a.blockedAt - b.blockedAt || a.memberId.localeCompare(b.memberId))
      .map(({ liftedBy: _by, liftedByName: _name, liftedAt: _at, ...block }) => block);
  }

  async openAppeals(serverId: string) {
    await this.check('openAppeals');
    return [...this.appeals.values()]
      .filter((one) => one.serverId === serverId && one.status === 'open')
      .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))
      .map((one) => ({ ...one }));
  }

  async staleAsks(stale: { unpostedBefore: number; openedBefore: number }) {
    await this.check('staleAsks');
    return [...this.asks.values()]
      .filter(
        (one) =>
          one.status === 'open' &&
          ((one.messageId === null && one.createdAt <= stale.unpostedBefore) ||
            one.createdAt <= stale.openedBefore),
      )
      .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))
      .map((one) => structuredClone(one));
  }

  async block(serverId: string, memberId: string) {
    await this.check('block');
    const found = this.blockRows.get(`${serverId} ${memberId}`);
    if (!found || found.liftedAt !== null) return undefined;
    const { liftedBy: _by, liftedByName: _name, liftedAt: _at, ...block } = found;
    return block;
  }

  async addBlock(serverId: string, memberId: string, by: Decider, memberName?: string | null) {
    await this.check('addBlock');
    return this.blockNow(serverId, memberId, by, memberName ?? null);
  }

  private blockNow(
    serverId: string,
    memberId: string,
    by: Decider,
    memberName: string | null,
  ): boolean {
    const key = `${serverId} ${memberId}`;
    const found = this.blockRows.get(key);
    if (found && found.liftedAt === null) return false;
    this.blockRows.set(key, {
      serverId,
      memberId,
      memberName,
      blockedBy: by.id,
      blockedByName: by.name,
      blockedAt: by.at,
      liftedBy: null,
      liftedByName: null,
      liftedAt: null,
    });
    return true;
  }

  async blockMaker(
    request: Pick<MeetupRequestRecord, 'id' | 'serverId' | 'makerName'> & { makerId: string },
    by: Decider,
  ) {
    await this.check('blockMaker');
    const found = this.requests.get(request.id);
    if (!found || found.status !== 'pending') return { decided: false, newBlock: false };
    this.requests.set(request.id, {
      ...found,
      status: 'refused',
      decision: 'block',
      decidedBy: by.id,
      decidedByName: by.name,
      decidedAt: by.at,
    });
    return {
      decided: true,
      newBlock: this.blockNow(request.serverId, request.makerId, by, request.makerName),
    };
  }

  async liftBlock(serverId: string, memberId: string, by: Decider) {
    await this.check('liftBlock');
    const found = this.blockRows.get(`${serverId} ${memberId}`);
    if (!found || found.liftedAt !== null) return false;
    found.liftedBy = by.id;
    found.liftedByName = by.name;
    found.liftedAt = by.at;
    return true;
  }

  async liftWithAppeal(serverId: string, memberId: string, by: Decider) {
    await this.check('liftWithAppeal');
    const found = this.blockRows.get(`${serverId} ${memberId}`);
    if (!found || found.liftedAt !== null) return { lifted: false, appeal: undefined };
    found.liftedBy = by.id;
    found.liftedByName = by.name;
    found.liftedAt = by.at;
    const open = [...this.appeals.values()].find(
      (one) => one.serverId === serverId && one.memberId === memberId && one.status === 'open',
    );
    if (!open) return { lifted: true, appeal: undefined };
    const decided: MeetupAppeal = {
      ...open,
      status: 'lifted',
      decidedBy: by.id,
      decidedByName: by.name,
      decidedAt: by.at,
    };
    this.appeals.set(open.id, decided);
    return { lifted: true, appeal: { ...decided } };
  }

  async liftOnAppeal(
    appeal: Pick<MeetupAppeal, 'id' | 'serverId'> & { memberId: string },
    by: Decider,
  ) {
    await this.check('liftOnAppeal');
    const found = this.appeals.get(appeal.id);
    if (!found || found.status !== 'open') return false;
    this.appeals.set(appeal.id, {
      ...found,
      status: 'lifted',
      decidedBy: by.id,
      decidedByName: by.name,
      decidedAt: by.at,
    });
    const block = this.blockRows.get(`${appeal.serverId} ${appeal.memberId}`);
    if (block && block.liftedAt === null) {
      block.liftedBy = by.id;
      block.liftedByName = by.name;
      block.liftedAt = by.at;
    }
    return true;
  }

  async addRequest(request: NewMeetupRequest) {
    await this.check('addRequest');
    this.requests.set(request.id, {
      ...structuredClone(request),
      status: 'pending',
      decision: null,
      decidedBy: null,
      decidedByName: null,
      decidedAt: null,
      partyId: null,
      failure: null,
    });
  }

  async request(id: string) {
    await this.check('request');
    const found = this.requests.get(id);
    return found && structuredClone(found);
  }

  async decideRequest(
    id: string,
    status: Exclude<RequestStatus, 'pending' | 'failed'>,
    decision: RequestDecision | null,
    by: Decider | null,
  ) {
    await this.check('decideRequest');
    const found = this.requests.get(id);
    if (!found || found.status !== 'pending') return false;
    this.requests.set(id, {
      ...found,
      status,
      decision,
      decidedBy: by?.id ?? null,
      decidedByName: by?.name ?? null,
      decidedAt: by?.at ?? null,
    });
    return true;
  }

  async settleApproval(id: string, outcome: ApprovalOutcome) {
    await this.check('settleApproval');
    const found = this.requests.get(id);
    if (!found || found.status !== 'approved' || found.partyId !== null) return false;
    this.requests.set(
      id,
      typeof outcome === 'string'
        ? { ...found, status: outcome }
        : 'failed' in outcome
          ? { ...found, status: 'failed', failure: structuredClone(outcome.failed) }
          : { ...found, partyId: outcome.partyId },
    );
    return true;
  }

  async strandedApprovals(decidedBefore: number) {
    await this.check('strandedApprovals');
    return this.sorted(
      (one) =>
        one.status === 'approved' &&
        one.partyId === null &&
        one.decidedAt !== null &&
        one.decidedAt <= decidedBefore,
    );
  }

  async pendingOf(serverId: string, makerId: string) {
    await this.check('pendingOf');
    return this.sorted(
      (one) => one.serverId === serverId && one.makerId === makerId && one.status === 'pending',
    );
  }

  async approvedRequestOf(serverId: string, makerId: string, partyId: string) {
    await this.check('approvedRequestOf');
    return [...this.requests.values()].find(
      (one) =>
        one.serverId === serverId &&
        one.makerId === makerId &&
        one.status === 'approved' &&
        one.partyId === partyId,
    );
  }

  async duePending(now: number) {
    await this.check('duePending');
    return this.sorted((one) => one.status === 'pending' && one.expiresAt <= now);
  }

  private sorted(which: (request: MeetupRequestRecord) => boolean): MeetupRequestRecord[] {
    return [...this.requests.values()]
      .filter(which)
      .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))
      .map((one) => structuredClone(one));
  }

  async addAppeal(appeal: NewMeetupAppeal) {
    await this.check('addAppeal');
    const open = [...this.appeals.values()].some(
      (one) =>
        one.serverId === appeal.serverId &&
        one.memberId === appeal.memberId &&
        one.status === 'open',
    );
    if (open) return 'open' as const;
    this.appeals.set(appeal.id, {
      ...appeal,
      status: 'open',
      channelId: null,
      messageId: null,
      decidedBy: null,
      decidedByName: null,
      decidedAt: null,
    });
    return 'added' as const;
  }

  async discardAppeal(id: string) {
    await this.check('discardAppeal');
    this.appeals.delete(id);
  }

  async setAppealPost(id: string, channelId: string, messageId: string) {
    await this.check('setAppealPost');
    const found = this.appeals.get(id);
    if (found) this.appeals.set(id, { ...found, channelId, messageId });
  }

  async appeal(id: string) {
    await this.check('appeal');
    const found = this.appeals.get(id);
    return found && { ...found };
  }

  async openAppeal(serverId: string, memberId: string) {
    await this.check('openAppeal');
    const found = [...this.appeals.values()].find(
      (one) => one.serverId === serverId && one.memberId === memberId && one.status === 'open',
    );
    return found && { ...found };
  }

  async lastKept(serverId: string, memberId: string) {
    await this.check('lastKept');
    const times = [...this.appeals.values()]
      .filter(
        (one) => one.serverId === serverId && one.memberId === memberId && one.status === 'kept',
      )
      .map((one) => one.decidedAt ?? 0);
    return times.length === 0 ? undefined : Math.max(...times);
  }

  async decideAppeal(id: string, status: Exclude<AppealStatus, 'open'>, by: Decider | null) {
    await this.check('decideAppeal');
    const found = this.appeals.get(id);
    if (!found || found.status !== 'open') return false;
    this.appeals.set(id, {
      ...found,
      status,
      decidedBy: by?.id ?? null,
      decidedByName: by?.name ?? null,
      decidedAt: by?.at ?? null,
    });
    return true;
  }

  async staleAppeals(stale: { unpostedBefore: number; openedBefore: number }) {
    await this.check('staleAppeals');
    return [...this.appeals.values()]
      .filter(
        (one) =>
          one.status === 'open' &&
          ((one.messageId === null && one.createdAt <= stale.unpostedBefore) ||
            one.createdAt <= stale.openedBefore),
      )
      .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))
      .map((one) => ({ ...one }));
  }
}
