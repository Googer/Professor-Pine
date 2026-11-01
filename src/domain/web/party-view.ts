import { allowedPicture } from './picture.js';
import { stopKey } from '../party/stops.js';
import { maxEnded } from '../party/max.js';
import {
  attendeeOf,
  inLetterOrder,
  isMax,
  isRaid,
  isTimed,
  mayArrange,
  remoteAllowed,
  type Attendee,
  type MaxParty,
  type MeetupParty,
  type Party,
  type RaidParty,
  type TrainParty,
  goingCount,
  partyWord,
} from '../party/party.js';
import { raidStage } from '../party/raid.js';
import { PartyStatus } from '../party/status.js';
import { timedOver } from '../party/timed.js';
import {
  endMode,
  mayNotArrange,
  mayNotClear,
  mayNotLoad,
  mayNotMove,
  stopsAhead,
} from '../party/train.js';
import { maxBossTitle, maxTierLabel } from '../pogo/max-tier.js';
import { raidTierGroup, raidWords } from '../pogo/raid-tier.js';
import type {
  GroupCounts,
  MapAttendance,
  MapMeetup,
  MapMeetupPlace,
  MapParty,
  MapGroupChoice,
  MapMax,
  MapPress,
  MapRaid,
  MapRaidPlace,
  MapStatus,
  MapConductor,
  MapMoveRefusal,
  MapTrain,
  MapMoves,
  MapTrainRights,
  MapClose,
  MapRegroup,
  PartiesView,
} from './party-data.js';
import { TRAIN_KIND_WORDS } from './party-data.js';

export type * from './party-data.js';

/**
 * What a logged-in member sees of a server's parties on the live map (spec 3.2,
 * `GET /s/<guild>/api/parties`). Pure: the caller gives the active parties, the forums the member
 * is barred from, and how each raid looks in its post. The list names nobody (attendees are
 * counts, as the post counts them); each party's post, asked for by its `postKey` (plan 8M-8A:
 * `GET /s/<guild>/api/parties/<id>/post`), names attendees, the reporter and the maker exactly as
 * the post does, to the same members.
 */

/**
 * How a raid's post looks: its picture, the boss it names and where it is (`raidLook` of the
 * renderer).
 */
export interface RaidLook {
  /** The post's heading in words (plan 8M-7, fix round 1); the tier's words without one. */
  heading?: string;
  picture?: string;
  boss?: string;
  place?: MapRaidPlace;
}

/**
 * How a max battle's post looks (plan 8X-5; `maxLook` of the renderer): the boss's picture and
 * name as the post shows them, and where it is as Where names it (the power spot as it is now
 * while it is the same place, else as named; a pin as `Unlisted power spot`), with the spot's
 * Wayfarer id (null for a pin).
 */
export interface MaxLook {
  picture?: string;
  boss: string;
  place: MapRaidPlace;
  spotId: string | null;
}

const round = (value: number): number => Math.round(value * 1e6) / 1e6;

