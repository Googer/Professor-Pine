import { isWayfarerId } from '@pine/wayspot-core/export-file';
import { z } from 'zod';
import { MAX_LINK_NAME, MAX_PLACE_TITLE } from '../geo/place.js';
import { MAX_TIERS } from '../pogo/max-tier.js';
import { RAID_LEVELS, RETIRED_EX_LEVEL, raidTier } from '../pogo/raid-tier.js';
import {
  GROUP_IDS,
  MAX_COMPLETION_PROMPTS,
  MAX_MEETUP_DESCRIPTION,
  MAX_PARTY_NAME,
  MAX_MEMBER_NAME,
  MAX_ROUTE_STOPS,
  MAX_SPLITS_KEPT,
  MIRROR_KINDS,
  TEAMS,
  TRAIN_AT_END,
  TRAIN_KINDS,
  inLetterOrder,
  isPartyType,
  type Attendee,
  type MirrorMessage,
  type Party,
  type PartyCore,
} from './party.js';
import { PartyStatus } from './status.js';
import { gymStop, stopKey, type StopRef } from './stops.js';

/**
 * The version written into every state document. The reader accepts exactly this version, so
 * raising the number alone makes every stored party unreadable. A change of shape needs a new
 * version together with a reader for the old one that upgrades it. Any new field is a new
 * version too: fields the schema does not know are dropped when a document is read. After a
 * rollback the old code cannot read rows the new code wrote.
 *
 * Version 2 (plan 2D-1) added an attendee's `name` and `team` and the party's `prompts`; a
 * version 1 document is read as one without them. Version 3 (plan 2D-2) added an attendee's
 * `askedBy` and made a completion question a record of its message and the members it asked; a
 * question of a version 2 document is read as one that asked nobody in particular. Version 4
 * (plan 3A) added `timed` (the name and the start of a party that has them) and `meetup` (what
 * only a meetup has) beside `raid`: a document has the parts that fit its party's type and no
 * others. Version 5 (plan 3B) added `train` (the route, the stop the train is at, its conductor
 * and its boss): a train is `timed` and `train`. Version 6 (plan 3C) added a train's
 * `finishedFrom` (the stop its route was finished from); a train of a version 5 document
 * remembers none. Version 7 added `makerName` (the display name of the member who made the
 * party), which a document of an earlier version does not have. Version 8 (plan 7B) added a
 * raid's `screenshot` (the screenshot it was reported from, and whether its time is a guess); a
 * raid of an earlier document has none. Version 9 (plan 8B-3) added a train's `atEnd` (what it
 * does at the last stop of its route); a train of an earlier document finishes its route there.
 * Version 10 (plan 8D) added a meetup's `place` (a gym, PokéStop or power spot as it was named,
 * or a pin); a meetup of an earlier document has none. Version 11 (plan 8T) added a train's
 * `splitFrom` (the train it was split off from, `pending: true` until the split is settled) and
 * `splitOff` (the groups split off it); a train of an earlier document has neither. Version 12
 * (plan 8X-1B) added a group's `opened` (when it was opened: a group nobody is in goes, and a
 * later one may take its letter), also kept with a group split off a train; a group of an
 * earlier document has none and counts as opened with the party (`groupOpened`). Version 13
 * (plan 8X-3) added `max` (a max battle's tier, boss and spot), the details of a fourth kind of
 * party; a document of an earlier version is never one of a max battle. Version 14 (plan 8X-4)
 * added a train's `kind` (raid, Dynamax, Gigantamax); a train of an earlier document is a raid
 * train. Version 15 (plan 8X-S) added a max battle's `bossSince` (since when it has its boss)
 * and `screenshot` (as a raid's); a max battle of an earlier document has had its boss since it
 * was made (its row's `createdAt`) and has no screenshot.
 * Documents of versions 1 to 3 are those of raids, and one of version 4 is that of a raid or a
 * meetup.
 */
export const PARTY_STATE_VERSION = 15;

const snowflake = z.string().regex(/^\d{15,20}$/);
const time = z.number().int().nonnegative();
const groupId = z.enum(GROUP_IDS);

const attendeeV1 = z.object({
  number: z.number().int().min(1),
  status: z.union([
    z.literal(PartyStatus.Interested),
    z.literal(PartyStatus.Coming),
    z.literal(PartyStatus.Present),
    z.literal(PartyStatus.CompletePending),
    z.literal(PartyStatus.Complete),
  ]),
  group: groupId,
  remote: z.boolean(),
  pendingUntil: time.optional(),
});

const attendeeV2 = attendeeV1.extend({
  name: z.string().min(1).max(MAX_MEMBER_NAME).optional(),
  team: z.enum(TEAMS).optional(),
});

const attendee = attendeeV2.extend({ askedBy: snowflake.optional() });

