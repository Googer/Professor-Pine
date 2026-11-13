import { gymStop, spotStop, type StopRef } from '../../src/domain/party/stops.js';
import { isDeepStrictEqual } from 'node:util';
import { loadSettings } from '../../src/config/settings.js';
import type {
  LeftoverCopies,
  PartyForum,
  PartyList,
  PartySave,
  PartyStorage,
  Saved,
} from '../../src/db/repositories/party-repository.js';
import { leftoversOf, type LeftoverCopy } from '../../src/domain/party/leftovers.js';
import type { HistoryNote, WrittenRecord } from '../../src/domain/history/party-history.js';
import { partyFromStored, partyMirrors, partyState } from '../../src/domain/party/party-state.js';
import type { DroppedPin } from '../../src/domain/geo/place.js';
import { createMax, type NewMax } from '../../src/domain/party/max.js';
import { createMeetup, type NewMeetup } from '../../src/domain/party/meetup.js';
import type {
  Attendee,
  MaxParty,
  PowerSpot,
  MeetupParty,
  Party,
  RaidParty,
  TrainParty,
} from '../../src/domain/party/party.js';
import { createRaid, type NewRaid } from '../../src/domain/party/raid.js';
import { createTrain, type NewTrain } from '../../src/domain/party/train.js';

import { PartyStatus } from '../../src/domain/party/status.js';
import { raidDurationRules, type RaidDurationRules } from '../../src/domain/time/raid-durations.js';
import { PartyStore, type PartyProvider } from '../../src/services/party-store.js';
import type { MemoryHistory } from './history.js';
import { raidEventsFixture } from './raid-events.js';
import { createTestLogger } from './test-logger.js';
import { TEST_SETTINGS_PATH } from './test-settings.js';
import { zonedAt } from './time.js';

export const PARTY_ZONE = 'America/New_York';
export const MINUTE = 60_000;

/** Snowflakes of invented members. */
export const REPORTER = '200000000000000001';
export const ALICE = '200000000000000002';
export const BOB = '200000000000000003';
export const CAROL = '200000000000000004';

/**
 * `REPORTER`, who made the test meetup and the test train, as who asks to set a time of one
 * (`TimesAsker`): its maker, no staff.
 */
export const AS_MAKER = { id: REPORTER, staff: false } as const;

/** Epoch ms of a wall-clock time in the zone of the test settings. */
export function at(iso: string): number {
  return zonedAt(iso, PARTY_ZONE);
}

/** Tuesday 13 October 2026, 14:00: a day without a Raid Hour or Raid Day. */
export const PARTY_NOW = at('2026-10-13T14:00');

/** The test settings with the events of the fixture feed. */
export function testRaidRules(): RaidDurationRules {
  return raidDurationRules(
    loadSettings(TEST_SETTINGS_PATH),
    raidEventsFixture().events(),
    PARTY_ZONE,
  );
}

/** The same rules, but a boss that hatches during a Raid Day stays `raidDayMinutes` (60 by default). */
export function testRaidRulesWithRaidDay(raidDayMinutes = 60): RaidDurationRules {
  const rules = testRaidRules();
  const { raidEvents } = rules.settings;
  return {
    ...rules,
    settings: {
      ...rules.settings,
      raidEvents: {
        ...raidEvents,
        hatchedDuration: { ...raidEvents.hatchedDuration, 'raid-day': raidDayMinutes },
      },
    },
  };
}

/**
 * A tier 5 egg at gym 1 of region 1, reported at `PARTY_NOW` by `REPORTER`, who is signed up
 * as interested. Nothing of it exists on Discord yet (no forum post).
 */
export function testRaid(
  overrides: Partial<NewRaid> = {},
  rules: RaidDurationRules = testRaidRules(),
): RaidParty {
  return createRaid(
    {
      id: '00000000-0000-4000-8000-000000000001',
      guildId: 1,
      regionId: 1,
      gymId: 1,
      createdById: REPORTER,
      anonymous: false,
      autoStatus: PartyStatus.Interested,
      tier: { level: 'T5', shadow: false },
      boss: null,
      now: PARTY_NOW,
      ...overrides,
    },
    rules,
  );
}

/**
 * A meetup called "Community Day picnic" in region 1, made at `PARTY_NOW` by `REPORTER`, who is
 * signed up as interested. It has no times, and nothing of it exists on Discord yet.
 */
export function testMeetup(overrides: Partial<NewMeetup> = {}): MeetupParty {
  const made = createMeetup({
    id: '00000000-0000-4000-8000-000000000002',
    guildId: 1,
    regionId: 1,
    createdById: REPORTER,
    name: 'Community Day picnic',
    now: PARTY_NOW,
    ...overrides,
  });
  if (!made.ok) throw new Error(`bad test meetup: ${made.reason}`);
  return made.party;
}

