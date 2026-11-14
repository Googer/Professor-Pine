import { forumRefusedWords } from '../render/server-notices.js';
import type { ServerNotices } from './server-notices.js';
import type { QuietServers } from './quiet-servers.js';
import { DiscordAPIError } from 'discord.js';
import { isNetworkError } from './network-error.js';
import type { Settings } from '../config/settings.js';
import type { Gym } from '../db/repositories/gym-repository.js';
import type { Region } from '../db/repositories/region-repository.js';
import type { UserSettingsReader } from '../db/repositories/user-repository.js';
import {
  BOARD_SLOWMODE_SECONDS,
  channelLimitOf,
  OLD_BOARD_SLOWMODE_SECONDS,
  isMissingPermission,
  isRefusedBody,
  isRefusedStarter,
  PostsRefusedError,
  rateLimitWaitMs,
  type ForumAccess,
  type ForumHiding,
  type MemberAccess,
  type NewPost,
  type PartyGateway,
  type PostInfo,
  type TagIds,
  type V2Message,
} from '../discord/party-gateway.js';
import { MAX_CATEGORY_CHANNELS, MAX_SERVER_CHANNELS } from '../domain/regions/region-import.js';
import {
  closedEnd,
  historyCounts,
  type PartyEnd,
  type WrittenRecord,
} from '../domain/history/party-history.js';
import { trainShownOnWeb } from '../domain/history/trains-on-web.js';
import {
  raidsAlongQuery,
  type RaidsAlongQuery,
  stopWindows,
  trainCard,
  type RaidAlongRow,
  type TrainCard,
} from '../domain/history/train-card.js';
import type { RaidsAlongReader } from '../db/repositories/history-repository.js';
import type { LeftoverCopies } from '../db/repositories/party-repository.js';
import { leftoversOf } from '../domain/party/leftovers.js';
import type { PostRemoval } from '../domain/moderation/reports.js';
import { applyAutoStatus, noteMember, type MemberInfo } from '../domain/party/attendance.js';
import { lobbySize, splitLobby } from '../domain/party/lobby.js';
import { blocksNewMax, createMax } from '../domain/party/max.js';
import { createMeetup, tidyDescription } from '../domain/party/meetup.js';
import type { PostsRefused } from '../domain/party/post-permissions.js';
import {
  asKindOf,
  isMax,
  isMeetup,
  isRaid,
  isTrain,
  sameBoss,
  type MaxParty,
  type MaxSpot,
  membersWhere,
  partyWord,
  type Change,
  type GroupId,
  type MeetupParty,
  type PartyGroup,
  type PartyProblem,
  type MeetupPlace,
  type Party,
  type RaidBossRef,
  type RaidParty,
  type RaidStage,
  type TimedParty,
  type TrainAtEnd,
  type TrainKind,
  type TrainParty,
  setSaved,
  endParty,
  type RaidScreenshot,
  type BattleParty,
  isBattle,
} from '../domain/party/party.js';
import {
  certainMoves,
  createRaid,
  raidStage,
  setEndTime,
  setHatchTime,
} from '../domain/party/raid.js';
import { carriedOver, relocatedRaid } from '../domain/party/relocate.js';
import { PartyStatus } from '../domain/party/status.js';
import type { NewTimedParty } from '../domain/party/timed.js';
import {
  carriedSplit,
  createTrain,
  currentStop,
  splitOffGroup,
  splitSettled,
  splitTrain,
  stopsStillReached,
} from '../domain/party/train.js';
import { raidEggName } from '../domain/pogo/raid-eggs.js';
import { EggPictures } from './egg-pictures.js';
import {
  FormTrail,
  postForms,
  RefusedFiles,
  refusalSaid,
  sendInForms,
  type FormStep,
  type LeftOut,
  type MessageForms,
} from './refused-files.js';
import type { MaxTier } from '../domain/pogo/max-tier.js';
import type { RaidTier } from '../domain/pogo/raid-tier.js';
import { raidDurationRules, type RaidDurationRules } from '../domain/time/raid-durations.js';
import type { Logger } from '../log.js';
import {
  meetupPlaceNow,
  meetupTitle,
  renderMeetupPost,
  type MeetupPostView,
} from '../render/meetup-post.js';
import {
  FORUM_TAGS,
  RETIRED_TAGS,
  layoutPicture,
  tidyTitle,
  type PartyBrief,
  type PostEmoji,
  type PostLayout,
  type PostVariant,
  type RenderedPost,
  type NeighborsShown,
} from '../render/party-post.js';
import {
  raidLook,
  raidNeighborLine,
  raidTitle,
  renderRaidPost,
  shownAutoset,
  shownBoss,
  type RaidPostView,
} from '../render/raid-post.js';
import { summaryRefusedWords } from '../render/activity.js';
import { customIconText } from '../render/party-controls.js';
import { postLink } from '../render/notify-dm.js';
import { postKey } from '../render/post-view.js';
import { everyLocalMidnightIn, type ZonesMidnight } from './local-midnight.js';
import type { NeighborParties } from './neighbor-parties.js';
import {
  maxNeighborLine,
  maxTitle,
  renderMaxPost,
  shownMaxBoss,
  type MaxPostView,
  spotNow,
} from '../render/max-post.js';
import {
  LEGACY_SUMMARY_TITLES,
  renderRegionLink,
  renderSummary,
  SUMMARY_TITLE,
  type ListedTrain,
  type StopsLine,
} from '../render/summary.js';
import { memberText, plain, type NamedMember } from '../render/text.js';
import type { TimedPostView } from '../render/timed-post.js';
import { renderTrainPost, trainTitle, type TrainPostView } from '../render/train-post.js';
import { stopLabel, stopsFrom, type StopLookup } from '../render/train-stops.js';
import { BoundedMap } from '../bounded-map.js';
import { Turns } from '../turns.js';
import { Coalescer } from './coalescer.js';
import type { GameDataProvider } from './game-data-service.js';
import { KeyedLock } from './keyed-lock.js';
import type { PartyNotifier } from './notify-service.js';
import { PartyMirrors } from './party-mirrors.js';
import { byMember, loggedBy, pingInMessages, settingsOf } from './party-change.js';
import { RegionClosedError, type PairChange, type PartyStore } from './party-store.js';
import type { Rehearsal } from './rehearsal.js';
import type { MaxBossProvider } from './max-boss-service.js';
import type { RaidBossProvider } from './raid-boss-service.js';
import type { RaidEventProvider } from './raid-event-service.js';
import type { WayspotProvider } from './wayspot-directory.js';
import type { AddressedWayspot } from '../domain/geo/spot-address.js';
import {
  gymRegionsInGuild,
  regionsAtPoint,
  stopRegionsInGuild,
  type RegionProvider,
} from './region-directory.js';
import type { GymProvider } from './gym-directory.js';
import type { ServerSettingsLookup } from './server-settings.js';
import { DEFAULT_REGION_FORUM_SUFFIX } from '../config/settings.js';

const MINUTE = 60_000;

/**
 * How many of a forum's latest archived posts a lost board is looked for among: one page, one
 * request (review S7), where a raid forum may have thousands.
 */
const ARCHIVED_BOARD_READ = 100;
/** Logged when a party that cannot be shown cannot be ended either. */
const NO_POST = 'could not end a party without a post';

/**
 * The first message of a post where Discord refuses a components-v2 one there: it is edited into
 * the post at once (see `PartyService.createPost`).
 */
export const FIRST_LINE = 'Setting up this post…';

/** The post of a new party went while it was being made: it could not be finished. */
class PostLostError extends Error {
  constructor() {
    super('the new post went while it was being made');
  }
}
/** Discord lets a thread be renamed twice in ten minutes. */
const RENAMES = 2;
const RENAME_WINDOW_MS = 10 * MINUTE;
/** A retry after a rate limit waits at least this long and at most the rename window. */
const MIN_RETRY_MS = 1_000;
/** A request to the moderators pings at most this many roles (a server has an admin and a moderator role). */
const MAX_ROLE_PINGS = 5;
/** `end` waits at most this long for the answer given before a close. */
const ANSWER_WAIT_MS = 3_000;
/**
 * The close of a train waits as long at most for the raids along its way (plan 8H-7A, review
 * B2), as for the answer before a close: a database that answers slowly must not keep the post
 * open. The card is shown without them then.
 */
export const RAIDS_ALONG_WAIT_MS = ANSWER_WAIT_MS;
/** An unchanged post is checked for existence at most this often. */
const CHECK_EVERY_MS = 10 * MINUTE;
/**
 * When the emoji change, the active posts are shown anew one after the other, one this often:
 * a restart reads the emoji anew, and every post at once would be a burst of edits.
 */
export const EMOJI_RENDER_GAP_MS = 250;

/**
 * How long changes of servers' gyms are gathered before their neighbors' matches are compared
 * (plan 19E, review R9, `neighborGymsChanged`): a Wayfarer import writes its gyms in blocks, each
 * read again, and every pair of the server is compared once for all the blocks of a few seconds.
 */
export const NEIGHBOR_MATCHES_GATHER_MS = 5_000;

/** At most so many closings that failed are kept to be done again (`redoClosings`). */
export const UNDONE_CLOSINGS_MAX = 500;
/** How many posts found gone are remembered, so that each is ended once (`postGone`). */
const POSTS_GONE_KEPT = 1_000;
/**
 * A closing still undone a day after the party ended is forgotten: no post is opened and archived
 * again days later (review r0 B4); the sweep archives what stayed open.
 */
export const UNDONE_CLOSING_KEPT_MS = 24 * 60 * 60 * 1000;

/**
 * Whether a failure of a closing is worth trying again with the upkeep (plan 8X-H, review r0 B5):
 * the network's, or a rate limit discord.js would not wait for. A refusal of Discord's (Missing
 * Access) would fail the same way again.
 */
function worthRedoing(err: unknown): boolean {
  return isNetworkError(err) || rateLimitWaitMs(err) !== undefined;
}

/** A closing of an ended party of which a part failed for the network (`redoClosings`). */
interface UndoneClosing {
  party: Party;
  lastWords: string | undefined;
  /** Whether the last words were said already. */
  said: boolean;
  /** `delete` where a moderator chose it and the deletion failed for the network (review r0 B3). */
  removal: PostRemoval;
  /** When the party ended (its first closing). */
  since: number;
  /**
   * What a train's card is drawn from (plan 8H-7A): the record its ending wrote, and the card as
   * its first closing made it, if it got that far. A redo shows that card (F-B2), made again with
   * the raids read once more where they could not be read then (review B5).
   */
  card: TrainCardFacts;
}

/**
 * What the card of a train that ended is drawn from (`closePost`): the record its ending wrote
 * (none where it failed, and for every other party), and the card once made from it.
 */
interface TrainCardFacts {
  recorded?: WrittenRecord | undefined;
  card?: TrainCard | undefined;
  /** A redo read the raids once more already (review R5): no later redo reads them again. */
  readAgain?: boolean | undefined;
}

/**
 * How a party is ended by `end`: why, what is said last, the post archived or deleted, and who
 * closed it (`by`, for the audit log).
 */
export interface PartyClosing {
  lastWords?: string;
  left?: () => Promise<unknown>;
  ended?: PartyEnd;
  removal?: PostRemoval;
  by?: NamedMember;
}

/**
 * How the post of a party went when it ended (`endAs`): `deleting` where a deletion failed for the
 * network, so that the post is archived for now and deleted by `redoClosings` (review r1 C1).
 */
export type PostRemoved = 'archived' | 'deleted' | 'deleting';

export interface RaidReport {
  gym: Gym;
  /** Snowflake of the reporter. */
  reporterId: string;
  /** The reporter's name and team, as the interaction said them, for when they are signed up. */
  reporter?: MemberInfo;
  anonymous: boolean;
  /** The reporter's automatic status (`User.status`). */
  autoStatus: PartyStatus;
  tier: RaidTier;
  /** Null for an egg; a boss means the raid was seen hatched. */
  boss: RaidBossRef | null;
  /** Seen hatched although nobody could tell the boss (a screenshot report): no egg. */
  hatched?: boolean;
  /**
   * The screenshot the raid was reported from (`ctx.screenshots`), which its post offers for
   * feedback, and whether its time is a guess.
   */
  screenshot?: RaidScreenshot;
  /** Left out, a move is set when the boss has only that one (`certainMoves`). */
  fastMove?: string | null;
  chargedMove?: string | null;
  /**
   * The server the report was made in (its `Guild` row): the raid goes to a region of this server,
   * and only while the server has the gym (plan 19B-2).
   */
  guildRow: number;
  /**
   * The region channel the report was made in: the raid goes to that region when it is one of the
   * server's, the gym lies in it and it has a forum.
   */
  regionChannelId?: string;
  /** A time the caller has checked (`resolvePartyTime`): when the egg hatches, or the raid ends. */
  time?: { hatch: number } | { end: number };
  /**
   * Asked, once the report would join a raid already at the gym, whether the reporter may be
   * put in that raid's forum (plan 8W-3): a raid reported moments before, at a gym of two
   * regions, may stand in a forum the caller's own check (`reportBarred`) did not see. Not
   * asked for the forum of the region the raid would go to (the caller checked that one); with
   * it given, a raid whose forum is another by the time the join is written (inside
   * `PartyStore.update`) is not joined either. False: nothing is done (`barred`). Left out:
   * every forum is fine.
   */
  mayJoin?: (forumId: string) => Promise<boolean>;
  /**
   * Only a raid already at the gym is joined: a free gym gets none (`none-there`), decided under
   * the gym's lock (plan 8X-S: a passive screenshot of a gym in another region, whose author is
   * asked before a raid is made there).
   */
  joinOnly?: true;
}

/**
 * A max battle a member reports (`/max`, plan 8X-3): at a power spot or a pin, with its boss and
 * tier, and its end (the default end of `defaultMaxEnd`, or the one the report gave), checked by
 * the caller.
 */
export interface MaxReport {
  spot: MaxSpot;
  /** Snowflake of the reporter. */
  reporterId: string;
  /** The reporter's name and team, as the interaction said them. */
  reporter?: MemberInfo;
  anonymous: boolean;
  /** The reporter's automatic status (`User.status`). */
  autoStatus: PartyStatus;
  tier: MaxTier;
  boss: RaidBossRef;
  endTime: number;
  /** The region channel the report was made in: the battle goes to a region of that server. */
  regionChannelId: string;
  /**
   * Asked, once the report would join the battle already at the spot, whether the reporter may
   * be put in its forum, as `RaidReport.mayJoin`. Left out: every forum is fine.
   */
  mayJoin?: (forumId: string) => Promise<boolean>;
  /**
   * Asked of a report at a pin, before the spot is looked at, whether the reporter may make a new
   * battle there (a member blocked from meetups may not, final review F4): false, a free spot
   * gets none (`pin-blocked`) while the battle there may still be joined. Left out: they may.
   */
  mayCreateAtPin?: () => Promise<boolean>;
  /**
   * The screenshot the battle was reported from (plan 8X-S), kept in a new battle as a raid's
   * (`MaxDetails.screenshot`); a battle joined is not changed by it.
   */
  screenshot?: RaidScreenshot;
  /**
   * Since when a new battle has its boss (`MaxDetails.bossSince`): a screenshot's sure moment
   * (review R10). Left out: when it is made.
   */
  bossSince?: number;
}

/** What `reportMax` decided inside the store about the battle a report joins (review B, B2). */
type JoinStep =
  /** It ended, or no longer holds the spot. */
  | { outcome: 'over'; party?: never }
  /** Its boss is another by now. */
  | { outcome: 'other'; other: MaxParty; party?: never }
  | { outcome: 'joined'; party: Party; joined: boolean };

export type MaxReportOutcome =
  /** A new max battle with its post. */
  | { kind: 'created'; party: MaxParty }
  /** The spot has a battle of this boss: `joined` says whether the reporter was signed up. */
  | { kind: 'exists'; party: MaxParty; joined: boolean }
  /** The spot has a battle of another boss (design Q3): nothing was done; `/boss` there. */
  | { kind: 'taken'; party: MaxParty }
  /** The spot lies in no region of this server. */
  | { kind: 'no-region' }
  /** The spot's region has no forum yet. */
  | { kind: 'no-forum'; region: Region }
  | NoPost
  /** The battle there stands in a forum the reporter may not be put in (`mayJoin`). */
  | { kind: 'barred' }
  /**
   * The battle the report would join ended while it waited, twice over (the one repeat used):
   * nothing was done (fix review F2).
   */
  | { kind: 'ended' }
  /** The spot is a pin, free, and the reporter may make no battle there (`mayCreateAtPin`). */
  | { kind: 'pin-blocked' };

/**
 * A party's post was not made, so nothing was kept: it went while it was being made, or the bot
 * may not make posts in the forum (`refused`: what it lacks there; plan 8S-3).
 */
export interface NoPost {
  kind: 'no-post';
  refused?: PostsRefused;
}

export type ReportOutcome =
  /** A new raid with its post. */
  | { kind: 'created'; party: RaidParty }
  /**
   * The gym has a raid already, of any kind (plan 8E); `joined` says whether the reporter was
   * signed up for it.
   */
  | { kind: 'exists'; party: RaidParty; joined: boolean }
  /** The gym lies in no region of this server. */
  | { kind: 'no-region' }
  /** The gym was deleted from the gym list while the report was on its way. */
  | { kind: 'gym-gone' }
  /** The gym's region has no forum yet (`/admin setup-forums`). */
  | { kind: 'no-forum'; region: Region }
  /** The post could not be made (`noPostWords`): nothing was kept. */
  | NoPost
  /**
   * The gym has a raid already, in a forum the reporter may not be put in
   * (`RaidReport.mayJoin`): they were not signed up, nothing was done.
   */
  | { kind: 'barred' }
  /** A report that may only join (`RaidReport.joinOnly`) found no raid at the gym: none was made. */
  | { kind: 'none-there' };

/** A timed party that a member makes: a meetup with `/meetup`, a train with `/train`. */
export interface TimedRequest {
  /** As the member typed it. */
  name: string;
  /** Snowflake of the member who makes it. */
  creatorId: string;
  /** Their name and team, as the interaction said them: they are signed up as interested. */
  creator?: MemberInfo;
  /** The region channel it is made in: the post goes into the forum of that region. */
  regionChannelId: string;
}

/**
 * A meetup, with where it is when its maker said (`/meetup near:`): set once, never changed;
 * and since plan 8S-1 its start and information, which it is made with (no line announces
 * them).
 */
export interface MeetupRequest extends TimedRequest {
  place?: MeetupPlace | null;
  startTime?: number | null;
  /** When it ends; the caller has read it (`typedNewEnd`). */
  endTime?: number | null;
  description?: string | null;
}

/** A train follows what its maker has set for the raids they report (`NewTrain`). */
export interface TrainRequest extends TimedRequest {
  /** The maker's privacy setting is Anonymous: the post names no maker. Left out: it does. */
  anonymous?: boolean;
  /** The maker's automatic status (`User.status`). Left out: interested. */
  autoStatus?: PartyStatus;
  /** What the train does at the end of its route. Left out: it finishes the route. */
  atEnd?: TrainAtEnd;
  /** What it goes to (plan 8X-4). Left out: raids. */
  kind?: TrainKind;
  /**
   * When it starts, read by the caller (`/train start:`, the map's form, as `/meet` reads it): its post and the
   * news of a new train say it from the first. Left out: no start yet.
   */
  startTime?: number;
}

export type TimedOutcome<P extends TimedParty> =
  /** A new party with its post. */
  | { kind: 'created'; party: P }
  /** The text is no name (`tidyName`). */
  | { kind: 'bad-name' }
  /** What the party cannot be made with otherwise, such as an end not after its start. */
  | { kind: 'cannot-make'; reason: PartyProblem }
  /** The channel is not the channel of a region of a server. */
  | { kind: 'no-region' }
  /** The region has no forum yet (`/admin setup-forums`). */
  | { kind: 'no-forum'; region: Region }
  /** The post could not be made (`noPostWords`): nothing was kept. */
  | NoPost;

export type MeetupOutcome =
  | TimedOutcome<MeetupParty>
  /** The information is longer than a meetup's may be (`tidyDescription`). */
  | { kind: 'bad-description' };
export type TrainOutcome = TimedOutcome<TrainParty>;

/** What came of moving a raid to a gym of another region. */
export type RelocateOutcome =
  /** There is no such active raid. */
  | { kind: 'gone' }
  /** The gym already has a raid, `other`. */
  | { kind: 'taken'; other: RaidParty }
  /** The region has no forum (any more): the raid stays where it is. */
  | { kind: 'no-forum' }
  /** The new post could not be made: the raid stays where it is. */
  | NoPost
  /** The gym was deleted from the gym list meanwhile: the raid stays where it is. */
  | { kind: 'gym-gone' }
  /** `party` is the raid in its new place, `from` the party it was, which has ended. */
  | { kind: 'moved'; party: RaidParty; from: RaidParty };

/** A group of a train to be split off into a train of its own (plan 8T). */
export interface SplitRequest {
  partyId: string;
  /** Who splits it off: the maker of the new train. */
  by: { id: string } & MemberInfo;
  staff: boolean;
  group: GroupId;
  /** Their privacy is Anonymous: the new post names no maker, as for `/train`. */
  anonymous: boolean;
  /** The group's mark as the split's dialog showed it (`groupMark`); a command draws none. */
  drawn?: string;
}

/** What came of splitting a group off a train. */
export type SplitOutcome =
  /** There is no such active train. */
  | { kind: 'gone' }
  /** Not split, as the train said (`splitOffGroup`): nothing was made. */
  | { kind: 'refused'; reason: PartyProblem }
  /** The region of the train has no forum (any more). */
  | { kind: 'no-forum' }
  /**
   * The new post could not be made (`noPostWords`), or the new train ended before the old one
   * lost the group (its post deleted): nothing was kept.
   */
  | NoPost
  /**
   * `party` is the new train with its post, `from` the old one without the group; `group` the
   * group as it was, `moved` the members who went with it, in the order they signed up.
   */
  | {
      kind: 'split';
      party: TrainParty;
      from: TrainParty;
      group: PartyGroup;
      moved: readonly string[];
    };

/**
 * What the summary reads of the post "Today’s Stops" of a region's channel (plan 8X-G;
 * `StopPostService.summaryOf`): its server, the board post it is in (plan 8R-9: the summary's
 * own) and its first message, and how many tasks and hideouts it names (and, under an event's
 * window, the day's research waiting: plan 8R-6); undefined where the channel has no post today.
 * `boardChanged` is told when the region's board post is made or taken over (plan 8R-9, B2), so
 * that the stops are drawn in it.
 */
export interface StopPostsForSummary {
  summaryOf(
    channelId: string,
  ):
    | ({ serverId: string; threadId: string; messageId: string } & Omit<StopsLine, 'url'>)
    | undefined;
  boardChanged(channelId: string): void;
}

/** What the party service needs of the region table. */

export interface SummaryStore {
  setForum(id: number, forumChannelId: string | null): Promise<'set' | 'no-region' | 'forum-taken'>;
  setSummaryMessage(id: number, forumChannelId: string, messageId: string | null): Promise<boolean>;
}

/**
 * Why a forum was not made in rehearsal mode when Discord refused it: a hidden forum's
 * overwrites may give only what the bot has in the server (`hiddenForumOverwrites`).
 */
export const HIDDEN_FORUM_REFUSED =
  'I could not make this forum hidden from members. I need Manage Channels and Manage Roles, ' +
  'and in the server every permission I give staff and the testers in it: View Channel, Send ' +
  'Messages, Read Message History, Send Messages in Threads and Add Reactions.';

/**
 * Discord refused to make a forum hidden (`setupForum`, rehearsal mode): said as
 * `HIDDEN_FORUM_REFUSED`, which no other refusal is. `cause` is Discord's error.
 */
class HiddenForumRefused extends Error {
  constructor(cause: unknown) {
    super('Discord refused to make a hidden forum', { cause });
  }
}

/** Whether a summary post was pinned (`refused`: the bot lacks Manage Posts; `failed`: else). */
type SummaryPin = 'pinned' | 'refused' | 'failed';

/**
 * Whether the region's board is open to members (plan 8R-9F, R2): `open`; `locked`, a moderator
 * locked it after Pine opened it, and it is left so; `refused`, Pine could not open it for want
 * of Manage Posts; `failed`, for anything else (logged).
 */
type BoardOpen = 'open' | 'locked' | 'refused' | 'failed';

/**
 * Whether a summary post was made, and why it is not pinned or open (plan 8R-9, review P12; plan
 * 8R-9F) where it is not.
 */
interface SummaryMade {
  made: boolean;
  unpinned?: Exclude<SummaryPin, 'pinned'>;
  closed?: Exclude<BoardOpen, 'open'>;
}

