import type { DroppedPin, KnownPlace, Place } from '../geo/place.js';
import { BATTLE_KINDS, type BattleKind, type MaxTier } from '../pogo/max-tier.js';
import type { RaidTier } from '../pogo/raid-tier.js';
import { PartyStatus } from './status.js';
import type { StopRef } from './stops.js';

export type { StopRef };

/** A party has at most five groups, named by these letters in this order. */
export const GROUP_IDS = ['A', 'B', 'C', 'D', 'E'] as const;
export type GroupId = (typeof GROUP_IDS)[number];

export function isGroupId(value: string): value is GroupId {
  return (GROUP_IDS as readonly string[]).includes(value);
}

/** The teams of the game, as a member's role in the server names them. */
export const TEAMS = ['instinct', 'mystic', 'valor'] as const;
export type Team = (typeof TEAMS)[number];

/** The team a member's roles name: the first of the teams that one of them is called. */
export function teamOfRoles(roleNames: Iterable<string>): Team | undefined {
  const names = new Set([...roleNames].map((name) => name.trim().toLowerCase()));
  return TEAMS.find((team) => names.has(team));
}

/** A display name is kept no longer than this (Discord allows 32 characters). */
export const MAX_MEMBER_NAME = 32;

/** A status an attendee can have. Not interested means: no attendee record. */
export type AttendeeStatus = Exclude<PartyStatus, typeof PartyStatus.NotInterested>;

export interface Attendee {
  /** Head count this member brings, themself included; at least 1. Shown as `+<number - 1>`. */
  number: number;
  status: AttendeeStatus;
  group: GroupId;
  /** Takes part with a remote raid pass. */
  remote: boolean;
  /**
   * Set while the status is `CompletePending`: the moment (epoch ms) from which no answer to
   * "have you completed this raid?" counts as yes.
   */
  pendingUntil?: number;
  /**
   * The member's display name and team as they were when the member last acted on the party
   * (see `noteMember`). The bot has no member list to look them up in, so the post is sorted
   * by what it saw then. Absent for a member it never saw act.
   */
  name?: string;
  team?: Team;
  /**
   * The member whose Done asked this attendee whether they completed the raid too. Set with
   * `pendingUntil` and kept when the attendee completes (by answering yes, by saying nothing in
   * time, or by Done of their own): it is how `withdrawQuestions` knows whether anybody followed
   * that member. Any other status drops it. Absent when the scheduler asked (a meeting time).
   */
  askedBy?: string;
}

/** A "have you completed this raid?" message in the post, and the members it asked. */
export interface CompletionQuestion {
  /** The id of the message. */
  id: string;
  /**
   * The members it asked. It has served once none of them is still asked. Empty for a question
   * of a version 2 document, which has served once nobody at all is asked.
   */
  members: readonly string[];
}

/** Messages of the bot in the post that it removes again when they have served. */
export interface PartyPrompts {
  /** The completion questions that still have somebody to answer. */
  completion: readonly CompletionQuestion[];
  /** The warning that the post will be archived; null while there is none. */
  warning: string | null;
}

/** A party remembers at most this many completion questions; older ones are deleted. */
export const MAX_COMPLETION_PROMPTS = 10;

export const NO_PROMPTS: PartyPrompts = { completion: [], warning: null };

export interface PartyGroup {
  id: GroupId;
  label?: string;
  /** The group's meeting time, epoch ms. */
  startTime?: number;
  /** Set once the meeting time has passed: when it is removed and the group is asked. */
  startClearTime?: number;
  /**
   * When the group was opened, epoch ms (plan 8X-1B): a group nobody is in goes
   * (`pruneGroups`) and a later one may take its letter, so what names a group across time
   * names it by its letter and this (`groupStamp`). Absent for a group of a document before
   * version 12, which counts as opened with the party (`groupOpened`).
   */
  opened?: number;
}

/** When a group was opened: its own stamp, else (a group of an older document) the party's making. */
export function groupOpened(
  party: Pick<PartyCore, 'createdAt'>,
  group: Pick<PartyGroup, 'opened'>,
): number {
  return group.opened ?? party.createdAt;
}

/**
 * A group's stamp as a custom id or a step of the history carries it: when it was opened
 * (`groupOpened`), in base 36. With the letter it names the group across time: a group opened
 * again under a letter that a pruned group had is another.
 */
