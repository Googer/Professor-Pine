/**
 * Neighbors (plan 19E; spec `2026-11-12-multi-server-instance-design.md`, "Neighbors"): two
 * servers whose staff both agreed, the staff of one asking and the staff of the other accepting.
 * The pure rules: the pair's order, what a row of `ServerNeighbor` says now, and what an ask and
 * an answer come to. `ServerNeighbors` (`src/services/server-neighbors.ts`) keeps the rows.
 */

/**
 * How many neighbors a server may have, its own requests still unanswered counted with them
 * (each turns into a neighbor when accepted). Ten: a community borders few others, and every
 * raid post of a server reads its neighbors' parties at its gym (one line each, and Discord's 40
 * components and 4,000 characters bound the post), while every change of a party redraws its
 * neighbors' posts at that gym in their turns.
 */
export const NEIGHBORS_MAX = 10;

/** A day. */
const DAY_MS = 24 * 60 * 60_000;

/** How long after a decline the same server may ask again (and until then is answered as asked). */
export const NEIGHBOR_ASK_AGAIN_MS = 7 * DAY_MS;

/** How long a request waits for an answer before it expires. */
export const NEIGHBOR_ASK_EXPIRES_MS = 7 * DAY_MS;

/** Two servers in a fixed order: the lower snowflake (as a number) first. */
export interface NeighborPair {
  serverA: string;
  serverB: string;
}

/**
 * A pair's row: which of the two asked and when, and when the other accepted or declined (null
 * while neither). A pair has one row at a time: one request pending per pair. `toldAt` is when the
 * other server's staff were last told of a request of `askedBy`'s (null: never), `withdrawnAt`
 * when `askedBy` took its request back: a request taken back is kept as long as its tell, so that
 * the other is told of the pair's requests at most once a week (review R2).
 */
export interface NeighborRow extends NeighborPair {
  askedBy: string;
  askedAt: number;
  acceptedAt: number | null;
  declinedAt: number | null;
  toldAt: number | null;
  withdrawnAt: number | null;
}

/** The pair of two servers in its order (snowflakes compared as numbers, never as text). */
export function neighborPair(one: string, other: string): NeighborPair {
  return BigInt(one) <= BigInt(other)
    ? { serverA: one, serverB: other }
    : { serverA: other, serverB: one };
}

/** The key of a pair, for a map. */
export function pairKey(pair: NeighborPair): string {
  return `${pair.serverA}:${pair.serverB}`;
}

/** The other server of a pair. */
export function otherOf(pair: NeighborPair, serverId: string): string {
  return pair.serverA === serverId ? pair.serverB : pair.serverA;
}

/**
 * What a row says now: an expired request, a request taken back and a decline a week old say
 * nothing any more.
 */
export type NeighborStanding = 'neighbors' | 'asked' | 'declined' | 'none';

export function neighborStanding(row: NeighborRow | undefined, now: number): NeighborStanding {
  if (row === undefined) return 'none';
  if (row.acceptedAt !== null) return 'neighbors';
  if (row.declinedAt !== null) {
    return now - row.declinedAt < NEIGHBOR_ASK_AGAIN_MS ? 'declined' : 'none';
  }
  if (row.withdrawnAt !== null) return 'none';
  return now - row.askedAt < NEIGHBOR_ASK_EXPIRES_MS ? 'asked' : 'none';
}

/**
 * When a row stops saying anything (`neighborStanding` is `none` from then on): never for
 * neighbors.
 */
export function neighborRowEnds(row: NeighborRow): number | undefined {
  if (row.acceptedAt !== null) return undefined;
  if (row.declinedAt !== null) return row.declinedAt + NEIGHBOR_ASK_AGAIN_MS;
  if (row.withdrawnAt !== null) return row.withdrawnAt;
  return row.askedAt + NEIGHBOR_ASK_EXPIRES_MS;
}

/**
 * Whether a row is kept (in memory and in the table): while it says something, and while its
 * tell keeps the other server from being told of the pair's requests again (`toldAt`, a week).
 * A row no longer kept is deleted by its key (`ServerNeighbors.sweep`, at the start and with the
 * upkeep).
 */
export function neighborRowKept(row: NeighborRow, now: number): boolean {
  const ends = neighborRowEnds(row);
  if (ends === undefined) return true;
  const toldEnds = row.toldAt === null ? -Infinity : row.toldAt + NEIGHBOR_ASK_EXPIRES_MS;
  return now < Math.max(ends, toldEnds);
}