/**
 * A raid train called "Saturday legendaries" in region 1, made at `PARTY_NOW` by `REPORTER`,
 * who is signed up as interested. It has no route, no conductor, no boss and no times, and
 * nothing of it exists on Discord yet.
 */
export function testTrain(overrides: Partial<NewTrain> = {}): TrainParty {
  const made = createTrain({
    id: '00000000-0000-4000-8000-000000000003',
    guildId: 1,
    regionId: 1,
    createdById: REPORTER,
    name: 'Saturday legendaries',
    now: PARTY_NOW,
    ...overrides,
  });
  if (!made.ok) throw new Error(`bad test train: ${made.reason}`);
  return made.party;
}

/**
 * Stops of a route (plan 8X-4): a number is a gym by its id, a text a power spot by its Wayfarer
 * id.
 */
export function stops(...ids: readonly (number | string)[]): StopRef[] {
  return ids.map((id) => (typeof id === 'number' ? gymStop(id) : spotStop(id)));
}

/** A gym as a stop of a route (`gymStop`), for a test's short lines. */
export const gym = gymStop;

/**
 * A value with every gym stop (`{ kind: 'gym', id }`) written as its id, for expectations written
 * by gym ids, as the routes of tests before plan 8X-4 were; a power spot stays as it is. The very
 * same value where it holds no gym stop. Typed as the value it was given, for the matchers that
 * take it (only a test reads what comes of it).
 */
export function inGyms<T>(value: T): T {
  return gymsOf(value) as T;
}

function gymsOf(value: unknown): unknown {
  if (Array.isArray(value)) {
    const mapped = value.map((item: unknown) => gymsOf(item));
    return mapped.every((item, index) => item === value[index]) ? value : mapped;
  }
  if (typeof value !== 'object' || value === null) return value;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if (
    keys.length === 2 &&
    record.kind === 'gym' &&
    typeof record.id === 'number' &&
    keys.includes('id')
  ) {
    return record.id;
  }
  let changed = false;
  const mapped: Record<string, unknown> = {};
  for (const key of keys) {
    mapped[key] = gymsOf(record[key]);
    changed ||= mapped[key] !== record[key];
  }
  return changed ? mapped : value;
}

/**
 * An invented power spot in region 1 (West), as a max battle names it: its Wayfarer id, title,
 * place, address and picture.
 */
export const TEST_SPOT: PowerSpot = {
  kind: 'powerspot',
  id: 'c0ffee00c0ffee00c0ffee00c0ffee00.16',
  title: 'Gazebo of the Park',
  lat: 40.0005,
  lon: -80.0005,
  address: '1 Park Lane',
  image: null,
};

/** A pin in region 1 that no known power spot is near: an "Unlisted power spot". */
export const TEST_PIN: DroppedPin = {
  kind: 'pin',
  lat: 40.002,
  lon: -80.002,
  near: null,
  linkName: null,
};

/**
 * A Dynamax Machamp (2★) battle at `TEST_SPOT` in region 1, reported at `PARTY_NOW` by
 * `REPORTER`, who is signed up as interested, ending at 21:00 that day (the default last battle
 * time). Nothing of it exists on Discord yet.
 */
export function testMax(overrides: Partial<NewMax> = {}): MaxParty {
  return createMax({
    id: '00000000-0000-4000-8000-000000000004',
    guildId: 1,
    regionId: 1,
    createdById: REPORTER,
    anonymous: false,
    autoStatus: PartyStatus.Interested,
    tier: 'D2',
    boss: { key: 'machamp' },
    spot: TEST_SPOT,
    endTime: at('2026-10-13T21:00'),
    now: PARTY_NOW,
    ...overrides,
  });
}

/** The party as the max battle it is, for a test that reads or changes what only it has. */
export function asMax(party: Party | undefined): MaxParty {
  if (party?.type !== 'max') throw new Error(`not a max battle: ${party?.type ?? 'no party'}`);
  return party;
}

/** The party as the train it is, for a test that reads or changes what only a train has. */
export function asTrain(party: Party | undefined): TrainParty {
  if (party?.type !== 'train') throw new Error(`not a train: ${party?.type ?? 'no party'}`);
  return party;
}

/** The party as the raid it is, for a test that reads or changes what only a raid has. */
export function asRaid(party: Party | undefined): RaidParty {
  if (party?.type !== 'raid') throw new Error(`not a raid: ${party?.type ?? 'no party'}`);
  return party;
}