export function groupStamp(
  party: Pick<PartyCore, 'createdAt'>,
  group: Pick<PartyGroup, 'opened'>,
): string {
  return groupOpened(party, group).toString(36);
}

/**
 * The groups in letter order, A to E: the order a party keeps them in, and so the order the
 * post, the dialogs, `/shout group:` and the map list them (plan 8X-G, Matt 2026-10-22). Before,
 * they were kept in the order they were opened, so a letter given again came after later ones
 * (C D E A). A new group is put in its place (`withGroupAdded`), a stored party is read sorted.
 */
export function inLetterOrder<G extends Pick<PartyGroup, 'id'>>(groups: readonly G[]): G[] {
  return [...groups].sort((a, b) => GROUP_IDS.indexOf(a.id) - GROUP_IDS.indexOf(b.id));
}

/** The groups with one more, in its place by letter (`inLetterOrder`). */
export function withGroupAdded(groups: readonly PartyGroup[], group: PartyGroup): PartyGroup[] {
  return inLetterOrder([...groups, group]);
}

/**
 * The groups newest first (by when they were opened, `groupOpened`; the later by letter on a
 * tie): which group takes over as the default one when the default goes (`pruneGroups`, a
 * train's split). The dialogs list them in letter order since plan 8X-G.
 */
export function newestFirst(party: Pick<PartyCore, 'createdAt' | 'groups'>): PartyGroup[] {
  return party.groups
    .map((group, index) => ({ group, index }))
    .sort((a, b) => groupOpened(party, b.group) - groupOpened(party, a.group) || b.index - a.index)
    .map(({ group }) => group);
}

/**
 * The group of this letter while it is the one with this stamp (`groupStamp`); undefined when
 * the party has no such group, or the letter is another group's by now (the one named went and
 * a new one took its letter).
 */
export function stampedGroup(
  party: Pick<PartyCore, 'createdAt' | 'groups'>,
  groupId: string,
  stamp: string,
): PartyGroup | undefined {
  const group = party.groups.find((one) => one.id === groupId);
  return group && groupStamp(party, group) === stamp ? group : undefined;
}

/**
 * A copy of the party's message besides the first message of its post (spec 5.2), with the same
 * controls. `ex` and `remote` are in the server's channels for raids at elite raid gyms and for raids
 * that can be joined remotely; `status` is the copy `/status` puts at the bottom of the post
 * itself (`channelId` is then the post). `region` is a train's copy in the text channel of
 * another region its route has a stop in: one in each such channel. The newest of a kind (of a
 * kind in a channel, for `region`) counts; an earlier one stays recorded until it has been
 * deleted.
 */
export interface MirrorMessage {
  channelId: string;
  messageId: string;
  kind: MirrorKind;
}

export const MIRROR_KINDS = ['ex', 'remote', 'status', 'region'] as const;
export type MirrorKind = (typeof MIRROR_KINDS)[number];

/**
 * Every kind of party, in one list (review A of 8X-3, X3-B-1): the type, the stored party's check
 * and the moderators' reports are built from it, so a kind added later reaches them all.
 */
export const PARTY_TYPES = ['raid', 'train', 'meetup', 'max'] as const;
export type PartyType = (typeof PARTY_TYPES)[number];

/** Whether a stored text names a kind of party. */
export function isPartyType(value: string): value is PartyType {
  return (PARTY_TYPES as readonly string[]).includes(value);
}
export type PartyLifeStatus = 'active' | 'ended';

