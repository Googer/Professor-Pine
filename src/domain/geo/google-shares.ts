import type { GoogleBudget } from './google-line.js';

/**
 * Google's month shared between servers by need (plan 19B-5; spec "Fairness and limits"). Pure.
 *
 * A server's need is what of it waits in the line (its rows of `ServerGymLookup` and
 * `ServerWayspotLookup`: places questions; of them the gyms that wait for their address too:
 * geocodes). Its share of the month, of each kind, is its part of the line's month (places: the
 * budget above the reserve; addresses: the month's geocodes, which the line may use whole), less
 * what the servers that wait for none of that kind used of it this month (`monthToShare`, fix
 * round 4, R1), by its need over everyone's, and no more than it wants: what the line asked of its rows this month,
 * its need, and a tenth of its need over it (`SHARE_HEADROOM`, for rows that come during the
 * day). The half of the month binds only so far as the others can use the rest (fix round 3, T2,
 * the controller's ruling): a server may take `max(half, month − Σ others' min(want, half))`,
 * so no month is left unused while one server waits; and none more than `max`
 * (`googleServerShareMax`). What those limits leave goes to the others by their need; what is
 * over once every server has what it wants is shared by need too (up to `max`), so that a Pine of
 * one server gets the whole month and notices nothing. The shares add up to the month to the
 * question (largest remainder, fix round 4, R5), and a server that waits gets at least one
 * question as far as what the parts leave goes (`whole`). An operator's raise of this month is
 * added on top, past the half and the most.
 *
 * A share is a limit, not a promise: the month's budget and its pace (`lineAllowance`) still hold
 * for the whole line, and lookups by hand and `/find-region`'s maps have floors of their own
 * (`withinFloors`).
 */

/** What of a server waits in the line: places questions, and of them addresses. */
export interface ShareNeed {
  places: number;
  geocodes: number;
}

/** A server's share of the month, in questions of each kind. */
export interface MonthShare {
  places: number;
  geocodes: number;
}

/**
 * How far over its need a server's share may go while the month is short: a tenth of what waits,
 * rounded down (none under ten), for rows that come before the shares are worked out again.
 */
export const SHARE_HEADROOM = 0.1;

export interface MonthSharesInput {
  /** Each server's need, by its `Guild` row. */
  needs: ReadonlyMap<number, ShareNeed>;
  /** What the line asked of each server's rows this month so far; none unless given. */
  used?: ReadonlyMap<number, MonthShare>;
  budget: GoogleBudget;
  /** The most of one server, of each kind (`googleServerShareMax`); unset: none. */
  max?: number;
  /** What operators added to servers' shares this month, by `Guild` row. */
  raises: ReadonlyMap<number, number>;
}

/**
 * What of the month is shared out between the servers that wait, of each kind (fix round 4, R1):
 * the line's month (places: the budget above the reserve; addresses: the month's geocodes) less
 * what the servers that wait for none of that kind used of it this month, which is theirs and
 * not shared out again; never below nothing. A server that waits keeps its own use in what it
 * wants.
 */
export function monthToShare(
  input: Pick<MonthSharesInput, 'needs' | 'used' | 'budget'>,
): MonthShare {
  const { needs, used = new Map<number, MonthShare>(), budget } = input;
  const left = (kind: keyof MonthShare, month: number) => {
    let gone = 0;
    for (const [guildId, counts] of used) {
      if ((needs.get(guildId)?.[kind] ?? 0) === 0) gone += counts[kind];
    }
    return Math.max(0, month - gone);
  };
  return {
    places: left('places', Math.max(0, budget.places - budget.reserve)),
    geocodes: left('geocodes', budget.geocodes),
  };
}