const promptsV2 = z.object({
  completion: z.array(snowflake).max(MAX_COMPLETION_PROMPTS),
  warning: snowflake.nullable(),
});

const prompts = z.object({
  completion: z
    .array(z.object({ id: snowflake, members: z.array(snowflake) }))
    .max(MAX_COMPLETION_PROMPTS),
  warning: snowflake.nullable(),
});

/** A group as versions 1 to 11 wrote it: without when it was opened. */
const groupV11 = z.object({
  id: groupId,
  label: z.string().optional(),
  startTime: time.optional(),
  startClearTime: time.optional(),
});

const group = groupV11.extend({ opened: time.optional() });

/**
 * The level of a raid. A raid stored while there was an EX tier (plan 4F removed it; a dev
 * database may hold ended ones) is read as an elite raid, which is what the game made of EX.
 * That is no new version of the document: nothing was added to it, no document is ever written
 * with the old level again (the level is no `RaidLevel` any more), and a reader that still
 * knows the old level reads a document without it as before.
 */
const tierLevel = z.preprocess(
  (level) => (level === RETIRED_EX_LEVEL ? 'Elite' : level),
  z.enum(RAID_LEVELS),
);

const tier = z
  .object({ level: tierLevel, shadow: z.boolean() })
  .refine((value) => raidTier(value.level, value.shadow) !== undefined, {
    error: 'this level has no shadow raids',
  });

const bossRef = z.union([
  z.object({ key: z.string().min(1) }),
  z.object({ name: z.string().min(1) }),
]);

/** A raid's details as versions 1 to 7 wrote them: without a screenshot. */
const raidV7 = z.object({
  tier,
  boss: bossRef.nullable(),
  reportedHatched: z.boolean(),
  fastMove: z.string().nullable(),
  chargedMove: z.string().nullable(),
  hatchedDuration: z.number().int().min(1).nullable(),
  stageSeen: z.enum(['egg', 'hatched', 'ended']),
});

/** The screenshot a raid (version 8) or a max battle (version 15) was reported from. */
const screenshot = z
  .object({
    id: z
      .string()
      .regex(/^[A-Za-z0-9_-]{12}$/)
      .nullable(),
    timeUncertain: z.boolean(),
  })
  .nullable();

const raid = raidV7.extend({ screenshot });

const timed = z.object({
  name: z.string().min(1).max(MAX_PARTY_NAME),
  startTime: time.nullable(),
});

/** A meetup's details as versions 4 to 9 wrote them: without its place. */
const meetupV9 = z.object({
  description: z.string().min(1).max(MAX_MEETUP_DESCRIPTION).nullable(),
});

const placeKind = z.enum(['gym', 'stop', 'powerspot']);
const latitude = z.number().min(-90).max(90);
const longitude = z.number().min(-180).max(180);

/**
 * A gym, PokéStop or power spot as it was named, or a pin (`MeetupPlace`); also what a request
 * of meetup safety keeps of its place (`MeetupSafetyRepository`).
 */
export const placeDocument = z.union([
  z.object({
    kind: placeKind,
    id: z.string().min(1).max(64),
    title: z.string().min(1).max(MAX_PLACE_TITLE),
    lat: latitude,
    lon: longitude,
    address: z.string().max(500).nullable(),
    image: z.string().min(1).max(2048).nullable(),
  }),
  z.object({
    kind: z.literal('pin'),
    lat: latitude,
    lon: longitude,
    near: z.object({ kind: placeKind, title: z.string().min(1).max(MAX_PLACE_TITLE) }).nullable(),
    linkName: z.string().min(1).max(MAX_LINK_NAME).nullable(),
  }),
]);

const meetup = meetupV9.extend({
  place: placeDocument.nullable(),
});

/**
 * A max battle's details (version 13): its tier, its boss (always known) and its spot, a power
 * spot as it was named or a pin (`MaxSpot`): a known place of another kind is none.
 */
const maxV14 = z.object({
  tier: z.enum(MAX_TIERS),
  boss: bossRef,
  spot: placeDocument.refine((spot) => spot.kind === 'pin' || spot.kind === 'powerspot', {
    error: 'a max battle is at a power spot or a pin',
  }),
});

/**
 * A max battle's details of version 15 (plan 8X-S): since when it has its boss, and the
 * screenshot it was reported from.
 */
const max = maxV14.extend({ bossSince: time, screenshot });

const gymId = z.number().int().positive();

/**
 * A stop of a route (version 14, plan 8X-4): a gym by its id, or a power spot by its Wayfarer id
 * (`StopRef`). A route of an older version is gym ids.
 */
const stopRef = z.union([
  z.object({ kind: z.literal('gym'), id: gymId }),
  z.object({ kind: z.literal('powerspot'), id: z.string().refine(isWayfarerId) }),
]);