/** What every kind of party has. Times are epoch milliseconds. */
export interface PartyCore {
  /** UUID; also the id in the custom ids of the party's controls. */
  id: string;
  /** Row id of the guild (`Guild.id`), not its snowflake. */
  guildId: number;
  status: PartyLifeStatus;
  /** Row id of the region the party is in; null once that region was deleted. */
  regionId: number | null;
  /** The gym of a raid; null once that gym was deleted, and for a party that is at no gym. */
  gymId: number | null;
  /** The forum the post is in, and the post (a thread). Null until the post exists. */
  forumChannelId: string | null;
  forumPostId: string | null;
  /** The line in the region's text channel that links to the post ("New raid: …"). */
  regionLinkMessageId: string | null;
  mirrorMessages: readonly MirrorMessage[];
  /** Snowflake of the member who reported or made it, also when the report is anonymous. */
  createdById: string;
  /**
   * That member's display name as the bot last saw it (`noteMember`), for naming them in the
   * post also when they are not signed up. Absent when the bot never saw it.
   */
  makerName?: string;
  /**
   * The reporter of a raid asked not to be named (`User.raidPrivacy`). Always false for a
   * meetup, which names who made it.
   */
  anonymous: boolean;
  hatchTime: number | null;
  endTime: number | null;
  /** The latest moment the party can still be going on; what the clean-up goes by. */
  lastPossibleTime: number | null;
  /** When the post is archived; null while that is not scheduled. */
  deletionTime: number | null;
  /** Kept by a moderator: never archived automatically. */
  saved: boolean;
  createdAt: number;
  updatedAt: number;
  /**
   * By member snowflake, in the order they signed up. (Snowflakes are too long to be array
   * indices, so an object keeps that order; the stored document is a list for the same reason.)
   */
  attendees: Readonly<Record<string, Attendee>>;
  /**
   * In the order they were created; never empty. A group nobody is in goes after the change that
   * emptied it, unless it has a label or a meeting time (`pruneGroups`).
   */
  groups: readonly PartyGroup[];
  /** The group a new attendee lands in: the newest one. */
  defaultGroupId: GroupId;
  prompts: PartyPrompts;
}

/**
 * A raid's boss: the catalogue key of a Pokémon the game master knows, or the feed's name for
 * one it does not know yet. Names of known Pokémon are never stored: they can change.
 */
export type RaidBossRef = { key: string } | { name: string };

export function sameBoss(a: RaidBossRef | null, b: RaidBossRef | null): boolean {
  if (a === null || b === null) return a === b;
  if ('key' in a) return 'key' in b && a.key === b.key;
  return 'name' in b && a.name === b.name;
}

/**
 * The boss of a party that can have one: what a raid is against, and what a train is after.
 * Null for a party without one, of whatever kind.
 */
export function bossOf(party: Party): RaidBossRef | null {
  switch (party.type) {
    case 'raid':
      return party.raid.boss;
    case 'train':
      return party.train.boss;
    case 'max':
      return party.max.boss;
    case 'meetup':
      return null;
  }
}

export type RaidStage = 'egg' | 'hatched' | 'ended';

export interface RaidDetails {
  tier: RaidTier;
  /** Null for an egg, and for a raid whose boss nobody has named. */
  boss: RaidBossRef | null;
  /**
   * The report named a boss, so the raid had hatched when it was reported. Without times this,
   * and not the boss, says whether the raid is an egg: naming the boss an egg will have does
   * not hatch it.
   */
  reportedHatched: boolean;
  /** Move ids of the catalogue (`Move.id`). */
  fastMove: string | null;
  chargedMove: string | null;
  /** Minutes the hatched raid lasts, when a member set it for this raid (`/duration`). */
  hatchedDuration: number | null;
  /** The stage the post last showed; the scheduler compares it with the clock (see `partyTick`). */
  stageSeen: RaidStage;
  /**
   * The screenshot the raid was reported from, null for a raid reported without one. `id` is
   * the kept screenshot (`ScreenshotStore`), which the post's "Screenshot feedback" button shows;
   * null when it could not be kept. `timeUncertain`: its times were guessed from when the
   * screenshot was posted, or the screenshot was taken a while before; the post says so until
   * somebody sets a time (`/hatch`, `/end`, "Set time").
   */
  screenshot: RaidScreenshot | null;
}

export interface RaidScreenshot {
  id: string | null;
  timeUncertain: boolean;
}

export interface RaidParty extends PartyCore {
  type: 'raid';
  raid: RaidDetails;
}

/** The name of a party that has one has at most this many characters, once it is tidied. */
export const MAX_PARTY_NAME = 80;
/** What a form's paragraph input holds, and little enough to be shown whole in the post. */
export const MAX_MEETUP_DESCRIPTION = 1000;

/**
 * What a party with a name and times of its own has, whatever its kind: a meetup (which adds
 * `meetup` beside it) and a train (which adds `train`). Its end is `endTime`.
 */
export interface TimedDetails {
  /** One line, 1 to `MAX_PARTY_NAME` characters. */
  name: string;
  /** When the party starts, for everybody; the groups of such a party have no meeting times. */
  startTime: number | null;
}