export interface PartyViewInput {
  /** The server's snowflake, for the links to the posts. */
  guildId: string;
  /** Its row (`Guild.id`), by which a party says whose it is. */
  guildRow: number;
  /** The active parties (`PartyStore.active`); those of other servers are left out here. */
  parties: readonly Party[];
  /** Who asks. */
  memberId: string;
  /** The forums somebody keeps the member out of (`memberAccess` said `barred`). */
  barred: ReadonlySet<string>;
  /**
   * The forums the member cannot see on Discord by their roles, though nobody keeps them out
   * (plan 8M-8B, review W-7): their parties are shown, without Report…. Left out: none.
   */
  hidden?: ReadonlySet<string>;
  now: number;
  /** `settings.timezone`, in which the page shows times. */
  zone: string;
  /** Discord cannot be reached: nothing may be pressed. */
  readOnly: boolean;
  /**
   * How many trainers a group of a party holds, where it has a size (`lobbySize`): the popup's
   * question then offers "Any group with room" first. Left out: no party has one.
   */
  lobbySize?: (party: Party) => number | undefined;
  /** Who asks is staff of the server (an admin, a moderator, the bot's owner): may change raids. */
  staff: boolean;
  /**
   * Who asks is staff as `/route clear` has it (also a bot developer, `isBotManagement`); left
   * out: as `staff`.
   */
  botStaff?: boolean;
  look(raid: RaidParty): RaidLook;
  /**
   * How a max battle's post looks (plan 8X-5). Left out: no max battle is shown (a caller that
   * shows only another kind).
   */
  maxLook?: (party: MaxParty) => MaxLook;
  /**
   * A power spot Pine keeps, by its Wayfarer id (plan 8X-4: a stop of a train's route): its name
   * and place; undefined for one it does not keep. Left out: none is known.
   */
  spotOf?: (id: string) => { name: string; lat: number; lon: number } | undefined;
  /** The origins the page may load pictures from (`pictureOrigins`). */
  pictureOrigins: readonly string[];
  /**
   * Group… for the member (plan 8M-8B): the choices of the post's dialog as its code words them,
   * or its refusal; undefined for a party without groups. Left out: none. Not asked while
   * read-only.
   */
  regroup?: (party: Party) => MapRegroup | undefined;
  /**
   * Staff's Delete… of a party (plan 8M-8B): whether the bot may delete its post and its forum's
   * name, asked only for staff and never while read-only. Left out: none.
   */
  closing?: (party: Party) => Omit<MapClose, 'word'>;
  /**
   * The key of a party's post as last shown (plan 8M-8A, `postKey` of its `PartyService.layoutOf`),
   * undefined while it has none. Left out: none has one.
   */
  postKey?: (party: Party) => string | undefined;
  /**
   * Why a member may not move a train, in the commands' words as text of the page (plan 8M-8C,
   * review C1: `manageRefusal`'s, which Discord says before Move… and Manage… open). Left out: no
   * words.
   */
  trainRefusal?: (reason: MapMoveRefusal) => string;
  /**
   * Move… of a train as the post's dialog draws it now (plan 8M-8C, `moveForm` in the map's
   * words), asked only for who may move it. Left out: no Move… on the map.
   */
  trainMoves?: (party: TrainParty) => MapMoves;
  /**
   * What lies ahead of a train as its post's small print says it (plan 8M-8C, R3: `aheadText` in
   * the map's words), undefined where it says nothing. Left out: none.
   */
  trainAhead?: (party: TrainParty) => string | undefined;
}

/** Staff's Delete… of a party (plan 8M-8B): for staff alone, never while read-only. */
function closeOf(party: Party, input: PartyViewInput): { close?: MapClose } {
  if (!input.staff || input.readOnly || input.closing === undefined) return {};
  return { close: { ...input.closing(party), word: partyWord(party) } };
}

/**
 * Report… of a party (plan 8M-8B, review W-7): for a member who sees its forum on Discord (not one
 * of `hidden`; a report without the moderators' channel writes into the post), never while
 * read-only.
 */
function reportOf(party: Party, input: PartyViewInput): { mayReport?: true } {
  if (input.readOnly) return {};
  const { forumChannelId } = party;
  return forumChannelId !== null && input.hidden?.has(forumChannelId) === true
    ? {}
    : { mayReport: true };
}

/** The address of a post on Discord, as the direct messages give it (`postLink`). */
function postLink(guildId: string, postId: string): string {
  return `https://discord.com/channels/${guildId}/${postId}`;
}

/** Under which status the post lists an attendee: one asked whether they completed is present. */
function mapStatus(attendee: Attendee): MapStatus | undefined {
  switch (attendee.status) {
    case PartyStatus.Interested:
      return 'interested';
    case PartyStatus.Coming:
      return 'coming';
    case PartyStatus.Present:
    case PartyStatus.CompletePending:
      return 'present';
    case PartyStatus.Complete:
      return 'complete';
    default:
      return undefined;
  }
}

/**
 * The popup's question "which group?" (plan 8X-1B), asked as the post's dialog asks it: of a
 * member who is not signed up for a party of several groups, "Any group with room" first where
 * its groups have a size, then the groups in letter order (plan 8X-G).
 */
function groupPick(party: Party, input: PartyViewInput): MapGroupChoice[] | undefined {
  if (input.readOnly || party.groups.length < 2 || attendeeOf(party, input.memberId)) {
    return undefined;
  }
  const sized = input.lobbySize?.(party) !== undefined;
  return [
    ...(sized ? [{ label: 'Any group with room' }] : []),
    ...inLetterOrder(party.groups).map((group) => ({
      group: group.id,
      label: group.label ? `Group ${group.id}: ${group.label}` : `Group ${group.id}`,
    })),
  ];
}

/**
 * The counts of a party, the same for everyone, worked out once per party object: a changed party
 * is a new object. A big train's hundreds of attendees are then read once per change, not per ask.
 */
const partyCounts = new WeakMap<Party, { groups: GroupCounts[]; going: number }>();