/** A stop as its key (`stopKey`): a gym id of an older version is the key of that gym. */
function keyOf(stop: number | StopRef): string {
  return typeof stop === 'number' ? String(stop) : stopKey(stop);
}

/** What does not hold of where a train is on its route, whatever the version of its document. */
function routeProblems(value: { route: readonly (number | StopRef)[]; stop: number }): string[] {
  const problems: string[] = [];
  if (new Set(value.route.map(keyOf)).size !== value.route.length)
    problems.push('a stop is on the route twice');
  if (value.stop > value.route.length) problems.push('the train is at a stop beyond its route');
  return problems;
}

/** The details of a train as version 5 wrote them: read only. */
const trainV5 = z
  .object({
    route: z.array(gymId).max(MAX_ROUTE_STOPS),
    stop: z.number().int().nonnegative(),
    conductorId: snowflake.nullable(),
    boss: bossRef.nullable(),
  })
  .superRefine((value, context) => {
    for (const message of routeProblems(value)) context.addIssue({ code: 'custom', message });
  });

/** What does not hold of the stop a route remembers it was finished from. */
function finishProblems(value: {
  route: readonly (number | StopRef)[];
  stop: number;
  finishedFrom: number | StopRef | null;
}): string[] {
  const { route, stop, finishedFrom } = value;
  if (finishedFrom === null) return [];
  // Only a finished route remembers the stop it was finished from, which is one of its own.
  if (route.length === 0 || stop < route.length) {
    return ['a route that is not finished remembers where it was finished from'];
  }
  return route.map(keyOf).includes(keyOf(finishedFrom))
    ? []
    : ['the route was finished from a stop that is not on it'];
}

/** The details of a train as versions 6 to 8 wrote them: read only, without its mode. */
const trainV8 = z
  .object({
    route: z.array(gymId).max(MAX_ROUTE_STOPS),
    stop: z.number().int().nonnegative(),
    finishedFrom: gymId.nullable(),
    conductorId: snowflake.nullable(),
    boss: bossRef.nullable(),
  })
  .superRefine((value, context) => {
    for (const message of [...routeProblems(value), ...finishProblems(value)]) {
      context.addIssue({ code: 'custom', message });
    }
  });

/** The details of a train as versions 9 and 10 wrote them: read only, without its splits. */
const trainV10 = z
  .object({
    route: z.array(gymId).max(MAX_ROUTE_STOPS),
    stop: z.number().int().nonnegative(),
    finishedFrom: gymId.nullable(),
    atEnd: z.enum(TRAIN_AT_END),
    conductorId: snowflake.nullable(),
    boss: bossRef.nullable(),
  })
  .superRefine((value, context) => {
    for (const message of [...routeProblems(value), ...finishProblems(value)]) {
      context.addIssue({ code: 'custom', message });
    }
  });

/** The other train of a split: its party (a UUID, as every party id is) and its post. */
const trainLink = z.object({ partyId: z.uuid(), postId: snowflake });

/** The details of a train as version 11 wrote them: read only, its splits without stamps. */
const trainV11 = z
  .object({
    route: z.array(gymId).max(MAX_ROUTE_STOPS),
    stop: z.number().int().nonnegative(),
    finishedFrom: gymId.nullable(),
    atEnd: z.enum(TRAIN_AT_END),
    conductorId: snowflake.nullable(),
    boss: bossRef.nullable(),
    splitFrom: trainLink.extend({ pending: z.literal(true).optional() }).nullable(),
    splitOff: z
      .array(trainLink.extend({ group: groupId, label: z.string().optional() }))
      .max(MAX_SPLITS_KEPT),
  })
  .superRefine((value, context) => {
    for (const message of [...routeProblems(value), ...finishProblems(value)]) {
      context.addIssue({ code: 'custom', message });
    }
  });

/** A train's details as versions 12 and 13 wrote them: read only, without its kind. */
const trainFieldsV13 = {
  route: z.array(gymId).max(MAX_ROUTE_STOPS),
  stop: z.number().int().nonnegative(),
  finishedFrom: gymId.nullable(),
  atEnd: z.enum(TRAIN_AT_END),
  conductorId: snowflake.nullable(),
  boss: bossRef.nullable(),
  splitFrom: trainLink.extend({ pending: z.literal(true).optional() }).nullable(),
  splitOff: z
    .array(
      trainLink.extend({
        group: groupId,
        label: z.string().optional(),
        opened: time.optional(),
      }),
    )
    .max(MAX_SPLITS_KEPT),
};

const trainV13 = z.object(trainFieldsV13).superRefine((value, context) => {
  for (const message of [...routeProblems(value), ...finishProblems(value)]) {
    context.addIssue({ code: 'custom', message });
  }
});

/**
 * A train's details (version 14): its kind beside what version 13 had, and its stops gyms or
 * power spots (`StopRef`) where version 13 had gym ids.
 */