/** What `/admin setup-forums` did for one region. */
export interface ForumSetup {
  region: Region;
  /**
   * `created`: a new forum; `ready`: the forum was there; `no-channel`: the region's channel is
   * gone; `failed`: something went wrong (`reason` says what, in words for the moderator).
   */
  forum: 'created' | 'ready' | 'no-channel' | 'failed';
  /** Set when `forum` is `failed`. */
  reason?: string;
  /** How many tags an existing forum lacked and got. */
  tagsAdded: number;
  /** How many tags the bot no longer uses (`RETIRED_TAGS`) an existing forum had and lost. */
  tagsRemoved?: number;
  /**
   * The bot's tags an existing forum has no room for (Discord allows 20, `MAX_FORUM_TAGS`, the
   * server's own count too): its posts go without them.
   */
  tagsMissing?: string[];
  /** Whether an existing forum got the name the settings give it. */
  renamed?: boolean;
  /** Whether a new summary post was made. */
  summary: boolean;
  /**
   * Set where the region's server is quiet (plan 19C-2: in setup): the forum is made and recorded,
   * and its board is neither posted nor looked at until the server is set up (`checkSummaries`
   * makes it then).
   */
  boardWaits?: true;
  /**
   * Set when a new summary post, or one that stood unpinned (review W3), could not be pinned:
   * `refused` where the bot lacks Manage Posts in the forum, `failed` for anything else (logged).
   * It is made and kept all the same.
   */
  unpinned?: Exclude<SummaryPin, 'pinned'>;
  /**
   * Set when the board is not open to members (plan 8R-9F, R2): `locked`, a moderator locked it
   * after Pine opened it (left so); `refused`, Pine could not open it for want of Manage Posts in
   * the forum; `failed`, for anything else (logged).
   */
  closed?: Exclude<BoardOpen, 'open'>;
  /**
   * Whether the bot may delete what members write in the board (Manage Messages in the forum,
   * plan 8R-9F); absent where the region has no board.
   */
  cleaning?: boolean;
  /**
   * Whether the making of posts in the forum was left to the bot now (`reserved`), or could
   * not be (`not-allowed`: the bot may not change the permissions of the forum); absent when
   * nothing had to change.
   */
  posting?: 'reserved' | 'not-allowed';
  /**
   * In rehearsal mode: whether the forum was hidden from all but staff and the allowlist
   * (`hidden`), or could not be (`not-allowed`).
   */
  hidden?: 'hidden' | 'not-allowed';
  /**
   * Set when the forum is `hidden` though Discord refused the bot's hide (a new forum, made
   * hidden, or one hidden already, `isHiddenForum`): the permissions the bot did not get there,
   * which only the category gives it (none named when nothing more was asked).
   */
  refused?: readonly string[];
}

/** Told of a post drawn (`PartyService.onPostShown`): the party, its server's row, whether it changed. */
export type PostShownListener = (partyId: string, row: number, changed: boolean) => void;

/**
 * What `view` reads besides the party, as a raid's look on the map follows it (`raidLookOf`, whose
 * comparison stands by this): each read in the key, or why it need not be. A test records the reads
 * and fails on a new one, until somebody decides about it here.
 */
export const RAID_LOOK_READS = {
  gameData: {
    catalogue: 'compared',
    icons: 'compared: replaced alone when the list of icons is read',
  },
  gyms: { stored: 'compared: the gym’s row' },
  raidBosses: {
    bosses: 'compared: the very same list until it changes',
    bossesOf: 'of that list',
    autoset: 'of that list',
  },
  eggPictures: {
    picture: 'by its name, of the boss list, and `isServed`, which is compared',
  },
  servers: {
    zoneOf: 'the zone of the party’s server (plan 19A-2); the look reads no time by it',
  },
  settings: {
    showUnknownMoves: 'does not change while the bot runs, and the look shows no moves',
    emoji: 'does not change while the bot runs, and the look shows no emoji',
    lobbies: 'does not change while the bot runs, and the look shows no lobby',
  },
} as const;

export interface PartyServiceOptions {
  /**
   * Where an egg's picture comes from (`EggPictures`): told by the app when the web server
   * listens. By default the message's own file, whatever the settings say.
   */
  eggPictures?: EggPictures;
  store: PartyStore;
  gateway: PartyGateway;
  regions: RegionProvider & { load(): Promise<void> };
  regionStore: SummaryStore;
  /**
   * The row id of a server (`GuildRepository`); regions belong to servers by that id. Its
   * snowflake by the row (`snowflakeOf`) makes the summary's links to messages (plan 8X-G: a
   * train's copy in another region's channel); without it the summary links the posts.
   */
  guilds: {
    idFor(snowflake: string): Promise<number | undefined>;
    snowflakeOf?(id: number): Promise<string | undefined>;
  };
  /**
   * The gyms per server (plan 19B-2): a party's gym is a reference its server stored (`stored`),
   * where a gym lies is read in the party's server's view (`of`).
   */
  gyms: Pick<GymProvider, 'of' | 'stored' | 'serversOf'>;
  raidBosses: RaidBossProvider;
  /**
   * The max bosses (plan 8X-3): whether a max battle's boss is shiny, its picture. Max battles
   * are always on, so the bot always has them (a test without any passes `NO_MAX_BOSSES`).
   */
  maxBosses: Pick<MaxBossProvider, 'bosses'>;
  gameData: GameDataProvider;
  raidEvents: RaidEventProvider;
  /** The members' settings: who lets the bot ping them. Without it nobody is pinged. */
  users?: UserSettingsReader;
  /**
   * The emoji of the bot's application (`ApplicationEmoji`), looked for before the server's.
   * Without it only the server's emoji are used. `refused` is told when Discord refuses one on a
   * button (`refusedPart`), so that it reads them anew.
   */
  appEmoji?: { get(name: string): string | undefined; refused?(): void };
  settings: Settings;
  /** Each server's values (plan 19A-1): the channels of the copies, the forums' ending. */
  servers: ServerSettingsLookup;
  /**
   * The snowflake of the server of a `Guild` row, from every row read at start or made since
   * (`RowIds.serverOfRow`, never a bounded memory: fix round 1, K1): a party's server, whose zone
   * its times are in (plan 19A-2). Without it, or for a row not known, the summary's learned
   * snowflakes, else the instance's default zone (warned of once per row).
   */
  serverOfRow?: (row: number) => string | undefined;
  /**
   * The quiet servers (`QuietServers`: those Pine left, plan 19C-1, and those in setup, plan
   * 19C-2): their parties are not drawn, their summaries neither drawn nor made, their posts and
   * copies neither swept nor closed again, and the clock passes over them (`ofQuietServer`);
   * nothing of them is ended. Without it, none.
   */
  quiet?: QuietServers;
  /**
   * What is wrong with a server's setup, told to its staff in its moderators' bot lab (plan
   * 19B-1, `ServerNotices`): a forum the bot may not make posts in.
   */
  notices: Pick<ServerNotices, 'tell'>;
  log: Logger;
  now?: () => number;
  /**
   * How many trainers one group of a party holds; by default `lobbySize` of the settings, which
   * no party of today has. Tests give a size here to reach what max battles (plan 8X-3) switch on.
   */
  lobbySize?: (party: Party) => number | undefined;
  /** How long changes of one post are gathered into one edit. Default two seconds. */
  renderDelayMs?: number;
  /** The same for a party's copies in the server's shared channels. Default ten seconds. */
  sharedDelayMs?: number;
  /**
   * Starts the timer of a title that has to wait for the rename limit and gives the function that
   * cancels it. Default: `setTimeout`, unref'd. A test passes its own to fire the timer by hand.
   */
  setTimer?: (run: () => void, ms: number) => () => void;
  /**
   * Rehearsal mode: `setupForums` makes forums only for its regions, and hides them from all
   * but staff and its allowlist.
   */
  rehearsal?: Pick<Rehearsal, 'rehearses' | 'forumAccess' | 'settings'>;
  /**
   * The kept Wayspots: a meetup near a PokéStop or power spot shows it as it is now
   * (`shownPlace`), and is shown anew after every change of what they are. Without them it
   * shows the place as it was named.
   */
  wayspots?: Pick<WayspotProvider, 'of' | 'stored' | 'addressOf' | 'whenChanged' | 'size'>;
  /**
   * The raids and max battles of the history (plan 8H-7A): read once when a train ends, for the
   * raids along its way on its card. Without it the card says nothing of raids.
   */
  raidsAlong?: RaidsAlongReader;
  /**
   * What ended parties left on Discord (`EndedPartyCopy`, written with their end): forgotten once
   * a closing has dealt with them, the rest deleted by `sweepCopies` with the upkeep. Without it
   * nothing is swept.
   */
  leftovers?: LeftoverCopies;
  /**
   * The map's address of an ended train by its record (plan 8H-7B, review G4), for "Route on the
   * map" in its post's last showing: only where the web is configured and Discord's login offered
   * (an instance with only the links of `/maps` gets none). Without it the post has no link.
   */
  trainMapLink?: (guildId: string, historyId: number) => string;
}

/**
 * Parties on Discord: creates the forum post of a reported raid, a new meetup or train, keeps posts
 * and the pinned summary of each forum up to date, and tidies up what went wrong half-way. The
 * parties themselves are in the store; this service is what talks to Discord about them.
 */
export class PartyService {
  private readonly now: () => number;
  private readonly posts: Coalescer<string>;
  private readonly summaries: Coalescer<number>;
  private readonly setTimer: (run: () => void, ms: number) => () => void;
  /** The tags of a forum, as the promise of the ask, so that two first uses make one ask. */
  private readonly tags = new Map<string, Promise<TagIds>>();
  private readonly renames = new Map<string, number[]>();
  /** For posts that wait for a rate limit: the function that cancels the timer, and when it is due. */
  private readonly renameTimers = new Map<string, { cancel: () => void; due: number }>();
  /** For summaries that wait for a rate limit: the same, by region. */
  private readonly summaryTimers = new Map<number, { cancel: () => void; due: number }>();
  /** Parties whose post is being created: a second report of a raid's gym waits for the outcome. */
  private readonly creating = new Map<string, Promise<void>>();
  /** A raid moves to another region once at a time. */
  private readonly moves = new KeyedLock<string>();
  /**
   * The posts found gone whose party `postGone` has ended or is ending: a second finding (Discord's
   * `ThreadDelete` beside a render that found the post gone) does nothing (review GR-7).
   */
  private readonly postsGone = new BoundedMap<string, true>(POSTS_GONE_KEPT);
  /** The new parties of moves under way, until the move landed or failed (`moveUnderWay`). */
  private readonly deciding = new Map<string, Promise<void>>();
  /**
   * The messages on their way into the post of a party (a completion question, the archive
   * warning: `whileOpen`), by party: the closing of an ended party waits for them.
   */
  private readonly sending = new Map<string, Set<Promise<unknown>>>();
  /** The latest `ensureSummary` of each region: calls for one region run one after the other. */
  private readonly summaryChains = new Map<number, Promise<unknown>>();
  /** The latest `setupForums` of each server, and how many are running or waiting. */
  private readonly setupChains = new Map<string, Promise<unknown>>();
  private readonly setupCounts = new Map<string, number>();
  /**
   * What was last sent for each post (the message, the title and the tags as one string) and when
   * the post was last known to exist. An edit that would send the same is not made.
   */
  private readonly sent = new Map<string, { key: string; checkedAt: number }>();
  /**
   * The layout each post was last shown with (plan 8M-8A), by post: what the live map draws as the
   * party's popup (`layoutOf`), so that the map shows exactly what the post shows. Set when a post
   * is made and each time an edit went through (or would send nothing new); an edit that fails
   * leaves the one before; forgotten with the post.
   */
  private readonly shownLayouts = new Map<string, PostLayout>();
  /** A raid's look on the map as last built, with what it was built from (`raidLookOf`). */
  private readonly looks = new WeakMap<
    RaidParty,
    {
      stage: RaidStage;
      gym: unknown;
      bosses: unknown;
      catalogue: unknown;
      icons: unknown;
      served: boolean;
      look: ReturnType<typeof raidLook>;
    }
  >();
  /** Who hears of the posts drawn (`onPostShown`). */
  private readonly postShownListeners: PostShownListener[] = [];
  /**
   * How many changes of each party the store has made in memory (`PartyStore.onChange`, plan
   * 8M-11A, S1): a press on the map takes the count once its change has returned (`drawTicket`,
   * review R1: its own change counted). Forgotten when the party ends.
   */
  private readonly changes = new Map<string, number>();
  /**
   * The draws of each party's post (plan 8M-11A, S1, review F2): the change count the draw going
   * on read the party at (`reading`), and the highest count a draw that kept its layout or ended
   * had read (`seen`). A wait is answered by a draw that read the press's change (a count of the
   * ticket or more), never by one in flight that read the party before it. Forgotten when the party ends.
   */
  private readonly draws = new Map<string, { reading: number | undefined; seen: number }>();
  /** The presses that wait for a draw of a party's post, by party (`shown`). */
  private readonly drawWaits = new Map<string, Set<{ ticket: number; resolve: () => void }>>();
  /**
   * How a post is made, once one was: with its message as its first message (`direct`), or with
   * a line of text that is then edited into the message (`edited`), where Discord refuses a
   * components-v2 message as the first message of a post (not documented either way).
   */
  private starter: 'direct' | 'edited' | undefined;
  /**
   * The message last sent to each region's summary post (as JSON), and the post it went to. A
   * summary that would be the same is not edited again.
   */
  private readonly summarySent = new Map<number, { postId: string; text: string }>();
  /**
   * The closings of ended parties of which a part failed for the network (plan 8X-H, review R4;
   * Matt 2026-10-23: the network away while a party ended left its post with live controls, which
   * the sweep only archives): the party as it ended, its last words and whether they were said,
   * how its post goes, redone by `redoClosings` with the upkeep, for a day. In memory, bounded:
   * after a restart the sweep archives what is left open, as before, and `sweepCopies` deletes
   * the copies and link lines it left (they are written with the end).
   */
  private readonly undoneClosings = new BoundedMap<string, UndoneClosing>(UNDONE_CLOSINGS_MAX);
  /**
   * The parties whose closing is under way: from the write of their end (`endAs`, `relocate`)
   * until `closePost` is through. `sweepCopies` leaves their copies to it.
   */
  private readonly closing = new Set<string>();

  /** The regions whose summary post Discord refused to rename, said once in the log. */
  private readonly renameRefused = new Set<number>();
  /** The regions whose board Discord refused to open (plan 8R-9F), said once in the log. */
  private readonly openRefused = new Set<number>();
  /**
   * The regions whose board's old mark Discord refused to move (plan 8R-9H), said once in the log.
   */
  private readonly markRefused = new Set<number>();
  /**
   * The regions whose board's pin (and opening, plan 8R-9F) is checked at the summary's next draw, whether or not
   * its text changed (plan 8R-9, B4: the stops were drawn in it, which opens it if archived).
   */
  private readonly boardChecks = new Set<number>();
  /**
   * The timers of the next local midnight of each zone in use (plan 8R-9, B7; plan 19A-2); none
   * until `watchMidnight`.
   */
  private midnights: ZonesMidnight | undefined;
  /** The timers that try a summary post's rename again, by region (review r1, R1-6). */
  private readonly summaryRenameTimers = new Map<number, { cancel: () => void }>();
  /** The renames those timers have under way, which `flush` waits for. */
  private readonly summaryRenames = new Set<Promise<void>>();

  /** The snowflakes of the servers by their rows, as far as known (`guilds.snowflakeOf`). */
  private readonly snowflakes = new Map<number, string>();
  /** The `Guild` rows whose server was not known, each warned of once (`zoneOfRow`). */
  private readonly unknownRows = new Set<number>();

  /** The posts of the stops (`StopPostService`), for the summary's line; none until set. */
  private stopPosts: StopPostsForSummary | undefined;
  /**
   * The parties whose posts wait to be shown anew (other emoji, the catch-up, a zone), a line per
   * server (its `Guild` row) served in turns (plan 19B-5), and the timer of the next.
   */
  private readonly emojiQueue = new Turns<number | null, string>();
  private emojiTimer: (() => void) | undefined;
  /** Set by `close` at shutdown: nothing is shown anew from then on. */
  private closed = false;
  /** The copies of a party's message in other channels and at the bottom of its post. */
  private readonly mirrors: PartyMirrors;
  /**
   * The requests to the moderators to delete a party, by party: who has asked (each member asks
   * once), whether a message with roles was really sent, and the latest request, so that the
   * requests of one party are sent one after the other.
   */
  private readonly deletionRequests = new Map<
    string,
    { asked: Set<string>; pinged: boolean; tail: Promise<unknown> }
  >();

  /** Told of new raids and of raids that moved to another region (`announceTo`). */
  private notifier: PartyNotifier | undefined;
  /** The neighbors' parties at a party's gym or Power Spot (plan 19E, `useNeighbors`). */
  private neighborParties: NeighborParties | undefined;
  /** The servers (`Guild` rows) whose gyms changed since their matches were last compared. */
  private readonly gymsChangedOf = new Set<number>();
  /** Cancels the timer of that comparison (`NEIGHBOR_MATCHES_GATHER_MS`), while one waits. */
  private gymsChangedTimer: (() => void) | undefined;

  /** Where an egg's picture comes from: the bot's web pages, or the post's own file. */
  private readonly eggPictures: EggPictures;
  /** The forums, posts and channels of copies that refused files lately. */
  private readonly refusedFiles: RefusedFiles;
  /** The forums where the bot was found not to be allowed to make posts, said once each. */
  private readonly refusedForums = new BoundedMap<string, true>(1_000);
  /** How many trainers one group of a party holds, where it has a size (`lobbySize`). */
  private readonly lobbySize: (party: Party) => number | undefined;

  constructor(private readonly options: PartyServiceOptions) {
    this.now = options.now ?? (() => Date.now());
    this.eggPictures = options.eggPictures ?? new EggPictures(options.settings);
    this.lobbySize = options.lobbySize ?? ((party) => lobbySize(party, options.settings.lobbies));
    this.refusedFiles = new RefusedFiles(this.now);
    this.mirrors = new PartyMirrors({
      store: options.store,
      gateway: options.gateway,
      regions: options.regions,
      gyms: options.gyms,
      ...(options.wayspots === undefined ? {} : { wayspots: options.wayspots }),
      servers: options.servers,
      render: (party) => this.rendered(party),
      refusedFiles: this.refusedFiles,
      emojiRefused: () => options.appEmoji?.refused?.(),
      // A train's copy in another region is what that region's summary links (plan 8X-G).
      copied: (kind, channelId) => {
        const region = kind === 'region' ? options.regions.byChannel(channelId) : undefined;
        if (region) this.summaries.request(region.id);
      },
      log: options.log,
      now: this.now,
      ...(options.sharedDelayMs === undefined ? {} : { sharedDelayMs: options.sharedDelayMs }),
    });
    this.setTimer =
      options.setTimer ??
      ((run, ms) => {
        const timer = setTimeout(run, ms);
        timer.unref();
        return () => {
          clearTimeout(timer);
        };
      });
    const delayMs = options.renderDelayMs ?? 2_000;
    this.posts = new Coalescer({
      delayMs,
      work: (partyId) => this.renderPost(partyId),
      // The network away is a warning (plan 8X-H: the catch-up shows the posts anew once the
      // gateway is back); anything else needs a person.
      onError: (err, party) =>
        isNetworkError(err)
          ? options.log.warn({ err, party }, 'could not update a party post')
          : options.log.error({ err, party }, 'could not update a party post'),
    });
    this.summaries = new Coalescer({
      delayMs,
      work: (regionId) => this.renderSummary(regionId),
      onError: (err, region) =>
        isNetworkError(err)
          ? options.log.warn({ err, region }, 'could not update a summary')
          : options.log.error({ err, region }, 'could not update a summary'),
    });
    options.wayspots?.whenChanged((guildId) => {
      this.wayspotsChanged(guildId);
    });
    // Each change in memory counted, for the presses that wait for their post (plan 8M-11A, S1).
    options.store.onChange((_before, after) => {
      this.changes.set(after.id, (this.changes.get(after.id) ?? 0) + 1);
    });
    // A party's change shows in its neighbors' posts at its gym (plan 19E).
    options.store.onChange((before, after) => {
      this.neighborsFollow(before, after);
    });
  }

  /**
   * Shows the neighbors' parties at a raid's gym or a max battle's Power Spot in its post (plan
   * 19E): set once at start, when the neighbors are read.
   */
  useNeighbors(parties: NeighborParties): void {
    this.neighborParties = parties;
  }

  /**
   * What a raid's or max battle's post shows of its neighbors' parties there (plan 19E): a line
   * each, made by the renderer of the neighbor party's kind from its own view (the one path of
   * its post's words), its times on this party's server's clock; nothing for an ended party, nor
   * without neighbors there.
   */
  private neighborsShown(party: BattleParty): { neighbors?: NeighborsShown } {
    const finder = this.neighborParties;
    if (finder === undefined || party.status !== 'active') return {};
    const found = finder.of(party, this.now());
    if (found.length === 0) return {};
    const zone = this.zoneOf(party);
    const lines = found.map(({ serverId, party: theirs }) => {
      const neighbor = {
        server: this.options.gateway.guildName(serverId),
        link: postLink(serverId, theirs.forumPostId ?? ''),
      };
      return isRaid(theirs)
        ? raidNeighborLine(this.view(theirs), neighbor, zone)
        : maxNeighborLine(this.maxView(theirs), neighbor, zone);
    });
    return { neighbors: { at: isRaid(party) ? 'gym' : 'spot', lines } };
  }

  /**
   * A party changed (`PartyStore.onChange`): the posts of its neighbors' parties at its gym or
   * Power Spot, before and after the change, are shown anew in their servers' turns (plan 19E,
   * `queueAnew`), gathered with what waits already. A quiet server's party reaches nobody.
   */
  private neighborsFollow(before: Party | undefined, after: Party): void {
    const finder = this.neighborParties;
    if (finder === undefined || this.closed || !isBattle(after)) return;
    const now = this.now();
    const changed = before === undefined || before === after ? [after] : [before, after];
    this.queueAnew(changed.flatMap((party) => finder.of(party, now).map((found) => found.party)));
  }

  /**
   * Two servers became neighbors or stopped being so (`ServerNeighbors.whenChanged`): the posts of
   * either's parties at a gym or Power Spot of the other's parties are shown anew, paced.
   */
  neighborsChanged(pair: { serverA: string; serverB: string }): void {
    const finder = this.neighborParties;
    if (finder === undefined || this.closed) return;
    const now = this.now();
    this.queueAnew(
      this.options.store.active().filter((party) => {
        if (!isBattle(party)) return false;
        const server = this.serverOf(party);
        const other =
          server === pair.serverA
            ? pair.serverB
            : server === pair.serverB
              ? pair.serverA
              : undefined;
        return other !== undefined && finder.in(party, other, now) !== undefined;
      }),
    );
  }

  /**
   * Servers' gyms changed as the same gyms of two neighbors read them (`GymDirectory.
   * whenServersChanged`: an import, an edit, a link, a removal, a region edit): gathered for
   * `NEIGHBOR_MATCHES_GATHER_MS`, then each pair of neighbors of these servers is compared once,
   * and the posts of both servers' live raids at gyms that gained, lost or changed a match are
   * shown anew on the paced queue (review R9). Nothing after `close`; `flush` drops what waits.
   */
  neighborGymsChanged(guildRows: readonly number[]): void {
    if (this.neighborParties === undefined || this.closed) return;
    for (const row of guildRows) this.gymsChangedOf.add(row);
    if (this.gymsChangedTimer !== undefined) return;
    this.gymsChangedTimer = this.setTimer(() => {
      this.gymsChangedTimer = undefined;
      const rows = [...this.gymsChangedOf];
      this.gymsChangedOf.clear();
      const finder = this.neighborParties;
      if (finder === undefined || this.closed) return;
      this.queueAnew(finder.matchesChanged(rows, this.now()));
    }, NEIGHBOR_MATCHES_GATHER_MS);
  }

  /**
   * Servers went quiet or came back (Pine left them or is back, `ServerStandings.whenLeftChanged`):
   * their neighbors' posts that show, or would show, their parties are shown anew, paced.
   */
  neighborsQuietChanged(serverIds: readonly string[]): void {
    const finder = this.neighborParties;
    if (finder === undefined || this.closed) return;
    const now = this.now();
    const shown: Party[] = [];
    for (const serverId of serverIds) {
      const neighbors = new Set(finder.neighborsOf(serverId));
      for (const party of this.options.store.active()) {
        const server = this.serverOf(party);
        if (!isBattle(party) || server === null || !neighbors.has(server)) continue;
        if (finder.in(party, serverId, now)) shown.push(party);
      }
    }
    this.queueAnew(shown);
  }

  /**
   * Has `notifier` told of what members may want a direct message about. Set once, at start:
   * the notifier shows a party as this service does (`briefOf`), so it is made after it.
   */
  announceTo(notifier: PartyNotifier): void {
    this.notifier = notifier;
  }

  /**
   * The party as a direct message shows it (the brief of its post: a few of its lines, its
   * colour and picture), as it is now, for whoever shows the party elsewhere.
   */
  briefOf(party: Party): PartyBrief {
    return this.rendered(party).brief;
  }

  /**
   * The layout an active party's post was last shown with (plan 8M-8A): what the live map draws
   * as its popup, never rendered a second time for the web. Undefined for a party without a post,
   * one whose post the service has not shown since it started (the start shows every post anew,
   * paced, once the application's emoji are read: `emojiChanged`), and once it ended.
   */
  layoutOf(partyId: string): PostLayout | undefined {
    const postId = this.options.store.get(partyId)?.forumPostId;
    return postId === null || postId === undefined ? undefined : this.shownLayouts.get(postId);
  }