export interface MeetupDetails {
  /** What the members wrote about it (`/info`), at most `MAX_MEETUP_DESCRIPTION` characters. */
  description: string | null;
  /**
   * Where it is, set once when it is made (`/meetup near:`; Matt, 2026-10-17): a gym, PokéStop or power
   * spot as it was when it was named (a snapshot; the post shows it as it is now while it is
   * still the same place, `shownPlace`), or a pin; null for none.
   */
  place: MeetupPlace | null;
}

/** The place of a meetup: a gym, PokéStop or power spot as it was named, or a pin. */
export type MeetupPlace = Place;

/** A meetup is at no gym and hatches from nothing; its `endTime` is when it ends. */
export interface MeetupParty extends PartyCore {
  type: 'meetup';
  gymId: null;
  hatchTime: null;
  timed: TimedDetails;
  meetup: MeetupDetails;
}

/** A route has at most this many stops: more than a train gets to, and what one message lists. */
export const MAX_ROUTE_STOPS = 50;

/**
 * What a train does when Next is pressed at the last stop of its route: it finishes the route
 * (`finish`), goes round to the first stop again (`loop`), or runs the route backwards from
 * there (`turn-back`). A route of one stop finishes in every mode: there is nowhere to go round
 * or back to.
 */
export const TRAIN_AT_END = ['finish', 'loop', 'turn-back'] as const;
export type TrainAtEnd = (typeof TRAIN_AT_END)[number];

export function isTrainAtEnd(value: unknown): value is TrainAtEnd {
  return typeof value === 'string' && (TRAIN_AT_END as readonly string[]).includes(value);
}

/**
 * What kind of battles a train goes to (plan 8X-4; design `2026-10-20-max-battles-design.md`,
 * 6.1): raids, Dynamax battles or Gigantamax battles, one spelling with the lobbies' kinds
 * (`BattleKind`, design 10). It sets the lobby (`lobbySize`, `splitLobby`) and how the post heads
 * it; `/boss` takes any Pokémon whatever the kind.
 */
export type TrainKind = BattleKind;
export const TRAIN_KINDS = BATTLE_KINDS;

export function isTrainKind(value: unknown): value is TrainKind {
  return typeof value === 'string' && (TRAIN_KINDS as readonly string[]).includes(value);
}

/** The other train of a split (plan 8T): its party and its post. */
export interface TrainLink {
  partyId: string;
  postId: string;
}

/**
 * The train a train was split off from (plan 8T). `pending` while the split is not settled: the
 * new train is stored and has its post, and the one write of both trains (the old one loses the
 * group, this one is made to match) has not committed. That write clears it (`splitSettled`); a
 * train still pending at start never had the group and is taken back
 * (`PartyService.settlePendingSplits`).
 */
export interface SplitFrom extends TrainLink {
  pending?: true;
}

/**
 * A group that was split off a train and became a train of its own (plan 8T): that train, and
 * the group as it was called when it left (its letter, and its label when it had one).
 */
export interface SplitOff extends TrainLink {
  group: GroupId;
  label?: string;
  /** When the group was opened (`PartyGroup.opened`); absent for one of an older document. */
  opened?: number;
}

/**
 * A train remembers this many of the groups that were split off it, the newest first: a train
 * has at most five groups at a time, and the small print of its post lists them.
 */
export const MAX_SPLITS_KEPT = 10;

/** What only a train has, of any kind (the functions that change it are in `train.ts`). */
export interface TrainDetails {
  /** What kind of battles it goes to (`TrainKind`, plan 8X-4): `raid` unless its maker said. */
  kind: TrainKind;
  /**
   * The stops the train visits, in order: gyms and power spots by reference (`StopRef`, plan
   * 8X-4); no stop twice (`stopKey`), at most `MAX_ROUTE_STOPS`.
   */
  route: readonly StopRef[];
  /**
   * The index of the stop the train is at, from 0. With a route that is not empty,
   * `route.length` means the route is finished; an empty route has only 0.
   */
  stop: number;
  /**
   * The stop the train was at when a move finished its route (Finish, or Next from the last
   * stop): Previous leads back there, so that a mistaken Finish can be taken back. A stop and not
   * an index, so that it follows its stop through the edits of the route. Null whenever the
   * route is not finished, when an edit finished it (the last stop was removed under the
   * train), and once that stop is no longer on the route.
   */
  finishedFrom: StopRef | null;
  /** What the train does at the last stop of its route (`TRAIN_AT_END`). */
  atEnd: TrainAtEnd;
  /** Snowflake of the member who leads the train; null while nobody does. */
  conductorId: string | null;
  /** The Pokémon the train is after, when somebody said (`/boss`). */
  boss: RaidBossRef | null;
  /** The train this one was split off from (`splitTrain`), with its post; null for any other. */
  splitFrom: SplitFrom | null;
  /** The groups split off this train, newest first, at most `MAX_SPLITS_KEPT`. */
  splitOff: readonly SplitOff[];
}