const train = z
  .object({
    ...trainFieldsV13,
    kind: z.enum(TRAIN_KINDS),
    route: z.array(stopRef).max(MAX_ROUTE_STOPS),
    finishedFrom: stopRef.nullable(),
  })
  .superRefine((value, context) => {
    for (const message of [...routeProblems(value), ...finishProblems(value)]) {
      context.addIssue({ code: 'custom', message });
    }
  });

/** What does not hold between the parts of a document, whatever its version. */
function inconsistencies(value: {
  groups: { id: string }[];
  defaultGroupId: string;
  attendees: { id: string; group: string }[];
}): string[] {
  const problems: string[] = [];
  if (!value.groups.some((g) => g.id === value.defaultGroupId))
    problems.push('the default group is not one of the groups');
  if (new Set(value.attendees.map((a) => a.id)).size !== value.attendees.length)
    problems.push('a member is listed twice');
  if (new Set(value.groups.map((g) => g.id)).size !== value.groups.length)
    problems.push('a group is listed twice');
  if (!value.attendees.every((a) => value.groups.some((g) => g.id === a.group)))
    problems.push('an attendee is in a group that is not one of the groups');
  return problems;
}

/**
 * What documents of versions 1 to 7 share; a raid's details without a screenshot, groups without
 * their stamps (version 12 has its own).
 */
const shared = {
  anonymous: z.boolean(),
  groups: z.array(groupV11).min(1).max(GROUP_IDS.length),
  defaultGroupId: groupId,
  raid: raidV7.optional(),
};

const state = z
  .object({
    v: z.literal(PARTY_STATE_VERSION),
    ...shared,
    groups: z.array(group).min(1).max(GROUP_IDS.length),
    raid: raid.optional(),
    makerName: z.string().min(1).max(MAX_MEMBER_NAME).optional(),
    timed: timed.optional(),
    meetup: meetup.optional(),
    train: train.optional(),
    max: max.optional(),
    /**
     * A list, in the order the members signed up, and not an object by member: MySQL sorts the
     * keys of a JSON object, which would put the attendees in the order of their snowflakes.
     */
    attendees: z.array(attendee.extend({ id: snowflake })),
    prompts,
  })
  .superRefine((value, context) => {
    for (const message of inconsistencies(value)) context.addIssue({ code: 'custom', message });
  });

/**
 * Version 14, as plans 8X-4 to 8R-4 wrote it: read only. It is version 15 without a max battle's
 * `bossSince` and `screenshot`.
 */
const stateV14 = z
  .object({
    v: z.literal(14),
    ...shared,
    groups: z.array(group).min(1).max(GROUP_IDS.length),
    raid: raid.optional(),
    makerName: z.string().min(1).max(MAX_MEMBER_NAME).optional(),
    timed: timed.optional(),
    meetup: meetup.optional(),
    train: train.optional(),
    max: maxV14.optional(),
    attendees: z.array(attendee.extend({ id: snowflake })),
    prompts,
  })
  .superRefine((value, context) => {
    for (const message of inconsistencies(value)) context.addIssue({ code: 'custom', message });
  });

/** Version 13, as plans 8X-3 and 8X-6 wrote it: read only. It is version 14 without a train's kind. */
const stateV13 = z
  .object({
    v: z.literal(13),
    ...shared,
    groups: z.array(group).min(1).max(GROUP_IDS.length),
    raid: raid.optional(),
    makerName: z.string().min(1).max(MAX_MEMBER_NAME).optional(),
    timed: timed.optional(),
    meetup: meetup.optional(),
    train: trainV13.optional(),
    max: maxV14.optional(),
    attendees: z.array(attendee.extend({ id: snowflake })),
    prompts,
  })
  .superRefine((value, context) => {
    for (const message of inconsistencies(value)) context.addIssue({ code: 'custom', message });
  });

/** Version 12, as plans 8X-1B and 8X-2 wrote it: read only. It is version 13 without `max`. */
const stateV12 = z
  .object({
    v: z.literal(12),
    ...shared,
    groups: z.array(group).min(1).max(GROUP_IDS.length),
    raid: raid.optional(),
    makerName: z.string().min(1).max(MAX_MEMBER_NAME).optional(),
    timed: timed.optional(),
    meetup: meetup.optional(),
    train: trainV13.optional(),
    attendees: z.array(attendee.extend({ id: snowflake })),
    prompts,
  })
  .superRefine((value, context) => {
    for (const message of inconsistencies(value)) context.addIssue({ code: 'custom', message });
  });