  /**
   * How many changes of a party the store has made in memory (plan 8M-11A, S1, reviews F2 and
   * R1): a press on the map takes it once its change has returned, so that it counts the press's
   * own change, and waits with it for its post (`shown`).
   */
  drawTicket(partyId: string): number {
    return this.changes.get(partyId) ?? 0;
  }

  /**
   * Resolves once a draw of the party's post that read the party at `ticket` or later
   * (`drawTicket`, taken after the change: with the press's change) has kept its layout
   * (`layoutOf`) or ended, or after `maxMs`, whichever comes first (plan 8M-11A, S1; reviews F2
   * and R1: a draw in flight that read the party before the change answers nothing). A draw the
   * change started at once counts (it read the ticket's count), and so does one that waits out
   * its delay. At once when the party has no post drawn (over, or its post still being
   * made), when such a draw is done already, or when no draw is waiting or running for it. Never
   * rejects.
   */
  shown(partyId: string, ticket: number, maxMs: number): Promise<void> {
    const party = this.options.store.get(partyId);
    if (!party?.forumPostId || this.creating.has(partyId)) return Promise.resolve();
    if ((this.draws.get(partyId)?.seen ?? 0) >= ticket) return Promise.resolve();
    if (!this.posts.busy(partyId)) return Promise.resolve();
    return new Promise<void>((resolve) => {
      const waits = this.drawWaits.get(partyId) ?? new Set();
      this.drawWaits.set(partyId, waits);
      const wait = {
        ticket,
        resolve: () => {
          cancel();
          waits.delete(wait);
          if (waits.size === 0 && this.drawWaits.get(partyId) === waits) {
            this.drawWaits.delete(partyId);
          }
          resolve();
        },
      };
      const cancel = this.setTimer(() => {
        wait.resolve();
      }, maxMs);
      waits.add(wait);
    });
  }

  /** A draw of a party's post starts, reading the party now: the change count it read. */
  private drawStarted(partyId: string): number {
    const read = this.changes.get(partyId) ?? 0;
    const draw = this.draws.get(partyId) ?? { reading: undefined, seen: 0 };
    draw.reading = read;
    this.draws.set(partyId, draw);
    return read;
  }

  /**
   * A draw that read the party at change count `read` kept its layout or ended: the presses whose
   * change it read are answered.
   */
  private drawDone(partyId: string, read: number): void {
    const draw = this.draws.get(partyId);
    if (draw !== undefined && read > draw.seen) draw.seen = read;
    for (const wait of [...(this.drawWaits.get(partyId) ?? [])]) {
      if (read >= wait.ticket) wait.resolve();
    }
  }

  /** A party's post is drawn no more: every press that waits for it is answered. */
  private drawsOver(partyId: string): void {
    for (const wait of [...(this.drawWaits.get(partyId) ?? [])]) wait.resolve();
    this.draws.delete(partyId);
    this.changes.delete(partyId);
  }

  /**
   * Whether the bot may delete the post of an active party (`PartyGateway.mayDeletePost`): a
   * moderator's choice to delete it (plan 8S-2) is refused before the party ends where it may
   * not. True for a party without a post.
   */
  mayDeletePost(partyId: string): boolean {
    const postId = this.options.store.get(partyId)?.forumPostId;
    return postId === null || postId === undefined || this.options.gateway.mayDeletePost(postId);
  }

  /** The title of the party's post as it is now (a report names the party by it, plan 8S-2). */
  postTitle(party: Party): string {
    return this.rendered(party).title;
  }

  /**
   * The durations in effect in a zone, with the events known at this moment: the rules of the
   * parties of the servers in `zone` (plan 19A-2; `rulesOf` a party's).
   */
  rulesIn(zone: string): RaidDurationRules {
    return raidDurationRules(this.options.settings, this.options.raidEvents.events(zone), zone);
  }

  /** The durations in effect for a party: those of its server's zone (`zoneOf`). */
  rulesOf(party: Pick<Party, 'guildId'>): RaidDurationRules {
    return this.rulesIn(this.zoneOf(party));
  }

  /**
   * The zone of a party's server (plan 19A-2): every time of it said or typed, its days. Its
   * server is its `Guild` row's (`serverOfRow`, else as the summary learned it); the instance's
   * default zone for a row not seen.
   */
  zoneOf(party: Pick<Party, 'guildId'>): string {
    return this.zoneOfRow(party.guildId);
  }

  /**
   * The zone of the server of a `Guild` row (`zoneOf`); the default for none. A row whose server
   * is not known cannot be once every row was read at the start (`RowIds.serverOfRow`; fix round
   * 1, K1): should one be, it is warned of once and has the default.
   */
  zoneOfRow(row: number | null): string {
    const { servers } = this.options;
    const server = this.serverOfRow(row);
    if (server === undefined && row !== null && !this.unknownRows.has(row)) {
      this.unknownRows.add(row);
      this.options.log.warn({ row }, 'a party’s server is not known');
    }
    return server === undefined ? servers.defaultZone() : servers.zoneOf(server);
  }

  /**
   * The snowflake of a party's server (its `Guild` row's, as `zoneOf` finds it, in memory):
   * whether a custom id names a party of the interaction's server (`partyOfServer`, plan 19B-4),
   * and what is the server's own, such as its Pokémon nicknames. Null for a row not known, which
   * cannot be once every row was read at the start: the instance's names alone then.
   */
  serverOf(party: Pick<Party, 'guildId'>): string | null {
    return this.serverOfRow(party.guildId) ?? null;
  }

  /**
   * Whether the server of a party (or of a region, by its `Guild` row) is quiet (Pine left it,
   * plan 19C-1, or it is in setup, plan 19C-2): the clock passes over it, nothing of it is drawn,
   * and its board is not swept.
   */
  ofQuietServer(of: { guildId: number | null }): boolean {
    return this.quietRow(of.guildId);
  }

  /** Whether the server of a `Guild` row is quiet. */
  private quietRow(row: number | null): boolean {
    const { quiet } = this.options;
    if (quiet === undefined) return false;
    const server = this.serverOfRow(row);
    return server !== undefined && quiet.isQuiet(server);
  }

  /** Whether a channel is in a quiet server, by the gateway's cache. */
  private quietChannel(channelId: string | undefined): boolean {
    const { quiet, gateway } = this.options;
    if (quiet === undefined || channelId === undefined) return false;
    const server = gateway.serverOf(channelId);
    return server !== undefined && quiet.isQuiet(server);
  }

  /** The server of a `Guild` row: `serverOfRow`'s, else as the summary learned it. */
  private serverOfRow(row: number | null): string | undefined {
    if (row === null) return undefined;
    return this.options.serverOfRow?.(row) ?? this.snowflakes.get(row);
  }

  /**
   * The emoji a party's post shows, each by name: the bot's application's, else one of the server
   * the post is in (as the legacy bot used them), else plain characters, or words for the game's
   * icons (`PostEmoji.icon`).
   */
  private emoji(party: Party): PostEmoji {
    const { gateway, settings, appEmoji } = this.options;
    const where = party.forumChannelId;
    const find = (name: string): string | undefined =>
      appEmoji?.get(name) ?? (where === null ? undefined : gateway.emoji(where, name));
    const teamless = find('teamless');
    return {
      shiny: find(settings.emoji.shiny) ?? '✨',
      remote: find(settings.emoji.remote) ?? '🛰️',
      teams: {
        instinct: find('instinct') ?? '⚡',
        mystic: find('mystic') ?? '❄️',
        valor: find('valor') ?? '🔥',
      },
      ...(teamless === undefined ? {} : { teamless }),
      icon: find,
      // The buttons' emoji are the application's alone (`PostEmoji.controlIcon`).
      controlIcon: (name) => appEmoji?.get(name),
    };
  }

  /** Everything the renderer needs to show a raid as it is now. */
  view(party: RaidParty): RaidPostView {
    const { gyms, raidBosses, gameData, settings } = this.options;
    const catalogue = gameData.catalogue;
    const zone = this.zoneOf(party);
    const boss = shownBoss(party, catalogue, raidBosses.bosses(zone), gameData.icons);
    const hatchesAs = boss
      ? undefined
      : shownAutoset(party.raid.tier, raidBosses.autoset(party.raid.tier, zone), gameData);
    const eggName = raidEggName(party.raid.tier, raidBosses.bossesOf(party.raid.tier, zone));
    const egg = eggName === undefined ? undefined : this.eggPictures.picture(eggName);
    return {
      party,
      now: this.now(),
      gym: party.gymId === null ? undefined : gyms.stored(party.gymId),
      boss,
      ...(hatchesAs ? { hatchesAs } : {}),
      ...(egg === undefined ? {} : { eggPicture: egg.url }),
      ...(egg?.file === undefined ? {} : { eggFile: egg.file }),
      catalogue,
      showUnknownMoves: settings.showUnknownMoves,
      zone: this.zoneOf(party),
      emoji: this.emoji(party),
      ...this.lobbiesOf(party),
    };
  }

  /**
   * How a raid's post looks on the map (`raidLook` of `view`, the post's own words), built once per
   * party (Matt, 2026-10-31, the map's view cache): `view` asks the boss list and the emoji, the
   * dearest part of an ask of the map's list by far. A changed party is a new object, so the party
   * keys it; the rest of what it reads is compared here: its stage by the clock, its gym's row, the
   * boss list (the very same list until it changes, `BossFeedService.bosses`), the catalogue and the
   * list of icons (each replaced whole, the icons apart from the game data), whether the eggs are
   * served. What `view` reads of all that, and why, is `RAID_LOOK_READS`, which a test holds to it.
   */
  raidLookOf(party: RaidParty): ReturnType<typeof raidLook> {
    const { gyms, raidBosses, gameData } = this.options;
    const { catalogue, icons } = gameData;
    const stage = raidStage(party, this.now());
    const gym = party.gymId === null ? undefined : gyms.stored(party.gymId);
    const bosses = raidBosses.bosses(this.zoneOf(party));
    const served = this.eggPictures.isServed;
    const kept = this.looks.get(party);
    if (
      kept !== undefined &&
      kept.stage === stage &&
      kept.gym === gym &&
      kept.bosses === bosses &&
      kept.catalogue === catalogue &&
      kept.icons === icons &&
      kept.served === served
    ) {
      return kept.look;
    }
    const look = raidLook(this.view(party));
    this.looks.set(party, { stage, gym, bosses, catalogue, icons, served, look });
    return look;
  }

  /**
   * The lobbies a post counts: the size of the party's groups, where it has one, and above how
   * many heads a group is told to split up (`splitLobby`), null where it never is.
   */
  private lobbiesOf(party: Party): { lobbySize?: number; splitLobby: number | null } {
    const size = this.lobbySize(party);
    return {
      ...(size === undefined ? {} : { lobbySize: size }),
      splitLobby: splitLobby(party, this.options.settings.lobbies) ?? null,
    };
  }

  /** Everything the renderer needs to show a timed party (a meetup, a train) as it is now. */
  timedView<P extends TimedParty>(party: P): TimedPostView<P> {
    const { settings } = this.options;
    return {
      party,
      now: this.now(),
      zone: this.zoneOf(party),
      archiving: {
        graceMinutes: settings.deletionGraceTime,
        warningMinutes: settings.trainOrMeetupDeletionWarningTime,
      },
      emoji: this.emoji(party),
      ...this.lobbiesOf(party),
    };
  }

  /**
   * Everything the renderer needs to show a meetup as it is now: the gyms and the kept Wayspots,
   * for its place as it is now (`shownPlace`).
   */
  meetupView(party: MeetupParty): MeetupPostView {
    const { gyms, wayspots } = this.options;
    return {
      ...this.timedView(party),
      gym: (id) => gyms.stored(id),
      ...(wayspots === undefined
        ? {}
        : {
            wayspot: (id: string) => wayspots.stored(party.guildId, id),
            addressOf: (wayspot: AddressedWayspot & { id: string }) => wayspots.addressOf(wayspot),
          }),
    };
  }

  /**
   * After a server's kept Wayspots changed (its import): its meetups near a PokéStop or power
   * spot are shown anew, with the place as it is now (`shownPlace`); another server's parties
   * read none of its Wayspots, and are left alone.
   */
  private wayspotsChanged(guildId: number): void {
    // At shutdown nothing is shown anew any more. At start the kept Wayspots load before the
    // parties: a post shown after that shows the place as it is then anyway.
    if (this.closed || !this.options.store.isLoaded) return;
    for (const party of this.options.store.active()) {
      if (party.guildId !== guildId) continue;
      // A max battle at a power spot shows it as it is now too (plan 8X-3).
      const kind = isMeetup(party)
        ? party.meetup.place?.kind
        : isMax(party)
          ? party.max.spot.kind
          : undefined;
      if (kind === 'stop' || kind === 'powerspot') this.changed(party.id);
      // A train whose route has a power spot shows it as it is now (plan 8X-4).
      else if (isTrain(party) && party.train.route.some((ref) => ref.kind === 'powerspot')) {
        this.changed(party.id);
      }
    }
  }

  /**
   * The place of a meetup as its post shows it now (`meetupPlaceNow`): what a direct message about
   * it names.
   */
  placeOf(party: MeetupParty): MeetupPlace | null {
    return meetupPlaceNow(this.meetupView(party));
  }

  /**
   * A max battle's spot as its post shows it now (fix review (b)): a power spot as it is now
   * while it is the same place (`spotNow` over the kept Wayspots), else as it was named; a pin as
   * it is. The one way a DM and `/where` name the spot, so that it is never named two ways.
   */
  spotOf(party: MaxParty): MaxSpot {
    const { spot } = party.max;
    const { wayspots } = this.options;
    if (spot.kind === 'pin' || wayspots === undefined) return spot;
    return spotNow(
      spot,
      (id) => wayspots.stored(party.guildId, id),
      (wayspot) => wayspots.addressOf(wayspot),
    );
  }

  /**
   * The stops of the routes of a server's trains as they are now (plan 8X-4): gyms from the gym
   * list, power spots from the server's kept Wayspots (plan 19B-3).
   */
  stopsOf(guildId: number): StopLookup {
    return stopsFrom(this.options.gyms, this.options.wayspots, guildId);
  }

  /** Everything the renderer needs to show a train as it is now. */
  trainView(party: TrainParty): TrainPostView {
    const { raidBosses, gameData } = this.options;
    const catalogue = gameData.catalogue;
    return {
      ...this.timedView(party),
      stop: this.stopsOf(party.guildId),
      boss: shownBoss(party, catalogue, raidBosses.bosses(this.zoneOf(party)), gameData.icons),
      catalogue,
    };
  }

  /**
   * What the post of a party shows now, by the renderer of its kind. `closed` is the sentence
   * of its last showing when somebody closed it (see `RaidPostView.closed`).
   */
  private rendered(
    party: Party,
    closed?: string,
    card?: TrainCard,
    mapLink?: string,
  ): RenderedPost {
    const last = closed === undefined ? {} : { closed };
    switch (party.type) {
      case 'raid':
        return renderRaidPost({ ...this.view(party), ...this.neighborsShown(party), ...last });
      case 'meetup':
        return renderMeetupPost({ ...this.meetupView(party), ...last });
      case 'train':
        return renderTrainPost({
          ...this.trainView(party),
          ...last,
          ...(card === undefined
            ? {}
            : {
                card,
                regionChannel: (regionId: number) => this.options.regions.byId(regionId)?.channelId,
              }),
          ...(mapLink === undefined ? {} : { mapLink }),
        });
      case 'max':
        return renderMaxPost({ ...this.maxView(party), ...this.neighborsShown(party), ...last });
    }
  }

  /** Everything the renderer needs to show a max battle as it is now (plan 8X-3). */
  maxView(party: MaxParty): MaxPostView {
    const { maxBosses, gameData, wayspots } = this.options;
    const { catalogue } = gameData;
    return {
      party,
      now: this.now(),
      zone: this.zoneOf(party),
      boss: shownMaxBoss(party, catalogue, maxBosses.bosses(this.zoneOf(party)), gameData.icons),
      catalogue,
      emoji: this.emoji(party),
      ...(wayspots === undefined
        ? {}
        : {
            wayspot: (id: string) => wayspots.stored(party.guildId, id),
            addressOf: (wayspot: AddressedWayspot & { id: string }) => wayspots.addressOf(wayspot),
          }),
      ...this.lobbiesOf(party),
    };
  }

  /**
   * The region whose forum takes a max battle at this spot (plan 8X-3), among the regions of the
   * report's server whose outlines hold it (`regionsAtPoint`): the region the report was made in
   * when it is one of them, else the first with a forum; `any` is the first of them, for "no
   * forum yet". Neither for a spot outside the server's regions, or a channel of no region.
   */
  regionForSpot(spot: MaxSpot, regionChannelId: string): { region?: Region; any?: Region } {
    const { regions } = this.options;
    const invoking = regions.byChannel(regionChannelId);
    if (invoking?.guildId === undefined || invoking.guildId === null) return {};
    const lying = regionsAtPoint(regions.all(), invoking.guildId, spot);
    const candidates = [
      ...lying.filter((region) => region.id === invoking.id),
      ...lying.filter((region) => region.id !== invoking.id),
    ];
    const region = candidates.find((candidate) => candidate.forumChannelId !== null);
    return { ...(region ? { region } : {}), ...(candidates[0] ? { any: candidates[0] } : {}) };
  }

  /**
   * Stores a reported max battle and creates its post (plan 8X-3; design 3.1, 3.2). The spot has
   * one battle at a time (`PartyStore.addMaxUnlessTaken`): a report of the same boss and tier
   * signs the reporter up for the battle there with their automatic status, unless they are
   * already (`exists`); another boss is refused, the battle there named (`taken`, Q3). No active
   * max battle is left without a post, and no post without its battle.
   */
  async reportMax(report: MaxReport): Promise<MaxReportOutcome> {
    return this.reportMaxOnce(report, true);
  }

  private async reportMaxOnce(report: MaxReport, mayRepeat: boolean): Promise<MaxReportOutcome> {
    const { store, log } = this.options;
    const { region, any } = this.regionForSpot(report.spot, report.regionChannelId);
    if (!region?.forumChannelId) {
      return any ? { kind: 'no-forum', region: any } : { kind: 'no-region' };
    }
    if (region.guildId === null) {
      log.warn({ region: region.id }, 'a max battle was reported in a region of no server');
      return { kind: 'no-region' };
    }
    const forumId = region.forumChannelId;
    const now = this.now();
    let battle = createMax({
      id: crypto.randomUUID(),
      guildId: region.guildId,
      regionId: region.id,
      createdById: report.reporterId,
      anonymous: report.anonymous,
      autoStatus: report.autoStatus,
      tier: report.tier,
      boss: report.boss,
      spot: report.spot,
      endTime: report.endTime,
      now,
      ...(report.bossSince === undefined ? {} : { bossSince: report.bossSince }),
      ...(report.screenshot ? { screenshot: report.screenshot } : {}),
    });
    battle = noteMember(battle, report.reporterId, report.reporter ?? {});
    // The view does not depend on the stored row, so a renderer that fails stores nothing.
    const rendered = this.rendered({ ...battle, forumChannelId: forumId });

    // Asked before the spot's lock (never across a call in it), for the battle there may end
    // before the report is written, and the spot be free by then.
    const mayAdd =
      report.spot.kind !== 'pin' || !report.mayCreateAtPin || (await report.mayCreateAtPin());
    let stored: Awaited<ReturnType<PartyStore['addMaxUnlessTaken']>>;
    try {
      stored = await store.addMaxUnlessTaken(battle, now, { mayAdd });
    } catch (err) {
      if (err instanceof RegionClosedError) return { kind: 'no-region' };
      throw err;
    }
    if (!stored.added) {
      if (stored.existing === undefined) return { kind: 'pin-blocked' };
      const existingId = stored.existing.id;
      const inFlight = this.creating.get(existingId);
      if (inFlight) {
        await inFlight;
        // Its post was not made and the battle is gone: report again from the start, once.
        if (!store.get(existingId) && mayRepeat) return this.reportMaxOnce(report, false);
      }
      const existing = store.get(existingId);
      const there = existing && isMax(existing) ? existing : stored.existing;
      const ofReport = (party: MaxParty): boolean =>
        sameBoss(party.max.boss, report.boss) && party.max.tier === report.tier;
      // Answered at once for a battle of another boss; the store decides again below.
      if (!ofReport(there)) return { kind: 'taken', party: there };
      const checked = there.forumChannelId;
      if (
        report.mayJoin &&
        checked !== null &&
        checked !== forumId &&
        !(await report.mayJoin(checked))
      ) {
        return { kind: 'barred' };
      }
      // Decided inside the store (review B, B2): the boss the battle has by then (`/boss` may
      // have changed it meanwhile), and whether it still holds the spot.
      const signedUp = await store.update(existingId, (party): JoinStep => {
        if (!isMax(party) || !blocksNewMax(party, this.now())) return { outcome: 'over' };
        if (!ofReport(party)) return { outcome: 'other', other: party };
        const applied = applyAutoStatus(
          party,
          report.reporterId,
          report.autoStatus,
          this.lobbySize(party),
          this.now(),
        );
        return {
          outcome: 'joined',
          ...applied,
          ...(applied.joined
            ? { party: noteMember(applied.party, report.reporterId, report.reporter ?? {}) }
            : {}),
        };
      });
      if (signedUp === undefined || signedUp.outcome === 'over') {
        // It ended meanwhile, and the spot is free: report again from the start, once.
        if (mayRepeat) return this.reportMaxOnce(report, false);
        // The one after it ended as well: said so, never `exists` about an ended battle.
        return { kind: 'ended' };
      }
      if (signedUp.outcome === 'other') return { kind: 'taken', party: signedUp.other };
      if (signedUp.written) this.changed(existingId);
      const after = signedUp.party;
      return {
        kind: 'exists',
        party: isMax(after) ? after : there,
        joined: signedUp.joined,
      };
    }
    // The row exists; from here on a failure must not leave an active battle without a post.
    const created = await this.unlessRegionClosed(region, () =>
      this.createTracked(battle, region, rendered),
    );
    if (created === undefined) return { kind: 'no-region' };
    // Only now: the message links to the post. Nobody of a battle that has ended meanwhile.
    if (created.kind === 'created' && store.get(created.party.id)) {
      this.notifier?.maxReported(created.party, report.reporterId);
    }
    return created;
  }

  /**
   * How a member stands to a forum (`PartyGateway.memberAccess`), as Discord says it now: what
   * `/raid` asks before a report puts the member in a forum (`reportBarred`, plan 8M-6). Rejects
   * while Discord cannot say.
   */
  memberAccess(forumId: string, memberId: string): Promise<MemberAccess | undefined> {
    return this.options.gateway.memberAccess(forumId, memberId);
  }

  /**
   * The region whose forum takes a raid at this gym, among the regions of the server it was
   * reported in (`guildRow`, plan 19B-2: a gym the server does not have lies in none of its
   * regions) that the gym lies in: the region the report was made in, when that channel is a
   * region of this server (a region row of another server, or of none, is no region here); else
   * the first with a forum. `any` is the first candidate, for "no forum yet"; neither is set when
   * the gym lies in no region of this server. What `reportRaid` uses, so a caller can say
   * beforehand where a raid would go.
   */
  regionFor(
    gym: Gym,
    guildRow: number,
    regionChannelId?: string,
  ): { region?: Region; any?: Region } {
    const { gyms, regions } = this.options;
    const channel = regionChannelId === undefined ? undefined : regions.byChannel(regionChannelId);
    const invoking = channel?.guildId === guildRow ? channel : undefined;
    const lying = gymRegionsInGuild(gyms, regions, gym.id, guildRow);
    const candidates = invoking
      ? [
          ...lying.filter((region) => region.id === invoking.id),
          ...lying.filter((region) => region.id !== invoking.id),
        ]
      : lying;
    const region = candidates.find((candidate) => candidate.forumChannelId !== null);
    return { ...(region ? { region } : {}), ...(candidates[0] ? { any: candidates[0] } : {}) };
  }

  /** The tag ids of a forum. A failure, or a forum that is gone, is not remembered. */
  private tagIds(forumId: string): Promise<TagIds> {
    let ids = this.tags.get(forumId);
    if (!ids) {
      const asked: Promise<TagIds> = this.options.gateway
        .ensureTags(forumId, FORUM_TAGS)
        .then((found) => {
          if (!found) this.dropTags(forumId, asked);
          return found ?? {};
        });
      asked.catch(() => {
        this.dropTags(forumId, asked);
      });
      ids = asked;
      this.tags.set(forumId, ids);
    }
    return ids;
  }

  /** Forgets what is remembered about a forum's tags, or only the given ask. */
  private dropTags(forumId: string, only?: Promise<TagIds>): void {
    if (only === undefined || this.tags.get(forumId) === only) this.tags.delete(forumId);
  }

  private static applied(post: RenderedPost, ids: TagIds): string[] {
    return post.tags.map((tag) => ids[tag]).filter((id): id is string => id !== undefined);
  }