function countsOf(party: Party): { groups: GroupCounts[]; going: number } {
  const kept = partyCounts.get(party);
  if (kept) return kept;
  // By letter, as the post lists them (plan 8X-G; a party read from storage is sorted already).
  const groups: GroupCounts[] = inLetterOrder(party.groups).map((group) => ({
    id: group.id,
    interested: 0,
    coming: 0,
    present: 0,
  }));
  for (const attendee of Object.values(party.attendees)) {
    const status = mapStatus(attendee);
    const counts = groups.find((group) => group.id === attendee.group);
    if (counts && (status === 'interested' || status === 'coming' || status === 'present')) {
      counts[status] += attendee.number;
    }
  }
  const counted = { groups, going: goingCount(party) };
  partyCounts.set(party, counted);
  return counted;
}

/**
 * The counts per group, the member's own standing, and the post's buttons, the same for one
 * group and several (plan 8X-1B): Interested, Join, Here; Done for a raid that has hatched and a
 * max battle; Leave for a member who is signed up. None while read-only. A newcomer to several
 * groups is asked which (`groupPick`). The Remote switch as the post has it (plan 8X-5).
 */
function attendanceOf(party: Party, input: PartyViewInput, hatched: boolean): MapAttendance {
  const { groups, going } = countsOf(party);
  const own = attendeeOf(party, input.memberId);
  const ownStatus = own && mapStatus(own);
  const mine = own && ownStatus ? { status: ownStatus, group: own.group } : null;
  const actions: MapPress[] = input.readOnly
    ? []
    : [
        { action: 'interested' },
        { action: 'join' },
        { action: 'here' },
        ...(hatched ? [{ action: 'done' as const }] : []),
        ...(mine ? [{ action: 'leave' as const }] : []),
      ];
  const pick = groupPick(party, input);
  const remote = { offered: !input.readOnly && remoteAllowed(party), on: own?.remote ?? false };
  // The completion question to this member (plan 8M-8B), until no answer counts as done.
  const until =
    !input.readOnly && own?.status === PartyStatus.CompletePending ? own.pendingUntil : undefined;
  // Group… (plan 8M-8B), none while read-only (X10).
  const regroup = input.readOnly ? undefined : input.regroup?.(party);
  return {
    groups,
    going,
    mine,
    actions,
    ...(pick === undefined ? {} : { pick }),
    remote,
    count: !input.readOnly,
    ...(until === undefined ? {} : { asked: { until, word: partyWord(party) } }),
    ...(regroup === undefined ? {} : { regroup }),
  };
}

/**
 * Whether a member may change a meetup on the map (spec 3.7, "its maker and staff"; plan 8M-5M):
 * the member who made it, or staff (an admin, a moderator, the bot's owner). The commands let
 * anybody in the post change its name, information and end; the map asks more (a meetup's text
 * is safety-relevant since plan 8S-1; plan 8M-8B leaves it so, Matt to confirm). A start also
 * needs what `/meet` asks, a sign-up (`mayArrange`).
 */
export function mayEditMeetup(
  party: Pick<MeetupParty, 'createdById'>,
  memberId: string,
  staff: boolean,
): boolean {
  return staff || party.createdById === memberId;
}

function raidOf(party: RaidParty, link: string, input: PartyViewInput): MapRaid | null {
  const stage = raidStage(party, input.now);
  if (stage === 'ended') return null;
  const look = input.look(party);
  return {
    kind: 'raid',
    id: party.id,
    gymId: party.gymId,
    picture: allowedPicture(look.picture, input.pictureOrigins) ?? null,
    tier: raidWords(party.raid.tier),
    tierGroup: raidTierGroup(party.raid.tier),
    heading: look.heading ?? raidWords(party.raid.tier),
    boss: look.boss ?? null,
    stage,
    hatchTime: party.hatchTime,
    endTime: party.endTime,
    link,
    place: look.place
      ? { ...look.place, lat: round(look.place.lat), lon: round(look.place.lon) }
      : null,
    // Discord's rule (Matt, plan 8M-8B): anybody in the post may set the hatch, the end and the
    // boss; on the map, anybody it shows the raid to, which leaves out who is barred from its forum.
    mayChange: !input.readOnly,
    attendance: attendanceOf(party, input, stage === 'hatched'),
    postKey: input.postKey?.(party) ?? null,
    ...closeOf(party, input),
    ...reportOf(party, input),
  };
}

/**
 * A max battle as the map shows it (plan 8X-5; design 7), as a raid is (`raidOf`): its boss and
 * picture as its post shows them, the tier in the posts' words, its end and where it is; Done
 * always among its buttons. None once its end has come, nor without the renderer's `maxLook`.
 */
