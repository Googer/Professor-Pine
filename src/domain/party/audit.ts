import { z } from 'zod';
import type { PartyEnd } from '../history/party-history.js';
import type { PostRemoval } from '../moderation/reports.js';
import { maxTierLabel } from '../pogo/max-tier.js';
import { raidTierLabel, raidWords } from '../pogo/raid-tier.js';
import { maxSpotName } from './max.js';
import {
  isMax,
  isMeetup,
  isRaid,
  isTimed,
  isTrain,
  PARTY_TYPES,
  TRAIN_KINDS,
  type Party,
  type RaidBossRef,
} from './party.js';
import type { StopRef } from './stops.js';

/**
 * The staff audit log of parties (Matt, 2026-11-07): what of a party's changes `/audit` shows,
 * as facts (`detail`), worded when read (`src/render/audit.ts`). Recorded: how a party was made
 * (or moved here from another region), its boss and tier and a raid's moves, its gym or Power
 * Spot, its hatch, start and end, a timed party's name and that its information changed, a
 * train's stops added or removed and a cleared route, its conductor, `/admin save-party`, and how
 * it ended. Not: attendance, groups, meeting times, a train's movement.
 */

/**
 * A member as the log names them: by id, and by the name the bot had for them then. The id is a
 * snowflake of at most 30 characters, as the indexes on a conductor's `$.from.id` and `$.to.id`
 * hold it (migration 057, cast to `char(30)`): the database refuses an entry with a longer one,
 * so widening it is a decision of a migration, never of this schema alone.
 */
const loggedMember = z.object({ id: z.string().max(30), name: z.string().optional() });
export type LoggedMember = z.infer<typeof loggedMember>;

const time = z.number().nullable();
const fromTo = <T extends z.ZodType>(value: T) => z.object({ from: value, to: value });

/** Every kind of entry, its facts as they are kept in `PartyAudit.detail`. */
const DETAILS = {
  /** Made, as it was then: what (a raid's or max battle's tier and boss), where, its times. */
  created: z.object({
    kind: z.enum(PARTY_TYPES),
    what: z.string().optional(),
    boss: z.string().nullable().optional(),
    /** A raid reported hatched whose boss nobody could tell: no egg. */
    hatched: z.boolean().optional(),
    name: z.string().optional(),
    place: z.string().nullable(),
    anonymous: z.boolean(),
    hatch: time,
    end: time,
    start: time,
  }),
  /** A raid that moved here from another region: the party it was, its gym and channel there. */
  moved: z.object({
    kind: z.enum(PARTY_TYPES),
    fromParty: z.string(),
    fromPlace: z.string().nullable(),
    fromChannel: z.string().nullable(),
  }),
  /**
   * The boss and tier, as `Yveltal (T5)`, `T5 egg`, `Machamp (Dynamax 2★)`; a train's boss by
   * name, `none` for none.
   */
  boss: fromTo(z.string()),
  /** A raid boss's moves, `Snarl / Hurricane` (`?` for one not known). */
  moves: fromTo(z.string()),
  /** A raid's gym in its own region, a max battle's spot: by name, null for one not known. */
  place: fromTo(z.string().nullable()),
  hatch: fromTo(time),
  start: fromTo(time),
  end: fromTo(time),
  name: fromTo(z.string()),
  /** A meetup's information changed (what it says is not kept). */
  info: z.object({}),
  /** A stop of a train's route, by name; null for one Pine no longer knows. */
  /**
   * One change of a train's route: the stops it added and removed, by name (null for one Pine no
   * longer knows), counted (a stop twice in the route is two).
   */
  route: z.object({
    added: z.array(z.string().nullable()),
    removed: z.array(z.string().nullable()),
  }),
  'route-cleared': z.object({}),
  conductor: fromTo(loggedMember.nullable()),
  /** What a train is mainly for (Manage…'s kind). */
  kind: fromTo(z.enum(TRAIN_KINDS)),
  /** `/admin save-party`: kept from the clock, or let go again. */
  saved: z.object({ saved: z.boolean() }),
  /**
   * How it ended: by the clock; closed (by staff or the moderators, with their choice for the
   * post; or by whoever, without); moved to another region (where to); or its post could not be
   * made (`failed`).
   */
  ended: z.object({
    how: z.enum(['clock', 'closed', 'moved', 'failed']),
    by: z.enum(['staff', 'moderators']).optional(),
    removal: z.enum(['archive', 'delete']).optional(),
    toPlace: z.string().nullable().optional(),
    toChannel: z.string().nullable().optional(),
  }),
} as const;

export type AuditAction = keyof typeof DETAILS;

/** Facts as a schema infers them; none for an action without (zod infers those as `Record`). */
type Facts<T> = string extends keyof T ? Record<never, never> : T;