  /** What identifies the state of a post on Discord: its message, title and (sorted) tags. */
  private static sentKey(rendered: RenderedPost, tagIds: readonly string[]): string {
    return JSON.stringify({
      message: rendered.message,
      title: rendered.title,
      tags: [...tagIds].sort(),
    });
  }

  /**
   * Whether the server (its `Guild` row) still has a gym (plan 19B-2: one a server deleted is
   * gone for it, though another server keeps it): asked under the gym's lock when a raid is
   * stored.
   */
  private gymExists(gymId: number, guildRow: number | null | undefined): boolean {
    return this.options.gyms.of(guildRow ?? undefined).get(gymId) !== undefined;
  }

  /**
   * Stores a reported raid and creates its post. When the gym already has a raid, of any kind
   * (plan 8E), the reporter is signed up for that one with their automatic status, unless they
   * already are; nothing else of the report is applied to it (its tier, boss and times stay).
   * No active raid is left without a post, and no post without a stored raid.
   */
  async reportRaid(report: RaidReport): Promise<ReportOutcome> {
    return this.report(report, true);
  }

  private async report(report: RaidReport, mayRepeat: boolean): Promise<ReportOutcome> {
    const { store, log } = this.options;
    const { gym } = report;
    // Deleted since the member picked it: it lies in no region any more, but that is not what
    // to tell them. (Asked again under the gym's lock, where it counts.)
    const server = report.guildRow;
    if (!this.gymExists(gym.id, server)) return { kind: 'gym-gone' };
    const { region, any } = this.regionFor(gym, server, report.regionChannelId);
    if (!region?.forumChannelId)
      return any ? { kind: 'no-forum', region: any } : { kind: 'no-region' };
    if (region.guildId === null) {
      log.warn({ region: region.id }, 'a raid was reported in a region that belongs to no server');
      return { kind: 'no-region' };
    }
    const forumId = region.forumChannelId;

    const now = this.now();
    const rules = this.rulesOf({ guildId: region.guildId });
    const certain = certainMoves(
      report.boss && 'key' in report.boss
        ? this.options.gameData.catalogue.byKey(report.boss.key)
        : undefined,
    );
    let raid = createRaid(
      {
        id: crypto.randomUUID(),
        guildId: region.guildId,
        regionId: region.id,
        gymId: gym.id,
        createdById: report.reporterId,
        anonymous: report.anonymous,
        autoStatus: report.autoStatus,
        tier: report.tier,
        boss: report.boss,
        ...(report.hatched ? { hatched: true } : {}),
        fastMove: report.fastMove ?? certain.fastMove,
        chargedMove: report.chargedMove ?? certain.chargedMove,
        now,
      },
      rules,
    );
    if (report.time && 'hatch' in report.time)
      raid = setHatchTime(raid, report.time.hatch, rules, now);
    else if (report.time) raid = setEndTime(raid, report.time.end, rules, now);
    if (report.screenshot)
      raid = { ...raid, raid: { ...raid.raid, screenshot: report.screenshot } };
    raid = noteMember(raid, report.reporterId, report.reporter ?? {});
    // The view does not depend on the stored row, so a renderer that fails stores nothing.
    const rendered = renderRaidPost(this.view({ ...raid, forumChannelId: forumId }));

    let stored: Awaited<ReturnType<PartyStore['addRaidUnlessTaken']>>;
    try {
      stored = await store.addRaidUnlessTaken(raid, now, () => this.gymExists(gym.id, server), {
        ...(report.joinOnly ? { mayAdd: false } : {}),
      });
    } catch (err) {
      // The region was removed while the report was on its way: it is no region any more.
      if (err instanceof RegionClosedError) return { kind: 'no-region' };
      throw err;
    }
    if (!stored.added) {
      if (!stored.existing) {
        return report.joinOnly && this.gymExists(gym.id, server)
          ? { kind: 'none-there' }
          : { kind: 'gym-gone' };
      }
      const existingId = stored.existing.id;
      const inFlight = this.creating.get(existingId);
      // The new party of a move: joined only once the move has landed (follow-ups 604).
      const moving = this.deciding.get(existingId);
      if (inFlight || moving) {
        await inFlight;
        await moving;
        // Its creation or its move failed and the raid is gone: report again from the start, once.
        if (!store.get(existingId) && mayRepeat) return this.report(report, false);
      }
      // The raid it would join may stand in a forum the caller did not check (one reported
      // moments ago at a gym of two regions): asked here, where the raid to join is known; not
      // for the region's own forum, which every caller checked before (`reportBarred`).
      const checked = (store.get(existingId) ?? stored.existing).forumChannelId;
      if (
        report.mayJoin &&
        checked !== null &&
        checked !== forumId &&
        !(await report.mayJoin(checked))
      ) {
        return { kind: 'barred' };
      }
      // Decided in the store: a raid whose forum is not the one asked about any more (moved
      // while the question was out) is not joined.
      let elsewhere = false;
      const signedUp = await store.update(existingId, (party) => {
        if (report.mayJoin && party.forumChannelId !== checked) {
          elsewhere = true;
          return { party, joined: false };
        }
        const applied = applyAutoStatus(
          party,
          report.reporterId,
          report.autoStatus,
          this.lobbySize(party),
          this.now(),
        );
        // Only somebody this report signed up: an attendee's record is theirs to change.
        return applied.joined
          ? {
              ...applied,
              party: noteMember(applied.party, report.reporterId, report.reporter ?? {}),
            }
          : applied;
      });
      if (elsewhere) return { kind: 'barred' };
      if (signedUp?.written) this.changed(existingId);
      const existing = signedUp?.party ?? store.get(existingId);
      return {
        kind: 'exists',
        party: existing && isRaid(existing) ? existing : stored.existing,
        joined: signedUp?.joined ?? false,
      };
    }

    // The row exists; from here on a failure must not leave an active raid without a post.
    const created = await this.unlessRegionClosed(region, () =>
      this.createTracked(raid, region, rendered),
    );
    if (created === undefined) return { kind: 'no-region' };
    // Only now: the message links to the post. The reporter is not told of their own report,
    // and nobody of a raid that has ended meanwhile.
    if (created.kind === 'created' && store.get(created.party.id)) {
      this.notifier?.raidReported(created.party, report.reporterId);
    }
    return created;
  }

  /**
   * Makes a meetup with its post in the forum of the region it is made in (`/meetup`). Meetups
   * are not kept apart by anything: two with one name are two meetups. Like a raid, a meetup is
   * never left active without a post, nor a post without its meetup.
   */
  async createMeetup(request: MeetupRequest): Promise<MeetupOutcome> {
    const { place, startTime, endTime, description } = request;
    if (description !== undefined && description !== null) {
      if (tidyDescription(description) === undefined) return { kind: 'bad-description' };
    }
    return this.createTimed(request, 'meetup', (input) =>
      createMeetup({
        ...input,
        ...(place === undefined ? {} : { place }),
        ...(startTime === undefined ? {} : { startTime }),
        ...(endTime === undefined ? {} : { endTime }),
        ...(description === undefined ? {} : { description }),
      }),
    );
  }

  /**
   * Makes a raid train with its post in the forum of the region it is made in (`/train`), as a
   * meetup is made: nothing keeps trains apart, and a train is never left active without a
   * post, nor a post without its train. Its post stays in that forum wherever its route leads.
   * Its maker is signed up, and named, as they have set it for the raids they report.
   */
  createTrain(request: TrainRequest): Promise<TrainOutcome> {
    const { anonymous, autoStatus, atEnd, kind, startTime } = request;
    return this.createTimed(request, 'train', (input) =>
      createTrain({
        ...input,
        ...(anonymous === undefined ? {} : { anonymous }),
        ...(autoStatus === undefined ? {} : { autoStatus }),
        ...(atEnd === undefined ? {} : { atEnd }),
        ...(kind === undefined ? {} : { kind }),
        ...(startTime === undefined ? {} : { startTime }),
      }),
    );
  }

  /** Makes a timed party of one kind (`make`) with its post; `word` names the kind in the log. */
  private async createTimed<P extends TimedParty>(
    request: TimedRequest,
    word: string,
    make: (input: NewTimedParty) => Change<P>,
  ): Promise<TimedOutcome<P>> {
    const { store, regions, log } = this.options;
    const region = regions.byChannel(request.regionChannelId);
    if (!region) return { kind: 'no-region' };
    if (region.guildId === null) {
      log.warn({ region: region.id }, `a ${word} was made in a region that belongs to no server`);
      return { kind: 'no-region' };
    }
    const forumId = region.forumChannelId;
    if (forumId === null) return { kind: 'no-forum', region };
    const made = make({
      id: crypto.randomUUID(),
      guildId: region.guildId,
      regionId: region.id,
      createdById: request.creatorId,
      name: request.name,
      now: this.now(),
    });
    if (!made.ok) {
      return made.reason === 'bad-name'
        ? { kind: 'bad-name' }
        : { kind: 'cannot-make', reason: made.reason };
    }
    const party = noteMember(made.party, request.creatorId, request.creator ?? {});
    // The view does not depend on the stored row, so a renderer that fails stores nothing.
    const rendered = this.rendered({ ...party, forumChannelId: forumId });
    try {
      await store.add(party);
    } catch (err) {
      // The region was removed while this was on its way: it is no region any more.
      if (err instanceof RegionClosedError) return { kind: 'no-region' };
      throw err;
    }
    // The row exists; from here on a failure must not leave an active party without a post.
    const created = await this.unlessRegionClosed(region, () =>
      this.createTracked(party, region, rendered),
    );
    if (created === undefined) return { kind: 'no-region' };
    // Whoever asked to hear of new trains is told, but for who made this one; of a train that
    // has ended meanwhile, nobody.
    if (created.kind === 'created' && isTrain(created.party) && store.get(created.party.id)) {
      this.notifier?.trainCreated(created.party, request.creatorId);
    }
    return created;
  }

  /**
   * Runs the making of a post; undefined when it failed because the region was closed for its
   * removal meanwhile (`PartyStore.closeRegion`), which ended the party under it: whoever
   * made it is told what is true by then, that there is no region (its post was taken back).
   * What failed is logged all the same.
   */
  private async unlessRegionClosed<T>(
    region: Region,
    work: () => Promise<T>,
  ): Promise<T | undefined> {
    try {
      return await work();
    } catch (err) {
      if (!this.options.store.isRegionClosed(region.id)) throw err;
      // Mostly the removal ending the party under it; but a failure of its own in that moment
      // (Discord, the database) must not go unseen.
      this.options.log.info(
        { err, region: region.id },
        'a post was not made: its region is being removed',
      );
      return undefined;
    }
  }

  /** `createPostFor`, remembered while it runs: a report of the same gym waits for it. */
  private async createTracked<P extends Party>(
    party: P,
    region: Region,
    rendered: RenderedPost,
  ): Promise<{ kind: 'created'; party: P } | { kind: 'no-forum'; region: Region } | NoPost> {
    const creation = this.createPostFor(party, region, rendered);
    this.creating.set(
      party.id,
      creation.then(
        () => undefined,
        () => undefined,
      ),
    );
    try {
      return await creation;
    } finally {
      this.creating.delete(party.id);
    }
  }

  /**
   * Moves a raid to a gym of another region (spec 5.2). Its post cannot move to another forum,
   * so the raid becomes a new party with a post of its own there, and the old party ends: its
   * post says where the raid went, pinging those who are signed up and allow it, and is archived
   * like any ended party's, its link line and copies deleted. The new party is the raid as it was
   * at the moment the old one ended, so what members did while the new post was being made is
   * kept; `by` is the member who moved it.
   *
   * The new party is stored first and gets its post before the old one ends: when the gym has
   * a raid already (`taken`), the region has no forum (`no-forum`) or the post cannot be
   * made (it throws), the raid stays as and where it was. The word that it moved is said in the
   * old post while that party is still active: whoever is in that forum only for this raid
   * loses sight of it the moment the party ends, and would not get the ping. When the old party
   * has ended by itself meanwhile (the clock, `/delete`), the new one is taken back (`gone`): a
   * raid that somebody closed does not come back elsewhere. One raid moves once at a time; a
   * second move finds it `gone`.
   *
   * A stop of the process after the new post exists and before the old party has ended leaves
   * the raid twice (both run out by the clock); `flush` waits for a move that is under way.
   *
   * `moved` is called with the raid in its new place before anything is done to the old post:
   * an answer to an interaction in that post must be given there, not after the archiving. Like
   * `closing.left` of `end` it is waited for three seconds at most, and what it throws is
   * logged.
   */
  relocate(
    partyId: string,
    gym: Gym,
    region: Region,
    by?: { id: string } & MemberInfo,
    moved?: (party: RaidParty) => Promise<unknown>,
  ): Promise<RelocateOutcome> {
    return this.moves.run(partyId, async () => {
      const move: { decided?: () => void } = {};
      try {
        return await this.relocateNow(partyId, gym, region, by, moved, move);
      } finally {
        move.decided?.();
      }
    });
  }

  /**
   * Remembers that the new party of a move waits for the move’s outcome (2026-11-07,
   * follow-ups 604): a report of its gym meanwhile waits for it (`deciding`), so that it never
   * joins a raid whose post a failed move deletes a moment later. Gives the function that says
   * it is decided (once is enough; more do nothing).
   */
  private moveUnderWay(partyId: string): () => void {
    let resolve: () => void = () => undefined;
    const decision = new Promise<void>((done) => {
      resolve = done;
    });
    this.deciding.set(partyId, decision);
    return () => {
      resolve();
      if (this.deciding.get(partyId) === decision) this.deciding.delete(partyId);
    };
  }

  private async relocateNow(
    partyId: string,
    gym: Gym,
    region: Region,
    by: ({ id: string } & MemberInfo) | undefined,
    moved: ((party: RaidParty) => Promise<unknown>) | undefined,
    move: { decided?: () => void },
  ): Promise<RelocateOutcome> {
    const { store, gateway, log } = this.options;
    const old = store.get(partyId);
    if (!old || !isRaid(old)) return { kind: 'gone' };
    const forumId = region.forumChannelId;
    if (forumId === null || region.guildId === null) return { kind: 'no-forum' };
    const raid = relocatedRaid(old, {
      id: crypto.randomUUID(),
      guildId: region.guildId,
      regionId: region.id,
      gymId: gym.id,
    });
    const rendered = renderRaidPost(this.view({ ...raid, forumChannelId: forumId }));
    let stored: Awaited<ReturnType<PartyStore['addRaidUnlessTaken']>>;
    try {
      stored = await store.addRaidUnlessTaken(
        raid,
        this.now(),
        () => this.gymExists(gym.id, region.guildId),
        {
          movedFrom: partyId,
          // The audit log names who moved it (none: Pine).
          ...(by === undefined ? {} : { by: loggedBy(by) }),
        },
      );
    } catch (err) {
      // The region it should move to was removed meanwhile: it has no forum to move into.
      if (err instanceof RegionClosedError) return { kind: 'no-forum' };
      throw err;
    }
    if (!stored.added) {
      return stored.existing ? { kind: 'taken', other: stored.existing } : { kind: 'gym-gone' };
    }
    // A report of the gym waits until the move has landed (the old party ended, what it was
    // carried over) or failed (the new party taken back).
    move.decided = this.moveUnderWay(raid.id);
    // Before the old party ends: who was told about it is not told again about the new one.
    this.notifier?.raidMoving(partyId, raid.id);
    // A failure in here ends the new party again and leaves the old one alone.
    const created = await this.unlessRegionClosed(region, () =>
      this.createTracked(raid, region, rendered),
    );
    if (created?.kind === 'no-post') return created;
    if (created?.kind !== 'created') return { kind: 'no-forum' };
    const postId = created.party.forumPostId;

    // The word goes into the old post now, while everybody who is in the raid can still see it.
    const before = store.get(partyId);
    const oldPost = before?.forumPostId ?? null;
    if (!before || oldPost === null) {
      await this.takeBack(raid.id);
      return { kind: 'gone' };
    }
    const words =
      `This raid has moved to **${plain(gym.nickname || gym.name)}** in ` +
      `<#${region.channelId}>${postId === null ? '.' : `: <#${postId}>`}`;
    let said = false;
    try {
      const others = membersWhere(
        before,
        (attendee, id) => id !== by?.id && attendee.status !== PartyStatus.Complete,
      );
      // Everybody, in as many messages as it takes (plan 8X-4); none into the post of a party
      // that has ended, which would open an archived post again (`pingInMessages` asks). The
      // words are said once the first message went, though a later one fails: they are not said
      // again when the post closes.
      const telling = {
        sendMessage: async (...args: Parameters<PartyGateway['sendMessage']>) => {
          const id = await gateway.sendMessage(...args);
          if (id !== undefined) said = true;
          return id;
        },
      };
      await pingInMessages(
        { store, gateway: telling },
        partyId,
        oldPost,
        words,
        await this.pingable(others),
      );
    } catch (err) {
      log.warn({ err, party: partyId }, 'could not say in its post that a raid moves');
    }

    // The old party ends inside the store: what it is at that moment is what moves.
    const seen: { last?: RaidParty } = {};
    // The history keeps the raid once, as the party it goes on as.
    const movedTo: PartyEnd = { how: 'moved', to: raid.id };
    let ended;
    try {
      ended = await store.update(
        partyId,
        (party) => {
          const raid = asKindOf(old, party);
          seen.last = raid;
          return { party: endParty(raid), ended: movedTo };
        },
        byMember(by),
      );
    } catch (err) {
      // Both would stay active, one raid in two places: the new one goes again.
      await this.takeBack(raid.id);
      if (said) await this.sayItStays(partyId, oldPost);
      throw err;
    }
    const source = seen.last;
    const from = ended?.written ? ended.party : undefined;
    if (!source || !from) {
      // It ended by itself in this very moment: what somebody closed does not come back.
      await this.takeBack(raid.id);
      return { kind: 'gone' };
    }
    // Its closing is under way from here: the sweep of leftover copies leaves it alone.
    this.closing.add(from.id);
    let party = created.party;
    try {
      const carried = await store.update(raid.id, (current) => {
        const now = carriedOver(asKindOf(raid, current), source, raid);
        return { party: by ? noteMember(now, by.id, by) : now };
      });
      party = carried?.party ?? party;
    } catch (err) {
      log.warn({ err, party: raid.id }, 'could not carry over what changed while a raid moved');
    }
    move.decided();
    this.ended(from);
    if (moved) {
      const there = party;
      await this.answerBeforeClosing(raid.id, () => moved(there));
    }
    try {
      await this.closePost(from, words, said);
    } finally {
      // The raid has moved by now, whatever became of the old post (its last showing can
      // throw): the new post is brought up to date and the notifier told all the same.
      this.changed(raid.id);
      // Whoever moved it is not told; who targets the new gym, and who can see it only now, is.
      this.notifier?.raidMoved(from, party, by?.id ?? null);
    }
    return { kind: 'moved', party, from };
  }

  /**
   * Splits a group off a train into a train of its own (plan 8T): a new train with its post in
   * the same forum, with the route, stop, mode, boss and times of the old one and the group's
   * members (`splitTrain`), and the old train without them (`splitOffGroup`). Nobody is in both
   * trains or in neither once it settles; the old train keeps its post whatever happens; a failure
   * leaves the old train as it was and no new post behind.
   *
   * As a raid's move (`relocate`): the new train is stored (`pending`: `splitFrom.pending`) and
   * gets its post first; then both trains change in one write (`PartyStore.updateBoth`, one
   * transaction), which decides anew (the group may be gone or called otherwise by now, `drawn`;
   * the train may have ended; the member may no longer be allowed; the new train must still be
   * there). When it refuses, has ended, or the write fails, the new train is taken back
   * (`takeBack`: its post and link line deleted, nothing recorded) and that is the answer. A
   * refusal that is known before anything is made is answered at once. In that write the old
   * train loses the group, and who is in it at that moment goes: a member who left the group, or
   * joined it, while the new post was made counts as they are then; the new train, as it is then,
   * is made to match (`carriedSplit`), keeping what members did on the new post meanwhile, goes on
   * from where the old one was then (its stop, route and times) and is settled (no longer
   * pending); its history starts there (`partySteps`). One split of a train at a time; a second
   * finds the group gone.
   *
   * There is nothing between the old train's write and the new one's: both commit or neither
   * does. What a stop of the process can leave is a new train that is pending, with its post,
   * whose write never committed (the old train still has the group); `settlePendingSplits` (at
   * start, and with the clock's hourly upkeep for one a minute old) takes it back.
   *
   * No new-train DMs go out (its members know); its region copies, the access to its forum and
   * the summary follow as for any new party. Lines and the ping of who moved are the caller's
   * (`TrainService.split`).
   */
  splitTrain(request: SplitRequest): Promise<SplitOutcome> {
    return this.moves.run(request.partyId, () => this.splitNow(request));
  }

  private async splitNow(request: SplitRequest): Promise<SplitOutcome> {
    const { store, regions } = this.options;
    const { by, staff, group, drawn } = request;
    const old = store.get(request.partyId);
    const oldPost = old?.forumPostId ?? null;
    if (!old || !isTrain(old) || oldPost === null) return { kind: 'gone' };
    const id = crypto.randomUUID();
    // What the old train would say now, before anything is made.
    const first = splitOffGroup(
      old,
      by.id,
      staff,
      group,
      { partyId: id, postId: oldPost },
      drawn,
      request.anonymous,
    );
    if (!first.ok) return { kind: 'refused', reason: first.reason };
    const region = old.regionId === null ? undefined : regions.byId(old.regionId);
    const forumId = old.forumChannelId;
    // The new post goes into the region's forum: only while that is the old train's.
    if (!region || forumId === null || region.forumChannelId !== forumId) {
      return { kind: 'no-forum' };
    }
    const made = splitTrain(old, {
      id,
      by: by.id,
      anonymous: request.anonymous,
      group,
      now: this.now(),
    });
    const fresh = noteMember(made, by.id, by);
    const rendered = this.rendered({ ...fresh, forumChannelId: forumId });
    try {
      await store.add(fresh);
    } catch (err) {
      if (err instanceof RegionClosedError) return { kind: 'no-forum' };
      throw err;
    }
    // A failure in here ends the new train again and leaves the old one alone.
    const created = await this.unlessRegionClosed(region, () =>
      this.createTracked(fresh, region, rendered),
    );
    if (created?.kind === 'no-post') return created;
    if (created?.kind !== 'created' || created.party.forumPostId === null) {
      return { kind: 'no-forum' };
    }
    const link = { partyId: id, postId: created.party.forumPostId };

    // One write of both trains: the old one loses the group (who is in it now is who goes),
    // and the new one, as it is now, is made to match and settled.
    const seen: {
      split?: Extract<ReturnType<typeof splitOffGroup>, { ok: true }>;
      refusal?: PartyProblem;
      newGone?: true;
    } = {};
    let paired;
    try {
      paired = await store.updateBoth(
        [old.id, id],
        (oldNow, newNow): PairChange => {
          // The new train ended meanwhile (its post was deleted): the group stays where it is.
          if (!newNow) {
            seen.newGone = true;
            return {};
          }
          if (!oldNow) return {};
          // The presser is noted before the split, so that their record moves with the name and
          // team they have now: the carry-over takes the moved records over the new train's.
          const train = noteMember(asKindOf(old, oldNow), by.id, by);
          const split = splitOffGroup(train, by.id, staff, group, link, drawn, request.anonymous);
          if (!split.ok) {
            seen.refusal = split.reason;
            return {};
          }
          seen.split = split;
          const carried = carriedSplit(
            asKindOf(fresh, newNow),
            fresh,
            split.moved,
            split.conductor,
            split.was,
            this.now(),
          );
          return { parties: [split.party, splitSettled(carried)] };
        },
        byMember(by),
      );
    } catch (err) {
      await this.takeBack(id);
      throw err;
    }
    const split = seen.split;
    const [oldStored, newStored] = paired.parties;
    if (!paired.written || !split || !oldStored || !newStored) {
      await this.takeBack(id);
      if (seen.newGone) return { kind: 'no-post' };
      return seen.refusal ? { kind: 'refused', reason: seen.refusal } : { kind: 'gone' };
    }
    const from = asKindOf(old, oldStored);
    const party = asKindOf(fresh, newStored);
    this.changed(from.id);
    this.changed(id);
    return { kind: 'split', party, from, group: split.group, moved: Object.keys(split.moved) };
  }