/** Version 11, as plans 8T to 8X-1 wrote it: read only. It is version 12 without stamps. */
const stateV11 = z
  .object({
    v: z.literal(11),
    ...shared,
    raid: raid.optional(),
    makerName: z.string().min(1).max(MAX_MEMBER_NAME).optional(),
    timed: timed.optional(),
    meetup: meetup.optional(),
    train: trainV11.optional(),
    attendees: z.array(attendee.extend({ id: snowflake })),
    prompts,
  })
  .superRefine((value, context) => {
    for (const message of inconsistencies(value)) context.addIssue({ code: 'custom', message });
  });

/** Version 10, as plans 8D to 8M-5 wrote it: read only. It is version 11 without a train's splits. */
const stateV10 = z
  .object({
    v: z.literal(10),
    ...shared,
    raid: raid.optional(),
    makerName: z.string().min(1).max(MAX_MEMBER_NAME).optional(),
    timed: timed.optional(),
    meetup: meetup.optional(),
    train: trainV10.optional(),
    attendees: z.array(attendee.extend({ id: snowflake })),
    prompts,
  })
  .superRefine((value, context) => {
    for (const message of inconsistencies(value)) context.addIssue({ code: 'custom', message });
  });

/** Version 9, as plans 8B-3 to 8M-2F wrote it: read only. It is version 10 without a meetup's place. */
const stateV9 = z
  .object({
    v: z.literal(9),
    ...shared,
    raid: raid.optional(),
    makerName: z.string().min(1).max(MAX_MEMBER_NAME).optional(),
    timed: timed.optional(),
    meetup: meetupV9.optional(),
    train: trainV10.optional(),
    attendees: z.array(attendee.extend({ id: snowflake })),
    prompts,
  })
  .superRefine((value, context) => {
    for (const message of inconsistencies(value)) context.addIssue({ code: 'custom', message });
  });

/** Version 8, as plans 7B to 8B-2 wrote it: read only. It is version 9 without a train's mode. */
const stateV8 = z
  .object({
    v: z.literal(8),
    ...shared,
    raid: raid.optional(),
    makerName: z.string().min(1).max(MAX_MEMBER_NAME).optional(),
    timed: timed.optional(),
    meetup: meetupV9.optional(),
    train: trainV8.optional(),
    attendees: z.array(attendee.extend({ id: snowflake })),
    prompts,
  })
  .superRefine((value, context) => {
    for (const message of inconsistencies(value)) context.addIssue({ code: 'custom', message });
  });

/** Version 7, as plans 4A to 7A wrote it: read only. It is version 8 without a screenshot. */
const stateV7 = z
  .object({
    v: z.literal(7),
    ...shared,
    makerName: z.string().min(1).max(MAX_MEMBER_NAME).optional(),
    timed: timed.optional(),
    meetup: meetupV9.optional(),
    train: trainV8.optional(),
    attendees: z.array(attendee.extend({ id: snowflake })),
    prompts,
  })
  .superRefine((value, context) => {
    for (const message of inconsistencies(value)) context.addIssue({ code: 'custom', message });
  });

/** Version 6, as plan 3C wrote it: read only. It is version 7 without the maker's name. */
const stateV6 = z
  .object({
    v: z.literal(6),
    ...shared,
    timed: timed.optional(),
    meetup: meetupV9.optional(),
    train: trainV8.optional(),
    attendees: z.array(attendee.extend({ id: snowflake })),
    prompts,
  })
  .superRefine((value, context) => {
    for (const message of inconsistencies(value)) context.addIssue({ code: 'custom', message });
  });

/**
 * Version 5, as plan 3B wrote it: read only, and upgraded when read. Its train does not say
 * where its route was finished from.
 */
const stateV5 = z
  .object({
    v: z.literal(5),
    ...shared,
    timed: timed.optional(),
    meetup: meetupV9.optional(),
    train: trainV5.optional(),
    attendees: z.array(attendee.extend({ id: snowflake })),
    prompts,
  })
  .superRefine((value, context) => {
    for (const message of inconsistencies(value)) context.addIssue({ code: 'custom', message });
  });

/** Version 4, as plan 3A wrote it: read only. It is version 5 without a train. */
const stateV4 = z
  .object({
    v: z.literal(4),
    ...shared,
    timed: timed.optional(),
    meetup: meetupV9.optional(),
    attendees: z.array(attendee.extend({ id: snowflake })),
    prompts,
  })
  .superRefine((value, context) => {
    for (const message of inconsistencies(value)) context.addIssue({ code: 'custom', message });
  });

/** Version 3, as plans 2D-2 to 2E-2 wrote it: read only. It is version 4 with `raid` alone. */
const stateV3 = z
  .object({
    v: z.literal(3),
    ...shared,
    attendees: z.array(attendee.extend({ id: snowflake })),
    prompts,
  })
  .superRefine((value, context) => {
    for (const message of inconsistencies(value)) context.addIssue({ code: 'custom', message });
  });