/** An entry of the log: its action and its facts. */
export type AuditEntry = {
  [A in AuditAction]: { action: A } & Facts<z.infer<(typeof DETAILS)[A]>>;
}[AuditAction];

/** What the log asks of the bot to name what a party holds by id, as it is named now. */
export interface AuditNames {
  gym(id: number): string | undefined;
  /** A Power Spot by its Wayfarer id. */
  spot(id: string): string | undefined;
  boss(ref: RaidBossRef): string;
  move(id: string): string | undefined;
  /** The channel of a region, by the region's id. */
  channel(regionId: number): string | undefined;
}

/** What else a change says, beyond the party before and after it. */
export interface AuditHow {
  /** Why it ended, as the store was told (`PartyEnd`). */
  ended?: PartyEnd | undefined;
  /** What was chosen for the post of a party that staff or the moderators closed. */
  removal?: PostRemoval | undefined;
  /** For a party added by a move to another region: the party it was. */
  movedFrom?: Party | undefined;
  /** For a party that ended by a move to another region: the party it goes on as. */
  movedTo?: Party | undefined;
}

/** A party's place by name: a raid's gym, a max battle's spot, a meetup's place. */
function placeOf(party: Party, names: AuditNames): string | null {
  if (isRaid(party)) return party.gymId === null ? null : (names.gym(party.gymId) ?? null);
  if (isMax(party)) return maxSpotName(party.max.spot);
  if (isMeetup(party)) {
    const { place } = party.meetup;
    if (place === null) return null;
    if (place.kind !== 'pin') return place.title;
    return place.near === null ? 'a dropped pin' : `a pin near ${place.near.title}`;
  }
  return null;
}

/** The boss and tier of a raid or max battle in words; undefined for any other party. */
function bossWords(party: Party, names: AuditNames): string | undefined {
  if (isRaid(party)) {
    const tier = raidTierLabel(party.raid.tier);
    const { boss } = party.raid;
    return boss === null ? `${tier} egg` : `${names.boss(boss)} (${tier})`;
  }
  if (isMax(party)) return `${names.boss(party.max.boss)} (${maxTierLabel(party.max.tier)})`;
  if (isTrain(party)) return party.train.boss === null ? 'none' : names.boss(party.train.boss);
  return undefined;
}

function movesWords(party: Party, names: AuditNames): string | undefined {
  if (!isRaid(party)) return undefined;
  const name = (id: string | null) => (id === null ? '?' : (names.move(id) ?? '?'));
  return `${name(party.raid.fastMove)} / ${name(party.raid.chargedMove)}`;
}

function stopName(stop: StopRef, names: AuditNames): string | null {
  return (stop.kind === 'gym' ? names.gym(stop.id) : names.spot(stop.id)) ?? null;
}

const stopKey = (stop: StopRef): string => `${stop.kind}:${String(stop.id)}`;

/** The stops of `a` that `b` lacks, counted: a stop twice in `a` and once in `b` once. */
function stopsLacking(a: readonly StopRef[], b: readonly StopRef[]): StopRef[] {
  const left = new Map<string, number>();
  for (const stop of b) left.set(stopKey(stop), (left.get(stopKey(stop)) ?? 0) + 1);
  return a.filter((stop) => {
    const count = left.get(stopKey(stop)) ?? 0;
    if (count === 0) return true;
    left.set(stopKey(stop), count - 1);
    return false;
  });
}

function conductorOf(party: Party): LoggedMember | null {
  if (!isTrain(party) || party.train.conductorId === null) return null;
  const id = party.train.conductorId;
  const name = party.attendees[id]?.name;
  return name === undefined ? { id } : { id, name };
}

/** How a party was made, or moved here. */
function creation(party: Party, names: AuditNames, movedFrom: Party | undefined): AuditEntry {
  if (movedFrom !== undefined) {
    return {
      action: 'moved',
      fromParty: movedFrom.id,
      fromPlace: placeOf(movedFrom, names),
      fromChannel: movedFrom.regionId === null ? null : (names.channel(movedFrom.regionId) ?? null),
      kind: party.type,
    };
  }
  const what = isRaid(party)
    ? {
        what: raidWords(party.raid.tier),
        boss: party.raid.boss === null ? null : names.boss(party.raid.boss),
        ...(party.raid.boss === null && party.raid.reportedHatched ? { hatched: true } : {}),
      }
    : isMax(party)
      ? {
          what: `${maxTierLabel(party.max.tier)} max battle`,
          boss: names.boss(party.max.boss),
        }
      : isTimed(party)
        ? { name: party.timed.name }
        : {};
  return {
    action: 'created',
    kind: party.type,
    ...what,
    place: placeOf(party, names),
    anonymous: party.anonymous,
    hatch: party.hatchTime,
    end: party.endTime,
    start: isTimed(party) ? party.timed.startTime : null,
  };
}