/** Every server's share of the month: those with a need or a raise. */
export function monthShares(input: MonthSharesInput): Map<number, MonthShare> {
  const { needs, used = new Map<number, MonthShare>(), max, raises } = input;
  const month = monthToShare(input);
  const places = shareOut(month.places, servers(needs, used, 'places'), max);
  const geocodes = shareOut(month.geocodes, servers(needs, used, 'geocodes'), max);
  const shares = new Map<number, MonthShare>();
  for (const guildId of new Set([...needs.keys(), ...raises.keys()])) {
    const raise = raises.get(guildId) ?? 0;
    shares.set(guildId, {
      places: (places.get(guildId) ?? 0) + raise,
      geocodes: (geocodes.get(guildId) ?? 0) + raise,
    });
  }
  return shares;
}

/** A server that waits for a kind: its need of it, and what the line asked of it this month. */
interface Waiting {
  need: number;
  used: number;
}

function servers(
  needs: ReadonlyMap<number, ShareNeed>,
  used: ReadonlyMap<number, MonthShare>,
  kind: keyof ShareNeed,
): Map<number, Waiting> {
  const waiting = new Map<number, Waiting>();
  for (const [guildId, need] of needs) {
    if (need[kind] > 0)
      waiting.set(guildId, { need: need[kind], used: used.get(guildId)?.[kind] ?? 0 });
  }
  return waiting;
}

function sum(values: Iterable<number>): number {
  let total = 0;
  for (const value of values) total += value;
  return total;
}

/**
 * The month of one kind shared by need: each server first up to its limit (what it wants, the
 * half or what the others leave, the most), then what is over by need up to the most.
 */
function shareOut(
  month: number,
  waiting: ReadonlyMap<number, Waiting>,
  max: number | undefined,
): Map<number, number> {
  if (waiting.size === 0) return new Map();
  const most = max ?? Number.POSITIVE_INFINITY;
  const half = waiting.size >= 2 ? Math.floor(month / 2) : month;
  const wants = new Map(
    [...waiting].map(([guildId, { need, used }]): [number, number] => [
      guildId,
      used + need + Math.floor(need * SHARE_HEADROOM),
    ]),
  );
  // What each server claims of the month against the others: what it wants, at most its half.
  const claims = new Map(
    [...wants].map(([guildId, want]): [number, number] => [guildId, Math.min(want, half, most)]),
  );
  const claimed = sum(claims.values());
  const limits = new Map(
    [...wants].map(([guildId, want]): [number, number] => [
      guildId,
      Math.min(want, Math.max(half, month - (claimed - (claims.get(guildId) ?? 0))), most),
    ]),
  );
  const weights = new Map(
    [...waiting].map(([guildId, { need }]): [number, number] => [guildId, need]),
  );
  const first = fill(month, weights, limits);
  const over = month - sum(first.values());
  const second =
    over > 1e-9
      ? fill(
          over,
          weights,
          new Map([...first].map(([guildId, part]): [number, number] => [guildId, most - part])),
        )
      : new Map<number, number>();
  const parts = new Map(
    [...waiting.keys()].map((guildId): [number, number] => [
      guildId,
      (first.get(guildId) ?? 0) + (second.get(guildId) ?? 0),
    ]),
  );
  return whole(parts, month);
}

/**
 * The parts in whole questions that add up to what the parts do, to the question (fix round 4,
 * R5): each part rounded down, and the questions that leaves given one each, first to the servers
 * whose part rounded down to none (the minimum of one question for a server that waits, so taken
 * only out of what the parts leave), then by the largest remainder (the lower `Guild` row on a
 * tie). What the month has over the parts (the most held every server below it) gives a server
 * still at none its one question too, as far as it goes; never past the month.
 */