/** Version 1, as plans 2B and 2C wrote it: read only, and upgraded when read. */
const stateV1 = z
  .object({
    v: z.literal(1),
    ...shared,
    attendees: z.array(attendeeV1.extend({ id: snowflake })),
  })
  .superRefine((value, context) => {
    for (const message of inconsistencies(value)) context.addIssue({ code: 'custom', message });
  });

/** Version 2, as plan 2D-1 wrote it: read only, and upgraded when read. */
const stateV2 = z
  .object({
    v: z.literal(2),
    ...shared,
    attendees: z.array(attendeeV2.extend({ id: snowflake })),
    prompts: promptsV2,
  })
  .superRefine((value, context) => {
    for (const message of inconsistencies(value)) context.addIssue({ code: 'custom', message });
  });

/** A raid of a document before version 8 had no screenshot. */
function withScreenshot<T extends { raid?: z.output<typeof raidV7> | undefined }>(old: T) {
  return old.raid ? { ...old, raid: { ...old.raid, screenshot: null } } : old;
}

/** A train of a document before version 9 finishes its route at the last stop, as it did. */
function withAtEnd<T extends { train?: z.output<typeof trainV8> | undefined }>(old: T) {
  return old.train ? { ...old, train: { ...old.train, atEnd: 'finish' as const } } : old;
}

/** A meetup of a document before version 10 has no place. */
function withPlace<T extends { meetup?: z.output<typeof meetupV9> | undefined }>(old: T) {
  return old.meetup ? { ...old, meetup: { ...old.meetup, place: null } } : old;
}

/** A train of a document before version 11 was split neither from nor off another. */
function withSplits<T extends { train?: z.output<typeof trainV10> | undefined }>(old: T) {
  return old.train ? { ...old, train: { ...old.train, splitFrom: null, splitOff: [] } } : old;
}

/**
 * A train of a document before version 14 is a raid train, as every train was, and its route
 * and the stop it was finished from are gyms.
 */
function withKind<T extends { train?: z.output<typeof trainV13> | undefined }>(old: T) {
  if (!old.train) return old;
  const { route, finishedFrom } = old.train;
  return {
    ...old,
    train: {
      ...old.train,
      kind: 'raid' as const,
      route: route.map(gymStop),
      finishedFrom: finishedFrom === null ? null : gymStop(finishedFrom),
    },
  };
}

/**
 * A max battle of a document before version 15 has had its boss since it was made (`createdAt`,
 * a column of its row), and was reported from no screenshot.
 */
function withBossSince<T extends { max?: z.output<typeof maxV14> | undefined }>(
  old: T,
  createdAt: number,
) {
  return old.max ? { ...old, max: { ...old.max, bossSince: createdAt, screenshot: null } } : old;
}

/**
 * Reads a stored document of any version this code knows, as the current version; `createdAt`
 * is the party's own (its row's), which a max battle of a document before version 15 has had its
 * boss since. A document before version 13 is never a max battle's; a train of one before
 * version 14 is a raid train.
 */
function readState(stored: unknown, createdAt: number) {
  const version =
    typeof stored === 'object' && stored !== null && 'v' in stored ? stored.v : undefined;
  if (version === PARTY_STATE_VERSION) return state.safeParse(stored);
  const older = readStateV14(stored, version);
  if (!older.success) return older;
  return state.safeParse({ ...withBossSince(older.data, createdAt), v: PARTY_STATE_VERSION });
}

/** Reads a document of versions 1 to 14, upgraded to the shape of version 14. */
function readStateV14(stored: unknown, version: unknown) {
  if (version === 14) return stateV14.safeParse(stored);
  const older = readStateV13(stored, version);
  if (!older.success) return older;
  return stateV14.safeParse({ ...withKind(older.data), v: 14 });
}

/** Reads a document of versions 1 to 13, upgraded to the shape of version 13. */
function readStateV13(stored: unknown, version: unknown) {
  if (version === 13) return stateV13.safeParse(stored);
  const older = readStateV12(stored, version);
  if (!older.success) return older;
  return stateV13.safeParse({ ...older.data, v: 13 });
}

/**
 * Reads a document of versions 1 to 12, upgraded to the shape of version 12. A document before
 * version 12 has groups without stamps, which count as opened with the party.
 */
function readStateV12(stored: unknown, version: unknown) {
  if (version === 12) return stateV12.safeParse(stored);
  const older = readStateV11(stored, version);
  if (!older.success) return older;
  return stateV12.safeParse({ ...older.data, v: 12 });
}

/** Reads a document of versions 1 to 11, upgraded to the shape of version 11. */
function readStateV11(stored: unknown, version: unknown) {
  if (version === 11) return stateV11.safeParse(stored);
  const older = readStateV10(stored, version);
  if (!older.success) return older;
  return stateV11.safeParse({ ...withSplits(older.data), v: 11 });
}

