/**
 * Who may have the Pine Wayspot export tool (plan 8W-P): the admins of servers that run
 * Pine ask for it on the owner's instance (`/userscript`), the owner approves, refuses or
 * revokes, and an approved admin fetches the tool at an address carrying a key of their own. One
 * row per member (`ScriptAccess`, migration 024; `ScriptAccessRepository`, its twin
 * `MemoryScriptAccess`).
 */

/** Where a member stands: asked and waiting, approved (with a key), refused, revoked. */
export const SCRIPT_ACCESS_STATES = ['asked', 'approved', 'refused', 'revoked'] as const;
export type ScriptAccessState = (typeof SCRIPT_ACCESS_STATES)[number];

/** A refused member may ask again this many days after the refusal. */
export const REASK_DAYS = 30;
const DAY_MS = 86_400_000;
/** `REASK_DAYS` in milliseconds. */
export const REASK_MS = REASK_DAYS * DAY_MS;
/** The owner is sent a DM of a request only while at most this many requests are open. */
export const OPEN_REQUESTS_NOTIFIED = 20;
/** As much of the community line as is kept, in code points. */
export const COMMUNITY_MAX = 200;
/** A key's fetches are recorded at most once in this many milliseconds (unless its version changed). */
export const FETCH_RECORD_MS = 60_000;
/** The longest name kept of a member (`ScriptAccess.name`, varchar(100)), in code points. */
export const NAME_MAX = 100;
/** A key as written: 32 random bytes in hex. */
export const ACCESS_KEY = /^[0-9a-f]{64}$/;

/** A member's access to the tool, as stored. Times are epoch milliseconds. */
export interface ScriptAccess {
  id: number;
  userId: string;
  /** The member's Discord name when they asked. */
  name: string;
  /** Which community they run Pine for, in their words (`communityLine`). */
  community: string;
  state: ScriptAccessState;
  /** The key of their addresses: only while approved, a new one at every approval. */
  key: string | null;
  askedAt: number;
  /** When the state was last decided; null while asked. */
  decidedAt: number | null;
  /** When the tool was last fetched with the key, and the version it was given then. */
  lastFetchAt: number | null;
  lastVersion: string | null;
}

/** What the owner can decide of a member's access. */
export type Decision = 'approve' | 'refuse' | 'revoke';

/** The states each decision is taken from: Approve also undoes a refusal or a revocation. */
const DECIDED_FROM: Readonly<Record<Decision, readonly ScriptAccessState[]>> = {
  approve: ['asked', 'refused', 'revoked'],
  refuse: ['asked'],
  revoke: ['approved'],
};

/** Whether `decision` can be taken from `state`. */
export function decisionFits(decision: Decision, state: ScriptAccessState): boolean {
  return DECIDED_FROM[decision].includes(state);
}

/** The state a decision leads to. */
export function decidedState(decision: Decision): ScriptAccessState {
  return decision === 'approve' ? 'approved' : decision === 'refuse' ? 'refused' : 'revoked';
}

/** Cuts text to `max` code points (never a surrogate pair in half). */
function cut(text: string, max: number): string {
  return [...text].slice(0, max).join('');
}

/**
 * The community line as kept: cut to `COMMUNITY_MAX` code points before anything else, then on
 * one line (each run of white space one space) and trimmed. Empty when nothing is left.
 */
export function communityLine(typed: string): string {
  return cut(typed, COMMUNITY_MAX).replace(/\s+/gu, ' ').trim();
}

/** A member's name as kept: at most `NAME_MAX` code points. */
export function keptName(name: string): string {
  return cut(name, NAME_MAX);
}

/** When a refused member may ask again; undefined for any other state. */
export function askAgainAt(access: ScriptAccess): number | undefined {
  return access.state === 'refused' && access.decidedAt !== null
    ? access.decidedAt + REASK_MS
    : undefined;
}

/** Whether a member's row lets them ask (again) at `now`: a refusal at least `REASK_DAYS` old. */
export function mayAskAgain(access: ScriptAccess, now: number): boolean {
  const at = askAgainAt(access);
  return at !== undefined && now >= at;
}

/** A request to the owner: who asks, in their words, when. */
export interface AccessRequest {
  userId: string;
  name: string;
  /** The community line as kept (`communityLine`): never empty. */
  community: string;
  at: number;
}

/**
 * What asking did: `asked`, a new request or one renewed after a refusal (the owner is told);
 * `standing`, nothing changed (a request open already, approved, revoked, or refused less than
 * `REASK_DAYS` ago), with the row as it is.
 */
export type AskOutcome =
  { kind: 'asked'; access: ScriptAccess } | { kind: 'standing'; access: ScriptAccess };

/**
 * A decision as the owner took it: what, from the state the button was drawn with (`from`) and,
 * for a request, the asking it was drawn for (`askedAt`: a request asked again since is another
 * one), the new key of an approval (null otherwise), when.
 */
export interface DecisionTaken {
  decision: Decision;
  from: ScriptAccessState;
  askedAt?: number;
  key: string | null;
  at: number;
}

/**
 * What a decision did: `decided`, with the row now; `changed`, nothing (the row is no longer in
 * the state the button was drawn with, or the decision does not fit it), with the row as it is;
 * `gone`, there is no such row.
 */
export type DecideOutcome =
  | { kind: 'decided'; access: ScriptAccess }
  | { kind: 'changed'; access: ScriptAccess }
  | { kind: 'gone' };

/** Where the rows are kept: `ScriptAccessRepository`, and `MemoryScriptAccess` in tests. */
export interface ScriptAccessStore {
  byId(id: number): Promise<ScriptAccess | undefined>;
  byUser(userId: string): Promise<ScriptAccess | undefined>;
  /** The row of a key, whatever its state (a key is kept only while approved). */
  byKey(key: string): Promise<ScriptAccess | undefined>;
  /** Asks for access: a new row, or a refusal at least `REASK_DAYS` old asked again. */
  ask(request: AccessRequest): Promise<AskOutcome>;
  /**
   * Takes a decision on the row as it is now: only from `from` (and `askedAt`, when given), and
   * only where it fits.
   */
  decide(id: number, taken: DecisionTaken): Promise<DecideOutcome>;
  /** Gives an approved member a new key (the old one stops at once); undefined when not approved. */
  newKey(userId: string, key: string): Promise<ScriptAccess | undefined>;
  /**
   * The owner's row, approved with `key`: made when there is none, approved when it is not; an
   * approved row is given as it is (its key kept).
   */
  ownerLink(
    owner: { userId: string; name: string },
    key: string,
    at: number,
  ): Promise<ScriptAccess>;
  /**
   * Records a fetch of the tool with an approved row's key: at most once in `FETCH_RECORD_MS`,
   * unless the version differs from the last recorded. Whether it was recorded.
   */
  recordFetch(id: number, version: string, at: number): Promise<boolean>;
  /** Every row, the latest asked first. */
  all(): Promise<ScriptAccess[]>;
  /** How many requests wait for the owner. */
  openCount(): Promise<number>;
}