/**
 * A raid train: a timed party that moves along a route of gyms. `gymId` stays null (that column
 * serves the rule of one raid per gym): the gym of a train is its current stop (`currentStop`).
 */
export interface TrainParty extends PartyCore {
  type: 'train';
  gymId: null;
  hatchTime: null;
  timed: TimedDetails;
  train: TrainDetails;
}

/**
 * Where a max battle is (design `2026-10-20-max-battles-design.md`, 3.1): a power spot as it was
 * named (a snapshot, as a meetup's place: the post shows it as it is now while it is the same
 * place, `shownPlace`), or a pin, an "Unlisted power spot" (Q7: a maps link or coordinates with
 * no known power spot within `PIN_NEAR_METRES`).
 */
/** A power spot as a max battle keeps it: a known place of that kind. */
export type PowerSpot = KnownPlace & { kind: 'powerspot' };

export type MaxSpot = PowerSpot | DroppedPin;

export interface MaxDetails {
  /** Dynamax 1 to 5 stars, or Gigantamax (`MAX_TIERS`). */
  tier: MaxTier;
  /** Always known: there is no egg (design 1). */
  boss: RaidBossRef;
  spot: MaxSpot;
  /**
   * Since when it has its boss (plan 8X-S, state version 15): when it was made, or the moment of
   * the screenshot it was made from when that moment is sure; when `/boss` changed it, or a
   * clearly newer screenshot. A screenshot of another boss changes it only when taken after this.
   */
  bossSince: number;
  /**
   * The screenshot it was reported from, as a raid's (`RaidDetails.screenshot`): kept while it
   * lasts; `timeUncertain` says the end is a guess, until `/end` sets it.
   */
  screenshot: RaidScreenshot | null;
}

/**
 * A max battle (plan 8X-3; design 3.1): a battle at a power spot or a pin, with groups of a lobby
 * size by its tier, Done meaning completed (`isBattle`), and an end that is always set (the day's
 * last battle time or earlier: `defaultMaxEnd`). `gymId` stays null (that column serves the one
 * raid per gym rule; one max battle per spot is the store's, `PartyStore.maxAt`), and it hatches
 * from nothing.
 */
export interface MaxParty extends PartyCore {
  type: 'max';
  gymId: null;
  hatchTime: null;
  max: MaxDetails;
}

export type Party = RaidParty | MeetupParty | TrainParty | MaxParty;

/**
 * A party with `timed`: a name, a start time for everybody and an end that members set. What is
 * written for a timed party (`timed.ts`) reads only that part, so it serves both kinds.
 */
export type TimedParty = MeetupParty | TrainParty;

export function isRaid(party: Party): party is RaidParty {
  return party.type === 'raid';
}

/**
 * Named outright (design `2026-10-20-max-battles-design.md`, 3.1, review 1): a kind added later
 * (a max battle) is no timed party by elimination, and code that reads `party.timed` never meets
 * one without it.
 */
export function isTimed(party: Party): party is TimedParty {
  return party.type === 'meetup' || party.type === 'train';
}

/**
 * A party that is a battle (design `2026-10-20-max-battles-design.md`, 3.1, review 3): Done
 * means the member completed it, not that they leave; its present members are asked whether
 * they completed it (`completeRaid`, `askGroupWhetherComplete`, `completeUnanswered`). A raid or
 * a max battle.
 */
export type BattleParty = RaidParty | MaxParty;

export function isBattle(party: Party): party is BattleParty {
  return party.type === 'raid' || party.type === 'max';
}

export function isMax(party: Party): party is MaxParty {
  return party.type === 'max';
}

/**
 * The kept screenshot a party was reported from (a raid's or a max battle's), which the store
 * keeps while the party is active (`ScreenshotStore`'s `shown`); undefined for none.
 */
export function screenshotIdOf(party: Party): string | undefined {
  const shot = isRaid(party) ? party.raid.screenshot : isMax(party) ? party.max.screenshot : null;
  return shot?.id ?? undefined;
}