function whole(parts: ReadonlyMap<number, number>, month: number): Map<number, number> {
  const shares = new Map<number, number>();
  for (const [guildId, part] of parts) shares.set(guildId, Math.floor(part + 1e-9));
  const total = Math.min(month, Math.round(sum(parts.values())));
  let left = total - sum(shares.values());
  const order = [...parts]
    .map(([guildId, part]) => ({
      guildId,
      none: (shares.get(guildId) ?? 0) === 0,
      remainder: part - (shares.get(guildId) ?? 0),
    }))
    .sort(
      (a, b) =>
        Number(b.none) - Number(a.none) || b.remainder - a.remainder || a.guildId - b.guildId,
    );
  for (const { guildId } of order) {
    if (left <= 0) break;
    shares.set(guildId, (shares.get(guildId) ?? 0) + 1);
    left--;
  }
  let over = month - sum(shares.values());
  for (const { guildId } of order) {
    if (over <= 0) break;
    if ((shares.get(guildId) ?? 0) > 0) continue;
    shares.set(guildId, 1);
    over--;
  }
  return shares;
}

/**
 * `amount` shared by weight, each at most its limit: a server whose part reaches its limit is
 * held to it, and the rest is shared again among the others, until no part reaches one.
 */
function fill(
  amount: number,
  weights: ReadonlyMap<number, number>,
  limits: ReadonlyMap<number, number>,
): Map<number, number> {
  const parts = new Map<number, number>();
  const open = new Map(weights);
  let left = amount;
  while (open.size > 0) {
    const total = sum(open.values());
    const held = [...open].filter(
      ([guildId, weight]) => (left * weight) / total >= (limits.get(guildId) ?? 0),
    );
    if (held.length === 0) {
      for (const [guildId, weight] of open) parts.set(guildId, (left * weight) / total);
      return parts;
    }
    for (const [guildId] of held) {
      const limit = limits.get(guildId) ?? 0;
      parts.set(guildId, limit);
      open.delete(guildId);
      left -= limit;
    }
  }
  return parts;
}

/**
 * Each server's floor of the lookups by hand and of `/find-region`'s maps a month unless the
 * settings say otherwise (`settings.googleByHandPerServer`; fix round 3, T3): a few a week, kept
 * for each server out of the instance's cap (`googleByHandPerMonth`, 500).
 */
export const DEFAULT_BY_HAND_FLOOR = 20;

/**
 * A server's floor of a monthly cap (`googleByHandPerServer`; fix round 3, T3): `floor`, scaled
 * down when the floors of every server add up to more than the cap.
 */
export function serverFloor(cap: number, floor: number, servers: number): number {
  return Math.min(floor, Math.floor(cap / Math.max(1, servers)));
}

/** What `withinFloors` works from: a monthly cap of the instance and the servers' floors of it. */
export interface FloorsInput {
  /** The instance's cap of the month (`googleByHandPerMonth`). */
  cap: number;
  /** Each server's floor (`googleByHandPerServer`), scaled down by `serverFloor`. */
  floor: number;
  /** The servers Pine is in (`Guild` rows), each with its floor; the server asking counts too. */
  servers: readonly number[];
  /** A server's of this month, those on their way and the one asked for included. */
  usedOf: (guildId: number) => number;
  /** The instance's of this month, those on their way and the one asked for included. */
  total: number;
  /** The server asking; none: it takes only from what the floors leave. */
  guildId?: number | undefined;
}

/**
 * Whether one more of a monthly cap shared by floors may be taken (lookups by hand, maps of
 * `/find-region`; fix round 3, T3, the controller's ruling: the spec's "small floor"): never past
 * the cap; a server under its floor always; above it, only of what the cap leaves after the other
 * servers' unused floors. A Pine of one server has the whole cap.
 */
export function withinFloors(input: FloorsInput): boolean {
  const { cap, floor, usedOf, total, guildId } = input;
  if (total > cap) return false;
  const servers = new Set(input.servers);
  if (guildId !== undefined) servers.add(guildId);
  const each = serverFloor(cap, floor, servers.size);
  if (guildId !== undefined && usedOf(guildId) <= each) return true;
  let kept = 0;
  for (const server of servers) {
    if (server !== guildId) kept += Math.max(0, each - usedOf(server));
  }
  return total + kept <= cap;
}