  /**
   * Takes back the new train of a split that is still pending (`splitFrom.pending`): its post
   * exists and the write that would have settled it with the old train never committed
   * (`updateBoth`), so the old train still has the group, or ended with it, and the new one goes
   * (`takeBack`: its post and link line deleted, dropped from the history). One whose old train
   * is still active and lists it among its splits (`splitOff`) cannot come of this code: only
   * plan 8T's first build, which wrote the two trains one after the other, could leave one
   * (stopped between the writes). The group is then on no other train, and it is settled as it
   * is stored (logged as an error). Only an active old train is seen (the store keeps no ended
   * party): the pending new train of an old train that ended is taken back, whatever the old one
   * listed.
   * Says which it did; nothing for a train that is not pending, or one that could not be ended
   * or settled (logged: it stays pending for the next try, `settlePendingSplits`). Never rejects.
   */
  private async settleSplit(partyId: string): Promise<'settled' | 'taken-back' | undefined> {
    const { store, log } = this.options;
    const found = store.get(partyId);
    const party = found && isTrain(found) ? found : undefined;
    const from = party?.train.splitFrom ?? null;
    if (!party || from?.pending !== true) return undefined;
    const old = store.get(from.partyId);
    if (!old || !isTrain(old) || !old.train.splitOff.some((split) => split.partyId === partyId)) {
      await this.takeBack(partyId);
      return store.get(partyId) ? undefined : 'taken-back';
    }
    log.error(
      { party: partyId, from: from.partyId },
      'a pending new train of a split that its old train lists: settled as it is',
    );
    try {
      await store.update(partyId, (current) => ({ party: splitSettled(asKindOf(party, current)) }));
      this.changed(partyId);
      return 'settled';
    } catch (err) {
      log.error({ err, party: partyId }, 'could not settle the new train of a split');
      return undefined;
    }
  }

  /**
   * Takes back (`settleSplit`) the new trains of splits that were left pending, each under the
   * lock of the moves of its old train: by a stop of the process before the split's write (call
   * once at start, once Discord is there: taking one back deletes its post), or in the process by
   * a take-back that could not end the train (the clock's hourly upkeep asks for those
   * `olderThanMs` a minute: the lock keeps it apart from a split under way, and the minute only
   * spares it waiting behind one). Logs how many it settled and took back, when it did any; says
   * how many.
   */
  async settlePendingSplits(olderThanMs = 0): Promise<number> {
    const before = this.now() - olderThanMs;
    const pending = this.options.store
      .active()
      .filter(isTrain)
      .filter((party) => party.train.splitFrom?.pending === true && party.createdAt <= before);
    const done: { id: string; outcome: 'settled' | 'taken-back' }[] = [];
    for (const party of pending) {
      const outcome = await this.moves.run(party.train.splitFrom?.partyId ?? party.id, () =>
        this.settleSplit(party.id),
      );
      if (outcome !== undefined) done.push({ id: party.id, outcome });
    }
    if (done.length > 0) {
      this.options.log.warn(
        {
          parties: done.map((one) => one.id),
          settled: done.filter((one) => one.outcome === 'settled').length,
          takenBack: done.filter((one) => one.outcome === 'taken-back').length,
        },
        'settled or took back the new trains of splits that were left pending',
      );
    }
    return done.length;
  }

  /**
   * Undoes the new party of a move that did not happen after all: it ends, and its link line,
   * its copies and its post, which is a moment old, are deleted. Never rejects. A party that
   * cannot be ended stays active without its post; a render is asked for, which ends it for that.
   */
  private async takeBack(partyId: string): Promise<void> {
    const { store, gateway, log } = this.options;
    const ended = await this.abandon(partyId, 'could not end the new party of a move that failed');
    const party = ended ?? store.get(partyId);
    if (!party) return;
    if (ended) this.ended(ended);
    // Still active: the render finds its post gone and ends it, now or with the next change.
    else this.posts.request(partyId);
    try {
      await this.deleteLinkLine(party);
      await this.posts.idle(partyId);
      await this.mirrors.idle(partyId);
      await this.mirrors.remove(party);
      if (party.forumPostId !== null) await gateway.deletePost(party.forumPostId);
    } catch (err) {
      log.warn({ err, party: partyId }, 'could not tidy up after a move that failed');
    }
  }

  /** Corrects the word that a raid moved, in the post of the party that stays after all. */
  private async sayItStays(partyId: string, postId: string): Promise<void> {
    try {
      // None into the post of a party that ended meanwhile; an ending waits for it.
      await this.whileOpen(partyId, () =>
        this.options.gateway.sendMessage(postId, {
          content: 'The move did not work: this raid stays here.',
        }),
      );
    } catch (err) {
      this.options.log.warn({ err, party: partyId }, 'could not say that a raid stays');
    }
  }

  /** Those of these members who let the bot ping them. Nobody without the members' settings. */
  private async pingable(ids: readonly string[]): Promise<string[]> {
    const { users } = this.options;
    if (!users) return [];
    const settings = await settingsOf(users, ids, this.options.log);
    return ids.filter((id) => settings.get(id)?.mentions === true);
  }

  /**
   * Makes the post of a stored party and records it; undoes the party when that cannot be done.
   * The link line in the region's channel says what kind of party is new.
   */
  private async createPostFor<P extends Party>(
    fresh: P,
    region: Region,
    rendered: RenderedPost,
  ): Promise<{ kind: 'created'; party: P } | { kind: 'no-forum'; region: Region } | NoPost> {
    const { store, gateway, log } = this.options;
    const forumId = region.forumChannelId ?? '';
    const word = partyWord(fresh);
    let postId: string | undefined;
    let tagIds: string[];
    try {
      tagIds = PartyService.applied(rendered, await this.tagIds(forumId));
      postId = await this.sendPost(fresh.id, forumId, rendered, tagIds);
    } catch (err) {
      this.dropTags(forumId);
      await this.abandon(fresh.id, NO_POST);
      if (err instanceof PostLostError) return { kind: 'no-post' };
      if (err instanceof PostsRefusedError) {
        this.postsRefusedIn(err, region);
        return { kind: 'no-post', refused: { forumId: err.forumId, missing: err.missing } };
      }
      throw err;
    }
    if (postId === undefined) {
      // The forum was deleted by hand: the region has none any more as far as reports go.
      this.dropTags(forumId);
      await this.abandon(fresh.id, NO_POST);
      return { kind: 'no-forum', region };
    }
    const post = postId;
    let posted;
    try {
      posted = await store.update(fresh.id, (party) => ({
        party: { ...party, forumChannelId: forumId, forumPostId: post },
      }));
    } catch (err) {
      await this.discard(fresh.id, post);
      throw err;
    }
    if (!posted) {
      await this.discard(fresh.id, post);
      throw new Error(`The ${word} ended while its post was being created`);
    }
    let party = asKindOf(fresh, posted.party);
    // What was just sent is what the render requested below would send: it sends nothing.
    this.sent.set(post, {
      key: PartyService.sentKey(rendered, tagIds),
      checkedAt: this.now(),
    });
    this.keepLayout(fresh.id, post, rendered.layout);

    // Ended meanwhile (its region removed, `/delete`): its end did not see a link line, so none
    // is sent, and one sent while it ended is taken back, or it would stay for good.
    if (store.get(fresh.id)) {
      try {
        const linkId = await gateway.sendMessage(region.channelId, {
          content: renderRegionLink(post, fresh.type),
        });
        if (linkId !== undefined) {
          const linked = await store.update(fresh.id, (current) => ({
            party: { ...current, regionLinkMessageId: linkId },
          }));
          if (linked?.party) party = asKindOf(fresh, linked.party);
          else if (!linked) await gateway.deleteMessage(region.channelId, linkId);
        }
      } catch (err) {
        log.warn({ err, party: fresh.id }, `could not post the link to a new ${word}`);
      }
    }
    // Whoever signed up while the post was being made is shown by this render.
    this.posts.request(fresh.id);
    this.summaries.request(region.id);
    return { kind: 'created', party };
  }

  /**
   * Says that the bot may not make posts in a forum (the member is told by the command): in the
   * log with the server, once per forum while the bot runs, and to the server's staff in its
   * moderators' bot lab (plan 19B-1), who must give it what it lacks, asked at every refusal
   * (fix round 2, G2: `ServerNotices` says it once, and again at the next refusal where it could
   * not, so a lab set later hears of it).
   */
  private postsRefusedIn(refusal: PostsRefusedError, region: Pick<Region, 'guildId'>): void {
    const server = this.serverOfRow(region.guildId);
    if (!this.refusedForums.has(refusal.forumId)) {
      this.refusedForums.set(refusal.forumId, true);
      this.options.log.warn(
        { server, forum: refusal.forumId, missing: refusal.missing },
        'the bot may not make posts in a forum: staff must give it the permissions',
      );
    }
    if (server === undefined) return;
    this.options.notices.tell(
      server,
      `forum-posts:${refusal.forumId}`,
      forumRefusedWords(refusal.forumId, refusal.missing),
    );
  }

  /**
   * Creates a post; when Discord refuses its files (an egg's picture), once more without them,
   * when it refuses an emoji of a button, with the plain ones, and when it refuses a picture (its
   * own or the gym's), without them (`createPost` tries the forms of a `FormTrail`, on either way
   * of making a post).
   */
  private sendPost(
    partyId: string,
    forumId: string,
    rendered: RenderedPost,
    tagIds: string[],
  ): Promise<string | undefined> {
    return this.createPost(
      partyId,
      forumId,
      { title: rendered.title, message: rendered.message, tagIds },
      { picture: layoutPicture(rendered.layout), forms: postForms(rendered.layout) },
    );
  }

  /**
   * Creates a post with this message as its first. Whether Discord takes a components-v2 message
   * as the first message of a forum post is not documented: until a post was made it is tried,
   * and when Discord refuses it (`isRefusedStarter`), the post is made with a line of text that is
   * edited into the message at once, which Discord does document (converted at once: the line is
   * known to be classic). Each way tries the forms of the message (`FormTrail`): without its
   * files, with plain emoji, without its pictures, before the way is given up: a part of the
   * message may be what Discord refused, and a line posted for nothing would flash by. A message
   * whose files (an egg's picture) Discord refuses (Missing Permissions where the bot may not
   * attach files: `isRefusedFile`) is tried without them, and the forum and the post are
   * remembered (`RefusedFiles`), so that their next messages go without them at once; files
   * refused so and an emoji Discord named on the first way are left out on the second at once.
   * What worked is kept for the rest of the process and logged once. A refusal of the edit in its last form takes the post back and is
   * thrown; a refusal once direct posts have worked is the message's own, and is thrown.
   * `partyId` names what the post is for in the log (`summary-<region>` for a region's summary
   * post). The refusals a form got round are logged once the post is made.
   */
  private async createPost(
    partyId: string,
    forumId: string,
    post: NewPost,
    options: { picture?: string | undefined; forms?: MessageForms } = {},
  ): Promise<string | undefined> {
    const { gateway, log } = this.options;
    const forms = options.forms ?? { message: post.message, without: () => post.message };
    /** What is known to be refused here: files in this forum, an emoji Discord named. */
    const known: LeftOut = this.refusedFiles.has(forumId) ? { files: false } : {};
    let filesRefused = known.files === false;
    /** Notes a refusal as the next form is tried; whether it was of the files. */
    const noted = (err: unknown, { what }: FormStep): void => {
      if (what === 'emoji') {
        known.customEmoji = false;
        this.options.appEmoji?.refused?.();
      }
      // Invalid Form Body may be the first message refused as v2, not its file: that goes the
      // way of a refused first message (the next form is without the file all the same).
      if (what === 'files' && !isRefusedBody(err)) {
        known.files = false;
        filesRefused = true;
        this.refusedFiles.note(forumId);
      }
    };
    /** Said once the post is made: the refusals its form got round on that way. */
    const said = (refusals: readonly [unknown, FormStep][]): void => {
      for (const [err, { what, dropped }] of refusals) {
        log.warn(
          { err, party: partyId, picture: options.picture },
          refusalSaid(what, 'posting', dropped),
        );
      }
    };
    let refusal: unknown;
    if (this.starter !== 'edited') {
      const trail = new FormTrail(forms, known);
      const refusals: [unknown, FormStep][] = [];
      for (;;) {
        try {
          const postId = await gateway.createPost(forumId, { ...post, message: trail.message });
          if (postId !== undefined && this.starter === undefined) {
            this.starter = 'direct';
            log.info({ party: partyId }, 'forum posts are made as they are');
          }
          if (postId !== undefined && filesRefused) this.refusedFiles.note(postId);
          said(refusals);
          return postId;
        } catch (err) {
          refusal = err;
          const starterRefused = isRefusedStarter(err, this.starter === 'direct');
          const step = trail.next(err, starterRefused);
          if (step === undefined) {
            if (!starterRefused || this.starter === 'direct') throw err;
            break;
          }
          noted(err, step);
          refusals.push([err, step]);
        }
      }
    }
    const postId = await gateway.createPost(forumId, {
      ...post,
      message: { content: FIRST_LINE },
    });
    if (postId === undefined) return undefined;
    const trail = new FormTrail(forms, known);
    const refusals: [unknown, FormStep][] = [];
    let edited: boolean;
    for (;;) {
      try {
        edited = await gateway.editPost(postId, trail.message, { convert: true });
        if (filesRefused) this.refusedFiles.note(postId);
        said(refusals);
        break;
      } catch (err) {
        const step = trail.next(err);
        if (step === undefined) {
          await this.discardPost(partyId, postId);
          throw err;
        }
        noted(err, step);
        refusals.push([err, step]);
      }
    }
    if (!edited) {
      // Deleted that very moment: the forum is still there, the post is not.
      await this.discardPost(partyId, postId);
      throw new PostLostError();
    }
    if (this.starter !== 'edited') {
      this.starter = 'edited';
      log.info(
        {
          party: partyId,
          ...(refusal instanceof DiscordAPIError ? { code: refusal.code } : {}),
        },
        'Discord refused a components-v2 first message of a forum post',
      );
    }
    return postId;
  }

  /** Deletes a post made a moment ago that will not be used; a failure is only logged. */
  private async discardPost(partyId: string, postId: string): Promise<void> {
    try {
      await this.options.gateway.deletePost(postId);
    } catch (err) {
      this.options.log.error({ err, party: partyId, post: postId }, 'could not delete a lost post');
    }
  }

  /** Deletes a post that no stored party has, and ends the party. */
  private async discard(partyId: string, postId: string): Promise<void> {
    await this.discardPost(partyId, postId);
    await this.abandon(partyId, NO_POST);
  }

  /**
   * Ends a party that cannot be shown, so that a raid does not block its gym. Gives the party as
   * it was when it ended; undefined when it could not be ended (it stays active) or was not active.
   * `how` is why, for the party history: one that never had a post failed; one whose post was
   * deleted was closed by whoever deleted it.
   */
  private async abandon(
    partyId: string,
    failure: string,
    how: PartyEnd = { how: 'failed' },
  ): Promise<Party | undefined> {
    const { store, log } = this.options;
    const postId = store.get(partyId)?.forumPostId;
    let ended: Party | undefined;
    try {
      const result = await store.update(partyId, (party) => ({
        party: endParty(party),
        ended: how,
      }));
      if (result?.written) ended = result.party;
    } catch (err) {
      log.error({ err, party: partyId }, failure);
    }
    if (postId) this.forgetPost(postId);
    this.drawsOver(partyId);
    return ended;
  }

  /**
   * Keeps the layout a post shows now, only while it is still its party's post (review 8A-7): an
   * edit that ends after the party ended, or after it moved to another post, keeps nothing.
   */
  private keepLayout(partyId: string, postId: string, layout: PostLayout): void {
    const party = this.options.store.get(partyId);
    if (party?.forumPostId !== postId) return;
    const kept = this.shownLayouts.get(postId);
    this.shownLayouts.set(postId, layout);
    this.tellPostShown(party, kept, layout);
    // The draw going on has shown what it read: the presses whose change it read are answered.
    const reading = this.draws.get(partyId)?.reading;
    if (reading !== undefined) this.drawDone(partyId, reading);
  }

  /**
   * Has `listener` told of each draw of a post that kept its layout, also of draws that send
   * nothing new: `changed` says the layout's key differs from the one kept before. Decides and
   * returns, as a listener of the store does; what it throws is logged.
   */
  onPostShown(listener: PostShownListener): void {
    this.postShownListeners.push(listener);
  }

  private tellPostShown(party: Party, kept: PostLayout | undefined, layout: PostLayout): void {
    if (this.postShownListeners.length === 0) return;
    const changed = kept === undefined || postKey(kept) !== postKey(layout);
    for (const listener of this.postShownListeners) {
      try {
        listener(party.id, party.guildId, changed);
      } catch (err) {
        this.options.log.error({ err, party: party.id }, 'a listener of the posts failed');
      }
    }
  }

  /** Forgets what is kept for a post: its rename budget, a title waiting for it, what it showed. */
  private forgetPost(postId: string): void {
    this.sent.delete(postId);
    this.shownLayouts.delete(postId);
    this.renames.delete(postId);
    this.renameTimers.get(postId)?.cancel();
    this.renameTimers.delete(postId);
  }

  /**
   * Ends every active party that has no post: what a stop between storing a raid and creating
   * its post leaves behind. Call once at start, right after the store is loaded.
   */
  async endPartiesWithoutPost(): Promise<number> {
    const orphans = this.options.store.active().filter((party) => party.forumPostId === null);
    for (const party of orphans) await this.abandon(party.id, NO_POST);
    if (orphans.length > 0) {
      this.options.log.warn(
        { parties: orphans.map((p) => p.id) },
        'ended parties that had no post',
      );
    }
    return orphans.length;
  }

  /**
   * A party changed: its post and its region's summary are brought up to date shortly. Whoever
   * changes a stored party calls this. The custom-id kind `raid` belongs to `/raid`'s own
   * controls; the controls of a post get a kind of their own.
   */
  changed(partyId: string): void {
    this.posts.request(partyId);
    const party = this.options.store.get(partyId);
    const regionId = party?.regionId;
    if (regionId !== null && regionId !== undefined) this.summaries.request(regionId);
    // A train may pass through any region of its server (plan 8X-G): every summary of the
    // server is drawn again, and one that would be the same is not edited (`summarySent`).
    if (party && isTrain(party)) this.serverSummaries(party.guildId);
  }

  /** Asks for the summary of every region of a server that has a forum. */
  private serverSummaries(guildId: number): void {
    for (const region of this.options.regions.all()) {
      if (region.guildId === guildId && region.forumChannelId !== null) {
        this.summaries.request(region.id);
      }
    }
  }

  /**
   * The posts of the stops (plan 8X-G): the summary links the post of its region's channel
   * today, with its counts. Set by the app once the service of the stops is made (none in
   * rehearsal mode); it tells `summaryChanged` when a post changes.
   */
  setStopPosts(stopPosts: StopPostsForSummary): void {
    this.stopPosts = stopPosts;
  }

  /**
   * The emoji the posts show have changed (the application's were read for the first time, or
   * anew after an upload): every active party's post is brought up to date as after a change,
   * one party every `EMOJI_RENDER_GAP_MS` (a change while some wait starts the round anew), and a
   * post whose message stays the same is not edited. Nothing after `close`; `flush` drops the rest.
   */
  emojiChanged(): void {
    this.showAllAnew();
  }

  /**
   * The gateway is back after a real disconnect (plan 8X-H, review R3): every active party's post
   * is shown anew as `emojiChanged` shows them, one party every `EMOJI_RENDER_GAP_MS`. A post
   * whose edit failed while the network was away stays as it was until something shows it anew
   * (`showPost` forgot what it sent before trying), so it is edited now; one that is current
   * makes no edit. Nothing after `close`.
   */
  redrawPosts(): void {
    this.showAllAnew();
  }

  /**
   * Every active post shown anew, paced (`emojiChanged`, `redrawPosts`), and every summary drawn
   * anew (plan 8R-9, B7: a midnight passed while the network was away); one that reads the same
   * is not edited.
   */
  private showAllAnew(): void {
    if (this.closed) return;
    this.allSummaries();
    // The round starts anew: what waited is in it again.
    this.emojiQueue.clear();
    for (const party of this.options.store.active()) {
      // A quiet server draws nothing (plans 19C-1, 19C-2): its posts take no turn of the pace.
      if (party.forumPostId !== null && !this.ofQuietServer(party)) {
        this.emojiQueue.put(party.guildId, party.id);
      }
    }
    if (this.emojiTimer === undefined) this.nextEmojiPost();
  }

  /**
   * Shows the next waiting post anew, the servers in turns (plan 19B-5: one server's many posts
   * do not hold back another's), and sets the timer of the one after it.
   */
  private nextEmojiPost(): void {
    this.emojiTimer = undefined;
    const partyId = this.emojiQueue.take();
    if (partyId === undefined) return;
    // Ended meanwhile: there is nothing to show.
    if (this.options.store.get(partyId)?.forumPostId) this.posts.request(partyId);
    if (this.emojiQueue.size > 0) {
      this.emojiTimer = this.setTimer(() => {
        this.nextEmojiPost();
      }, EMOJI_RENDER_GAP_MS);
    }
  }

  /**
   * A party has just ended (it is no longer in the store, so `changed` cannot find its region):
   * the summary of its region is brought up to date shortly, and what is kept for the party and
   * its post (requests to delete it, its rename budget) is dropped. `end` and `postGone` call
   * it; so must whoever ends a party in some other way.
   */
  ended(party: {
    id: string;
    forumPostId: string | null;
    regionId: number | null;
    type?: string;
    guildId?: number;
  }): void {
    this.deletionRequests.delete(party.id);
    if (party.forumPostId !== null) this.forgetPost(party.forumPostId);
    this.drawsOver(party.id);
    if (party.regionId !== null) this.summaries.request(party.regionId);
    // A train that ended passes through no region any more (plan 8X-G).
    if (party.type === 'train' && party.guildId !== undefined) this.serverSummaries(party.guildId);
  }

  /**
   * The summary of a region is brought up to date shortly; with `checkBoard` its post's pin and
   * lock are checked too, whether or not its text changed (plan 8R-9, B4: told after each draw of
   * the stops in it, which opens an archived board).
   */
  summaryChanged(regionId: number, checkBoard = false): void {
    if (checkBoard) this.boardChecks.add(regionId);
    this.summaries.request(regionId);
  }

  /**
   * Draws the summaries of the regions of the servers in a zone anew at each local midnight of
   * that zone from now on (plan 8R-9, B7: what starts tomorrow moves from Coming up to today;
   * plan 19A-2: one timer per zone in use, `everyLocalMidnightIn`), also in rehearsal mode.
   * Temporal's midnight, so a day of a change of the clocks is 23 or 25 hours long. A summary
   * that reads the same is not edited. Nothing after `close`.
   */
  watchMidnight(): void {
    if (this.closed) return;
    this.midnights?.cancel();
    this.midnights = everyLocalMidnightIn({
      zones: () => this.options.servers.zonesInUse(),
      now: this.now,
      setTimer: this.setTimer,
      run: (zone) => {
        if (this.closed) return;
        for (const region of this.options.regions.all()) {
          if (region.forumChannelId === null) continue;
          if (this.zoneOfRow(region.guildId) === zone) this.summaries.request(region.id);
        }
      },
    });
  }

  /**
   * A server's zone changed (plan 19A-2; `ServerSettings.onZoneChange`): its summaries are drawn
   * anew, and its active parties' posts, paced as after a change of the emoji (`showAllAnew`),
   * so that every time they say is on the new clock; the midnights follow the zones now in use.
   * Moments stored stay the same moments. Nothing after `close`.
   */
  zoneChanged(serverId: string): void {
    if (this.closed) return;
    this.zonesChanged();
    const ofServer = (row: number | null) => this.serverOfRow(row) === serverId;
    for (const region of this.options.regions.all()) {
      if (region.forumChannelId !== null && ofServer(region.guildId)) {
        this.summaries.request(region.id);
      }
    }
    this.queueAnew(this.options.store.active().filter((party) => ofServer(party.guildId)));
  }

  /**
   * Queues parties' posts to be shown anew on the paced queue (`EMOJI_RENDER_GAP_MS`, each in its
   * server's line, plan 19B-5), all of them before the first is shown, so that they are paced
   * among themselves; a post that waits there already is not queued twice (gathered: several
   * asks before its turn make one draw), nor one without a post or of a quiet server. A
   * neighbor's changes (plan 19E) take the turn of the server whose post shows them, never more
   * than its posts' pace (and each post's own, `posts`).
   */
  private queueAnew(parties: Iterable<Party>): void {
    if (this.closed) return;
    for (const party of parties) {
      if (party.forumPostId === null || this.ofQuietServer(party)) continue;
      if (this.emojiQueue.has(party.guildId, (id) => id === party.id)) continue;
      this.emojiQueue.put(party.guildId, party.id);
    }
    if (this.emojiTimer === undefined) this.nextEmojiPost();
  }

  /**
   * The zones in use changed (a server joined or left with a zone of its own: fix round 1, N5):
   * the summaries' midnights follow them. Nothing after `close`.
   */
  zonesChanged(): void {
    if (this.closed) return;
    this.midnights?.refresh();
  }

  /** Asks for the summary of every region that has a forum. */
  private allSummaries(): void {
    for (const region of this.options.regions.all()) {
      if (region.forumChannelId !== null) this.summaries.request(region.id);
    }
  }