/** Reads a document of versions 1 to 10, upgraded to the shape of version 10. */
function readStateV10(stored: unknown, version: unknown) {
  if (version === 10) return stateV10.safeParse(stored);
  const older = readStateV9(stored, version);
  if (!older.success) return older;
  return stateV10.safeParse({ ...withPlace(older.data), v: 10 });
}

/** Reads a document of versions 1 to 9, upgraded to the shape of version 9. */
function readStateV9(stored: unknown, version: unknown) {
  if (version === 9) return stateV9.safeParse(stored);
  const older = readStateV8(stored, version);
  if (!older.success) return older;
  return stateV9.safeParse({ ...withAtEnd(older.data), v: 9 });
}

/** Reads a document of versions 1 to 8, upgraded to the shape of version 8. */
function readStateV8(stored: unknown, version: unknown) {
  if (version === 8) return stateV8.safeParse(stored);
  const older = readOlderState(stored, version);
  if (!older.success) return older;
  return stateV8.safeParse({ ...withScreenshot(older.data), v: 8 });
}

/** Reads a document of versions 1 to 7, upgraded to the shape of version 7. */
function readOlderState(stored: unknown, version: unknown) {
  if (version === 1) {
    const old = stateV1.safeParse(stored);
    if (!old.success) return old;
    return stateV7.safeParse({
      ...old.data,
      v: 7,
      prompts: { completion: [], warning: null },
    });
  }
  if (version === 2) {
    const old = stateV2.safeParse(stored);
    if (!old.success) return old;
    return stateV7.safeParse({
      ...old.data,
      v: 7,
      prompts: {
        completion: old.data.prompts.completion.map((id) => ({ id, members: [] })),
        warning: old.data.prompts.warning,
      },
    });
  }
  if (version === 3) {
    const old = stateV3.safeParse(stored);
    if (!old.success) return old;
    return stateV7.safeParse({ ...old.data, v: 7 });
  }
  if (version === 4) {
    const old = stateV4.safeParse(stored);
    if (!old.success) return old;
    return stateV7.safeParse({ ...old.data, v: 7 });
  }
  if (version === 5) {
    const old = stateV5.safeParse(stored);
    if (!old.success) return old;
    const { train: oldTrain, ...rest } = old.data;
    return stateV7.safeParse({
      ...rest,
      v: 7,
      // Previous on a finished route of such a train leads to the last stop, as it did.
      ...(oldTrain ? { train: { ...oldTrain, finishedFrom: null } } : {}),
    });
  }
  if (version === 6) {
    const old = stateV6.safeParse(stored);
    if (!old.success) return old;
    return stateV7.safeParse({ ...old.data, v: 7 });
  }
  return stateV7.safeParse(stored);
}

const mirrors = z.array(
  z.object({ channelId: snowflake, messageId: snowflake, kind: z.enum(MIRROR_KINDS) }),
);

/** The part of a party that is stored as one JSON document (the `state` column). */
export type PartyState = z.output<typeof state>;

/** What the `Party` table keeps in columns of its own. */
export type PartyColumns = Omit<
  PartyCore,
  'anonymous' | 'makerName' | 'attendees' | 'groups' | 'defaultGroupId' | 'prompts'
> & {
  type: string;
};

/** The parts of a document that the kind of the party has: exactly these, and no others. */
function kindParts(party: Party): Pick<PartyState, 'raid' | 'timed' | 'meetup' | 'train' | 'max'> {
  switch (party.type) {
    case 'raid':
      return { raid: party.raid };
    case 'max':
      return { max: { ...party.max, spot: { ...party.max.spot } } };
    case 'meetup':
      return { timed: party.timed, meetup: party.meetup };
    case 'train':
      return {
        timed: party.timed,
        train: {
          ...party.train,
          route: [...party.train.route],
          splitOff: party.train.splitOff.map((split) => ({ ...split })),
        },
      };
  }
}

/**
 * The document to store for a party, with the parts of its own kind and no others. It is
 * checked by the schema the reader uses, and a party that would not be read back throws: it is
 * never written.
 */
export function partyState(party: Party): PartyState {
  const document: PartyState = {
    v: PARTY_STATE_VERSION,
    anonymous: party.anonymous,
    ...(party.makerName === undefined ? {} : { makerName: party.makerName }),
    attendees: Object.entries(party.attendees).map(([id, attendee]) => ({ ...attendee, id })),
    groups: [...party.groups],
    defaultGroupId: party.defaultGroupId,
    ...kindParts(party),
    prompts: {
      completion: party.prompts.completion.map(({ id, members }) => ({
        id,
        members: [...members],
      })),
      warning: party.prompts.warning,
    },
  };
  const checked = state.safeParse(document);
  if (!checked.success) {
    throw new Error(`party ${party.id} cannot be stored: ${z.prettifyError(checked.error)}`);
  }
  return checked.data;
}