/** How a party ended, from what the store was told. */
function ending(how: AuditHow, names: AuditNames): AuditEntry {
  const { ended, removal, movedTo } = how;
  if (ended?.how === 'clock') return { action: 'ended', how: 'clock' };
  if (ended?.how === 'failed') return { action: 'ended', how: 'failed' };
  if (ended?.how === 'moved') {
    return {
      action: 'ended',
      how: 'moved',
      toPlace: movedTo === undefined ? null : placeOf(movedTo, names),
      toChannel:
        movedTo?.regionId === undefined || movedTo.regionId === null
          ? null
          : (names.channel(movedTo.regionId) ?? null),
    };
  }
  return {
    action: 'ended',
    how: 'closed',
    ...(ended?.by === undefined ? {} : { by: ended.by }),
    ...(removal === undefined ? {} : { removal }),
  };
}

/**
 * The entries a stored change makes in the log (`before` undefined: the party was added), in
 * the order: how it was made; its boss, moves, place, hatch, name, start, end, information,
 * route, conductor, kept; how it ended. None for a change of nothing the log keeps.
 */
export function auditEntries(
  before: Party | undefined,
  after: Party,
  names: AuditNames,
  how: AuditHow = {},
): AuditEntry[] {
  if (before === undefined) return [creation(after, names, how.movedFrom)];
  const entries: AuditEntry[] = [];
  const changed = <T>(of: (party: Party) => T, same: (a: T, b: T) => boolean = Object.is) => {
    const from = of(before);
    const to = of(after);
    return same(from, to) ? undefined : { from, to };
  };
  const boss = changed((party) => bossWords(party, names));
  if (boss?.from !== undefined && boss.to !== undefined) {
    entries.push({ action: 'boss', from: boss.from, to: boss.to });
  }
  const moves = changed((party) => movesWords(party, names));
  if (moves?.from !== undefined && moves.to !== undefined) {
    entries.push({ action: 'moves', from: moves.from, to: moves.to });
  }
  const place = changed(
    (party) => (isRaid(party) ? party.gymId : isMax(party) ? party.max.spot : undefined),
    (a, b) => JSON.stringify(a) === JSON.stringify(b),
  );
  if (place) {
    entries.push({ action: 'place', from: placeOf(before, names), to: placeOf(after, names) });
  }
  const hatch = changed((party) => party.hatchTime);
  if (hatch) entries.push({ action: 'hatch', ...hatch });
  if (isTimed(before) && isTimed(after)) {
    if (before.timed.name !== after.timed.name) {
      entries.push({ action: 'name', from: before.timed.name, to: after.timed.name });
    }
    if (before.timed.startTime !== after.timed.startTime) {
      entries.push({ action: 'start', from: before.timed.startTime, to: after.timed.startTime });
    }
  }
  const end = changed((party) => party.endTime);
  if (end) entries.push({ action: 'end', ...end });
  if (
    isMeetup(before) &&
    isMeetup(after) &&
    before.meetup.description !== after.meetup.description
  ) {
    entries.push({ action: 'info' });
  }
  if (isTrain(before) && isTrain(after) && before.train.route !== after.train.route) {
    const was = before.train.route;
    const now = after.train.route;
    if (now.length === 0 && was.length > 0) entries.push({ action: 'route-cleared' });
    else {
      const added = stopsLacking(now, was).map((stop) => stopName(stop, names));
      const removed = stopsLacking(was, now).map((stop) => stopName(stop, names));
      if (added.length > 0 || removed.length > 0) entries.push({ action: 'route', added, removed });
    }
  }
  const conductor = changed(conductorOf, (a, b) => a?.id === b?.id);
  if (conductor) entries.push({ action: 'conductor', ...conductor });
  if (isTrain(before) && isTrain(after) && before.train.kind !== after.train.kind) {
    entries.push({ action: 'kind', from: before.train.kind, to: after.train.kind });
  }
  if (before.saved !== after.saved) entries.push({ action: 'saved', saved: after.saved });
  if (before.status === 'active' && after.status === 'ended') entries.push(ending(how, names));
  return entries;
}

/** What an entry keeps as its `detail`: its facts without the action; null for none. */
export function auditDetail(entry: AuditEntry): Record<string, unknown> | null {
  const { action: _action, ...detail } = entry;
  return Object.keys(detail).length === 0 ? null : detail;
}

function isAuditAction(action: string): action is AuditAction {
  return Object.hasOwn(DETAILS, action);
}

/** An entry read back from its action and `detail`; undefined for one it cannot read. */
export function auditEntryOf(action: string, detail: unknown): AuditEntry | undefined {
  if (!isAuditAction(action)) return undefined;
  const parsed = DETAILS[action].safeParse(detail ?? {});
  return parsed.success ? ({ action, ...parsed.data } as AuditEntry) : undefined;
}