/**
 * What an ask comes to. `asked` is what the asker hears whatever happened, so that it learns
 * nothing of the other server, and the same work is done for it whatever the other is (review
 * R1): `row` is written, the pair's row as it is when nothing changes (a request pending and told,
 * a decline less than a week old); `tell` whether the other's staff are told, after the write
 * (only a server Pine is in, may serve, and that is neither left nor in setup, and at most once a
 * week of the pair's requests, `toldAt`: review R2; a request written while the other could not
 * be told is told at a repeat ask once it can, review R5). The others the asker knows already:
 * its own server (`self`), neighbors already, a request the other sent it (`theirs`, in its own
 * moderators' bot lab), or as many neighbors and requests as it may have (`full`).
 */
export type AskDecision =
  | { kind: 'self' }
  | { kind: 'neighbors' }
  | { kind: 'theirs' }
  | { kind: 'full' }
  | { kind: 'asked'; row: NeighborRow; tell: boolean };

export function decideAsk(input: {
  asker: string;
  target: string;
  /** The pair's row, if any. */
  row: NeighborRow | undefined;
  now: number;
  /** The asker's neighbors and its own requests pending, this pair's left out. */
  count: number;
  /** Whether the other server's staff can be told. */
  reachable: boolean;
}): AskDecision {
  const { asker, target, now } = input;
  if (asker === target) return { kind: 'self' };
  // A server that declined the other's request may ask it back at once (review R4).
  const declinedByAsker =
    input.row !== undefined &&
    input.row.acceptedAt === null &&
    input.row.declinedAt !== null &&
    input.row.askedBy === target;
  const row = declinedByAsker ? undefined : input.row;
  const standing = neighborStanding(row, now);
  if (standing === 'neighbors') return { kind: 'neighbors' };
  if (standing === 'asked' && row?.askedBy === target) return { kind: 'theirs' };
  const mayTell = (toldAt: number | null) =>
    input.reachable && (toldAt === null || now - toldAt >= NEIGHBOR_ASK_EXPIRES_MS);
  if (row !== undefined && standing === 'declined') return { kind: 'asked', row, tell: false };
  if (row !== undefined && standing === 'asked') {
    const tell = mayTell(row.toldAt);
    return { kind: 'asked', row: tell ? { ...row, toldAt: now } : row, tell };
  }
  if (input.count >= NEIGHBORS_MAX) return { kind: 'full' };
  // A request anew: the tell of the asker's earlier request of this pair still counts.
  const toldAt = row !== undefined && row.askedBy === asker ? row.toldAt : null;
  const tell = mayTell(toldAt);
  return {
    kind: 'asked',
    row: {
      ...neighborPair(asker, target),
      askedBy: asker,
      askedAt: now,
      acceptedAt: null,
      declinedAt: null,
      toldAt: tell ? now : toldAt,
      withdrawnAt: null,
    },
    tell,
  };
}

/**
 * Whether the staff of `by` may answer the pair's request: only a request pending that the other
 * server sent (`expired` otherwise: a stale post, an answer given, a press from another server);
 * an acceptance that would give `by` more neighbors and requests than it may have is `full` (a
 * decline is never). `count`: `by`'s neighbors and own requests pending.
 */
export function decideAccept(input: {
  row: NeighborRow | undefined;
  by: string;
  now: number;
  count: number;
}): 'ok' | 'expired' | 'full' {
  const { row, by, now } = input;
  if (row === undefined || neighborStanding(row, now) !== 'asked') return 'expired';
  if (row.askedBy === by || (row.serverA !== by && row.serverB !== by)) return 'expired';
  return input.count >= NEIGHBORS_MAX ? 'full' : 'ok';
}

/** A server named by staff: its id, or an invite link to it (resolved by Discord). */
export type ServerRef = { kind: 'id'; id: string } | { kind: 'invite'; code: string };

/** A snowflake: 17 to 20 digits (as `isSnowflake` of `src/db/snowflake.ts`). */
const SNOWFLAKE = /^\d{17,20}$/;

/** An invite link: discord.gg/<code>, discord.com/invite/<code> or discordapp.com/invite/<code>. */
const INVITE =
  /^(?:https?:\/\/)?(?:www\.)?(?:discord\.gg|discord(?:app)?\.com\/invite)\/([A-Za-z0-9-]{2,32})\/?(?:\?\S*)?$/i;

/** What staff typed as a server: its id or an invite link; undefined for anything else. */
export function readServerRef(text: string): ServerRef | undefined {
  const typed = text.trim();
  if (SNOWFLAKE.test(typed)) return { kind: 'id', id: typed };
  const code = INVITE.exec(typed)?.[1];
  return code === undefined ? undefined : { kind: 'invite', code };
}