  /**
   * Ends a party: it leaves the store first, so nothing shows or says anything in its post any
   * more; then the messages the bot would otherwise leave behind are deleted (open completion
   * questions, the archive warning, the link line in the region's channel, the copies of its
   * message in other channels and at the bottom of the post), the post is shown one last time,
   * without its controls, and it is archived and locked. False when there is no such active
   * party.
   *
   * `onlyIf` is asked inside the store, about the party as it is at that moment: the scheduler
   * passes "still due", because a correction of the raid's times may have been stored since
   * its tick decided. False when it says no.
   *
   * `closing.lastWords` is said in the post before it is archived: why it ends, when that is
   * not the clock (`/delete`). `closing.left` is called once the party has left the store and
   * before anything is done to its post: an answer to an interaction in that post must be given
   * there, not after the archiving. It is waited for three seconds at most (`ANSWER_WAIT_MS`);
   * what it throws, also later, is logged. `closing.ended` is why it ends, for the party
   * history: the scheduler says `clock`; anybody else ends it as a person (`cancelled`).
   * `closing.removal` `delete` (a moderator's choice, plan 8S-2) deletes the post with everything
   * in it in the place of its last showing and the archiving (its copies and link line go as on
   * any end); a deletion Discord refuses archives it as usual. Whoever asks for it checks first
   * that the bot may (`PartyGateway.mayDeletePost`).
   *
   * What fails on Discord's side after the party has ended is logged and not tried again here;
   * a post that stayed open is archived by `sweepPosts`.
   */
  async end(
    partyId: string,
    onlyIf?: (party: Party) => boolean,
    closing: PartyClosing = {},
  ): Promise<boolean> {
    return (await this.endAs(partyId, onlyIf, closing)) !== false;
  }

  /**
   * Sends a message of the bot's own into the post of a party (a completion question, the archive
   * warning) only while the party is active: `work` runs when it is (decided at once, with no
   * wait in between), and the closing of the party, should it end meanwhile, waits for it before
   * anything is archived, so that the message and what `work` does after it (its record, or its
   * deletion where it can no longer be recorded) land in an open post. Undefined, with nothing
   * run, for a party that is not active. What `work` throws is passed on.
   */
  whileOpen<T>(partyId: string, work: () => Promise<T>): Promise<T | undefined> {
    if (!this.options.store.get(partyId)) return Promise.resolve(undefined);
    const run = (async () => work())();
    let runs = this.sending.get(partyId);
    if (!runs) this.sending.set(partyId, (runs = new Set()));
    const under = runs;
    under.add(run);
    const settled = (): void => {
      under.delete(run);
      if (under.size === 0 && this.sending.get(partyId) === under) this.sending.delete(partyId);
    };
    void run.then(settled, settled);
    return run;
  }

  /** `whileOpen` for the party whose post this is; undefined, with nothing run, for none. */
  whileOpenPost<T>(postId: string, work: () => Promise<T>): Promise<T | undefined> {
    const party = this.options.store.byPost(postId);
    return party ? this.whileOpen(party.id, work) : Promise.resolve(undefined);
  }

  /** Waits for every message of `whileOpen` on its way into a party's post. Never rejects. */
  private async messagesSent(partyId: string): Promise<void> {
    for (let runs = this.sending.get(partyId); runs; runs = this.sending.get(partyId)) {
      await Promise.allSettled([...runs]);
    }
  }

  /**
   * `end`, saying how the post went (plan 8S-2): `deleted` (`closing.removal` `delete` and Discord
   * deleted it), `archived` (as usual, also where Discord refused the deletion), `deleting` (the
   * deletion failed for the network: archived for now, deleted by `redoClosings`; plan 8X-H,
   * review r1 C1), or false when there was no such active party (nothing was done).
   */
  async endAs(
    partyId: string,
    onlyIf?: (party: Party) => boolean,
    closing: PartyClosing = {},
  ): Promise<PostRemoved | false> {
    const ended: PartyEnd = closing.ended ?? { how: 'cancelled' };
    const { by, removal } = closing;
    const result = await this.options.store.update(
      partyId,
      (party) => (onlyIf && !onlyIf(party) ? {} : { party: endParty(party), ended }),
      {
        ...byMember(by),
        ...(removal === undefined ? {} : { removal }),
      },
    );
    if (!result?.written || !result.party) return false;
    const party = result.party;
    // Its closing is under way from here: the sweep of leftover copies leaves it alone.
    this.closing.add(party.id);
    this.ended(party);
    if (closing.left) await this.answerBeforeClosing(partyId, closing.left);
    return this.closePost(party, closing.lastWords, false, closing.removal, this.now(), false, {
      recorded: result.recorded,
    });
  }

  /**
   * The map's address of a train that ended (plan 8H-7B, review G4), from the record its ending
   * wrote (`recorded`, its id), only where the map shows it (`trainShownOnWeb`: three members or
   * more came) and the web has Discord's login (`trainMapLink`); none for another party, or where
   * no record was written. A redo takes it from the same record (`undoneClosings`).
   */
  private trainMapLinkOf(party: Party, recorded: WrittenRecord | undefined): string | undefined {
    const link = this.options.trainMapLink;
    if (link === undefined || !isTrain(party) || recorded?.kind !== 'train') return undefined;
    if (!trainShownOnWeb(historyCounts(recorded.attendees))) return undefined;
    return link(recorded.serverId, recorded.historyId);
  }

  /**
   * The card of a train that ended (plan 8H-7A; design Part F), from the record its ending wrote
   * (`recorded`, review F-B1: the very rows written), with the raids along its way read once
   * (`raidsAlong`, records only). None for another party, or where no record was written (it
   * failed and waits for its later tries: the post ends without a card). A read that fails, or
   * does not answer within `RAIDS_ALONG_WAIT_MS` (review B2), is logged and the card says nothing
   * of raids (review F-B11). A card made already (`facts.card`, a redo) is kept, unless it could
   * not read the raids of a train that made stops: they are read once more (review B5), by one
   * redo only (`facts.readAgain`, review R5: a redo does not wait again for a database away).
   * Never rejects.
   */
  private async trainCardOf(party: Party, facts: TrainCardFacts): Promise<TrainCard | undefined> {
    const { recorded, card: made } = facts;
    const settled = made !== undefined && (made.raids !== null || made.stops === null);
    if (made !== undefined && (settled || facts.readAgain === true)) return made;
    if (!isTrain(party) || recorded === undefined || recorded.kind !== 'train') return made;
    const windows = stopWindows(recorded, recorded.stops, recorded.attendees);
    const query = raidsAlongQuery(windows);
    const raids =
      query === undefined ? [] : await this.raidsAlongOf(party, recorded.serverId, query);
    return trainCard(recorded, recorded.stops, recorded.attendees, raids, this.options.settings);
  }

  /**
   * The raids along a train's way (`raidsAlong`), waited for `RAIDS_ALONG_WAIT_MS` at most;
   * undefined where there is no reader, or the read failed or took too long (a warning, once; a
   * read that fails after the wait only at debug). Never rejects.
   */
  private async raidsAlongOf(
    party: Party,
    serverId: string,
    query: RaidsAlongQuery,
  ): Promise<RaidAlongRow[] | undefined> {
    const { raidsAlong: reader, log } = this.options;
    if (reader === undefined) return undefined;
    // Said once (review R4): a read that fails after the wait was said already, as too late.
    let late = false;
    const failed = (err: unknown): undefined => {
      if (late) {
        log.debug(
          { err, party: party.id },
          'the raids along the way of a train that ended failed after the wait',
        );
      } else {
        log.warn(
          { err, party: party.id },
          'could not read the raids along the way of a train that ended',
        );
      }
      return undefined;
    };
    const read = (async () => reader.raidsAlong(serverId, query))().then(
      (rows): RaidAlongRow[] | undefined => rows,
      failed,
    );
    let cancel = (): void => undefined;
    const timeout = new Promise<'late'>((resolve) => {
      cancel = this.setTimer(() => {
        resolve('late');
      }, RAIDS_ALONG_WAIT_MS);
    });
    const raids = await Promise.race([read, timeout]);
    cancel();
    if (raids !== 'late') return raids;
    failed(new Error(`no answer within ${String(RAIDS_ALONG_WAIT_MS)} ms`));
    late = true;
    return undefined;
  }

  /**
   * Deletes the post of a party that ended without it (plan 8S-2: Delete post chosen as the party
   * ended by itself). `deleted`, or `refused` (logged) where Discord would not.
   */
  async deletePostOf(postId: string): Promise<'deleted' | 'refused'> {
    try {
      await this.options.gateway.deletePost(postId);
      return 'deleted';
    } catch (err) {
      this.options.log.warn({ err, post: postId }, 'could not delete the post of a party');
      return 'refused';
    }
  }

  /**
   * Runs the answer given before a close and waits for it for `ANSWER_WAIT_MS` at most: a
   * request that fails slowly must not keep the post open. What it throws is logged, also when
   * it throws after the wait. Never rejects.
   */
  private async answerBeforeClosing(partyId: string, left: () => Promise<unknown>): Promise<void> {
    const settled = (async () => left())().then(
      () => undefined,
      (err: unknown) => {
        this.options.log.warn({ err, party: partyId }, 'could not answer before closing a party');
      },
    );
    let cancel = (): void => undefined;
    const timeout = new Promise<void>((resolve) => {
      cancel = this.setTimer(resolve, ANSWER_WAIT_MS);
    });
    await Promise.race([settled, timeout]);
    cancel();
  }

  /**
   * `/admin save-party`: keeps a party from the clock, which then neither warns nor archives
   * it, or lets it go again; the post says who did it. A warning that was said already is taken
   * away by the clock's next tick. `unchanged` when the party was kept (or not kept) already.
   */
  async keep(
    partyId: string,
    saved: boolean,
    member: NamedMember,
  ): Promise<'gone' | 'kept' | 'let-go' | 'unchanged'> {
    const { store, gateway, log } = this.options;
    const result = await store.update(
      partyId,
      (party) => (party.saved === saved ? {} : { party: setSaved(party, saved) }),
      byMember(member),
    );
    if (!result) return 'gone';
    if (!result.written) return 'unchanged';
    this.changed(partyId);
    const postId = result.party?.forumPostId ?? null;
    // A message into the post of a party that has ended would open an archived post again: none
    // then, and an ending meanwhile waits for it (`whileOpen`).
    if (postId !== null) {
      try {
        await this.whileOpen(partyId, () =>
          gateway.sendMessage(postId, {
            content: saved
              ? `${memberText(member)} keeps this post open: it will not be archived by itself.`
              : `${memberText(member)} no longer keeps this post open: it will be archived as usual.`,
          }),
        );
      } catch (err) {
        log.warn({ err, party: partyId }, 'could not say that a party is kept');
      }
    }
    return saved ? 'kept' : 'let-go';
  }

  /**
   * `/delete` from a member who is not staff: their reason is put into the post for the
   * moderators. A member asks once per party (`already` after that; kept in memory, so a
   * restart lets them ask again), and the roles given are pinged by the first request that is
   * really sent: the moderators are called once, the others add their reasons. The requests of
   * one party are sent one after the other, so a request that fails leaves the ping, and the
   * member's right to ask, to the next. `gone` when there is no such active party.
   */
  requestDeletion(
    partyId: string,
    member: NamedMember,
    reason: string,
    roleIds: readonly string[],
  ): Promise<'gone' | 'already' | 'asked'> {
    if (!this.options.store.get(partyId)?.forumPostId) return Promise.resolve('gone');
    const state = this.deletionRequests.get(partyId) ?? {
      asked: new Set<string>(),
      pinged: false,
      tail: Promise.resolve(),
    };
    this.deletionRequests.set(partyId, state);
    const run = state.tail
      .catch(() => undefined)
      .then(() => this.sendDeletionRequest(state, partyId, member, reason, roleIds));
    state.tail = run;
    return run;
  }

  /** How many parties have a request to delete them remembered. For tests. */
  get deletionRequestsTracked(): number {
    return this.deletionRequests.size;
  }

  private async sendDeletionRequest(
    state: { asked: Set<string>; pinged: boolean },
    partyId: string,
    member: NamedMember,
    reason: string,
    roleIds: readonly string[],
  ): Promise<'gone' | 'already' | 'asked'> {
    const memberId = member.id;
    // The party may have ended while this request waited for the earlier ones.
    const party = this.options.store.get(partyId);
    const postId = party?.forumPostId;
    if (!party || !postId) return 'gone';
    if (state.asked.has(memberId)) return 'already';
    const roles = state.pinged ? [] : roleIds.slice(0, MAX_ROLE_PINGS);
    const whom = roles.length === 0 ? '' : `${roles.map((id) => `<@&${id}>`).join(' ')}: `;
    // None into the post of a party that ended meanwhile; an ending waits for it (`whileOpen`).
    const sent = await this.whileOpen(partyId, () =>
      this.options.gateway.sendMessage(postId, {
        content:
          `${whom}${memberText(member)} asks for this ${partyWord(party)} to be deleted.\n` +
          `> ${plain(reason)}`,
        mention: { roles },
      }),
    );
    if (sent === undefined) return 'gone';
    state.asked.add(memberId);
    if (roles.length > 0) state.pinged = true;
    return 'asked';
  }

  /**
   * Deletes the line that links to a party in its region's channel; a failure is a warning, and
   * given back (none or one) for the closing to judge whether it is owed (review r0 B2).
   */
  private async deleteLinkLine(party: Party): Promise<unknown[]> {
    const regionChannel =
      party.regionId === null ? undefined : this.options.regions.byId(party.regionId);
    const linkId = party.regionLinkMessageId;
    if (!regionChannel || linkId === null) return [];
    try {
      await this.options.gateway.deleteMessage(regionChannel.channelId, linkId);
      return [];
    } catch (err) {
      this.options.log.warn(
        { err, party: party.id, post: party.forumPostId },
        'could not delete the link to an ended party',
      );
      return [err];
    }
  }

  /**
   * What `end` does on Discord for a party that has left the store. `lastWords` are said in the
   * post, unless they were `said` there already, and stand in the post's own message in the
   * place of the times. `redo`: a closing done again by `redoClosings`, whose post may be
   * archived already and whose tags may never have shown `Ended`. `facts`: what a train's card
   * is drawn from (plan 8H-7A), the record its ending wrote, read with the raids along its way
   * before the last showing, or on a redo the card its first closing made. Never rejects.
   *
   * What the party left on Discord (`leftovers`, written with its end) is forgotten once the
   * closing is through, also where Discord refused a deletion for good; a closing still owed
   * for the network (`undoneClosings`) keeps it, so that a restart, which forgets that, still
   * has its copies deleted by `sweepCopies`.
   */
  private async closePost(
    party: Party,
    lastWords?: string,
    said = false,
    removal: PostRemoval = 'archive',
    since = this.now(),
    redo = false,
    facts: TrainCardFacts = {},
  ): Promise<PostRemoved> {
    let removed: PostRemoved;
    try {
      removed = await this.closePostOnce(party, lastWords, said, removal, since, redo, facts);
    } finally {
      this.closing.delete(party.id);
    }
    if (!this.undoneClosings.has(party.id)) {
      const left = leftoversOf(party).map((copy) => copy.messageId);
      try {
        await this.options.leftovers?.copiesGone(left);
      } catch (err) {
        // The sweep asks for them again: a deletion of what is gone is no harm.
        this.options.log.warn(
          { err, party: party.id },
          'could not forget the copies of an ended party',
        );
      }
    }
    return removed;
  }

  /** `closePost` without what it forgets afterwards. */
  private async closePostOnce(
    party: Party,
    lastWords: string | undefined,
    said: boolean,
    removal: PostRemoval,
    since: number,
    redo: boolean,
    facts: TrainCardFacts,
  ): Promise<PostRemoved> {
    const { gateway, log } = this.options;
    const postId = party.forumPostId;
    // What of the closing failed for the network: it is redone with the upkeep (plan 8X-H,
    // review r0 B5: a refusal of Discord's would fail again, and is not kept).
    let undone = false;
    let owedRemoval: PostRemoval = 'archive';
    let wordsSaid = said;
    let card = facts.card;
    let readAgain = facts.readAgain === true;
    const owe = (err: unknown): void => {
      if (worthRedoing(err)) undone = true;
    };
    const attempt = async (what: string, work: () => Promise<unknown>): Promise<void> => {
      try {
        await work();
      } catch (err) {
        owe(err);
        log.warn({ err, party: party.id, post: postId }, `could not ${what}`);
      }
    };
    // A post that is gone has nothing left to close, whatever else failed. One whose deletion the
    // network failed is archived for now and `deleting` (review r1 C1).
    const closed = (removed: PostRemoved, gone = false): PostRemoved => {
      if (undone && !gone) {
        this.undoneClosings.set(party.id, {
          party,
          lastWords,
          said: wordsSaid,
          removal: owedRemoval,
          since,
          card: { recorded: facts.recorded, card, readAgain },
        });
        if (owedRemoval === 'delete') return 'deleting';
      } else {
        this.undoneClosings.delete(party.id);
      }
      return removed;
    };
    for (const err of await this.deleteLinkLine(party)) owe(err);
    // What was under way when the party ended (a render, a `/status`, an edit of a copy, a
    // question or a warning with its own deletion, `whileOpen`) would open the post again if it
    // landed after the archiving. None of it can have recorded a copy or a message that `party`
    // does not know of: the party had ended.
    await this.posts.idle(party.id);
    await this.mirrors.idle(party.id);
    await this.messagesSent(party.id);
    let there = true;
    // A party that was closed says so in the post itself, in the place of its times; a meetup
    // that ended is shown as over, whatever times it had (see `renderMeetupPost`). A train's card
    // stands between where it was and who came (plan 8H-7A): made, with the raids along its
    // way, only once the post is to be shown (review B3), and before that showing: nothing is
    // sent or edited after the archiving.
    let rendered: RenderedPost | undefined;
    const lastShowing = async (): Promise<RenderedPost> => {
      if (rendered === undefined) {
        const made = card;
        card = await this.trainCardOf(party, { recorded: facts.recorded, card, readAgain });
        // A redo that made the card again read the raids once more: no later one will.
        if (made !== undefined && card !== made) readAgain = true;
        rendered = this.rendered(
          party,
          lastWords,
          card,
          this.trainMapLinkOf(party, facts.recorded),
        );
      }
      return rendered;
    };
    // Rendered outside the attempt, as before the card: a post that cannot be rendered is no
    // failure of Discord's.
    const show = async (id: string): Promise<void> => {
      const shown = await lastShowing();
      await attempt('show an ended party one last time', async () => {
        there = await this.editPostOf(party.id, id, shown, { controls: false });
      });
    };
    const gone = (id: string): PostRemoved => {
      log.info({ party: party.id, post: id }, 'the post of an ended party is gone');
      return closed('archived', true);
    };
    // A redo may find the post archived already, and Discord refuses a deletion in an archived
    // post (50083): the last showing, which opens it, comes first there, before the copy in it
    // and the leftovers are deleted (review F4).
    const showFirst = redo && postId !== null && removal === 'archive';
    if (showFirst) await show(postId);
    for (const err of await this.mirrors.remove(party)) owe(err);
    if (postId === null) return closed('archived');
    if (!there) return gone(postId);
    if (removal === 'delete') {
      try {
        // The post goes with everything in it: nothing is said in it or done to it any more.
        await gateway.deletePost(postId);
        return closed('deleted');
      } catch (err) {
        log.warn({ err, party: party.id, post: postId }, 'could not delete the post of a party');
        // The moderator's choice is honoured once the network is back (review r0 B3); meanwhile
        // the post is closed as usual. A refusal of Discord's leaves it archived.
        if (worthRedoing(err)) {
          undone = true;
          owedRemoval = 'delete';
        }
      }
    }
    const leftovers = [
      ...party.prompts.completion.map((question) => question.id),
      ...(party.prompts.warning === null ? [] : [party.prompts.warning]),
    ];
    for (const messageId of leftovers) {
      await attempt('delete a message of an ended party', () =>
        gateway.deleteMessage(postId, messageId),
      );
    }
    if (lastWords !== undefined && !wordsSaid) {
      await attempt('say why a party ended', async () => {
        await gateway.sendMessage(postId, { content: lastWords });
        wordsSaid = true;
      });
    }
    if (!showFirst) await show(postId);
    if (!there) return gone(postId);
    const forumId = party.forumChannelId;
    if (forumId !== null && (redo || lastWords !== undefined || !isRaid(party))) {
      // The tags of the last showing. A raid that ran out has had `Ended` since its end time,
      // which the clock showed; a party that was closed has not, nor has a meetup whose day ran
      // out without an end time: any other party than a raid gets its tags at every end. On a
      // redo every party gets them: the clock's showing with `Ended` may have failed as well,
      // in the same outage (review F2).
      await attempt('tag an ended party as ended', async () =>
        gateway.setPostTags(
          postId,
          PartyService.applied(await lastShowing(), await this.tagIds(forumId)),
        ),
      );
    }
    await attempt('archive the post of an ended party', () => gateway.archivePost(postId));
    return closed('archived');
  }

  /**
   * The closings of which a part failed for the network (plan 8X-H, review R4) are done again,
   * oldest first, as the first step of the hourly upkeep and so of the catch-up on reconnect
   * (review r0 B4: a request can fail without the gateway going away): `closePost` with the link
   * line and copies, the leftover questions and the warning deleted, the last showing without
   * controls with its Ended tag (for every kind of party, review F2; first where the post is to be
   * archived, as it opens a post archived already for the deletions, review F4), the last words
   * where they were not said, the archiving, or the deletion a moderator chose. One that fails
   * again for the network is kept for the next run, for a day after the party ended
   * (`UNDONE_CLOSING_KEPT_MS`); then it is forgotten. The run ends with the first that fails
   * again: the rest wait for the next (review r1 C2). Ends between parties once `isStopped` says
   * so (the clock's stop), the rest kept. Says how many were redone and how many failed again,
   * and logs it where there were any. Never rejects.
   */
  async redoClosings(
    options: { isStopped?: () => boolean } = {},
  ): Promise<{ redone: number; failed: number }> {
    const { log } = this.options;
    let redone = 0;
    let failed = 0;
    const tooOld = this.now() - UNDONE_CLOSING_KEPT_MS;
    for (const partyId of this.undoneClosings.keys()) {
      if (options.isStopped?.()) break;
      const undone = this.undoneClosings.get(partyId);
      if (!undone) continue;
      // Kept for when its server is back (plan 19C-1).
      if (this.quietRow(undone.party.guildId)) continue;
      if (undone.since < tooOld) {
        this.undoneClosings.delete(partyId);
        continue;
      }
      try {
        await this.closePost(
          undone.party,
          undone.lastWords,
          undone.said,
          undone.removal,
          undone.since,
          true,
          undone.card,
        );
      } catch (err) {
        log.warn({ err, party: partyId }, 'could not close a party again');
      }
      if (this.undoneClosings.has(partyId)) {
        // The network is still away: one probe a run, the rest kept for the next (a request
        // that is black-holed takes about a minute; review r1 C2).
        failed++;
        break;
      }
      redone++;
    }
    if (redone + failed > 0) log.info({ redone, failed }, 'closed ended parties again');
    return { redone, failed };
  }

  /**
   * Deletes what ended parties left on Discord and no closing dealt with (`leftovers`, written
   * with each end; follow-ups of Phases 2E-1 and 3C): the copies of their message and the lines
   * that linked to them in their regions' channels, where a stop came between the end and its
   * closing, or a restart forgot a closing the network failed. With the upkeep, after
   * `redoClosings`, whose parties it leaves to it, as it leaves those whose closing is under way
   * (`closing`). A copy in a post (`/status`'s) is deleted with the post opened where it was
   * archived; the post sweep archives it again. A message deleted, gone, or refused for good
   * (logged) is forgotten; the run ends with the first the network fails, the rest kept for the
   * next (as `redoClosings`), and between messages once `isStopped` says so. Says how many it
   * forgot and how many failed, and logs it where there were any. Never rejects.
   */
  async sweepCopies(
    options: { isStopped?: () => boolean } = {},
  ): Promise<{ swept: number; failed: number }> {
    const { leftovers, gateway, regions, log } = this.options;
    if (!leftovers) return { swept: 0, failed: 0 };
    const gone: string[] = [];
    let failed = 0;
    try {
      for (const copy of await leftovers.leftoverCopies()) {
        if (options.isStopped?.()) break;
        // A closing under way, or one still owed, deletes its copies itself.
        if (this.closing.has(copy.partyId) || this.undoneClosings.has(copy.partyId)) continue;
        const region = copy.regionId === null ? undefined : regions.byId(copy.regionId);
        const channelId = copy.channelId ?? region?.channelId;
        // Kept for when its server is back (plan 19C-1): by its region's server, else by the
        // server its channel is in (a copy in another channel names no region).
        if (region !== undefined ? this.quietRow(region.guildId) : this.quietChannel(channelId)) {
          continue;
        }
        try {
          // A link line whose region is gone has nowhere left to be.
          // `/status`'s copy is in the post, which may be archived by now: opened for it (the post
          // sweep after it archives the post of an ended party again).
          if (channelId !== undefined) {
            await gateway.deleteMessage(channelId, copy.messageId, { reopen: true });
          }
        } catch (err) {
          log.warn(
            { err, party: copy.partyId, channel: channelId, message: copy.messageId },
            'could not delete a copy an ended party left',
          );
          if (worthRedoing(err)) {
            failed++;
            break;
          }
        }
        gone.push(copy.messageId);
      }
      await leftovers.copiesGone(gone);
    } catch (err) {
      log.warn({ err }, 'could not sweep the copies ended parties left');
      return { swept: 0, failed };
    }
    const swept = gone.length;
    if (swept + failed > 0) log.info({ swept, failed }, 'swept the copies ended parties left');
    return { swept, failed };
  }