export function isMeetup(party: Party): party is MeetupParty {
  return party.type === 'meetup';
}

export function isTrain(party: Party): party is TrainParty {
  return party.type === 'train';
}

/**
 * `changed` as the kind of party `original` is, for code that is written for one kind and gets
 * the party back from the store, which holds every kind. A change never alters the kind of a
 * party (`PartyStore.update` refuses one that does), so this only tells the compiler; it throws
 * if that was ever broken.
 */
export function asKindOf<P extends Party>(original: P, changed: Party): P {
  if (changed.type !== original.type || changed.id !== original.id) {
    throw new Error(
      `Party ${original.id} is a ${original.type}, not ${changed.type} ${changed.id}`,
    );
  }
  return changed as P;
}

/**
 * The party with the latest moment it can still be going on brought up to date. A scheduled
 * archiving is called off when that moment turns out to lie ahead: the party is still going on.
 * `deletionTime` belongs to the scheduler (`partyTick`) alone: it sets it when the party is
 * over, and nothing else may schedule an archiving through it, or a corrected time would call
 * that off too.
 */
export function withLastPossibleTime<P extends Party>(
  party: P,
  lastPossibleTime: number,
  now: number,
): P {
  const deletionTime = lastPossibleTime > now ? null : party.deletionTime;
  return { ...party, lastPossibleTime, deletionTime };
}

/** A moderator keeps the party (never archived automatically) or lets it go again. */
export function setSaved<P extends { saved: boolean; deletionTime: number | null }>(
  party: P,
  saved: boolean,
): P {
  return { ...party, saved, deletionTime: saved ? null : party.deletionTime };
}

/** The party after its post was archived. */
export function endParty<P extends { status: string }>(party: P): P & { status: 'ended' } {
  return { ...party, status: 'ended' };
}

const PARTY_WORDS: Readonly<Record<PartyType, string>> = {
  raid: 'raid',
  train: 'train',
  meetup: 'meetup',
  max: 'max battle',
};

/** What a kind of party is called in a sentence: `this raid`, `this train`, `this meetup`. */
export function partyWord(party: { type: PartyType }): string {
  return PARTY_WORDS[party.type];
}

/**
 * Whether members can open groups in this kind of party, and move between them: in a raid and
 * in a train. A meetup has its one group for good (as with the legacy bot, whose group commands
 * a meetup did not have).
 */
export function hasGroups(party: Party): boolean {
  return party.type !== 'meetup';
}