/**
 * The mirror messages to store for a party, checked by the schema the reader uses: a list the
 * reader would refuse throws, and is never written.
 */
export function partyMirrors(party: Party): MirrorMessage[] {
  const checked = mirrors.safeParse(party.mirrorMessages);
  if (!checked.success) {
    throw new Error(`party ${party.id} cannot be stored: ${z.prettifyError(checked.error)}`);
  }
  return checked.data;
}

export type StoredParty = { ok: true; party: Party } | { ok: false; id: string; problem: string };

/**
 * Puts a party together from its columns and the two JSON documents as the database returned
 * them. A row this version cannot read (a kind of party it does not know, a newer state
 * version, a damaged document, a document with the details of another kind of party than its row says) is
 * reported, never guessed at: the caller leaves such a row alone.
 */
export function partyFromStored(
  columns: PartyColumns,
  storedState: unknown,
  storedMirrors: unknown,
): StoredParty {
  const fail = (problem: string): StoredParty => ({ ok: false, id: columns.id, problem });
  const { type } = columns;
  if (!isPartyType(type)) return fail(`a party of type "${type}"`);
  const parsed = readState(storedState, columns.createdAt);
  if (!parsed.success) return fail(`state: ${z.prettifyError(parsed.error)}`);
  const mirrorMessages = mirrors.safeParse(storedMirrors);
  if (!mirrorMessages.success)
    return fail(`mirrorMessages: ${z.prettifyError(mirrorMessages.error)}`);
  const { anonymous, makerName, groups, defaultGroupId } = parsed.data;
  const { raid: raidDetails, timed: timedDetails, meetup: meetupDetails } = parsed.data;
  const trainDetails = parsed.data.train;
  const maxDetails = parsed.data.max;
  const attendees: Record<string, Attendee> = {};
  for (const { id, ...attendee } of parsed.data.attendees) attendees[id] = attendee;
  const messages: MirrorMessage[] = mirrorMessages.data;
  const core = {
    ...columns,
    mirrorMessages: messages,
    anonymous,
    ...(makerName === undefined ? {} : { makerName }),
    attendees,
    // Kept in letter order since plan 8X-G; one stored before may have a reused letter last.
    groups: inLetterOrder(groups),
    defaultGroupId,
    prompts: parsed.data.prompts,
  };
  if (type === 'raid') {
    if (!raidDetails) return fail('a raid without its raid details');
    if (timedDetails) return fail('a raid with a name and a start of its own');
    if (meetupDetails) return fail('a raid with the details of a meetup');
    if (trainDetails) return fail('a raid with the details of a train');
    if (maxDetails) return fail('a raid with the details of a max battle');
    return { ok: true, party: { ...core, type, raid: raidDetails } };
  }
  if (type === 'max') {
    if (!maxDetails) return fail('a max battle without its max battle details');
    if (raidDetails || timedDetails || meetupDetails || trainDetails) {
      return fail('a max battle with the details of another kind');
    }
    if (columns.gymId !== null) return fail('a max battle with a gym');
    if (columns.hatchTime !== null) return fail('a max battle with a hatch time');
    const { spot } = maxDetails;
    // The refinement above says so; the type of a power spot is narrower than a known place's.
    if (spot.kind !== 'pin' && spot.kind !== 'powerspot') return fail('a max battle at a gym');
    return {
      ok: true,
      party: {
        ...core,
        type,
        gymId: null,
        hatchTime: null,
        max: { ...maxDetails, spot: spot.kind === 'pin' ? spot : { ...spot, kind: spot.kind } },
      },
    };
  }
  if (maxDetails) return fail(`a ${type} with the details of a max battle`);
  // A timed party: a meetup or a train.
  if (!timedDetails) return fail(`a ${type} without its name and start`);
  if (type === 'meetup' && !meetupDetails) return fail('a meetup without its meetup details');
  if (type === 'train' && !trainDetails) return fail('a train without its train details');
  if (raidDetails) return fail(`a ${type} with the details of a raid`);
  // The columns of a raid: a timed party that had them would not be the party that was stored
  // (the gym of a train is the stop it is at, which is in the document).
  if (columns.gymId !== null) return fail(`a ${type} with a gym`);
  if (columns.hatchTime !== null) return fail(`a ${type} with a hatch time`);
  const timedCore = { ...core, gymId: null, hatchTime: null, timed: timedDetails };
  if (type === 'meetup') {
    if (!meetupDetails) return fail('a meetup without its meetup details');
    if (trainDetails) return fail('a meetup with the details of a train');
    return { ok: true, party: { ...timedCore, type, meetup: meetupDetails } };
  }
  if (!trainDetails) return fail('a train without its train details');
  if (meetupDetails) return fail('a train with the details of a meetup');
  return { ok: true, party: { ...timedCore, type, train: trainDetails } };
}
