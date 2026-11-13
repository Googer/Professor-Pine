import { randomBytes } from 'node:crypto';
import {
  communityLine,
  OPEN_REQUESTS_NOTIFIED,
  keptName,
  type AskOutcome,
  type DecideOutcome,
  type Decision,
  type ScriptAccess,
  type ScriptAccessState,
  type ScriptAccessStore,
} from '../domain/script-access/access.js';
import type { Logger } from '../log.js';
import { accessRequestDm } from '../render/script-access-dm.js';
import { DM_PRIORITY, type DmSender } from './dm-sender.js';

/** How long the owner's DM of a request waits in the queue before it is not worth sending. */
const REQUEST_DM_MS = 7 * 86_400_000;

/** A new key: 32 random bytes as hex. */
export function newAccessKey(): string {
  return randomBytes(32).toString('hex');
}

/** Who acts: a member's id and their Discord name. */
export interface AccessMember {
  id: string;
  name: string;
}

/** What asking did: `AskOutcome`, or nothing for a community line with nothing in it. */
export type AskAnswer = AskOutcome | { kind: 'no-community' };

export interface ScriptAccessServiceOptions {
  store: ScriptAccessStore;
  /** The instance's owner (`OWNER_ID`): the one who decides, approved without a row. */
  ownerId: string;
  /** Makes a key; random by default (`newAccessKey`). */
  newKey?: () => string;
  now?: () => number;
  log: Logger;
  /** The DM queue: a new request is told to the owner (none without it). */
  dms?: DmSender;
}

/**
 * Who may have the Pine Wayfarer export tool (plan 8W-P), for the page `/userscript`, the tool's
 * addresses and the owner's DM: asking, the owner's decisions (a new key at every approval, none
 * kept by a refusal or a revocation), a new link, the owner's own link. Every decision is taken
 * on the row as it is (`ScriptAccessStore.decide`); keys are never logged.
 */
export class ScriptAccessService {
  readonly ownerId: string;
  private readonly store: ScriptAccessStore;
  private readonly newKey: () => string;
  private readonly now: () => number;
  private readonly log: Logger;
  private readonly dms: DmSender | undefined;

  constructor(options: ScriptAccessServiceOptions) {
    this.store = options.store;
    this.ownerId = options.ownerId;
    this.newKey = options.newKey ?? newAccessKey;
    this.now = options.now ?? (() => Date.now());
    this.log = options.log;
    this.dms = options.dms;
  }

  isOwner(userId: string): boolean {
    return userId === this.ownerId;
  }

  byId(id: number): Promise<ScriptAccess | undefined> {
    return this.store.byId(id);
  }

  byUser(userId: string): Promise<ScriptAccess | undefined> {
    return this.store.byUser(userId);
  }

  byKey(key: string): Promise<ScriptAccess | undefined> {
    return this.store.byKey(key);
  }

  recordFetch(id: number, version: string, at: number): Promise<boolean> {
    return this.store.recordFetch(id, version, at);
  }

  all(): Promise<ScriptAccess[]> {
    return this.store.all();
  }

  openCount(): Promise<number> {
    return this.store.openCount();
  }

  /** A member asks for the tool with their community line (cut to 200 code points first). */
  async ask(member: AccessMember, typed: string): Promise<AskAnswer> {
    const community = communityLine(typed);
    if (community === '') return { kind: 'no-community' };
    const outcome = await this.store.ask({
      userId: member.id,
      name: keptName(member.name),
      community,
      at: this.now(),
    });
    this.log.info(
      { user: member.id, access: outcome.access.id, outcome: outcome.kind },
      'the Wayfarer export tool was asked for',
    );
    if (outcome.kind === 'asked') await this.tellOwner(outcome.access);
    return outcome;
  }

  /**
   * A DM of a new request to the owner, through the DM queue (`normal`, kept a week: the line is
   * in memory, so a restart loses it and the page is the fallback), while at most
   * `OPEN_REQUESTS_NOTIFIED` requests are open: any Discord account can log in and ask, and a
   * flood of them must not flood the owner's DMs; the rest wait on the page.
   */
  private async tellOwner(access: ScriptAccess): Promise<void> {
    if (!this.dms) return;
    const open = await this.store.openCount();
    if (open > OPEN_REQUESTS_NOTIFIED) {
      this.log.info({ access: access.id, open }, 'a tool request waits on the page without a DM');
      return;
    }
    const at = this.now();
    this.dms.send({
      userId: this.ownerId,
      serverId: null,
      message: accessRequestDm(access),
      priority: DM_PRIORITY.normal,
      eventAt: at,
      expiresAt: at + REQUEST_DM_MS,
    });
  }

  /**
   * The owner decides, from the state and the asking (`askedAt`) the button was drawn with, on
   * the page or in the DM: a request asked again since is another one. An approval makes a new
   * key.
   */
  async decide(
    id: number,
    decision: Decision,
    from: ScriptAccessState,
    askedAt?: number,
  ): Promise<DecideOutcome> {
    const outcome = await this.store.decide(id, {
      decision,
      from,
      ...(askedAt === undefined ? {} : { askedAt }),
      key: decision === 'approve' ? this.newKey() : null,
      at: this.now(),
    });
    this.log.info(
      { access: id, decision, from, outcome: outcome.kind },
      'a request for the Wayfarer export tool was decided',
    );
    return outcome;
  }

  /** An approved member's new link: the old one stops at once. Undefined when not approved. */
  async newLink(userId: string): Promise<ScriptAccess | undefined> {
    const access = await this.store.newKey(userId, this.newKey());
    if (access) this.log.info({ user: userId, access: access.id }, 'a new tool link was made');
    return access;
  }

  /** The owner's own row and link, made by their first "Make my link"; nobody else's. */
  async ownerLink(member: AccessMember): Promise<ScriptAccess | undefined> {
    if (!this.isOwner(member.id)) return undefined;
    return this.store.ownerLink(
      { userId: member.id, name: keptName(member.name) },
      this.newKey(),
      this.now(),
    );
  }
}