/** Why a change was refused. The commands turn these into sentences. */
export type PartyProblem =
  /** The member has no attendee record. */
  | 'not-attending'
  /** A meetup's times are set by its maker and staff alone (`mayEditMeetup`). */
  | 'not-yours'
  | 'no-such-group'
  /** A head count below 1 or above the allowed maximum. */
  | 'bad-count'
  /** Elite raids cannot be done remotely. */
  | 'in-person-only'
  | 'too-many-groups'
  /** The member was not asked whether they completed the raid. */
  | 'not-pending'
  | 'label-too-long'
  /** The raid is still an egg: nobody can have completed it. */
  | 'not-hatched'
  | 'no-boss'
  | 'bad-duration'
  /** The member has completed the raid; how they come no longer matters. */
  | 'already-done'
  /** This kind of party has one group for good (a meetup). */
  | 'no-groups'
  /** The party starts for everybody at once: its groups have no meeting times of their own. */
  | 'party-wide-start'
  /** A name that is empty or too long. */
  | 'bad-name'
  | 'description-too-long'
  /** The end would not lie after the start. */
  | 'end-before-start'
  /** The start would not lie before the end. */
  | 'start-after-end'
  /** Another raid of this kind already holds the gym. */
  | 'gym-taken'
  /** The change would make an Elite egg without its hatch time (plan 8F-1, 8E-1). */
  | 'elite-egg-time'
  /** Another max battle already holds the spot (plan 8X-3: a later end of an ended one). */
  | 'spot-taken'
  /**
   * A max battle's boss changed between Dynamax and Gigantamax (design 3.1): the lobby size would
   * jump; it is reported anew.
   */
  | 'max-kind-change'
  /**
   * A screenshot showed another boss at a max battle's spot, its moment not sure or no newer than
   * the battle's boss (plan 8X-S, design 6): `/boss` there changes it.
   */
  | 'max-other-boss'
  /** The gym lies in no region of the raid's server that has a forum for its post. */
  | 'other-region'
  /** The post of a raid in the region it moves to went while it was being made: it stays. */
  | 'post-not-made'
  /** The bot may not make posts in the forum of the region it moves to (plan 8S-3): it stays. */
  | 'posts-refused'
  /** The gym was deleted from the gym list meanwhile: nothing can be at it or go there. */
  | 'gym-gone'
  /** The power spot is no longer kept as one (an import found it gone, or of another kind). */
  | 'spot-gone'
  /** The boss of the raid does not have that move. */
  | 'not-a-move'
  /** The train has no route yet: there is nowhere to move it. */
  | 'no-route'
  /** The train has been through its whole route. */
  | 'route-finished'
  /** The train is at its first stop: there is none before it. */
  | 'at-first-stop'
  /** There is no stop after the next one. */
  | 'no-stop-to-skip'
  /** A route of one stop has no other order. */
  | 'one-stop-route'
  /** A train that turns back at the end reverses its route by itself at the last stop. */
  | 'reverse-turns-back'
  /** The route can be reversed only at its first or last stop (a loop: anywhere). */
  | 'reverse-mid-route'
  /** A finished route can be reversed only when it was finished at its last stop. */
  | 'reverse-finished-elsewhere'
  /** The gym is a stop of the route already. */
  | 'already-on-route'
  /** A route holds no more stops. */
  | 'route-full'
  /** The route has no stop with that number. */
  | 'no-such-stop'
  /** A route without a gym: nothing to load, nothing to save. */
  | 'empty-route'
  /** The train has a conductor, and only they and staff move it. */
  | 'not-conductor'
  /** Only the conductor of the train and staff may do this. */
  | 'conductor-or-staff'
  /** The train is no longer where the control that was pressed showed it. */
  | 'train-moved-on'
  /** The route was edited: the control that was pressed would lead elsewhere than it said. */
  | 'route-changed'
  /**
   * The route is no longer the one an edit was drawn from (the live map's route editor): the
   * numbers of its stops may stand for other gyms now.
   */
  | 'route-edited'
  /**
   * The conductor role is no longer whose it was when a button was drawn (the live map): the
   * button would take it over or drop it from somebody it did not show.
   */
  | 'conductor-changed'
  /** A train of one group has nothing to split a group off from. */
  | 'one-group'
  /** Nobody is in that group: there is nobody to make a train of. */
  | 'empty-group'
  /** Everybody on the train is in that group: the old train would be left empty (Matt). */
  | 'whole-train'
  /** The train has no post yet: the train split off it could not link to it. */
  | 'unposted'
  /**
   * The train is the new train of a split that is not settled yet: its members are still on the
   * old train too, and the split may yet be taken back.
   */
  | 'split-pending'
  /** Only a member of the group (or the conductor, or staff) may split it off. */
  | 'not-in-group'
  /** The conductor is in that group: only they and staff may split it off. */
  | 'conductor-in-group'
  /**
   * The group is no longer the one a split's dialog was drawn for (it was split off, or it is
   * called otherwise now): the Submit would split off something it did not show.
   */
  | 'group-changed'
  /** The meeting time Meet… showed is one it no longer offers (it passed, plan 8X-1B). */
  | 'meeting-time-gone'
  /**
   * A new group would change nothing: the member is alone in a plain group of their own, which
   * would go once they left it (`newGroupChangesNothing`, plan 8X-1B).
   */
  | 'nothing-to-change'
  /**
   * Group…'s dialog was drawn for a member signed up, who has left since: its Submit would sign
   * them up again, which they did not ask for (plan 8X-1B).
   */
  | 'no-longer-signed-up'
  /**
   * A change of a timed party drawn from a name, information or time it no longer has (the live
   * map's meetup editor): another change came meanwhile.
   */
  | 'changed-meanwhile';

/** A change that was not made. It has no `party`, which is how `PartyStore.update` knows. */
export interface Refusal {
  ok: false;
  reason: PartyProblem;
  party?: undefined;
}

/** The outcome of a change: the changed party (a new object) and what came of it, or why not. */
export type Change<P, Extra = unknown> = ({ ok: true; party: P } & Extra) | Refusal;

export function refused(reason: PartyProblem): Refusal {
  return { ok: false, reason };
}

export function attendeeOf(party: PartyCore, memberId: string): Attendee | undefined {
  return Object.hasOwn(party.attendees, memberId) ? party.attendees[memberId] : undefined;
}