function maxOf(party: MaxParty, link: string, input: PartyViewInput): MapMax | null {
  if (maxEnded(party, input.now) || input.maxLook === undefined) return null;
  const look = input.maxLook(party);
  const { tier } = party.max;
  return {
    kind: 'max',
    id: party.id,
    spotId: look.spotId,
    picture: allowedPicture(look.picture, input.pictureOrigins) ?? null,
    level: tier,
    tier: maxTierLabel(tier),
    boss: look.boss,
    title: maxBossTitle(look.boss, tier),
    endTime: party.endTime ?? party.lastPossibleTime ?? input.now,
    link,
    place: { ...look.place, lat: round(look.place.lat), lon: round(look.place.lon) },
    attendance: attendanceOf(party, input, true),
    postKey: input.postKey?.(party) ?? null,
    ...closeOf(party, input),
    ...reportOf(party, input),
  };
}

/**
 * What the member may do to a train's route on the map (spec 3.7), as the commands decide it
 * (`mayNotArrange`, `mayNotClear`, `mayNotLoad`); nothing while read-only.
 */
export function trainRights(party: TrainParty, input: PartyViewInput): MapTrainRights {
  if (input.readOnly) return { arrange: false, clear: false, load: false };
  const { memberId, staff } = input;
  return {
    arrange: mayNotArrange(party, memberId, staff) === undefined,
    clear: mayNotClear(party, memberId, input.botStaff ?? staff) === undefined,
    load: mayNotLoad(party, memberId, staff) === undefined,
  };
}

/**
 * Move… as the member may use it on the map (plan 8M-8C): none for who may not move the train
 * (`mayNotMove`), for a train without a route, and while read-only; else the post's dialog as
 * the caller's `trainMoves` draws it (`moveForm`), none without it.
 */
export function trainMovesOf(party: TrainParty, input: PartyViewInput): MapMoves | null {
  if (input.readOnly || party.train.route.length === 0) return null;
  if (mayNotMove(party, input.memberId, input.staff) !== undefined) return null;
  return input.trainMoves?.(party) ?? null;
}

/**
 * Why the member may not move the train on the map (review N1), as the commands decide it
 * (`mayNotMove`: `not-conductor`, `not-attending`), or that it has no route yet (`no-route`) or
 * the map is read-only (`read-only`); null where they may. The train carries it with the words
 * the caller gives (`trainRefusal`), which the page says under the post's Move… and Manage…,
 * never working it out or wording it itself.
 */
export function moveRefusalOf(party: TrainParty, input: PartyViewInput): MapMoveRefusal | null {
  if (input.readOnly) return 'read-only';
  const refused = mayNotMove(party, input.memberId, input.staff);
  if (refused !== undefined) return refused;
  return party.train.route.length === 0 ? 'no-route' : null;
}

/**
 * Whether Manage… opens for the member on the map (branch review B2 of 8M-8C): as Discord decides
 * it before the dialog opens (`manageRefusal`, `mayNotMove`: who may move the train and staff,
 * whether or not it has a route yet), never while read-only.
 */
export function mayManageOf(party: TrainParty, input: PartyViewInput): boolean {
  return !input.readOnly && mayNotMove(party, input.memberId, input.staff) === undefined;
}

/** The conductor of a train as the member sees it, and what they may do of it. */
export function conductorOf(party: TrainParty, input: PartyViewInput): MapConductor {
  const { conductorId } = party.train;
  const { memberId } = input;
  const who = conductorId === null ? null : conductorId === memberId ? 'you' : 'other';
  if (input.readOnly) return { who, mayTake: false, mayDrop: false };
  return {
    who,
    mayTake: who !== 'you' && attendeeOf(party, memberId) !== undefined,
    mayDrop: conductorId !== null && mayNotClear(party, memberId, input.staff) === undefined,
  };
}

function trainOf(party: TrainParty, link: string, input: PartyViewInput): MapTrain {
  const { route, stop } = party.train;
  const refused = moveRefusalOf(party, input);
  return {
    kind: 'train',
    id: party.id,
    name: party.timed.name,
    trainKind: party.train.kind,
    trainKindWords: TRAIN_KIND_WORDS[party.train.kind],
    startTime: party.timed.startTime,
    endTime: party.endTime,
    route: route.map(stopKey),
    spots: route.flatMap((ref) => {
      if (ref.kind !== 'powerspot') return [];
      const spot = input.spotOf?.(ref.id);
      return spot ? [{ key: stopKey(ref), ...spot }] : [];
    }),
    stop: stop < route.length ? stop : null,
    atEnd: endMode(party),
    stopsAhead: stopsAhead(route.length, stop, endMode(party)),
    ahead: input.trainAhead?.(party) ?? null,
    link,
    attendance: attendanceOf(party, input, false),
    postKey: input.postKey?.(party) ?? null,
    may: trainRights(party, input),
    moves: trainMovesOf(party, input),
    conductor: conductorOf(party, input),
    moveRefusal:
      refused === null ? null : { reason: refused, text: input.trainRefusal?.(refused) ?? '' },
    mayManage: mayManageOf(party, input),
    ...closeOf(party, input),
    ...reportOf(party, input),
  };
}