  /**
   * Archives the open posts in the party forums that belong to a party that has ended: one whose
   * archiving failed, or one that a late message opened again. Only a post that the database
   * says is an ended party's is touched: an open post without any party (a report that was cut
   * off, a post of another installation that uses the same bot account) is left alone, and so
   * are the summary posts, posts of members, and the post of a party whose row cannot be read.
   * Gives how many it archived. Never rejects.
   */
  async sweepPosts(): Promise<number> {
    const { gateway, regions, store, log } = this.options;
    let archived = 0;
    // The forums of the regions, and the forums that party rows name and no region has: one
    // whose region was removed and that was kept (`/region remove`) is looked after as before.
    const forums = new Map<string, number | null>();
    // A quiet server is not swept (plans 19C-1, 19C-2): its forums are left as they are.
    const leftForums = new Set<string>();
    for (const region of regions.all()) {
      if (region.forumChannelId === null) continue;
      if (this.quietRow(region.guildId)) leftForums.add(region.forumChannelId);
      else forums.set(region.forumChannelId, region.id);
    }
    try {
      for (const { forumChannelId } of await store.partyForums()) {
        if (!leftForums.has(forumChannelId)) forums.getOrInsert(forumChannelId, null);
      }
    } catch (err) {
      log.warn({ err }, 'could not list the forums that parties name');
    }
    // Forums whose look failed for anything but a refusal of Discord's (the network away, most
    // likely): one warning for the sweep, not one per forum (plan 8X-H: thirty in an outage).
    const failed: { forum: string; err: unknown }[] = [];
    let swept = 0;
    for (const [forumId, regionId] of forums) {
      // Only what the bot still knows as a forum: a forum deleted by hand is asked nothing.
      if (gateway.channelKind(forumId) !== 'forum') continue;
      swept++;
      try {
        const open = (await gateway.openPosts(forumId)) ?? [];
        for (const postId of await store.endedPosts(open)) {
          // Not while it is somebody's again (a post id is never reused, so this cannot be).
          if (store.byPost(postId)) continue;
          if (await gateway.archivePost(postId)) {
            archived++;
            log.info(
              { post: postId, region: regionId, forum: forumId },
              'archived the open post of an ended party',
            );
          }
        }
      } catch (err) {
        if (err instanceof DiscordAPIError) {
          // About this forum (Missing Access): named, for a person to look at.
          log.warn(
            { err, region: regionId, forum: forumId },
            'could not look for open posts of ended parties',
          );
        } else {
          failed.push({ forum: forumId, err });
        }
      }
    }
    const [first] = failed;
    if (first) {
      log.warn(
        { err: first.err, forum: first.forum, forums: failed.length, archived },
        'could not sweep the posts of ended parties',
      );
    }
    // So that a sweep can be seen to have run (plan 8X-H: after an outage).
    log.debug(
      { archived, forums: swept - failed.length, failed: failed.length },
      'swept the posts of ended parties',
    );
    return archived;
  }

  /**
   * The forums of a server (by its snowflake) that parties name and no region has, and that
   * still exist: the forums of regions that were removed and kept as history, or deleted
   * outside the bot. Nothing is ever done to them but the sweep of `sweepPosts`; staff are
   * told of them (`/region list`, `/admin setup-forums`).
   */
  async orphanForums(guildId: string): Promise<string[]> {
    const { store, regions, guilds, gateway } = this.options;
    const row = await guilds.idFor(guildId);
    if (row === undefined) return [];
    const channels = gateway.serverChannels(guildId);
    // Asked of the database for this server alone (by the index of migration 011).
    const named = (await store.partyForums(row)).map((forum) => forum.forumChannelId);
    return [...new Set(named)].filter(
      (forumId) =>
        regions.byForum(forumId) === undefined &&
        channels?.find((channel) => channel.id === forumId)?.kind === 'forum',
    );
  }

  /**
   * Makes sure every region that has a forum has its summary post (one deleted by hand is
   * noticed here at the latest) and has each brought up to date. Never rejects.
   */
  async checkSummaries(): Promise<void> {
    for (const region of this.options.regions.all()) {
      // A quiet server: no summary drawn, none made (plans 19C-1, 19C-2).
      if (region.forumChannelId === null || this.quietRow(region.guildId)) continue;
      try {
        await this.ensureSummary(region);
      } catch (err) {
        this.options.log.warn({ err, region: region.id }, 'could not check a summary post');
      }
    }
  }

  /**
   * Does everything that is waiting now, and cancels the timers of titles and tags that wait for
   * a rate limit, so what they wait for is not retried, and drops the posts that wait to be shown
   * with other emoji (`emojiChanged`). For tests; at shutdown `close`: stop whatever calls
   * `changed` (the scheduler) before it.
   */
  async flush(): Promise<void> {
    // Posts that wait for other emoji stay as they are.
    this.emojiTimer?.();
    this.emojiTimer = undefined;
    this.emojiQueue.clear();
    // So do those that wait for the neighbors' matches to be compared (plan 19E).
    this.gymsChangedTimer?.();
    this.gymsChangedTimer = undefined;
    this.gymsChangedOf.clear();
    // A raid on its way to another region arrives first.
    await this.moves.whenIdle();
    do {
      await this.posts.flush();
      await this.summaries.flush();
      await this.mirrors.flush();
      // A post run can ask for a summary and for its copies, and a summary run for a post.
    } while (this.posts.pending > 0 || this.summaries.pending > 0 || this.mirrors.pending > 0);
    await Promise.all(this.summaryRenames);
    for (const { cancel } of this.summaryRenameTimers.values()) cancel();
    this.summaryRenameTimers.clear();
    for (const { cancel } of this.renameTimers.values()) cancel();
    this.renameTimers.clear();
    for (const { cancel } of this.summaryTimers.values()) cancel();
    this.summaryTimers.clear();
  }

  /** For shutdown: shows nothing anew from now on (`emojiChanged`), then `flush`. */
  async close(): Promise<void> {
    this.closed = true;
    this.midnights?.cancel();
    this.midnights = undefined;
    await this.flush();
  }

  private mayRename(postId: string): boolean {
    const now = this.now();
    const recent = (this.renames.get(postId) ?? []).filter((at) => now - at < RENAME_WINDOW_MS);
    this.renames.set(postId, recent);
    return recent.length < RENAMES;
  }

  /**
   * Asks for a render of the party after a wait: the one Discord named (`waitMs`, kept between
   * one second and ten minutes), or else when the oldest counted rename leaves the window.
   */
  private retryLater(partyId: string, postId: string, waitMs?: number): void {
    let wait: number;
    if (waitMs !== undefined) {
      wait = PartyService.namedWait(waitMs);
    } else {
      const counted = this.renames.get(postId) ?? [];
      const oldest = counted.length > 0 ? Math.min(...counted) : undefined;
      wait = oldest === undefined ? RENAME_WINDOW_MS : oldest + RENAME_WINDOW_MS - this.now();
    }
    wait = Math.max(wait, 0);
    const due = this.now() + wait;
    const waiting = this.renameTimers.get(postId);
    // One timer per post: the earlier of two waits is the one that stays.
    if (waiting && waiting.due <= due) return;
    waiting?.cancel();
    const cancel = this.setTimer(() => {
      this.renameTimers.delete(postId);
      this.posts.request(partyId);
    }, wait);
    this.renameTimers.set(postId, { cancel, due });
  }

  /** The wait Discord named, kept between one second and ten minutes; no finite number is one second. */
  private static namedWait(waitMs: number): number {
    return Number.isFinite(waitMs)
      ? Math.min(Math.max(waitMs, MIN_RETRY_MS), RENAME_WINDOW_MS)
      : MIN_RETRY_MS;
  }

  /** Asks for the render of a region summary after a wait that Discord named. */
  private retrySummaryLater(regionId: number, waitMs: number): void {
    const wait = PartyService.namedWait(waitMs);
    const due = this.now() + wait;
    const waiting = this.summaryTimers.get(regionId);
    if (waiting && waiting.due <= due) return;
    waiting?.cancel();
    const cancel = this.setTimer(() => {
      this.summaryTimers.delete(regionId);
      this.summaries.request(regionId);
    }, wait);
    this.summaryTimers.set(regionId, { cancel, due });
  }

  /**
   * Edits a post to show the rendered party (in the form `variant` asks for: the last showing
   * has no controls); when Discord refuses it, in the next of its forms (`sendInForms`).
   */
  private async editPostOf(
    partyId: string,
    postId: string,
    rendered: RenderedPost,
    variant?: PostVariant,
  ) {
    const { gateway, log } = this.options;
    return sendInForms(
      postForms(rendered.layout, variant),
      postId,
      this.refusedFiles,
      (message) => gateway.editPost(postId, message),
      (err, what, dropped) => {
        const picture = layoutPicture(rendered.layout);
        log.warn({ err, party: partyId, picture }, refusalSaid(what, 'editing', dropped));
        if (what === 'emoji') this.options.appEmoji?.refused?.();
      },
    );
  }

  /**
   * Discord says a thread was deleted (`ThreadDelete`, which the `Guilds` intent delivers): when it
   * was the post of an active party, the party ends at once as when a render finds its post gone
   * (`postGone`: closed by staff, its link line and copies deleted), rather than at its next
   * render. Anything else is nothing. Never rejects.
   */
  async postDeleted(postId: string): Promise<void> {
    const { store, log } = this.options;
    try {
      const party = store.byPost(postId);
      if (party) await this.postGone(party, postId);
    } catch (err) {
      log.warn({ err, post: postId }, 'could not end the party of a deleted post');
    }
  }

  /**
   * Somebody deleted the post: the party is over (spec 7), and the thread goes if it is left.
   * Once per post: a second finding of the same post gone does nothing.
   */
  private async postGone(party: Party, postId: string): Promise<void> {
    const { gateway, log } = this.options;
    if (this.postsGone.has(postId)) return;
    this.postsGone.set(postId, true);
    log.warn({ party: party.id, post: postId }, 'a party post is gone; ending the party');
    // Only staff may delete the bot's posts: the history keeps that staff closed it (R-A1).
    const ended = await this.abandon(
      party.id,
      'could not end a party whose post is gone',
      closedEnd('staff'),
    );
    this.ended(party);
    // A party that could not be ended stays active: the next finding tries again.
    if (!ended) this.postsGone.delete(postId);
    // Only of a party that has really ended: one that stays active keeps its copies.
    if (ended) {
      await this.deleteLinkLine(ended);
      await this.mirrors.idle(party.id);
      await this.mirrors.remove(ended);
    }
    try {
      await gateway.deletePost(postId);
    } catch (err) {
      log.debug(
        { err, party: party.id, post: postId },
        'could not delete the thread of a gone post',
      );
    }
  }

  /** One run of the render of a party: its post, then the copies of its message. */
  private async renderPost(partyId: string): Promise<void> {
    // Of a quiet server (plans 19C-1, 19C-2): a draw of a server Pine left would find the post
    // gone and end the party.
    const party = this.options.store.get(partyId);
    if (party !== undefined && this.quietRow(party.guildId)) return;
    const read = this.drawStarted(partyId);
    try {
      await this.showPost(partyId);
    } finally {
      // Kept or not (failed, rate limited, gone), the presses whose change it read wait no longer.
      const draw = this.draws.get(partyId);
      if (draw) draw.reading = undefined;
      this.drawDone(partyId, read);
      await this.showCopies(partyId);
    }
  }

  /**
   * Brings the copies of a party's message up to date: the one in the post here and now, the
   * ones in the server's shared channels through their own queue (see `PartyMirrors`), so that
   * the post never waits for them. The party is read again: the render of the post may have
   * ended it (its post was gone). Never rejects.
   */
  private async showCopies(partyId: string): Promise<void> {
    const party = this.options.store.get(partyId);
    if (!party?.forumPostId) return;
    try {
      await this.mirrors.syncStatus(party, this.rendered(party));
    } catch (err) {
      this.options.log.warn({ err, party: partyId }, 'could not update the copy in a post');
    }
    this.mirrors.changed(partyId);
  }

  /**
   * `/status` in a post: a fresh copy of the party's message at the bottom of its post, in the
   * place of the one an earlier `/status` put there. False when there is no such active party.
   */
  async showStatus(partyId: string): Promise<boolean> {
    const shown = await this.mirrors.repost(partyId);
    // The party may have changed while the copy was on its way; a render that finds the copy
    // up to date sends nothing.
    if (shown) this.posts.request(partyId);
    return shown;
  }

  private async showPost(partyId: string): Promise<void> {
    const { store, gateway, log } = this.options;
    const party = store.get(partyId);
    if (!party?.forumPostId) return;
    const postId = party.forumPostId;
    const rendered = this.rendered(party);

    // The tag ids first: they are part of what is compared with what was sent last.
    let wanted: string[] | undefined;
    if (party.forumChannelId !== null) {
      try {
        wanted = PartyService.applied(rendered, await this.tagIds(party.forumChannelId));
      } catch (err) {
        this.dropTags(party.forumChannelId);
        log.warn({ err, party: partyId }, 'could not get the tags of a party forum');
      }
    }
    const key = PartyService.sentKey(rendered, wanted ?? []);
    const last = this.sent.get(postId);
    if (wanted && last?.key === key) {
      // The same message as last sent: the post shows this layout.
      this.keepLayout(partyId, postId, rendered.layout);
      // Nothing to send; the post is still looked at now and then, so that a deleted one is noticed.
      if (this.now() - last.checkedAt < CHECK_EVERY_MS) return;
      if (await gateway.postInfo(postId)) {
        this.sent.set(postId, { key, checkedAt: this.now() });
      } else {
        await this.postGone(party, postId);
      }
      return;
    }

    // Forgotten before anything is tried: a failure from here on must not leave a memory that
    // would hide an edit that is still needed.
    this.sent.delete(postId);
    let edited: boolean;
    try {
      edited = await this.editPostOf(partyId, postId, rendered);
    } catch (err) {
      const wait = rateLimitWaitMs(err);
      if (wait === undefined) throw err;
      log.debug({ party: partyId, waitMs: wait }, 'rate limited; the post waits');
      this.retryLater(partyId, postId, wait);
      return;
    }
    // False also when only the first message was deleted: the thread is then asked for.
    const info = edited ? await gateway.postInfo(postId) : undefined;
    if (!info) {
      await this.postGone(party, postId);
      return;
    }
    // The message went through (in one of its forms): the post shows this layout now.
    this.keepLayout(partyId, postId, rendered.layout);
    // What is not done leaves nothing remembered, so that the next render tries it again.
    let complete = wanted !== undefined;
    // Tags first: a rename that is refused or fails does not hold them back.
    if (wanted && party.forumChannelId !== null) {
      try {
        const same =
          wanted.length === info.tagIds.length && wanted.every((id) => info.tagIds.includes(id));
        if (!same) await gateway.setPostTags(postId, wanted);
      } catch (err) {
        complete = false;
        const wait = rateLimitWaitMs(err);
        if (wait === undefined) {
          this.dropTags(party.forumChannelId);
          log.warn({ err, party: partyId }, 'could not set the tags of a party post');
        } else {
          log.debug({ party: partyId, waitMs: wait }, 'rate limited; the tags wait');
          this.retryLater(partyId, postId, wait);
        }
      }
    }
    if (tidyTitle(info.title) !== rendered.title) {
      if (this.mayRename(postId)) {
        try {
          const answer = await gateway.renamePost(postId, rendered.title);
          if (answer === 'renamed') {
            this.renames.get(postId)?.push(this.now());
          } else if (answer !== 'gone') {
            complete = false;
            this.retryLater(partyId, postId, answer.laterMs);
          }
        } catch (err) {
          complete = false;
          const wait = rateLimitWaitMs(err);
          if (wait === undefined) {
            log.warn({ err, party: partyId }, 'could not rename a party post');
          } else {
            log.debug({ party: partyId, waitMs: wait }, 'rate limited; the title waits');
            this.retryLater(partyId, postId, wait);
          }
        }
      } else {
        // The latest title wins: it is tried again when the oldest rename leaves the window.
        complete = false;
        log.debug({ party: partyId }, 'renamed too often; the title waits');
        this.retryLater(partyId, postId);
      }
    }
    if (complete) this.sent.set(postId, { key, checkedAt: this.now() });
    else this.sent.delete(postId);
  }

  /**
   * The list of a region's raids, and under them its trains and its meetups, today's and those
   * coming up (plan 8R-9), as its summary post shows it (`board`: the stops are below it) and
   * `/status` in the region's channel (`channel`): a components-v2 message.
   */
  summaryMessage(regionId: number, where: 'board' | 'channel' = 'channel'): V2Message {
    const { store } = this.options;
    const now = this.now();
    const parties = store.inRegion(regionId);
    const raids = parties
      .filter(isRaid)
      .map((party) => ({ party, title: raidTitle(this.view(party)) }));
    const meetups = parties.filter(isMeetup).map((party) => ({ party, title: meetupTitle(party) }));
    const trains = parties.filter(isTrain).map((party) => {
      const stop = currentStop(party);
      const at = stop === undefined ? undefined : stopLabel(this.stopsOf(party.guildId)(stop));
      return { party, title: trainTitle(party), at };
    });
    const maxBattles = parties
      .filter(isMax)
      .map((party) => ({ party, title: maxTitle(this.maxView(party)) }));
    const region = this.options.regions.byId(regionId);
    return renderSummary(raids, now, meetups, trains, maxBattles, {
      passing: region === undefined ? [] : this.passingThrough(region),
      stops: region === undefined ? undefined : this.stopsLine(region),
      stopsBelow: where === 'board',
      zone: this.zoneOfRow(region?.guildId ?? null),
      trainMark: this.trainMark(),
    });
  }

  /**
   * The application's train emoji as message text (plan 8M-11A, Matt's answers: `pinetrain`
   * before a train's name in the summary and the new-train DMs), by the resolver of the controls'
   * icons (`customIconText`); undefined while the application lacks it, and the lines read as
   * before.
   */
  trainMark(): string | undefined {
    return customIconText({ controlIcon: (name) => this.options.appEmoji?.get(name) }, 'pinetrain');
  }

  /**
   * The trains of other regions of the region's server with a stop in it (plan 8X-G; as their
   * copies go, `stopRegionsInGuild`), each linked to its copy in the region's channel where it has
   * one and the server's snowflake is known, else to its post.
   */
  private passingThrough(region: Region): ListedTrain[] {
    const { store, gyms, wayspots, regions } = this.options;
    const guildId = region.guildId;
    if (guildId === null) return [];
    const places = { gyms, ...(wayspots === undefined ? {} : { wayspots }) };
    const snowflake = this.snowflakes.get(guildId);
    return store
      .active()
      .filter(isTrain)
      .filter((party) => party.guildId === guildId && party.regionId !== region.id)
      .filter((party) =>
        // Only while the train will still reach a stop of the region (review r0 C4).
        stopsStillReached(party).some((ref) =>
          stopRegionsInGuild(places, regions, ref, guildId).some((one) => one.id === region.id),
        ),
      )
      .map((party) => {
        const stop = currentStop(party);
        // The newest copy: an earlier one stays recorded until it is deleted (final review F2).
        const copy = party.mirrorMessages.findLast(
          (mirror) => mirror.kind === 'region' && mirror.channelId === region.channelId,
        );
        return {
          party,
          title: trainTitle(party),
          at: stop === undefined ? undefined : stopLabel(this.stopsOf(party.guildId)(stop)),
          copyUrl:
            copy === undefined || snowflake === undefined
              ? undefined
              : `https://discord.com/channels/${snowflake}/${copy.channelId}/${copy.messageId}`,
        };
      });
  }

  /**
   * The line of the region's post of the stops today, where there is one (plan 8X-G), linking its
   * first message in the board post (plan 8R-9, B1).
   */
  private stopsLine(region: Region): StopsLine | undefined {
    const post = this.stopPosts?.summaryOf(region.channelId);
    if (!post) return undefined;
    return {
      url: postLink(post.serverId, post.threadId, post.messageId),
      tasks: post.tasks,
      hideouts: post.hideouts,
      waiting: post.waiting,
    };
  }

  /** Learns the snowflake of a server for the summary's links, once (`guilds.snowflakeOf`). */
  private async knowSnowflake(guildId: number | null): Promise<void> {
    const { guilds } = this.options;
    if (guildId === null || guilds.snowflakeOf === undefined || this.snowflakes.has(guildId)) {
      return;
    }
    try {
      const found = await guilds.snowflakeOf(guildId);
      if (found !== undefined) this.snowflakes.set(guildId, found);
    } catch (err) {
      this.options.log.warn({ err, guild: guildId }, 'could not read the snowflake of a server');
    }
  }

  private async renderSummary(regionId: number): Promise<void> {
    const region = this.options.regions.byId(regionId);
    if (!region?.forumChannelId || !region.summaryMessageId) return;
    // Of a quiet server (plans 19C-1, 19C-2).
    if (this.quietRow(region.guildId)) return;
    const failed = region.summaryMessageId;
    const { gateway, log } = this.options;
    const check = this.boardChecks.delete(regionId);
    await this.knowSnowflake(region.guildId);
    const message = this.summaryMessage(regionId, 'board');
    const text = JSON.stringify(message);
    const last = this.summarySent.get(regionId);
    if (last?.postId === failed && last.text === text) {
      // The text stands; the board may have been opened by the stops' messages or a member's
      // (B4; plan 8R-9F, B7). A board gone meanwhile (review P2): asked for again, so that the
      // edit replaces it.
      if (check && !(await this.pinAndOpen(regionId, failed))) {
        this.summarySent.delete(regionId);
        this.summaries.request(regionId);
      }
      return;
    }
    // Forgotten before anything is tried: a failure must not hide an edit that is still needed.
    this.summarySent.delete(regionId);
    let edited: boolean;
    try {
      // A summary made before it was a v2 message is converted by the gateway (`editAs`). The
      // board post's reactions are removed (plan 8R-9G): Pine's lists are not reactable, while
      // the party posts in the same forum keep theirs (permissions are per forum).
      edited = await gateway.editPost(failed, message, { clearReactions: true });
    } catch (err) {
      const wait = rateLimitWaitMs(err);
      if (wait === undefined) throw err;
      log.debug({ region: regionId, waitMs: wait }, 'rate limited; the summary waits');
      this.retrySummaryLater(regionId, wait);
      return;
    }
    if (!edited) {
      log.warn({ region: regionId }, 'the summary post is gone; making a new one');
      await this.inSummaryChain(regionId, () => this.replaceSummary(regionId, failed));
      return;
    }
    // For the staging: which regions' summaries a change edited (final review F5).
    log.debug({ region: regionId, post: failed }, 'edited the summary post');
    // A post that was archived and opened again comes back unpinned; and it is the region's
    // board, opened to members once (plan 8R-9F, R2).
    const info = await this.pinAndOpen(regionId, failed);
    if (!info) return;
    // The text is sent: a request with the same text edits nothing (review r1, R1-6).
    this.summarySent.set(regionId, { postId: failed, text });
    // A post made as "Active raids" before plan 8X-G is renamed, by the rename limit as a party's
    // post; a rename that has to wait is tried again by its own timer, not by editing again.
    if (tidyTitle(info.title) !== SUMMARY_TITLE) await this.renameSummary(regionId, failed);
  }

  /**
   * Tries the rename of a summary post again after `waitMs` (bounded as `namedWait`), by itself:
   * the text it shows is sent already (review r1, R1-6). Nothing for a post that is no longer the
   * region's summary.
   */
  private renameSummaryLater(regionId: number, postId: string, waitMs: number): void {
    this.summaryRenameTimers.get(regionId)?.cancel();
    const cancel = this.setTimer(() => {
      this.summaryRenameTimers.delete(regionId);
      if (this.options.regions.byId(regionId)?.summaryMessageId !== postId) return;
      const renaming = this.inSummaryChain(regionId, () => this.renameSummary(regionId, postId))
        .then(() => undefined)
        .catch((err: unknown) => {
          this.options.log.warn({ err, region: regionId }, 'could not rename a summary post');
        })
        .finally(() => this.summaryRenames.delete(renaming));
      this.summaryRenames.add(renaming);
    }, PartyService.namedWait(waitMs));
    this.summaryRenameTimers.set(regionId, { cancel });
  }

  /**
   * Renames a summary post to `SUMMARY_TITLE`; true when it is renamed or gone, false otherwise.
   * A wait Discord named (its rename limit, a rate limit) is waited by a timer of its own
   * (`renameSummaryLater`); a refused permission is for good, said once per region until a rename
   * works again (review r0 C1, r1 R1-5), and the next change of the text tries again; any other
   * failure (a 5xx, the network) is tried again after the rename window.
   */
  private async renameSummary(regionId: number, postId: string): Promise<boolean> {
    const { gateway, log } = this.options;
    try {
      const answer = await gateway.renamePost(postId, SUMMARY_TITLE);
      if (answer === 'renamed' || answer === 'gone') {
        this.renameRefused.delete(regionId);
        return true;
      }
      this.renameSummaryLater(regionId, postId, answer.laterMs);
      return false;
    } catch (err) {
      const wait = rateLimitWaitMs(err);
      if (wait !== undefined) {
        this.renameSummaryLater(regionId, postId, wait);
        return false;
      }
      if (isMissingPermission(err)) {
        if (!this.renameRefused.has(regionId)) {
          this.renameRefused.add(regionId);
          log.warn({ err, region: regionId }, 'could not rename a summary post');
        }
        return false;
      }
      log.warn({ err, region: regionId }, 'could not rename a summary post; trying again later');
      this.renameSummaryLater(regionId, postId, RENAME_WINDOW_MS);
      return false;
    }
  }