/** The party as the meetup it is, for a test that reads or changes what only a meetup has. */
export function asMeetup(party: Party | undefined): MeetupParty {
  if (party?.type !== 'meetup') throw new Error(`not a meetup: ${party?.type ?? 'no party'}`);
  return party;
}

/** The party with these attendees added or replaced; each defaults to coming, alone, group A. */
export function withAttendees<P extends Party>(
  party: P,
  attendees: Record<string, Partial<Attendee>>,
): P {
  const added: Record<string, Attendee> = {};
  for (const [memberId, attendee] of Object.entries(attendees)) {
    added[memberId] = {
      number: 1,
      status: PartyStatus.Coming,
      group: 'A',
      remote: false,
      ...attendee,
    };
  }
  return { ...party, attendees: { ...party.attendees, ...added } };
}

/** Throws unless the party reads back from its stored form exactly as it is. */
function survivesStorage(party: Party): void {
  const { anonymous: _anonymous, attendees: _attendees, groups: _groups, ...rest } = party;
  const { defaultGroupId: _defaultGroupId, prompts: _prompts, ...kept } = rest;
  // The details of its kind are in the document, the rest are the columns.
  const columns = Object.fromEntries(
    Object.entries(kept).filter(
      ([key]) => !['raid', 'timed', 'meetup', 'train', 'max'].includes(key),
    ),
  ) as typeof kept;
  const document: unknown = JSON.parse(JSON.stringify(partyState(party)));
  const mirrors: unknown = JSON.parse(JSON.stringify(partyMirrors(party)));
  const back = partyFromStored(columns, document, mirrors);
  if (!back.ok) throw new Error(`This party would not survive storage: ${back.problem}`);
  if (!isDeepStrictEqual(back.party, party)) {
    throw new Error('This party would not survive storage: it reads back differently');
  }
}

/**
 * A `PartyStorage` kept in memory, for tests of what is built on the store. It follows
 * `PartyRepository`, whose behaviour party-repository.db.test.ts pins down: a second row with
 * the same id or the same post is refused (by `save` too, not counting the row itself), and
 * `save` says whether the row exists. It keeps the objects themselves, but it does notice what
 * would not survive the real state document: every `insert`, `save` and `saveBoth` runs the
 * party through the writers and the reader and rejects when what comes back is not the party
 * given. Set `failing` to make every call reject.
 */
export class MemoryPartyStorage implements PartyStorage, LeftoverCopies {
  failing: Error | undefined;
  readonly rows = new Map<string, Party>();
  /** What ended parties left on Discord (`EndedPartyCopy`), by message id, written with their end. */
  readonly leftovers = new Map<string, LeftoverCopy>();
  /** Every party written, in order: `insert`, `save` and `saveBoth` calls. */
  readonly writes: Party[] = [];
  /** Where the notes of the party history go, as `PartyRepository` writes them with the party. */
  history: MemoryHistory | undefined;
  /** Told of a note that could not be written, as `PartyRepository`'s `historyFailed`. */
  historyFailed: ((note: HistoryNote, err: unknown) => void) | undefined;
  /** The ids of rows that read back as unreadable (`readParty` of the party history). */
  readonly unreadable = new Set<string>();

  constructor(parties: readonly Party[] = []) {
    for (const party of parties) this.rows.set(party.id, party);
  }

  private attempt<T>(work: () => T): Promise<T> {
    return new Promise((resolve, reject) => {
      // Like a real query, the answer never comes in the same turn of the event loop.
      setImmediate(() => {
        if (this.failing) reject(this.failing);
        else {
          try {
            resolve(work());
          } catch (err) {
            reject(err instanceof Error ? err : new Error(String(err)));
          }
        }
      });
    });
  }

  /** Whether a row other than this party's own has the party's forum post (a unique key). */
  private postTaken(party: Party): boolean {
    return [...this.rows.values()].some(
      (row) =>
        row.id !== party.id && party.forumPostId !== null && row.forumPostId === party.forumPostId,
    );
  }

  insert(party: Party, note?: HistoryNote): Promise<void> {
    return this.attempt(() => {
      survivesStorage(party);
      if (this.rows.has(party.id) || this.postTaken(party)) throw new Error('Duplicate entry');
      this.rows.set(party.id, party);
      this.writes.push(party);
      this.noted(note);
    });
  }

  save(party: Party, note?: HistoryNote): Promise<Saved> {
    return this.attempt((): Saved => {
      if (!this.rows.has(party.id)) return false;
      survivesStorage(party);
      if (this.postTaken(party)) throw new Error('Duplicate entry');
      this.rows.set(party.id, party);
      this.writes.push(party);
      this.leftBehind(party);
      return { recorded: this.noted(note) };
    });
  }