/**
 * A meetup's place as the map shows it (plan 8M-5M): the snapshot it was named as, in words: a
 * gym or stop `At <title>`; a pin named by a gym or stop near it `Near <title>`, by the name
 * its link gave `At <name> (a pin)`, else `At a dropped pin`.
 */
export function meetupPlaceOf(place: MeetupParty['meetup']['place']): MapMeetupPlace | null {
  if (place === null) return null;
  if (place.kind === 'pin') {
    const words =
      place.near !== null
        ? `Near ${place.near.title}`
        : place.linkName !== null
          ? `At ${place.linkName} (a pin)`
          : 'At a dropped pin';
    return { kind: 'pin', words, lat: place.lat, lon: place.lon, gymId: null, at: null };
  }
  const gymId = place.kind === 'gym' && /^\d+$/u.test(place.id) ? Number(place.id) : null;
  return {
    kind: place.kind,
    words: `At ${place.title}`,
    lat: place.lat,
    lon: place.lon,
    gymId,
    at: { key: `${MEETUP_PLACE_KEYS[place.kind]}:${place.id}`, name: place.title },
  };
}

/**
 * The prefix of a place's key on the map by its kind (plan 8M-15), as the page's things at one
 * place key theirs: a gym's dot and raids `gym:`, a stop's reports `stop:`, a Power Spot's battle
 * and a train's stop there `spot:`.
 */
const MEETUP_PLACE_KEYS = { gym: 'gym', stop: 'stop', powerspot: 'spot' } as const;

/**
 * The editor of a meetup on the map as the member may use it (plan 8M-5M): its maker and staff
 * (`mayEditMeetup`), the start only signed up (`mayArrange`, as `/meet`); none while read-only.
 */
export function meetupPanelOf(party: MeetupParty, input: PartyViewInput): MapMeetup['panel'] {
  if (input.readOnly || !mayEditMeetup(party, input.memberId, input.staff)) return null;
  return { start: mayArrange(party, input.memberId) };
}

function meetupOf(party: MeetupParty, link: string, input: PartyViewInput): MapMeetup {
  return {
    kind: 'meetup',
    id: party.id,
    name: party.timed.name,
    startTime: party.timed.startTime,
    endTime: party.endTime,
    link,
    attendance: attendanceOf(party, input, false),
    postKey: input.postKey?.(party) ?? null,
    place: meetupPlaceOf(party.meetup.place),
    info: party.meetup.description,
    panel: meetupPanelOf(party, input),
    ...closeOf(party, input),
    ...reportOf(party, input),
  };
}

/**
 * One party as the member sees it on the map, or null when it is not theirs to see: of another
 * server, not active, without its post yet, in a forum they are barred from, or over by the
 * clock (a raid at its end, a meetup or train past its end time) though the store has not ended
 * it yet.
 */
export function mapParty(party: Party, input: PartyViewInput): MapParty | null {
  const { forumChannelId, forumPostId } = party;
  if (party.guildId !== input.guildRow || party.status !== 'active') return null;
  if (forumChannelId === null || forumPostId === null) return null;
  if (input.barred.has(forumChannelId)) return null;
  const link = postLink(input.guildId, forumPostId);
  if (isRaid(party)) return raidOf(party, link, input);
  if (isMax(party)) return maxOf(party, link, input);
  if (!isTimed(party)) return null;
  if (timedOver(party, input.now)) return null;
  return party.type === 'train' ? trainOf(party, link, input) : meetupOf(party, link, input);
}

/** The server's active parties as the member sees them, by kind, in the order they were made. */
export function partyView(input: PartyViewInput): PartiesView {
  const view: PartiesView = {
    zone: input.zone,
    readOnly: input.readOnly,
    raids: [],
    maxes: [],
    trains: [],
    meetups: [],
  };
  for (const party of input.parties) {
    const shown = mapParty(party, input);
    if (shown?.kind === 'raid') view.raids.push(shown);
    else if (shown?.kind === 'max') view.maxes.push(shown);
    else if (shown?.kind === 'train') view.trains.push(shown);
    else if (shown?.kind === 'meetup') view.meetups.push(shown);
  }
  return view;
}