  /**
   * Pins the region's board where Discord says it is not (plan 8R-9, B4: an archived post opened
   * again comes back unpinned) and opens it to members where Pine never did (`openOnce`); gives
   * what Discord said of it, undefined where it is gone.
   */
  private async pinAndOpen(regionId: number, postId: string): Promise<PostInfo | undefined> {
    const info = await this.options.gateway.postInfo(postId);
    if (!info) return undefined;
    if (!info.pinned) await this.pinSummary(regionId, postId);
    await this.openOnce(regionId, postId, info);
    return info;
  }

  /**
   * Opens the region's board to members once (plan 8R-9F, R2). Pine's mark is a slowmode of
   * exactly `BOARD_SLOWMODE_SECONDS` (review F2: a forum may give its posts a slowmode of its own):
   * - 45 seconds and locked: Pine opened it, and the lock is a moderator's, left (`locked`);
   * - the old mark, six hours (`OLD_BOARD_SLOWMODE_SECONDS`, plan 8R-9H): Pine opened it before
   *   that plan; the slowmode alone is moved to the new mark (`moveOldMark`), open or locked;
   * - locked with any other slowmode: Pine never opened it (plan 8R-9 locked it, whatever the
   *   forum's default), so it is unlocked and given its slowmode (`PartyGateway.openBoard`); a
   *   moderator who locks it and also clears its slowmode has it opened again (Discord keeps no
   *   other mark; no migration);
   * - open without slowmode: given it (made before plan 8R-9F unlocked, or an opening that failed);
   * - open with another slowmode: a moderator's choice, left.
   */
  private async openOnce(regionId: number, postId: string, info: PostInfo): Promise<BoardOpen> {
    if (info.slowmode === BOARD_SLOWMODE_SECONDS) return info.locked ? 'locked' : 'open';
    if (info.slowmode === OLD_BOARD_SLOWMODE_SECONDS) {
      await this.moveOldMark(regionId, postId);
      return info.locked ? 'locked' : 'open';
    }
    if (!info.locked && info.slowmode > 0) return 'open';
    return this.openBoard(regionId, postId);
  }

  /**
   * Moves a board's slowmode from the old mark to the new one (plan 8R-9H), its lock left as it
   * is. Whether it worked changes nothing for the caller: the board is open or locked as before,
   * and the next draw tries again. A refused permission (Manage Posts) is said once per region
   * until a move works again; any other failure is a warning.
   */
  private async moveOldMark(regionId: number, postId: string): Promise<void> {
    const { gateway, log } = this.options;
    try {
      if (await gateway.setBoardSlowmode(postId)) this.markRefused.delete(regionId);
    } catch (err) {
      const refused = isMissingPermission(err);
      if (refused && this.markRefused.has(regionId)) return;
      if (refused) this.markRefused.add(regionId);
      log.warn(
        { err, region: regionId, post: postId },
        'could not move the board’s slowmode to its mark',
      );
    }
  }

  /**
   * Opens the region's board to members (plan 8R-9F): unlocked, with its slowmode. A refused
   * permission (Manage Posts, as for the pin) is said once per region until an opening works
   * again; any other failure is a warning, and the next draw tries again.
   */
  private async openBoard(regionId: number, postId: string): Promise<BoardOpen> {
    const { gateway, log } = this.options;
    try {
      if (await gateway.openBoard(postId)) {
        this.openRefused.delete(regionId);
        return 'open';
      }
      return 'failed';
    } catch (err) {
      if (!isMissingPermission(err)) {
        log.warn({ err, region: regionId, post: postId }, 'could not open the board post');
        return 'failed';
      }
      if (!this.openRefused.has(regionId)) {
        this.openRefused.add(regionId);
        log.warn({ err, region: regionId, post: postId }, 'could not open the board post');
      }
      return 'refused';
    }
  }

  /**
   * Pins a summary post; a failure is a warning, as a moderator can pin it by hand. Answers
   * whether it was pinned: `refused` where the bot lacks the permission (Manage Posts), `failed`
   * otherwise.
   */
  private async pinSummary(regionId: number, postId: string): Promise<SummaryPin> {
    const { gateway, log } = this.options;
    try {
      if (await gateway.pinPost(postId)) return 'pinned';
      log.warn({ region: regionId, post: postId }, 'the summary post is gone before it was pinned');
      return 'failed';
    } catch (err) {
      log.warn({ err, region: regionId, post: postId }, 'could not pin the summary post');
      return isMissingPermission(err) ? 'refused' : 'failed';
    }
  }

  /**
   * Replaces a summary post that cannot be edited (deleted, or only its first message): the old
   * thread goes, which also frees the forum's one pin, and a new post is made. The new post has
   * the current text, so no further render is asked for.
   */
  private async replaceSummary(regionId: number, failedId: string): Promise<boolean> {
    const region = this.options.regions.byId(regionId);
    if (!region?.forumChannelId || region.summaryMessageId !== failedId) return false;
    try {
      await this.options.gateway.deletePost(failedId);
    } catch (err) {
      this.options.log.warn(
        { err, region: regionId, post: failedId },
        'could not delete a summary post that cannot be edited; it may keep the forum pin',
      );
    }
    return (await this.createSummary(region)).made;
  }

  /** Runs `work` after the earlier calls for the region are done. */
  private inSummaryChain<T>(regionId: number, work: () => Promise<T>): Promise<T> {
    const previous = this.summaryChains.get(regionId) ?? Promise.resolve();
    const run = previous.catch(() => undefined).then(work);
    this.summaryChains.set(regionId, run);
    return run;
  }

  /**
   * Makes sure the region's forum has its pinned summary post. Returns whether one was created.
   * The region must have a forum. Calls for one region run one after the other.
   */
  async ensureSummary(region: Region): Promise<boolean> {
    return (await this.summaryMade(region)).made;
  }

  /** `ensureSummary`, with whether a summary it made could be pinned. */
  private summaryMade(region: Region): Promise<SummaryMade> {
    return this.inSummaryChain(region.id, () =>
      this.makeSummary(this.options.regions.byId(region.id) ?? region),
    );
  }

  private async makeSummary(region: Region): Promise<SummaryMade> {
    const { gateway } = this.options;
    if (region.forumChannelId === null) throw new Error(`Region ${region.id} has no forum`);
    const postId = region.summaryMessageId;
    const info = postId === null ? undefined : await gateway.postInfo(postId);
    if (postId !== null && info) {
      // A board that stands is pinned where it is not (review W3: a moderator may have unpinned
      // it) and opened where Pine never did (plan 8R-9F, R2), and says so where it is not.
      const pin = info.pinned ? 'pinned' : await this.pinSummary(region.id, postId);
      const open = await this.openOnce(region.id, postId, info);
      this.summaries.request(region.id);
      return {
        made: false,
        ...(pin === 'pinned' ? {} : { unpinned: pin }),
        ...(open === 'open' ? {} : { closed: open }),
      };
    }
    const taken = await this.takeOverSummary(region, region.forumChannelId);
    if (taken !== 'none') return { made: false };
    return this.createSummary(region);
  }

  /**
   * Records as the region's summary a "Today and coming up" post the bot made in the forum (or
   * one made under an old title, `LEGACY_SUMMARY_TITLES`: "Active raids" before plan 8X-G, "Going
   * on now" before plan 8R-9), where the
   * record lost it (the record points at a post that is gone, or at none: a forum put back by
   * hand): the pinned one, else the oldest left over (it is pinned with its next edit); where no
   * open one is, among the latest archived (`ARCHIVED_BOARD_READ`, opened by its next edit). A second
   * post would not get the forum's one pin (Discord's 30047). `changed` when the region's forum
   * changed meanwhile (nothing is made then); a failed look counts as `none`, as a post that may
   * not be pinned is better than none. The post's text is brought up to date by the next render.
   */
  private async takeOverSummary(
    region: Region,
    forumId: string,
  ): Promise<'taken' | 'none' | 'changed'> {
    const { gateway, regionStore, regions, log } = this.options;
    let found: string | undefined;
    try {
      /** Of these posts, the summary pinned, else the first one: open posts come oldest first. */
      const summaryAmong = async (postIds: readonly string[]): Promise<string | undefined> => {
        let first: string | undefined;
        for (const postId of postIds) {
          const info = await gateway.postInfo(postId);
          // Also one made under an old title (B12), renamed with its next edit.
          if (
            info === undefined ||
            (info.title !== SUMMARY_TITLE && !LEGACY_SUMMARY_TITLES.includes(info.title))
          ) {
            continue;
          }
          if (info.pinned) return postId;
          first ??= postId;
        }
        return first;
      };
      found = await summaryAmong((await gateway.openPosts(forumId)) ?? []);
      // An archived one (review S7): among the latest archived, one page of them (a request);
      // an edit opens it again.
      found ??= await summaryAmong(
        (await gateway.archivedPosts(forumId, ARCHIVED_BOARD_READ)) ?? [],
      );
    } catch (err) {
      log.warn({ err, region: region.id }, 'could not look for a summary post to take over');
      return 'none';
    }
    if (found === undefined) return 'none';
    if (!(await regionStore.setSummaryMessage(region.id, forumId, found))) {
      log.warn({ region: region.id, post: found }, 'the forum of a region changed meanwhile');
      return 'changed';
    }
    log.info({ region: region.id, post: found }, 'took over a summary post');
    this.summarySent.delete(region.id);
    await regions.load();
    this.summaries.request(region.id);
    // The stops are drawn in the board it is now (plan 8R-9, B2).
    this.stopPosts?.boardChanged(region.channelId);
    return 'taken';
  }

  /** Makes the region's summary post with the current text, pins it and records it. */
  private async createSummary(region: Region): Promise<SummaryMade> {
    const { gateway, regionStore, regions, log } = this.options;
    const forumId = region.forumChannelId;
    if (forumId === null) throw new Error(`Region ${region.id} has no forum`);
    await this.knowSnowflake(region.guildId);
    const message = this.summaryMessage(region.id, 'board');
    this.summarySent.delete(region.id);
    // As a party's post: v2 as the first message where Discord takes it, edited in otherwise.
    const postId = await this.createPost(`summary-${String(region.id)}`, forumId, {
      title: SUMMARY_TITLE,
      message,
      tagIds: [],
    });
    if (postId === undefined) throw new Error(`The forum of region ${region.id} is gone`);
    // A moderator can pin it by hand, so the post is recorded whether or not this works; opened
    // to members as the region's board (plan 8R-9F): its slowmode marks it so (R2).
    const pin = await this.pinSummary(region.id, postId);
    const open = await this.openBoard(region.id, postId);
    if (!(await regionStore.setSummaryMessage(region.id, forumId, postId))) {
      log.warn({ region: region.id, post: postId }, 'the forum of a region changed meanwhile');
      try {
        await gateway.deletePost(postId);
      } catch (err) {
        log.error({ err, region: region.id, post: postId }, 'could not delete a summary post');
      }
      return { made: false };
    }
    this.summarySent.set(region.id, { postId, text: JSON.stringify(message) });
    await regions.load();
    // The stops are drawn in the new board (plan 8R-9, B2).
    this.stopPosts?.boardChanged(region.channelId);
    return {
      made: true,
      ...(pin === 'pinned' ? {} : { unpinned: pin }),
      ...(open === 'open' ? {} : { closed: open }),
    };
  }

  /** Forgets what is remembered about a forum's tags (after `/admin setup-forums` changed them). */
  forgetTags(forumId: string): void {
    this.dropTags(forumId);
  }

  /**
   * Gives every region of a server what parties need: a forum next to the region's channel
   * (created when the region has none, or when the one it had was deleted), the tags, and the
   * pinned summary post. Safe to run again: what is there is left alone. A region that fails is
   * reported as such and does not stop the others. The server's regions are those of its row
   * (`Region.guildId`), whether or not their channels are still in the channel cache. `only`
   * names the regions (by row id) to do it for, of that server: what an import made or changed
   * (`RegionAdminService.import`).
   */
  setupForums(guildId: string, only?: readonly number[]): Promise<ForumSetup[]> {
    // One run at a time per server: a second call waits for the first and finds all ready.
    this.setupCounts.set(guildId, (this.setupCounts.get(guildId) ?? 0) + 1);
    const previous = this.setupChains.get(guildId) ?? Promise.resolve();
    const run = previous
      .catch(() => undefined)
      .then(() => this.runSetup(guildId, only))
      .finally(() => {
        const left = (this.setupCounts.get(guildId) ?? 1) - 1;
        if (left > 0) {
          this.setupCounts.set(guildId, left);
        } else {
          this.setupCounts.delete(guildId);
          this.setupChains.delete(guildId);
        }
      });
    this.setupChains.set(guildId, run);
    return run;
  }

  /**
   * In rehearsal mode: the names of `settings.rehearsal.regions` that no region channel of this
   * server is called (a typo, another server's region), which get no forum; none otherwise.
   */
  async unmatchedRehearsedRegions(guildId: string): Promise<string[]> {
    const { regions, guilds, rehearsal, gateway } = this.options;
    if (!rehearsal) return [];
    const row = await guilds.idFor(guildId);
    const names = new Set(
      regions
        .all()
        .filter((region) => region.guildId === row)
        .map((region) => gateway.channelName(region.channelId)),
    );
    return rehearsal.settings.regions.filter((name) => !names.has(name));
  }

  /** Whether a `setupForums` of this server is running or waiting. */
  setupRunning(guildId: string): boolean {
    return this.setupCounts.has(guildId);
  }

  private async runSetup(guildId: string, only?: readonly number[]): Promise<ForumSetup[]> {
    const { regions, guilds, rehearsal, gateway } = this.options;
    const row = await guilds.idFor(guildId);
    if (row === undefined) return [];
    const results: ForumSetup[] = [];
    const wanted = regions
      .all()
      .filter((region) => region.guildId === row && (only?.includes(region.id) ?? true))
      // A rehearsal makes forums only for its own regions.
      .filter((region) => !rehearsal || rehearsal.rehearses(gateway.channelName(region.channelId)));
    for (const before of wanted) {
      try {
        results.push(await this.setupForum(before, rehearsal?.forumAccess));
      } catch (err) {
        this.options.log.error(
          { err: err instanceof HiddenForumRefused ? err.cause : err, region: before.id },
          'could not set up the forum of a region',
        );
        const full = channelLimitOf(err);
        results.push({
          region: regions.byId(before.id) ?? before,
          forum: 'failed',
          reason:
            err instanceof HiddenForumRefused
              ? HIDDEN_FORUM_REFUSED
              : err instanceof PostsRefusedError
                ? summaryRefusedWords(err)
                : full !== undefined
                  ? this.noRoomWords(guildId, before, full)
                  : isMissingPermission(err)
                    ? 'I need the Manage Channels and Manage Threads permissions here.'
                    : 'Something went wrong (see the log).',
          tagsAdded: 0,
          summary: false,
        });
      }
    }
    return results;
  }

  /**
   * Why a region's forum could not be made for want of room, as a sentence: its channel's
   * category (named, from the cache) or the server has as many channels as Discord allows.
   */
  private noRoomWords(guildId: string, region: Region, full: 'server' | 'category'): string {
    if (full === 'server') {
      return (
        `The server has as many channels as Discord allows (${MAX_SERVER_CHANNELS}, forums and ` +
        'categories count): delete channels nobody uses.'
      );
    }
    const channels = this.options.gateway.serverChannels(guildId) ?? [];
    const categoryId = channels.find((channel) => channel.id === region.channelId)?.categoryId;
    const name = channels.find((channel) => channel.id === categoryId)?.name;
    const category =
      name === undefined
        ? 'The category of its channel'
        : `The category \`${name.replace(/`/gu, '')}\``;
    return (
      `${category} is full (Discord allows ${MAX_CATEGORY_CHANNELS} channels in a category, and ` +
      'forums count): move ' +
      'some channels out of it.'
    );
  }

  /**
   * Rehearsal mode: hides a forum from all but staff and the allowlist
   * (`PartyGateway.hideForum`); a failure is logged and said as refused.
   */
  private async hideForum(forumId: string, access: ForumAccess): Promise<ForumHiding> {
    try {
      return await this.options.gateway.hideForum(forumId, access);
    } catch (err) {
      this.options.log.warn({ err, forum: forumId }, 'could not hide a forum for the rehearsal');
      return { refused: [], stillHidden: false };
    }
  }

  /** Deletes a forum that was made but belongs to no region; a failure is logged. */
  private async deleteForum(forumId: string): Promise<void> {
    try {
      await this.options.gateway.deleteChannel(forumId);
    } catch (err) {
      this.options.log.warn({ err, forum: forumId }, 'could not delete a forum that no region has');
    }
  }

  /**
   * One region's forum. `hidden` (rehearsal mode): a new forum is made hidden from its first
   * moment on (a forum that cannot be made so is not made: `HIDDEN_FORUM_REFUSED`) and hidden
   * once more for what only its category gives the bot (a refusal is logged, and it stays as it
   * was made), and one that is there is hidden before anything is posted in it; one that cannot
   * be hidden gets nothing posted, unless its overwrites hide it already (`isHiddenForum`: then
   * a refusal is logged as for a new one).
   */
  private async setupForum(before: Region, hidden?: ForumAccess): Promise<ForumSetup> {
    const { gateway, regions, regionStore } = this.options;
    let forum: ForumSetup['forum'] = 'ready';
    let tagsAdded = 0;
    let tagsRemoved = 0;
    const existing = before.forumChannelId;
    if (existing !== null) this.dropTags(existing);
    // Asking for no tags gives the ones the forum has.
    const had = existing === null ? undefined : await gateway.ensureTags(existing, []);
    // The retired tags go first: a forum has room for 20 (final review G2).
    if (had) tagsRemoved = (await gateway.removeTags(existing ?? '', RETIRED_TAGS)) ?? 0;
    const tags =
      had === undefined ? undefined : await gateway.ensureTags(existing ?? '', FORUM_TAGS);
    let tagsMissing: string[] = [];
    if (had && tags) {
      tagsAdded = Object.keys(tags).length - (Object.keys(had).length - tagsRemoved);
      tagsMissing = FORUM_TAGS.filter((tag) => tags[tag] === undefined);
    }
    if (!tags) {
      const made = await gateway
        .createForum(
          before.channelId,
          this.forumName(before.channelId, gateway.channelName(before.channelId) ?? 'region'),
          FORUM_TAGS,
          hidden,
        )
        .catch((err: unknown) => {
          throw hidden && isMissingPermission(err) ? new HiddenForumRefused(err) : err;
        });
      if (!made) return { region: before, forum: 'no-channel', tagsAdded: 0, summary: false };
      let set: Awaited<ReturnType<SummaryStore['setForum']>>;
      try {
        set = await regionStore.setForum(before.id, made.forumId);
      } catch (err) {
        await this.deleteForum(made.forumId);
        throw err;
      }
      if (set !== 'set') {
        await this.deleteForum(made.forumId);
        return {
          region: before,
          forum: 'failed',
          reason:
            set === 'forum-taken'
              ? 'That forum already belongs to another region.'
              : 'This region no longer exists.',
          tagsAdded: 0,
          summary: false,
        };
      }
      await regions.load();
      forum = 'created';
    }
    const region = regions.byId(before.id) ?? before;
    let hiding: ForumSetup['hidden'];
    let refused: readonly string[] | undefined;
    if (hidden && region.forumChannelId !== null) {
      const result = await this.hideForum(region.forumChannelId, hidden);
      if (result === 'hidden' || result === undefined) {
        hiding = result;
      } else if (forum === 'created' || result.stillHidden) {
        // A new forum was made hidden (`createForum` with `hidden`), and the second hide only
        // gives the bot what its category gives it beyond the server; one that was there is
        // hidden by the overwrites it has (`isHiddenForum`). Either stays hidden as it is, with
        // the bot short of what is named. Never a refusal alone: a forum members see is "ready"
        // too.
        hiding = 'hidden';
        refused = result.refused;
        const names = result.refused.join(', ');
        this.options.log.warn(
          { forum: region.forumChannelId, region: region.id },
          forum === 'created'
            ? result.refused.length === 0
              ? 'a new hidden forum stays as it was made: Discord refused to hide it once more'
              : `a new hidden forum stays as it was made: Discord refused the bot ${names} there, which only the category gives it`
            : result.refused.length === 0
              ? 'a hidden forum stays as it is: Discord refused to set its permissions'
              : `a hidden forum stays as it is: Discord refused to set its permissions, so the bot is without ${names} there`,
        );
      } else {
        return {
          region,
          forum,
          tagsAdded,
          ...(tagsRemoved > 0 ? { tagsRemoved } : {}),
          ...(tagsMissing.length > 0 ? { tagsMissing } : {}),
          summary: false,
          hidden: 'not-allowed',
        };
      }
    }
    const renamed = forum === 'ready' && (await this.renameForum(region));
    const posting = await this.reservePosts(region);
    // A quiet server (plan 19C-2: one in setup) has nothing posted: its board is made once it is
    // set up (`serverSetUpWork`'s summaries).
    if (this.quietRow(region.guildId)) {
      return {
        region: regions.byId(before.id) ?? region,
        forum,
        tagsAdded,
        ...(tagsRemoved > 0 ? { tagsRemoved } : {}),
        ...(tagsMissing.length > 0 ? { tagsMissing } : {}),
        summary: false,
        boardWaits: true,
        ...(renamed ? { renamed } : {}),
        ...(posting === undefined ? {} : { posting }),
        ...(hiding === undefined ? {} : { hidden: hiding }),
        ...(refused === undefined ? {} : { refused }),
      };
    }
    const { made: summary, unpinned, closed } = await this.summaryMade(region);
    const after = regions.byId(before.id) ?? region;
    return {
      region: after,
      forum,
      tagsAdded,
      ...(tagsRemoved > 0 ? { tagsRemoved } : {}),
      ...(tagsMissing.length > 0 ? { tagsMissing } : {}),
      summary,
      ...(unpinned === undefined ? {} : { unpinned }),
      ...(closed === undefined ? {} : { closed }),
      // Whether members' messages in the board can be deleted (plan 8R-9F).
      ...(after.forumChannelId === null || after.summaryMessageId === null
        ? {}
        : { cleaning: gateway.mayDeleteMessages(after.forumChannelId) }),
      ...(renamed ? { renamed } : {}),
      ...(posting === undefined ? {} : { posting }),
      ...(hiding === undefined ? {} : { hidden: hiding }),
      ...(refused === undefined ? {} : { refused }),
    };
  }

  /**
   * The name of the forum of a region whose channel has this name (its server's
   * `regionForumSuffix`, plan 19A-1).
   */
  private forumName(channelId: string, regionName: string): string {
    const server = this.options.gateway.serverOf(channelId);
    const suffix =
      server === undefined
        ? DEFAULT_REGION_FORUM_SUFFIX
        : this.options.servers.of(server).regionForumSuffix;
    // Discord allows 100 characters in a name.
    return `${[...regionName].slice(0, 100 - [...suffix].length).join('')}${suffix}`;
  }

  /**
   * Gives the forum of a region the name the settings give it, when its name is the region's
   * with another ending of one word (`north-raids`, what the bot called it before): a name
   * somebody chose by hand stays. Answers whether it was renamed; a failure is logged.
   */
  private async renameForum(region: Region): Promise<boolean> {
    const { gateway, log } = this.options;
    const forumId = region.forumChannelId;
    const regionName = gateway.channelName(region.channelId);
    const current = forumId === null ? undefined : gateway.channelName(forumId);
    if (forumId === null || regionName === undefined || current === undefined) return false;
    const wanted = this.forumName(region.channelId, regionName);
    const ending = current.startsWith(regionName) ? current.slice(regionName.length) : '';
    if (current === wanted || !/^-[\p{L}\p{N}]+$/u.test(ending)) return false;
    try {
      return await gateway.renameForum(forumId, wanted);
    } catch (err) {
      log.warn({ err, forum: forumId }, 'could not rename a forum');
      return false;
    }
  }

  /**
   * Leaves the making of posts in the forum of a region to the bot
   * (`PartyGateway.reservePosts`): a post a member made there would belong to no party, and
   * nothing would ever archive it. A failure is logged and told as `not-allowed`: the forum
   * works all the same.
   */
  private async reservePosts(region: Region): Promise<ForumSetup['posting']> {
    if (region.forumChannelId === null) return undefined;
    try {
      const reserved = await this.options.gateway.reservePosts(region.forumChannelId);
      return reserved === 'reserved' || reserved === 'not-allowed' ? reserved : undefined;
    } catch (err) {
      this.options.log.warn(
        { err, forum: region.forumChannelId },
        'could not close a forum to posts by members',
      );
      return 'not-allowed';
    }
  }
}