  /**
   * Both parties or neither, as the repository's transaction: a row that is gone, a party that
   * would not survive storage or a post taken writes neither; the notes follow both writes.
   */
  saveBoth(writes: readonly [PartySave, PartySave]): Promise<[boolean, boolean]> {
    return this.attempt((): [boolean, boolean] => {
      const found: [boolean, boolean] = [
        this.rows.has(writes[0].party.id),
        this.rows.has(writes[1].party.id),
      ];
      if (!found[0] || !found[1]) return found;
      for (const { party } of writes) {
        survivesStorage(party);
        if (this.postTaken(party)) throw new Error('Duplicate entry');
      }
      // The unique key holds between the two as well.
      const [first, second] = writes;
      if (
        first.party.forumPostId !== null &&
        first.party.forumPostId === second.party.forumPostId
      ) {
        throw new Error('Duplicate entry');
      }
      for (const { party } of writes) {
        this.rows.set(party.id, party);
        this.writes.push(party);
        this.leftBehind(party);
      }
      for (const { note } of writes) this.noted(note);
      return found;
    });
  }

  /** An ended party's leftovers, kept with its write as the repository keeps them. */
  private leftBehind(party: Party): void {
    for (const copy of leftoversOf(party)) {
      if (!this.leftovers.has(copy.messageId)) this.leftovers.set(copy.messageId, copy);
    }
  }

  leftoverCopies(): Promise<LeftoverCopy[]> {
    return this.attempt(() =>
      [...this.leftovers.values()].sort(
        (a, b) =>
          a.endedAt - b.endedAt ||
          a.partyId.localeCompare(b.partyId) ||
          a.messageId.localeCompare(b.messageId),
      ),
    );
  }

  copiesGone(messageIds: readonly string[]): Promise<void> {
    return this.attempt(() => {
      for (const id of messageIds) this.leftovers.delete(id);
    });
  }

  /**
   * Writes a note after its party, as the repository does behind a savepoint; answers the record
   * it wrote, none where it failed (handed to `historyFailed`).
   */
  private noted(note: HistoryNote | undefined): WrittenRecord | undefined {
    if (note === undefined || this.history === undefined) return undefined;
    try {
      return this.history.apply(note);
    } catch (err) {
      if (!this.historyFailed) throw err;
      this.historyFailed(note, err);
      return undefined;
    }
  }

  /** As the repository: the rows of ended parties, and the posts of those deleted once recorded. */
  endedPosts(forumPostIds: readonly string[]): Promise<string[]> {
    return this.attempt(() => [
      ...new Set(
        [
          ...[...this.rows.values()]
            .filter((party) => party.status === 'ended' && party.forumPostId !== null)
            .map((party) => party.forumPostId ?? ''),
          ...(this.history?.posts.keys() ?? []),
        ].filter((id) => forumPostIds.includes(id)),
      ),
    ]);
  }

  partyForums(only?: number): Promise<PartyForum[]> {
    return this.attempt(() => {
      const seen = new Map<string, PartyForum>();
      const forums = [
        ...this.rows.values(),
        ...(this.history ? [...this.history.posts.values()] : []),
      ];
      for (const { forumChannelId, guildId } of forums) {
        if (forumChannelId !== null && (only === undefined || guildId === only)) {
          seen.set(`${guildId}:${forumChannelId}`, { forumChannelId, guildId });
        }
      }
      return [...seen.values()];
    });
  }

  /**
   * What the table's foreign key does when a region's row is deleted: the rows of its parties
   * lose their region. The parties a store holds in memory are not touched, as in the bot.
   */
  dropRegion(regionId: number): void {
    for (const [id, party] of this.rows) {
      if (party.regionId === regionId) this.rows.set(id, { ...party, regionId: null });
    }
  }

  listActive(): Promise<PartyList> {
    return this.attempt(() => ({
      parties: [...this.rows.values()]
        .filter((party) => party.status === 'active')
        .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id)),
      unreadable: [],
    }));
  }
}

/** A loaded store over these parties, with its storage and what it logged. */
export async function partyStoreWith(parties: readonly Party[] = [], now?: () => number) {
  const storage = new MemoryPartyStorage(parties);
  const { log, entries } = createTestLogger();
  const store = new PartyStore({ storage, log, ...(now ? { now } : {}) });
  await store.load();
  return { store, storage, entries };
}

/** What `createTestContext` has for `ctx.parties`: no party anywhere. */
export function noParties(): PartyProvider {
  return {
    get: () => undefined,
    byPost: () => undefined,
    active: () => [],
    inRegion: () => [],
    raidAt: () => undefined,
    maxAt: () => undefined,
  };
}