/**
 * Whether a member may arrange a party: lay its route and set its start. Whoever is signed
 * up; and of a train also the member who made it, signed up or not (Matt, 2026-10-13: a maker
 * whose automatic status is None could otherwise do nothing to their own train). Moving a
 * train and being its conductor still take a sign-up. Since plan 8Z-2 only a train's changes
 * ask it: a meetup's times are its maker's and staff's (`mayEditMeetup`, `timesRefusal`).
 */
export function mayArrange(party: PartyCore & { type: string }, memberId: string): boolean {
  return (
    attendeeOf(party, memberId) !== undefined ||
    (party.type === 'train' && party.createdById === memberId)
  );
}

/**
 * Whether a member may change a meetup: its text (`/name`, `/info`) and its times (`/meet`,
 * `/cancel-meet`, `/end`), on Discord and on the map alike (spec 3.7, "its maker and staff";
 * plan 8Z for the text, plan 8Z-2 for the times: Matt, 2026-11-10): the member who made it, or
 * staff (an admin, a moderator, the bot's owner). No sign-up is asked: a meetup's text and times
 * are safety-relevant since plan 8S-1, and are its maker's whether they are on its list or not.
 */
export function mayEditMeetup(
  party: Pick<MeetupParty, 'createdById'>,
  memberId: string,
  staff: boolean,
): boolean {
  return staff || party.createdById === memberId;
}

/**
 * A member with the display name the party has for them: that of their attendee record, and for
 * the member who made the party the one kept with it. Without a name for anybody else.
 */
export function memberOf(party: PartyCore, memberId: string): { id: string; name?: string } {
  const name =
    attendeeOf(party, memberId)?.name ??
    (memberId === party.createdById ? party.makerName : undefined);
  return name === undefined ? { id: memberId } : { id: memberId, name };
}

export function groupOf(party: PartyCore, id: string): PartyGroup | undefined {
  return party.groups.find((group) => group.id === id);
}

/**
 * Heads expected: the numbers of everybody who has not completed the raid, of one group or of
 * all. Members asked whether they completed it still count.
 */
export function headCount(party: PartyCore, groupId?: GroupId): number {
  let total = 0;
  for (const attendee of Object.values(party.attendees)) {
    if (attendee.status === PartyStatus.Complete) continue;
    if (groupId !== undefined && attendee.group !== groupId) continue;
    total += attendee.number;
  }
  return total;
}

/** The statuses that hold a place in a lobby: coming, here, and asked whether they are done. */
export function isCommitted(status: AttendeeStatus): boolean {
  return (
    status === PartyStatus.Coming ||
    status === PartyStatus.Present ||
    status === PartyStatus.CompletePending
  );
}

/**
 * Heads in a group's lobby (design `2026-10-20-max-battles-design.md`, Q5): the numbers of its
 * committed members (`isCommitted`), remote players included; not who is interested, nor who has
 * completed it. `except` is a member left out of the count (the one being placed).
 */
export function lobbyCount(party: PartyCore, groupId: GroupId, except?: string): number {
  return committedHeads(
    party,
    (attendee, memberId) => memberId !== except && attendee.group === groupId,
  );
}

/**
 * Heads going to a party (plan 8M-7: the map's green count and its list's "Most going"): the
 * lobbies' own rule (`isCommitted`, +1s counted) over every group.
 */
export function goingCount(party: PartyCore): number {
  return committedHeads(party, () => true);
}

/** The numbers of the committed members for which `keep` holds. */
function committedHeads(
  party: PartyCore,
  keep: (attendee: Attendee, memberId: string) => boolean,
): number {
  let total = 0;
  for (const [memberId, attendee] of Object.entries(party.attendees)) {
    if (isCommitted(attendee.status) && keep(attendee, memberId)) total += attendee.number;
  }
  return total;
}

/** Snowflakes of the attendees for which `keep` holds, in the order they signed up. */
export function membersWhere(
  party: PartyCore,
  keep: (attendee: Attendee, memberId: string) => boolean,
): string[] {
  return Object.entries(party.attendees)
    .filter(([memberId, attendee]) => keep(attendee, memberId))
    .map(([memberId]) => memberId);
}

/** Whether members may take part remotely. Elite raids are in person only. */
export function remoteAllowed(party: Party): boolean {
  return !isRaid(party) || party.raid.tier.level !== 'Elite';
}
