import {
  ChannelFlags,
  ChannelType,
  DiscordAPIError,
  MessageFlags,
  OverwriteType,
  PermissionFlagsBits,
  RESTJSONErrorCodes,
  RateLimitError,
  Routes,
  ThreadAutoArchiveDuration,
  type APIActionRowComponent,
  type APIComponentInMessageActionRow,
  type APIEmbed,
  type APIMessageTopLevelComponent,
  type Client,
  type ForumChannel,
  type AnyThreadChannel,
  type Guild,
  type GuildChannel,
  type GuildMember,
  type NewsChannel,
  type TextChannel,
} from 'discord.js';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Logger } from '../log.js';
import type { ServerChannel } from '../domain/regions/region-import.js';
import {
  postNeeds,
  type PostPermission,
  type PostsRefused,
} from '../domain/party/post-permissions.js';
import { BoundedMap } from '../bounded-map.js';
import {
  channelPermissions,
  FORUM_NEEDS,
  SERVER_NEEDS,
  namedViewers,
  regionsKept,
  type ApiOverwrite,
} from '../ops/permissions.js';
import { fetchGuildMember } from './member-directory.js';

/** How many message ids the gateway keeps as known components-v2 messages. */
const V2_MESSAGES_KEPT = 10_000;

/** Members and roles a message may ping; everything else in it stays silent. */
interface Mentions {
  mention?: { users?: string[]; roles?: string[] };
}

/** A message of text, embeds and rows of controls under them. */
export interface ClassicMessage extends Mentions {
  v2?: false;
  content?: string;
  embeds?: APIEmbed[];
  components?: APIActionRowComponent<APIComponentInMessageActionRow>[];
}

/**
 * A message made of components alone (Discord's components v2: containers, sections, text
 * displays, separators, thumbnails and rows). It can carry no content and no embeds: Discord
 * refuses those beside the flag. A message that is v2 stays v2: every edit sends the flag again.
 */
export interface V2Message extends Mentions {
  v2: true;
  components: APIMessageTopLevelComponent[];
  /**
   * Files sent with the message (`MessageFile`: a local path, or text made with its name), each
   * shown where a component names it as `attachment://<file name>` (a map's gallery, a list cut
   * short, an egg's picture where the bot serves no web pages). An edit that has `files` (none
   * too, as every post's has) replaces the files the message had with these, uploaded again
   * (`editAs`); one without keeps them.
   */
  files?: readonly MessageFile[];
  content?: never;
  embeds?: never;
}

/**
 * A file sent with a message: a local path (named by its base name), or text the bot made
 * with the name it has in the message (`preview.txt`).
 */
export type MessageFile = string | { attachment: Buffer; name: string };

/** A message this bot sends or edits. Nobody is pinged unless `mention` names them. */
export type OutgoingMessage = ClassicMessage | V2Message;

/** How a message is sent (`PartyGateway.sendMessage`). */
export interface SendOptions {
  /**
   * Sent with Discord's `SuppressNotifications` (plan 8R-9, B13): nobody, a follower of the post
   * included, is notified of it. Edits never notify.
   */
  silent?: boolean;
  /**
   * An archived post is opened first (plan 8R-9, B3: Discord refuses a message in an archived
   * locked post, 50083). Only the posts of the stops ask for it (review P4); every other send
   * stays as it was.
   */
  reopen?: boolean;
}

/** How a message is deleted (`PartyGateway.deleteMessage`). */
export interface DeleteOptions {
  /**
   * An archived post is opened first (plan 8R-9, B3: Discord refuses a deletion in an archived
   * post, 50083); only the posts of the stops ask for it (review P4).
   */
  reopen?: boolean;
}

/** How a reported message is deleted (`PartyGateway.deleteReported`). */
export interface ReportedDeleteOptions {
  /**
   * An archived post opened for the deletion is left open rather than archived again (review W3:
   * the region's board, which members' commands need open; `BoardKeeper`). An unlocked one is
   * opened with Send Messages alone, as Discord allows; a locked one still takes Manage Threads.
   */
  leaveOpen?: boolean;
}

/**
 * What the bot may write in a post of a forum (plan 8R-9, B6; `PartyGateway.postAccess`): `v2`,
 * messages with components; `plain`, plain text only (no Embed Links); `refused`, nothing (no
 * View Channel, Send Messages in Posts or Manage Posts: a locked post takes Manage Posts).
 */
export type PostAccess = 'v2' | 'plain' | 'refused';

/** A post as Discord has it (`PartyGateway.postInfo`). */
export interface PostInfo {
  title: string;
  tagIds: string[];
  pinned: boolean;
  locked: boolean;
  /** Its slowmode (`rate_limit_per_user`) in seconds; 0 where it has none. */
  slowmode: number;
  /** Whether it is archived (plan 8V-1, review V6: an event's post opened again before its end). */
  archived: boolean;
}

/**
 * The slowmode of the region's board (plan 8R-9H, Matt 2026-10-27): 45 seconds. Pine deletes what
 * members write there anyway (`BoardKeeper`), so it only keeps a member from flooding the board
 * between sweeps; slash commands and bots are not held by it. Exactly this slowmode is Pine's
 * mark of a board it opened (R2, review F2: `PartyService.openOnce`; a forum may give its posts
 * another by default), and 45 seconds is not in Discord's menu of slowmodes (5 s to 6 h), so no
 * moderator sets it by hand.
 */
export const BOARD_SLOWMODE_SECONDS = 45;

/**
 * The board's mark before plan 8R-9H (plan 8R-9F, B4): six hours, Discord's most. It held a member
 * whose screenshot was answered by DM, and moderators without Bypass Slowmode, for six hours; a
 * board with exactly this slowmode is one Pine opened then, moved to `BOARD_SLOWMODE_SECONDS` at
 * its next draw (`PartyService.openOnce`).
 */
export const OLD_BOARD_SLOWMODE_SECONDS = 6 * 60 * 60;

/** A message of a post as `PartyGateway.boardMessages` reads it (plan 8R-9F, B6). */
export interface BoardMessage {
  id: string;
  authorId: string;
  /** `me`: this bot; `bot`: another application or a webhook; `member`: anybody else. */
  by: 'me' | 'bot' | 'member';
  /** Discord's own message (a title's change, a pin): it cannot be deleted. */
  system: boolean;
  createdAt: number;
  /**
   * Whether anybody reacted to it (plan 8R-9G: the sweep removes the reactions on the bot's own
   * messages in the board). A message read over REST carries its reactions without any intent;
   * one just written has none (absent).
   */
  reacted?: boolean;
}

/**
 * How a member stands to a forum. `visible`: they can see it. `hidden`: they cannot, and nothing
 * says that they in particular should not. `barred`: they cannot, and somebody set that on
 * purpose: the forum has a permission overwrite for this very member that denies something (an
 * empty one, or one that only allows, counts as none), or one that denies the view to a role they hold (other than
 * everybody's).
 */
export type MemberAccess = 'visible' | 'hidden' | 'barred';

/**
 * How a member stands to the gates of a server's regions (plan 8M-20, `memberGates`): what they
 * hold, how they stand to each gate as `memberAccess` says it, and what holding other roles would
 * make of a gate (`viewsWith`), all from one look at the member.
 */
export interface MemberGates {
  /** The ids of the roles they hold, without the role every member has. */
  held: string[];
  /**
   * When the member was looked at (`Date.now()`): with `fresh`, when Discord answered, which is
   * what `held` is of; without, when the cache was read, which holds the member as the last
   * forced fetch or interaction left them (as `RoleMember.seenAt` takes it, that look is as good
   * as an interaction made then: the bot keeps its own changes since in `heldNow`).
   */
  fetchedAt: number;
  /** By gate; a gate that is gone (or neither a forum nor a text channel) is left out. */
  access: ReadonlyMap<string, MemberAccess>;
  /**
   * Whether they would see a gate holding exactly these roles (not the everyone role); false for
   * a gate that is gone.
   */
  seesWith(gateId: string, roleIds: ReadonlySet<string>): boolean;
  /**
   * What denies them the view of a gate (plan 8M-20, A6): an overwrite of their own that denies
   * View Channel (`own`), and the roles they hold whose overwrites deny it (`roles`); nothing for
   * a gate that is gone.
   */
  denials(gateId: string): { own: boolean; roles: string[] };
}

/** Tag ids of a forum by tag name. */
export type TagIds = Readonly<Record<string, string>>;

export interface NewPost {
  title: string;
  message: OutgoingMessage;
  tagIds: readonly string[];
  /**
   * After how long without a message Discord archives the post (plan 8H-8: "On this day", a day);
   * a week unless set.
   */
  autoArchiveMinutes?: AutoArchiveMinutes;
}

/** The auto-archive durations of a post Pine sets (Discord's: an hour, a day, three days, a week). */
export type AutoArchiveMinutes = 60 | 1_440 | 4_320 | 10_080;

/** How many of a forum's archived posts `archivedPosts` reads at most (five pages of 100). */
export const ARCHIVED_POSTS_READ = 500;

/** How many tags Discord lets a forum have (its `available_tags`, at most 20). */
export const MAX_FORUM_TAGS = 20;

/**
 * Everything the party code asks of Discord, so that it can be tested without Discord. A
 * method that works on something that may have been deleted by hand (a post, a forum, a
 * message) answers `false` or `undefined` when it is gone, and throws for any other failure.
 */
export interface PartyGateway {
  /**
   * Creates the forum for a region's party posts next to the region's text channel (same
   * category, so it has that category's permissions), with these tags. Undefined when the
   * region's channel is gone.
   */
  createForum(
    regionChannelId: string,
    name: string,
    tagNames: readonly string[],
    hidden?: ForumAccess,
  ): Promise<{ forumId: string; tags: TagIds } | undefined>;
  /**
   * Leaves the making of posts in a forum to the bot: "Send Messages" (in a forum, the making
   * of posts) is denied to everyone and to every role the forum allows it, and allowed to the
   * bot itself; writing in posts stays as it was. `was-reserved` when nothing had to change,
   * `not-allowed` when Discord refuses the bot the change (it needs Manage Permissions and
   * Send Messages in the forum itself), undefined when the forum is gone.
   */
  reservePosts(forumId: string): Promise<'reserved' | 'was-reserved' | 'not-allowed' | undefined>;
  /**
   * Hides a forum from everybody but the bot, staff and these members (rehearsal mode): View
   * Channel denied to everyone, allowed to the bot, to the roles named and every role that may
   * manage the server, and to each member (with one permission more than `admitMember` gives,
   * so that `dismissMember` never takes it away). `refused` when Discord refuses the bot the
   * change (`ForumHiding`), undefined when the forum is gone.
   */
  hideForum(forumId: string, access: ForumAccess): Promise<ForumHiding>;
  /** Gives a forum another name. False when it is gone. */
  renameForum(forumId: string, name: string): Promise<boolean>;
  /**
   * Adds the tags the forum lacks, as many as fit under `MAX_FORUM_TAGS` (the rest logged and
   * left out), and gives all its tags. Undefined when it is gone.
   */
  ensureTags(forumId: string, tagNames: readonly string[]): Promise<TagIds | undefined>;
  /**
   * Takes these tags off the forum (and so off its posts): how many it had. Undefined when it is
   * gone.
   */
  removeTags(forumId: string, tagNames: readonly string[]): Promise<number | undefined>;
  /** Creates a post and gives its id (the id of the thread). Undefined when the forum is gone. */
  createPost(forumId: string, post: NewPost): Promise<string | undefined>;
  /**
   * The post's title, applied tags, whether it is pinned and locked, its slowmode in seconds
   * (0: none) and whether it is archived, as Discord has them. Undefined when it is gone.
   */
  postInfo(postId: string): Promise<PostInfo | undefined>;
  /**
   * Replaces the post's first message. False when the post is gone, and also when only its first
   * message was deleted (the thread may still exist: `postInfo` still answers then).
   */
  editPost(postId: string, message: OutgoingMessage, options?: EditOptions): Promise<boolean>;
  /**
   * Changes the post's title. Discord allows two renames in ten minutes: `{ laterMs }` when it
   * refused for that reason, with the wait Discord named (nothing waits for the limit to free),
   * `'gone'` when the post is gone. A rate limit on the reopening of an archived post is thrown
   * (see `rateLimitWaitMs`).
   */
  renamePost(postId: string, title: string): Promise<'renamed' | 'gone' | { laterMs: number }>;
  /**
   * Sets the post's tags. The tags are moderated (members cannot apply them), so the bot needs
   * the Manage Threads permission. A rate limit that would block for long is thrown (see
   * `rateLimitWaitMs`).
   */
  setPostTags(postId: string, tagIds: readonly string[]): Promise<boolean>;
  /**
   * Pins the post in its forum (a forum has one pinned post). Needs Manage Threads.
   */
  pinPost(postId: string): Promise<boolean>;
  /**
   * Opens the region's board to members (plan 8R-9F, R2): unlocked, so that they can use commands
   * in it, with a slowmode of `BOARD_SLOWMODE_SECONDS` (B4: a member can write there that seldom;
   * commands and bots are not held by it), opening it first where it is archived. Needs Manage
   * Threads. False when it is gone.
   */
  openBoard(postId: string): Promise<boolean>;
  /**
   * Sets the board's slowmode to `BOARD_SLOWMODE_SECONDS` and changes nothing else (plan 8R-9H:
   * the old mark moved, a moderator's lock kept), opening it first where it is archived, as
   * `openBoard`. Needs Manage Threads. False when it is gone.
   */
  setBoardSlowmode(postId: string): Promise<boolean>;
  /**
   * Archives and locks a post: it leaves the forum's list of active posts and members can no
   * longer write in it. False when it is gone. Anything sent or edited in it afterwards would
   * open it again, so this is the last thing done to a post.
   */
  archivePost(postId: string): Promise<boolean>;
  /**
   * Sets after how many minutes without a message Discord archives the post (plan 8V-1: an event's
   * post a day after its end), without opening it: one archived already is left so (a member's
   * message opens it again), and answers true. False when it is gone.
   */
  setAutoArchive(postId: string, minutes: AutoArchiveMinutes): Promise<boolean>;
  /**
   * Archives a post without locking it (plan 8V-1: an event's post after its end): it leaves the
   * forum's list of active posts, and a member's message opens it again. One archived already is
   * left as it is. False when it is gone.
   */
  archiveUnlocked(postId: string): Promise<boolean>;
  /**
   * Locks a post (plan 8V-1: the events forum's listing): members can no longer write in it. An
   * archived one is opened first and left open; one locked already is left as it is. Needs
   * Manage Threads. False when it is gone.
   */
  lockPost(postId: string): Promise<boolean>;
  /**
   * The posts of a forum that are not archived and that this bot made (members can make posts
   * in a forum too), oldest first. Undefined when the forum is gone.
   */
  openPosts(forumId: string): Promise<string[] | undefined>;
  /**
   * The archived posts of a forum that this bot made, the latest archived first, at most
   * `ARCHIVED_POSTS_READ` (plan 8V-1: a listing whose record was lost is looked for among them
   * too, R2). Undefined when the forum is gone.
   */
  archivedPosts(forumId: string): Promise<string[] | undefined>;
  /**
   * Lets the bot manage the posts of a forum (plan 8V-1: Manage Posts, a forum's Manage Threads,
   * in the bot's own overwrite of the events forum), to pin, lock and archive them. `was-allowed`
   * when nothing had to change, `not-allowed` when Discord refuses the bot the change (it needs
   * Manage Permissions there and Manage Threads itself), undefined when the forum is gone.
   */
  letBotManagePosts(
    forumId: string,
  ): Promise<'allowed' | 'was-allowed' | 'not-allowed' | undefined>;
  /**
   * Who cannot write in a forum's posts (branch review BR-7: the events forum): `@everyone` and
   * those of `roleNames` the server has, by name, where the forum lets them see it but not Send
   * Messages in Posts (re-review RR-4: one that cannot see it is left out). Undefined when the
   * forum is gone.
   */
  rolesWithoutReplies(forumId: string, roleNames: readonly string[]): Promise<string[] | undefined>;
  /** Deletes a post (its thread); one that is already gone is fine. */
  deletePost(postId: string): Promise<void>;
  /**
   * Whether the bot may delete a post (Manage Threads in its forum), from the cache: a
   * moderator's choice to delete one (plan 8S-2) is refused before the party ends where it may
   * not. A post or a member that is not in the cache counts as allowed: Discord decides.
   */
  mayDeletePost(postId: string): boolean;
  /**
   * Deletes a channel, such as a forum made a moment ago; one that is already gone is fine.
   * `reason` is what the server's audit log says of it (who asked for it).
   */
  deleteChannel(channelId: string, reason?: string): Promise<void>;
  /**
   * Sends a message into a text channel or a post; gives its id. An archived post is opened again
   * first where `options.reopen` asks (plan 8R-9, B3).
   */
  sendMessage(
    channelId: string,
    message: OutgoingMessage,
    options?: SendOptions,
  ): Promise<string | undefined>;
  /**
   * Replaces a message this bot sent, in a text channel or a post. False when the message or its
   * channel is gone.
   */
  editMessage(
    channelId: string,
    messageId: string,
    message: OutgoingMessage,
    options?: EditOptions,
  ): Promise<boolean>;
  /**
   * Deletes a message; one that is already gone is fine. An archived post is opened again first
   * where `options.reopen` asks (plan 8R-9, B3); otherwise Discord refuses it there (50083).
   */
  deleteMessage(channelId: string, messageId: string, options?: DeleteOptions): Promise<void>;
  /**
   * Unpins a message; one gone or not pinned is fine. False when the bot may not. (Plan 8R-9:
   * only for the post "Today’s Stops" that the bot before it pinned in a region's channel.)
   */
  unpinMessage(channelId: string, messageId: string): Promise<boolean>;
  /**
   * What the bot may write in a post (plan 8R-9, B6: the region's board), by its permissions in
   * the post's forum: View Channel and Send Messages in Threads, and Manage Threads where the post
   * is locked (plan 8R-9F, B5: a moderator may lock the open board; Discord's 160005); the post
   * is fetched (review P3), and one gone or whose permissions are not known counts as `v2`, so
   * that Discord decides.
   */
  postAccess(postId: string): Promise<PostAccess>;
  /**
   * The newest messages of a post (plan 8R-9F, B6: the board's catch-up), at most `limit` (100,
   * Discord's most at once), newest first: who wrote each (`me`, this bot; `bot`, another
   * application or a webhook; `member`) and whether it is Discord's own (a title's change, which
   * cannot be deleted). Undefined when the post is gone.
   */
  boardMessages(postId: string, limit: number): Promise<BoardMessage[] | undefined>;
  /**
   * Deletes 2 to 100 messages of a channel younger than 14 days in one request (Discord's bulk
   * delete; plan 8R-9F, B6), as `deleteReported` answers. One that is gone is no failure. An
   * archived post is opened first, and left open, where `options.reopen` asks (review W3: the
   * board's catch-up); otherwise Discord refuses it there (50083).
   */
  bulkDelete(
    channelId: string,
    messageIds: readonly string[],
    options?: DeleteOptions,
  ): Promise<'deleted' | 'gone' | 'not-allowed'>;
  /**
   * Removes every reaction on a message of a post (plan 8R-9G: the board's sweep), opening the
   * post first where it is archived and leaving it open, as the board's deletes do: `cleared`,
   * `gone` when the message or the post is gone, `not-allowed` without Manage Messages (in a
   * locked archived post also Manage Threads). Anything else is thrown.
   */
  clearReactions(channelId: string, messageId: string): Promise<'cleared' | 'gone' | 'not-allowed'>;
  /**
   * Whether a member has Manage Messages in a post (plan 8R-9F, Q1: a moderator's message in the
   * board is kept); `fresh` asks Discord rather than the cache (a message read over REST carries
   * no member). False for one not in the server or a post that is gone.
   */
  managesMessages(postId: string, memberId: string, fresh: boolean): Promise<boolean>;
  /**
   * Whether the bot may delete what members write in a forum's posts (Manage Messages there; plan
   * 8R-9F), from the cache: a forum or a member not in it counts as allowed.
   */
  mayDeleteMessages(forumId: string): boolean;
  /**
   * Deletes a message somebody else wrote (a reported one, plan 8S-2): `deleted`, `gone` when it
   * (or its channel) was gone already, `not-allowed` when the bot lacks Manage Messages there (in
   * an archived post also Manage Threads, which opening it for the deletion and archiving it
   * again take; a refused archiving afterwards is logged), unless `options.leaveOpen` asks to leave
   * it open (review W3: the region's board). Anything else is thrown.
   */
  deleteReported(
    channelId: string,
    messageId: string,
    options?: ReportedDeleteOptions,
  ): Promise<'deleted' | 'gone' | 'not-allowed'>;
  /**
   * Whether a member of the server can see a forum (and with it the posts in it), by their
   * roles and the forum's permission overwrites; the same of a text channel, which decides who
   * sees a region without a forum (`regionGate`, plan 8H-5). Undefined when the channel is gone
   * (or neither a forum nor a text channel) or the member is not in its server.
   */
  memberAccess(forumId: string, memberId: string): Promise<MemberAccess | undefined>;
  /**
   * How a member stands to these gates of a server's regions (their forums, or their text
   * channels where they have none; plan 8M-20): the member looked at once, fetched afresh with
   * `fresh` (else as `memberAccess` takes them: the cache's, which a forced fetch just before has
   * brought up to date), the gates from the cache as `memberAccess` reads them. Undefined for a
   * server the bot is not in and for somebody who is not in it; rejects when Discord cannot say.
   */
  memberGates(
    guildId: string,
    memberId: string,
    gateIds: readonly string[],
    fresh: boolean,
  ): Promise<MemberGates | undefined>;
  /**
   * Whether a channel (a region's text channel) has a permission overwrite of the member's own
   * that denies them View Channel: somebody keeps them out of it on purpose. Overwrites of
   * their roles are not looked at. False when the channel is gone.
   */
  ownViewDenied(channelId: string, memberId: string): Promise<boolean>;
  /**
   * Lets a member into a forum with a permission overwrite of their own: see the forum, read
   * what was written, write in its posts (not that, when a role of theirs may not write there).
   * It takes the place of an overwrite the member had. False when the forum is gone. Needs
   * Manage Permissions in the forum, and the bot can only give what it has there itself.
   */
  admitMember(forumId: string, memberId: string): Promise<boolean>;
  /**
   * Removes the permission overwrite `admitMember` made for a member. True when it is gone (also
   * when it, or the forum, was gone already). False when the member's overwrite is no longer
   * what `admitMember` made: somebody changed it since, and it is left as it is.
   */
  dismissMember(forumId: string, memberId: string): Promise<boolean>;
  /** The name of a channel the bot can see, from the cache. */
  channelName(channelId: string): string | undefined;
  /** The name of a server the bot is in, from the cache (for a DM that names it). */
  guildName(guildId: string): string | undefined;
  /**
   * The text channel with this name in the server that `nearChannelId` is in, in which the bot
   * may send messages with embeds, from the cache: its id, or undefined when that server has
   * none (of several, the oldest).
   */
  findChannel(nearChannelId: string, name: string): string | undefined;
  /**
   * Whether the bot may send messages with embeds in a text channel, from the cache: what
   * `findChannel` asks of the channels it finds. It is for text channels (the channels of
   * regions): of a thread it would ask the channel the thread is in. A channel that is not in
   * the cache counts as allowed, so that the send decides. Without the permission to embed,
   * Discord does not refuse a message: it shows it without its embed.
   */
  mayPost(channelId: string): boolean;
  /**
   * Whether the bot may post a shared answer in a channel (plan 8H-5, P2), from the cache: View
   * Channel and Send Messages, or Send Messages in Threads in a thread (a post); no Embed Links,
   * which a components-v2 message does not need; never in an ended post (archived and locked),
   * which refuses a message and is not opened for a share. A channel not in the cache counts as
   * allowed, so that the send decides.
   */
  mayShare(channelId: string): boolean;
  /**
   * The regions of `regionChannelIds` (each region's forum, or text channel where it has none)
   * whose counts may be shared into a channel (plan 8H-5, Matt's ruling R-A): a region whose
   * channel is the share channel, or the channel a shared-in post is in, at once; any other only
   * if everybody who can view the share channel (its parent's overwrites for a post) can view the
   * region's channel (`regionsKept` of `src/ops/permissions.ts`, from the cache; members the share
   * channel names asked of Discord afresh first, those the cache lacks before the others, at
   * most `SHARE_MEMBER_FETCHES`, each answer used for `SHARE_MEMBER_FRESH_MS`). A region
   * channel the cache lacks is not kept; undefined where the cache lacks the share channel (or a
   * post's parent), of which nothing can be said.
   */
  shareKeeps(
    shareChannelId: string,
    regionChannelIds: readonly string[],
  ): Promise<ReadonlySet<string> | undefined>;
  /**
   * A custom emoji, by name, of the server a channel is in, as message text (`<:name:id>`).
   * From the cache; undefined when the server has none of that name.
   */
  emoji(channelId: string, name: string): string | undefined;
  /**
   * Every channel of a server (by its snowflake) with its name, its kind and its category,
   * oldest first, from the cache (which follows the server with the Guilds intent). Threads
   * are no channels here. Undefined when the bot is not in that server.
   */
  serverChannels(guildId: string): ServerChannel[] | undefined;
  /**
   * What kind of channel an id is, from the cache (which follows every channel of the bot's
   * servers with the Guilds intent); undefined for one the bot does not know (gone, or never
   * seen). Threads are `other`.
   */
  channelKind(channelId: string): ServerChannel['kind'] | undefined;
  /** Whether the bot may create channels in a server (Manage Channels), from the cache. */
  mayCreateChannels(guildId: string): boolean;
  /**
   * Creates a category in a server (`/region import`, for the channel of a new region). A
   * refusal for a reason staff can do something about is an answer; anything else is thrown.
   * `reason` is what the server's audit log says of it (who asked for it). `like` names the
   * category it continues (an overflow category, plan 8S-4): it is made with that category's
   * permission overwrites and placed right after it (a refusal to set them is `no-permission`).
   */
  createCategory(
    guildId: string,
    name: string,
    reason?: string,
    like?: string,
  ): Promise<CreatedChannel>;
  /**
   * Creates an ordinary text channel in a server, in this category (which gives it its
   * permissions) or in none. Answers and throws as `createCategory`.
   */
  createTextChannel(
    guildId: string,
    name: string,
    categoryId: string | null,
    reason?: string,
  ): Promise<CreatedChannel>;
}

/**
 * What the bot's own overwrite of a hidden forum may allow it: what it uses in a forum
 * (`FORUM_NEEDS`, with the optional reactions and emoji) but Manage Roles, which Discord lets
 * only a server's administrators set in a channel ("Setting MANAGE_ROLES permission in channels
 * is only possible for guild administrators"); the bot keeps that through its role, which no
 * overwrite of the set denies.
 */
const BOT_OVERWRITE_BITS =
  FORUM_NEEDS.reduce(
    (all, need) => all | need.flag,
    PermissionFlagsBits.AddReactions | PermissionFlagsBits.UseExternalEmojis,
  ) & ~PermissionFlagsBits.ManageRoles;

/**
 * The permissions of a hidden forum's set that the bot would get through its category only
 * (`whereHas`, its permissions in the category), not in the server (`serverHas`): what the
 * creation of a hidden forum could not give it and the second hide (`hideForum`) adds. Named as
 * Discord's settings name them.
 */
export function categoryOnlyPermissions(serverHas: bigint, whereHas: bigint): string[] {
  const only = whereHas & ~serverHas & BOT_OVERWRITE_BITS;
  return SERVER_NEEDS.filter((need) => (only & need.flag) !== 0n).map((need) => need.name);
}

/**
 * What came of hiding a forum (`PartyGateway.hideForum`): hidden; `refused` when Discord refused
 * the bot the change, naming the permissions the set gave the bot that only the forum's category
 * gives it (`categoryOnlyPermissions`; none when nothing but the server's was asked), and
 * whether the forum is hidden all the same by the overwrites it has (`isHiddenForum`); undefined
 * when the forum is gone.
 */
export type ForumHiding =
  'hidden' | { refused: readonly string[]; stillHidden: boolean } | undefined;

/**
 * A staff role's name as rehearsal mode compares it (`settings.rehearsal.staffRoles`): trimmed,
 * lower case. The hidden forums and the router's admission both go by it.
 */
export function staffRoleKey(name: string): string {
  return name.trim().toLowerCase();
}

/** Who may see a hidden forum besides the bot (rehearsal mode): staff roles by name, and members. */
export interface ForumAccess {
  roleNames: readonly string[];
  memberIds: readonly string[];
}

/** A permission overwrite as Discord takes it whole (`permissionOverwrites.set`). */
export interface ForumOverwrite {
  id: string;
  type: OverwriteType;
  allow: bigint;
  deny: bigint;
}

/** A role of the server: its id, name and permissions. */
interface ServerRole {
  id: string;
  name: string;
  permissions: bigint;
  /** For the role Discord made for a bot's integration: that bot's id (`role.tags.botId`). */
  managedFor?: string | undefined;
}

/**
 * The staff of a hidden forum (rehearsal mode): the roles named (as staff roles are compared:
 * trimmed, lower case) and every role that may manage the server; never everyone.
 */
function staffRoles(
  server: { everyoneId: string; roles: readonly ServerRole[] },
  access: ForumAccess,
): ServerRole[] {
  const named = new Set(access.roleNames.map(staffRoleKey));
  const staffBits = PermissionFlagsBits.ManageGuild | PermissionFlagsBits.Administrator;
  return server.roles.filter(
    (role) =>
      role.id !== server.everyoneId &&
      (named.has(staffRoleKey(role.name)) || (role.permissions & staffBits) !== 0n),
  );
}

/**
 * Whether a forum's overwrites hide it as `hiddenForumOverwrites` would (rehearsal mode): View
 * Channel denied to everyone (computed as Discord does, `channelPermissions`), and every
 * overwrite that allows it the bot's (its member, or the role Discord made for it), a staff
 * role's (`staffRoles`) or an allowlisted member's. Everyone's own server permissions count (an
 * administrator everyone sees everything).
 * What a forum that Discord refused to hide again is judged by: hidden already, or not.
 */
export function isHiddenForum(
  overwrites: readonly ForumOverwrite[],
  server: { everyoneId: string; botId: string; roles: readonly ServerRole[] },
  access: ForumAccess,
): boolean {
  const see = PermissionFlagsBits.ViewChannel;
  const api = overwrites.map((one) => ({
    ...one,
    allow: String(one.allow),
    deny: String(one.deny),
  }));
  // A member of no role and no overwrite of their own: everyone's server permissions (an
  // administrator sees everything) and seeing the server's channels, then the overwrites.
  const everyone = server.roles.find((role) => role.id === server.everyoneId)?.permissions ?? 0n;
  const anybody = channelPermissions(
    everyone | see,
    server.everyoneId,
    { id: '', roleIds: [] },
    api,
  );
  if ((anybody & see) !== 0n) return false;
  const staff = new Set(staffRoles(server, access).map((role) => role.id));
  // The bot's own role, which Discord made for its integration: what an operator who hides the
  // forum by hand lets in as "Professor Pine".
  const botRoles = new Set(
    server.roles.filter((role) => role.managedFor === server.botId).map((role) => role.id),
  );
  const members = new Set(access.memberIds);
  return overwrites.every(
    (one) =>
      (one.allow & see) === 0n ||
      one.id === server.botId ||
      (one.type === OverwriteType.Role
        ? staff.has(one.id) || botRoles.has(one.id)
        : members.has(one.id)),
  );
}

/**
 * The overwrites of a forum hidden from all but the bot, staff and some members (rehearsal mode),
 * as the forum's whole set: every overwrite it had (those it took over from its category
 * included) is replaced, so that no role the category lets in sees it. Denied to everyone: View
 * Channel, and Send Messages (posts are the bot's). Allowed: the bot to see and post; the roles
 * named (by name, as staff roles are compared: trimmed, lower case) and every role that may
 * manage the server, to see, read and write in posts; each member, as an admission with Add
 * Reactions more (so that `dismissMember` never takes it away). The bot keeps, on its own
 * overwrite, every permission of a forum (`BOT_OVERWRITE_BITS`) that it has where Discord
 * checks the set (`botHas`): in the server for a new forum ("only permissions your bot has in
 * the guild can be allowed/denied"), in the category for one hidden later ("in the guild or
 * parent channel"), so that what the category gave it is not lost; never one more, which
 * Discord refuses. Nor does any overwrite allow what the bot lacks there: a creation with it is
 * refused as a whole.
 */
export function hiddenForumOverwrites(
  server: {
    everyoneId: string;
    botId: string;
    /** The bot's permissions where the forum is, before the set replaces its overwrites. */
    botHas: bigint;
    roles: readonly ServerRole[];
  },
  access: ForumAccess,
): ForumOverwrite[] {
  const staff = staffRoles(server, access);
  const see = PermissionFlagsBits.ViewChannel;
  return [
    {
      id: server.everyoneId,
      type: OverwriteType.Role,
      allow: 0n,
      deny: see | PermissionFlagsBits.SendMessages,
    },
    {
      id: server.botId,
      type: OverwriteType.Member,
      allow: see | PermissionFlagsBits.SendMessages | (server.botHas & BOT_OVERWRITE_BITS),
      deny: 0n,
    },
    ...staff.map((role) => ({
      id: role.id,
      type: OverwriteType.Role,
      allow: ADMITTED_BITS,
      deny: 0n,
    })),
    ...access.memberIds.map((id) => ({
      id,
      type: OverwriteType.Member,
      allow: ADMITTED_BITS | PermissionFlagsBits.AddReactions,
      deny: 0n,
    })),
  ];
}

/**
 * What came of creating a channel: the channel as Discord made it (it may write the name
 * differently), or why not. `no-permission`: the bot lacks Manage Channels (in the server, or
 * in the category); `server-full`: the server has as many channels as Discord allows (500);
 * `category-full`: the category has (50, forums included); `bad-name`: Discord does not take
 * the name; `no-server`: the bot is not in that server, or the category is gone; `base-gone`:
 * the category a new one was to continue (`createCategory`'s `like`) is gone, so it is not made
 * (made without that one's permissions it would be open to whoever the server lets in).
 */
export type CreatedChannel =
  | { ok: true; id: string; name: string }
  | {
      ok: false;
      reason:
        'no-permission' | 'server-full' | 'category-full' | 'bad-name' | 'no-server' | 'base-gone';
    };

/**
 * How many members a share channel names a Share asks Discord of before it decides (plan 8H-5,
 * R2), those the cache lacks first; one past them is taken from the cache, or stays unknown and
 * drops the regions it might not see.
 */
export const SHARE_MEMBER_FETCHES = 10;
/** How long what Discord said of a member a share channel names is used (8H5-4): a minute. */
export const SHARE_MEMBER_FRESH_MS = 60_000;
/** How many of those answers are kept (oldest out). */
const SHARE_MEMBERS_KEPT = 1_000;

/** A member's roles but the server's everyone role, as `shareKeeps` takes them. */
function rolesBesideEveryone(member: GuildMember, guildId: string): string[] {
  return [...member.roles.cache.keys()].filter((id) => id !== guildId);
}

/** A region's gate: its forum, or its text (or announcement) channel where it has none. */
type GateChannel = ForumChannel | TextChannel | NewsChannel;

/**
 * Whether a member would see a channel holding exactly the roles `roleIds` (not the everyone
 * role, which every member has), by discord.js's own rule (`GuildChannel.memberPermissions`) over
 * that set of roles (plan 8M-20, R1): the server's owner sees everything; the roles' permissions
 * with everybody's, everything for an administrator; then the channel's overwrite of everybody,
 * those of the roles together (an allowance of one role beats a denial of another), and the
 * member's own. A role the server no longer has counts for nothing. With the roles the member
 * holds it is `permissionsFor(member)`; with one more or one less it is what giving or taking that
 * role would make of the channel.
 */
export function viewsWith(
  channel: GateChannel,
  member: GuildMember,
  roleIds: ReadonlySet<string>,
): boolean {
  const { guild } = channel;
  if (member.id === guild.ownerId) return true;
  const roles = guild.roles.cache.filter((role) => role.id === guild.id || roleIds.has(role.id));
  let bits = roles.reduce((all, role) => all | role.permissions.bitfield, 0n);
  if ((bits & PermissionFlagsBits.Administrator) !== 0n) return true;
  // The overwrites sorted as `GuildChannel.overwritesFor` sorts them (everybody's, the roles',
  // the member's own), over the roles given rather than those the member holds.
  let everyone: { allow: bigint; deny: bigint } | undefined;
  let own: { allow: bigint; deny: bigint } | undefined;
  let allow = 0n;
  let deny = 0n;
  for (const overwrite of channel.permissionOverwrites.cache.values()) {
    const bits = { allow: overwrite.allow.bitfield, deny: overwrite.deny.bitfield };
    if (overwrite.id === guild.id) everyone = bits;
    else if (roles.has(overwrite.id)) {
      allow |= bits.allow;
      deny |= bits.deny;
    } else if (overwrite.id === member.id) own = bits;
  }
  for (const step of [everyone, { allow, deny }, own]) {
    if (step) bits = (bits & ~step.deny) | step.allow;
  }
  return (bits & PermissionFlagsBits.ViewChannel) !== 0n;
}

/** What the bot needs in a channel to put a copy of a party's message there. */
const CAN_POST = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.EmbedLinks,
];

/**
 * What the bot needs in a forum to write in its board post (plan 8R-9, B6; plan 8R-9F, B5: the
 * board is open, so no Manage Posts unless a moderator locked it, `postAccess`).
 */
const WRITES_IN_BOARD = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessagesInThreads,
];

const GONE: ReadonlySet<number | string> = new Set([
  RESTJSONErrorCodes.UnknownChannel,
  RESTJSONErrorCodes.UnknownMessage,
  RESTJSONErrorCodes.UnknownGuild,
]);

/** What a member who is let into a forum may do there (spec 5.4). */
const ADMITTED = {
  ViewChannel: true,
  ReadMessageHistory: true,
  SendMessagesInThreads: true,
} as const;
/** The same as permission bits: an overwrite that allows nothing else and denies nothing is the bot's own. */
const ADMITTED_BITS =
  PermissionFlagsBits.ViewChannel |
  PermissionFlagsBits.ReadMessageHistory |
  PermissionFlagsBits.SendMessagesInThreads;

function hasCode(err: unknown, ...codes: RESTJSONErrorCodes[]): boolean {
  return err instanceof DiscordAPIError && codes.some((code) => err.code === code);
}

/** Whether Discord says the thing asked about no longer exists. */
export function isGone(err: unknown): boolean {
  return err instanceof DiscordAPIError && GONE.has(err.code);
}

/** The flag of each of `POST_PERMISSIONS`, which name them as a forum's settings do. */
const POST_FLAGS: Record<PostPermission, bigint> = {
  'View Channel': PermissionFlagsBits.ViewChannel,
  'Create Posts': PermissionFlagsBits.SendMessages,
  'Send Messages in Posts': PermissionFlagsBits.SendMessagesInThreads,
  'Manage Posts': PermissionFlagsBits.ManageThreads,
};

/** `createPost` where the bot may not make posts in the forum (plan 8S-3). */
export class PostsRefusedError extends Error implements PostsRefused {
  override name = 'PostsRefusedError';

  constructor(
    readonly forumId: string,
    readonly missing: readonly string[],
  ) {
    super(
      `the bot may not make posts in the forum ${forumId}` +
        (missing.length > 0 ? `: it lacks ${missing.join(', ')}` : ''),
    );
  }
}

/** Whether Discord refused because the bot lacks a permission, or cannot see the channel. */
export function isMissingPermission(err: unknown): boolean {
  return (
    err instanceof DiscordAPIError &&
    (err.code === RESTJSONErrorCodes.MissingPermissions ||
      err.code === RESTJSONErrorCodes.MissingAccess)
  );
}

/** Whether Discord refused a message because the post is archived (and locked; 50083). */
export function isArchivedThread(err: unknown): boolean {
  return hasCode(err, RESTJSONErrorCodes.InvalidActionOnArchivedThread);
}

/** Whether Discord refused because the channel has as many permission overwrites as it can have. */
export function isOverwriteLimit(err: unknown): boolean {
  return hasCode(err, RESTJSONErrorCodes.MaximumNumberOfChannelPermissionOverwritesReached);
}

/**
 * Whether Discord refused a new channel (a forum too) for want of room: `server` when the server
 * has as many channels as Discord allows (500), `category` when its category has (50, forums
 * included; Invalid Form Body naming the parent, `CHANNEL_PARENT_MAX_CHANNELS`).
 */
export function channelLimitOf(err: unknown): 'server' | 'category' | undefined {
  if (hasCode(err, RESTJSONErrorCodes.MaximumNumberOfGuildChannelsReached)) return 'server';
  if (isRefusedBody(err) && err instanceof DiscordAPIError) {
    if (/CHANNEL_PARENT_MAX_CHANNELS/u.test(err.message)) return 'category';
  }
  return undefined;
}

/** Whether Discord refused the message for what it holds (Invalid Form Body). */
export function isRefusedBody(err: unknown): boolean {
  return (
    err instanceof DiscordAPIError && err.code === RESTJSONErrorCodes.InvalidFormBodyOrContentType
  );
}

/** A field Discord named in refusing a message: its path (`components`, `0`, …, `id`) and code. */
interface RefusedField {
  path: string[];
  code: string;
}

/** The fields an answer of Invalid Form Body names (its `errors`, by their `_errors`). */
function refusedFields(err: DiscordAPIError): RefusedField[] {
  const fields: RefusedField[] = [];
  const visit = (node: unknown, path: string[]): void => {
    if (typeof node !== 'object' || node === null) return;
    for (const [key, value] of Object.entries(node)) {
      if (key !== '_errors') {
        visit(value, [...path, key]);
        continue;
      }
      for (const error of Array.isArray(value) ? (value as unknown[]) : []) {
        const code = (error as { code?: unknown } | null)?.code;
        if (typeof code === 'string') fields.push({ path, code });
      }
    }
  };
  visit((err.rawError as { errors?: unknown }).errors, []);
  return fields;
}

/** What Discord may refuse in a post's message that a form of it leaves out. */
export type RefusedPart = 'emoji' | 'picture';

/**
 * What of a message Discord named in refusing it with Invalid Form Body (`errors`): `emoji` for
 * an emoji (a field under `emoji`, or a code about one, such as `COMPONENT_INVALID_EMOJI` for an
 * application emoji that was deleted; also read in the message, where the fields are missing),
 * else `picture` for a media item (a thumbnail's or a gallery's `media`), else undefined: another
 * field, none, or another failure. An emoji goes first where both are named.
 */
export function refusedPart(err: unknown): RefusedPart | undefined {
  if (!isRefusedBody(err)) return undefined;
  const fields = refusedFields(err as DiscordAPIError);
  const namesEmoji =
    fields.some((field) => field.path.includes('emoji') || field.code.includes('EMOJI')) ||
    /\[[A-Z_]*EMOJI[A-Z_]*\]/.test((err as DiscordAPIError).message);
  if (namesEmoji) return 'emoji';
  return fields.some((field) => field.path.includes('media')) ? 'picture' : undefined;
}

/**
 * Whether Discord refused a message as one that is empty (50006): what it answers for a
 * components-v2 message whose flag it did not take, and so finds neither content nor embeds.
 */
function isRefusedAsEmpty(err: unknown): boolean {
  return hasCode(err, RESTJSONErrorCodes.CannotSendAnEmptyMessage);
}

/**
 * Whether Discord refused a components-v2 message as the first message of a forum post: Invalid
 * Form Body, or, while direct posts are not known to work (`direct` false), an empty message (the
 * flag dropped on the post's nested message). Once they work, an empty message is the message's own.
 */
export function isRefusedStarter(err: unknown, direct: boolean): boolean {
  return isRefusedBody(err) || (!direct && isRefusedAsEmpty(err));
}

/**
 * How long Discord says a rate limit lasts, when `err` is one that discord.js refused to wait for
 * (see `rejectsLongChannelPatchWait`): the sublimit, the bucket wait or the retry-after, whichever is largest.
 * Undefined for any other failure.
 */
export function rateLimitWaitMs(err: unknown): number | undefined {
  return err instanceof RateLimitError
    ? Math.max(err.sublimitTimeout, err.timeToReset, err.retryAfter)
    : undefined;
}

function allowedMentions(message: OutgoingMessage) {
  return {
    parse: [],
    users: message.mention?.users ?? [],
    roles: message.mention?.roles ?? [],
  };
}

/** A message as discord.js sends it: nobody is pinged but whom `mention` names. */
export function discordPayload(message: OutgoingMessage) {
  if (message.v2) {
    return {
      components: message.components,
      flags: MessageFlags.IsComponentsV2 as const,
      allowedMentions: allowedMentions(message),
      ...(message.files === undefined ? {} : { files: [...message.files] }),
    };
  }
  return {
    content: message.content ?? '',
    embeds: message.embeds ?? [],
    components: message.components ?? [],
    allowedMentions: allowedMentions(message),
  };
}

/**
 * A message as discord.js sends it, as `discordPayload` makes it, and with `SuppressNotifications`
 * where `options.silent` asks (plan 8R-9, B13); only a send takes the flag.
 */
export function sendPayload(message: OutgoingMessage, options?: SendOptions) {
  const payload = discordPayload(message);
  if (options?.silent !== true) return payload;
  return {
    ...payload,
    flags: message.v2
      ? (['IsComponentsV2', 'SuppressNotifications'] as const)
      : (['SuppressNotifications'] as const),
  };
}

/**
 * The body of the edit that makes a classic message (a post made before the posts were v2) a
 * components-v2 message, as the API takes it: content and embeds cleared (`null` stays `null`
 * only on this route; discord.js would send an empty text), the flag, the components.
 */
export function conversionBody(message: V2Message) {
  return {
    content: null,
    embeds: [],
    components: message.components,
    flags: MessageFlags.IsComponentsV2,
    allowed_mentions: allowedMentions(message),
    // The files it says it has are all it keeps, each uploaded as `files[n]` (`uploadsOf`).
    ...(message.files === undefined
      ? {}
      : {
          attachments: message.files.map((file, id) => ({ id, filename: fileName(file) })),
        }),
  };
}

/** A file as the API takes it beside a body (`files[n]`). */
export interface Upload {
  name: string;
  data: Buffer;
}

/** The name a file of a message has in it: a path's base name, or the name it was given. */
function fileName(file: MessageFile): string {
  return typeof file === 'string' ? path.basename(file) : file.name;
}

/** The files of a message read for the API, in their order (`conversionBody`'s ids). */
export async function uploadsOf(message: V2Message): Promise<Upload[]> {
  return Promise.all(
    (message.files ?? []).map(async (file) => ({
      name: fileName(file),
      data: typeof file === 'string' ? await readFile(file) : file.attachment,
    })),
  );
}

/** Whether a message uploads files (`V2Message.files`, not none). */
export function carriesFiles(message: OutgoingMessage): boolean {
  return message.v2 === true && (message.files?.length ?? 0) > 0;
}

/**
 * Whether a failure of sending a message with files is what a refused file looks like: Missing
 * Permissions (no Attach Files: Discord answers 50013, not Invalid Form Body), Invalid Form Body,
 * Request entity too large, or an error of reading the file itself (not an answer of Discord).
 * Anything else (a timeout, a 5xx, Missing Access) would meet a message without the file too.
 */
export function looksLikeRefusedFile(err: unknown): boolean {
  if (!(err instanceof DiscordAPIError)) {
    // A system error of reading the file (ENOENT and the like) has a code of letters.
    const code: unknown =
      err instanceof Error ? (err as Error & { code?: unknown }).code : undefined;
    return typeof code === 'string' && /^E[A-Z]+$/.test(code);
  }
  return (
    err.code === RESTJSONErrorCodes.InvalidFormBodyOrContentType ||
    err.code === RESTJSONErrorCodes.MissingPermissions ||
    err.code === RESTJSONErrorCodes.RequestEntityTooLarge
  );
}

/** Whether Discord (or the disk) refused the files of this message (`looksLikeRefusedFile`). */
export function isRefusedFile(err: unknown, message: OutgoingMessage): boolean {
  return carriesFiles(message) && looksLikeRefusedFile(err);
}

/** How an edit is made (`editPost`, `editMessage`). */
export interface EditOptions {
  /**
   * The caller knows the message is classic (a post's first line of text): a v2 edit converts
   * it at once (`conversionBody`) instead of trying the plain edit Discord would refuse.
   */
  convert?: boolean;
  /**
   * A message of the region's board (plan 8R-9G: the summary, the stops' messages): where the
   * message Discord gives back after the edit carries reactions, they are all removed. A refusal
   * or a failure of that never fails the edit; it is logged once per channel until a removal
   * there works again. Party posts never ask for it: their chats keep their reactions.
   */
  clearReactions?: boolean;
}

/**
 * Edits a message into `message`: through `edit` as `discordPayload` makes it (a v2 message
 * with its flag and components only). When Discord refuses a v2 edit for its form (a classic
 * message still has content or embeds: Invalid Form Body, or an empty message where the flag was
 * not taken), it is made once more through `convert` with those
 * cleared (`conversionBody`), and `refused` is told Discord's code; a caller that knows the
 * message is classic (`convert`) converts it at once. A message known to be v2 already
 * (`knownV2`) is never converted: Discord refused the message itself, and that is passed on, as
 * is any other failure. Gives what the edit or the conversion that went through answered (the
 * edited message, which `carriesReactions` reads).
 */
export async function editAs(
  message: OutgoingMessage,
  edit: (payload: ReturnType<typeof discordPayload> & { attachments?: [] }) => Promise<unknown>,
  convert: (body: ReturnType<typeof conversionBody>, files: Upload[]) => Promise<unknown>,
  how: EditOptions & { knownV2?: boolean; refused?: (code: number | string) => void } = {},
): Promise<unknown> {
  if (message.v2 && how.convert) {
    return convert(conversionBody(message), await uploadsOf(message));
  }
  try {
    // A message that says which files it has keeps none of those it had (Discord keeps what
    // `attachments` names; discord.js adds the new files to it): the old picture of an egg
    // goes, its file uploaded again while it is still shown.
    return await edit({
      ...discordPayload(message),
      ...(message.v2 && message.files !== undefined ? { attachments: [] as [] } : {}),
    });
  } catch (err) {
    if (!message.v2 || how.knownV2 === true) throw err;
    if (!(isRefusedBody(err) || isRefusedAsEmpty(err))) throw err;
    if (err instanceof DiscordAPIError) how.refused?.(err.code);
    return convert(conversionBody(message), await uploadsOf(message));
  }
}

/**
 * Whether an edited message as Discord gave it back carries reactions (plan 8R-9G): a discord.js
 * message (its reactions' cache) or the REST body of a conversion (its `reactions`). Anything
 * else carries none.
 */
export function carriesReactions(answer: unknown): boolean {
  if (typeof answer !== 'object' || answer === null) return false;
  const reactions: unknown = (answer as { reactions?: unknown }).reactions;
  if (Array.isArray(reactions)) return reactions.length > 0;
  if (typeof reactions !== 'object' || reactions === null) return false;
  const size: unknown = (reactions as { cache?: { size?: unknown } }).cache?.size;
  return typeof size === 'number' && size > 0;
}

/** What of a channel's message cache the removal of reactions forgets (review R-F2). */
interface CachedMessages {
  messages: {
    cache: { get(id: string): { reactions: { cache: { clear(): void } } } | undefined };
  };
}

/**
 * The gateway over a discord.js client. The client is handed over once it exists (the login
 * may try several clients); anything asked before that fails.
 */
export class DiscordPartyGateway implements PartyGateway {
  private current: Client | undefined;
  /**
   * The messages this process sent, made or edited as components-v2 (a post's first message
   * has the post's id): a refused v2 edit of one of them is a refusal of the message, never a
   * classic message to convert. The oldest are forgotten; that costs a conversion tried for nothing.
   */
  private readonly v2Messages = new BoundedMap<string, true>(V2_MESSAGES_KEPT);
  /**
   * `<guild>:<member>`: the roles Discord said a member a share channel names has (null: not in
   * the server), and when (`SHARE_MEMBER_FRESH_MS`, 8H5-4), set in the order of those times.
   */
  private readonly shareMembers = new BoundedMap<
    string,
    { roles: readonly string[] | null; at: number }
  >(SHARE_MEMBERS_KEPT);
  /**
   * The channels (boards) where removing the reactions after an edit failed, said once until one
   * works there again (plan 8R-9G). As many as there are boards.
   */
  private readonly reactionsFailedIn = new Set<string>();

  /**
   * `log` hears of every conversion tried after Discord refused a plain edit, and of the
   * reactions on a board's message it could not remove.
   */
  constructor(private readonly log?: Logger) {}

  /**
   * What `editAs` is told: the caller's options, whether the message is known to be v2, and the
   * refusal a conversion follows, logged.
   */
  private editHow(messageId: string, options?: EditOptions) {
    return {
      ...options,
      knownV2: this.v2Messages.has(messageId),
      refused: (code: number | string) => {
        this.log?.info(
          { message: messageId, code },
          'Discord refused a components-v2 edit of a message not known to be v2; trying it as a conversion',
        );
      },
    };
  }

  /** Keeps whether a message that was just sent or edited is v2. */
  private noteSent(messageId: string | undefined, message: OutgoingMessage): void {
    if (messageId === undefined) return;
    if (message.v2) this.v2Messages.set(messageId, true);
    else this.v2Messages.delete(messageId);
  }

  /** The client to talk through from now on. */
  use(client: Client): void {
    this.current = client;
  }

  private get client(): Client {
    if (!this.current) throw new Error('Discord is not connected yet');
    return this.current;
  }

  /** Runs `work`; a "gone" answer of Discord becomes undefined. */
  private async unlessGone<T>(work: () => Promise<T>): Promise<T | undefined> {
    try {
      return await work();
    } catch (err) {
      if (isGone(err)) return undefined;
      throw err;
    }
  }

  /** Runs `work`; false when Discord says the thing is gone, true when it worked. */
  private async done(work: () => Promise<unknown>): Promise<boolean> {
    try {
      await work();
      return true;
    } catch (err) {
      if (isGone(err)) return false;
      throw err;
    }
  }

  private async forum(forumId: string): Promise<ForumChannel | undefined> {
    const channel = await this.unlessGone(() => this.client.channels.fetch(forumId));
    return channel?.type === ChannelType.GuildForum ? channel : undefined;
  }

  private async post(postId: string): Promise<AnyThreadChannel | undefined> {
    const channel = await this.unlessGone(() => this.client.channels.fetch(postId));
    return channel?.isThread() ? channel : undefined;
  }

  private static tagIds(forum: ForumChannel): TagIds {
    return Object.fromEntries(forum.availableTags.map((tag) => [tag.name, tag.id]));
  }

  /** The overwrites that hide a forum of this server (`hiddenForumOverwrites`). */
  private static hiddenIn(
    guild: Guild,
    botId: string,
    botHas: bigint,
    access: ForumAccess,
  ): ForumOverwrite[] {
    return hiddenForumOverwrites(
      {
        everyoneId: guild.roles.everyone.id,
        botId,
        botHas,
        roles: [...guild.roles.cache.values()].map((role) => ({
          id: role.id,
          name: role.name,
          permissions: role.permissions.bitfield,
        })),
      },
      access,
    );
  }

  async createForum(
    regionChannelId: string,
    name: string,
    tagNames: readonly string[],
    hidden?: ForumAccess,
  ): Promise<{ forumId: string; tags: TagIds } | undefined> {
    const region = await this.unlessGone(() => this.client.channels.fetch(regionChannelId));
    if (!region || region.isDMBased() || region.isThread()) return undefined;
    // Beside the other forums of the category, after the last of them: Discord would put a new
    // channel among the text channels.
    const lastForum = region.guild.channels.cache
      .filter(
        (channel): channel is ForumChannel =>
          channel.type === ChannelType.GuildForum && channel.parentId === region.parentId,
      )
      .sort((a, b) => a.rawPosition - b.rawPosition)
      .last();
    const forum = await this.unlessGone(() =>
      region.guild.channels.create({
        name,
        type: ChannelType.GuildForum,
        parent: region.parentId,
        defaultAutoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
        availableTags: tagNames.map((tag) => ({ name: tag, moderated: true })),
        // Hidden from its first moment on (rehearsal mode): never seen open, not even briefly.
        ...(hidden
          ? {
              permissionOverwrites: DiscordPartyGateway.hiddenIn(
                region.guild,
                this.client.user?.id ?? '',
                // What the bot has in the server: a creation may allow or deny no more. What
                // only the category gives it comes with `hideForum`, which `setupForum` runs
                // on the new forum next.
                region.guild.members.me?.permissions.bitfield ?? 0n,
                hidden,
              ),
            }
          : {}),
      }),
    );
    // Moved after it once made: a position given at creation does not shift the channels
    // behind it, and of two at one position the newer comes last. Where it stands is no reason
    // to fail: a refusal leaves it where Discord put it.
    if (forum && lastForum) {
      await forum.setPosition(lastForum.position + 1).catch(() => undefined);
    }
    return forum ? { forumId: forum.id, tags: DiscordPartyGateway.tagIds(forum) } : undefined;
  }

  async reservePosts(
    forumId: string,
  ): Promise<'reserved' | 'was-reserved' | 'not-allowed' | undefined> {
    const forum = await this.forum(forumId);
    if (!forum) return undefined;
    const me = forum.guild.members.me;
    if (!me) return 'not-allowed';
    const everyone = forum.guild.roles.everyone.id;
    const post = PermissionFlagsBits.SendMessages;
    const overwrites = forum.permissionOverwrites.cache;
    // The roles to deny it: everyone, and every role the forum itself allows it (an allowance
    // of the category or of the role is beaten by the denial for everyone here).
    const roles = [
      ...new Set([
        everyone,
        ...overwrites
          .filter((own) => own.type === OverwriteType.Role && own.allow.has(post))
          .map((own) => own.id),
      ]),
    ].filter((id) => !overwrites.get(id)?.deny.has(post));
    const mine = overwrites.get(me.id)?.allow.has(post) ?? false;
    if (roles.length === 0 && mine) return 'was-reserved';
    const reason = 'Posts in this forum are made by the bot';
    try {
      // The bot first: denied to everyone, it could not make a post either.
      if (!mine) await forum.permissionOverwrites.edit(me, { SendMessages: true }, { reason });
      for (const id of roles) {
        await forum.permissionOverwrites.edit(id, { SendMessages: false }, { reason });
      }
    } catch (err) {
      if (isMissingPermission(err)) return 'not-allowed';
      if (hasCode(err, RESTJSONErrorCodes.UnknownChannel)) return undefined;
      throw err;
    }
    return 'reserved';
  }

  async hideForum(forumId: string, access: ForumAccess): Promise<ForumHiding> {
    const forum = await this.forum(forumId);
    if (!forum) return undefined;
    const me = forum.guild.members.me;
    if (!me) return { refused: [], stillHidden: false };
    // Where Discord checks a change of the set: the server, or the category the forum is in.
    const where = (forum.parent?.permissionsFor(me) ?? me.permissions).bitfield;
    try {
      // The whole set at once: an overwrite the forum took over from its category (a role it
      // lets in) would otherwise outlive the denial to everyone.
      await forum.permissionOverwrites.set(
        DiscordPartyGateway.hiddenIn(forum.guild, me.id, where, access),
        'Rehearsal: only staff and the testers see this forum',
      );
    } catch (err) {
      if (isMissingPermission(err)) {
        // A refused set changes nothing: the overwrites it has say whether it is hidden already.
        const stillHidden = isHiddenForum(
          [...forum.permissionOverwrites.cache.values()].map((one) => ({
            id: one.id,
            type: one.type,
            allow: one.allow.bitfield,
            deny: one.deny.bitfield,
          })),
          {
            everyoneId: forum.guild.roles.everyone.id,
            botId: me.id,
            roles: [...forum.guild.roles.cache.values()].map((role) => ({
              id: role.id,
              name: role.name,
              permissions: role.permissions.bitfield,
              managedFor: role.tags?.botId,
            })),
          },
          access,
        );
        return { refused: categoryOnlyPermissions(me.permissions.bitfield, where), stillHidden };
      }
      if (hasCode(err, RESTJSONErrorCodes.UnknownChannel)) return undefined;
      throw err;
    }
    return 'hidden';
  }

  async renameForum(forumId: string, name: string): Promise<boolean> {
    const forum = await this.forum(forumId);
    if (!forum) return false;
    return (await this.unlessGone(() => forum.setName(name))) !== undefined;
  }

  async ensureTags(forumId: string, tagNames: readonly string[]): Promise<TagIds | undefined> {
    const forum = await this.forum(forumId);
    if (!forum) return undefined;
    const have = new Set(forum.availableTags.map((tag) => tag.name));
    const missing = tagNames.filter((tag) => !have.has(tag));
    if (missing.length === 0) return DiscordPartyGateway.tagIds(forum);
    // Discord refuses a forum more than 20 tags (final review G2): what does not fit is left out,
    // and the posts go without it, rather than every report there failing.
    const fits = missing.slice(0, Math.max(0, MAX_FORUM_TAGS - forum.availableTags.length));
    if (fits.length < missing.length) {
      this.log?.warn(
        { forum: forumId, missing: missing.slice(fits.length) },
        'a forum has no room for these tags: its posts go without them',
      );
    }
    if (fits.length === 0) return DiscordPartyGateway.tagIds(forum);
    const updated = await this.unlessGone(() =>
      forum.setAvailableTags([
        ...forum.availableTags,
        ...fits.map((tag) => ({ name: tag, moderated: true })),
      ]),
    );
    return updated ? DiscordPartyGateway.tagIds(updated) : undefined;
  }

  async removeTags(forumId: string, tagNames: readonly string[]): Promise<number | undefined> {
    const forum = await this.forum(forumId);
    if (!forum) return undefined;
    const gone = new Set(tagNames);
    const kept = forum.availableTags.filter((tag) => !gone.has(tag.name));
    const removed = forum.availableTags.length - kept.length;
    if (removed === 0) return 0;
    const updated = await this.unlessGone(() => forum.setAvailableTags(kept));
    return updated ? removed : undefined;
  }

  async createPost(forumId: string, post: NewPost): Promise<string | undefined> {
    let thread: AnyThreadChannel | undefined;
    try {
      const forum = await this.forum(forumId);
      if (!forum) return undefined;
      // Refused before Discord is asked: its answer would be Missing Access, which names nothing.
      const missing = DiscordPartyGateway.lacksForPosts(
        forum,
        DiscordPartyGateway.anyModerated(forum, post.tagIds),
      );
      if (missing.length > 0) throw new PostsRefusedError(forumId, missing);
      thread = await this.unlessGone(() =>
        forum.threads.create({
          name: post.title,
          autoArchiveDuration: post.autoArchiveMinutes ?? ThreadAutoArchiveDuration.OneWeek,
          message: discordPayload(post.message),
          appliedTags: [...post.tagIds],
        }),
      );
    } catch (err) {
      // What the cache did not show (it lags, or the forum cannot be seen at all).
      if (hasCode(err, RESTJSONErrorCodes.MissingAccess)) throw new PostsRefusedError(forumId, []);
      throw err;
    }
    // The first message of a forum post has the id of the post.
    this.noteSent(thread?.id, post.message);
    return thread?.id;
  }

  async postInfo(postId: string): Promise<PostInfo | undefined> {
    const post = await this.post(postId);
    return post
      ? {
          title: post.name,
          tagIds: [...post.appliedTags],
          pinned: post.flags.has(ChannelFlags.Pinned),
          locked: post.locked === true,
          slowmode: post.rateLimitPerUser ?? 0,
          archived: post.archived === true,
        }
      : undefined;
  }

  /** Discord refuses edits, renames, tags and pins in an archived post: open it again first. */
  private async reopen(post: AnyThreadChannel): Promise<void> {
    if (post.archived) await post.setArchived(false);
  }

  async editPost(
    postId: string,
    message: OutgoingMessage,
    options?: EditOptions,
  ): Promise<boolean> {
    const post = await this.post(postId);
    if (!post) return false;
    // The first message of a forum post has the id of the post.
    return this.done(async () => {
      await this.reopen(post);
      const edited = await editAs(
        message,
        (payload) => post.messages.edit(postId, payload),
        (body, files) =>
          this.client.rest.patch(Routes.channelMessage(postId, postId), { body, files }),
        this.editHow(postId, options),
      );
      this.noteSent(postId, message);
      if (options?.clearReactions === true && carriesReactions(edited)) {
        await this.clearAfterEdit(post, postId, postId);
      }
    });
  }

  /**
   * Removes every reaction on a message (`DELETE …/reactions`), and forgets them in the cached
   * message (review R-F2): Discord leaves `reactions` out of a message without any, and discord.js
   * replaces a cached message's reactions only where the body has some, so the next edit would
   * still say it has them and remove them again.
   */
  private async removeAllReactions(
    channel: CachedMessages,
    channelId: string,
    messageId: string,
  ): Promise<void> {
    await this.client.rest.delete(Routes.channelMessageAllReactions(channelId, messageId));
    channel.messages.cache.get(messageId)?.reactions.cache.clear();
  }

  /**
   * Removes the reactions on a message of the board just edited (plan 8R-9G). Never fails the
   * edit: a message gone meanwhile is nothing, any other failure is logged once per channel
   * until a removal there works again.
   */
  private async clearAfterEdit(
    channel: CachedMessages,
    channelId: string,
    messageId: string,
  ): Promise<void> {
    try {
      await this.removeAllReactions(channel, channelId, messageId);
      this.reactionsFailedIn.delete(channelId);
    } catch (err) {
      if (isGone(err) || this.reactionsFailedIn.has(channelId)) return;
      this.reactionsFailedIn.add(channelId);
      this.log?.warn(
        { err, channel: channelId, message: messageId },
        'could not remove the reactions on a message in the board',
      );
    }
  }

  async renamePost(
    postId: string,
    title: string,
  ): Promise<'renamed' | 'gone' | { laterMs: number }> {
    const post = await this.post(postId);
    if (!post) return 'gone';
    try {
      const done = await this.done(async () => {
        await this.reopen(post);
        await post.setName(title);
      });
      return done ? 'renamed' : 'gone';
    } catch (err) {
      // A limit on the reopening is thrown with the rest; the service waits for it as well.
      const wait = rateLimitWaitMs(err);
      if (wait !== undefined) return { laterMs: wait };
      throw err;
    }
  }

  async setPostTags(postId: string, tagIds: readonly string[]): Promise<boolean> {
    const post = await this.post(postId);
    if (!post) return false;
    return this.done(async () => {
      await this.reopen(post);
      await post.setAppliedTags([...tagIds]);
    });
  }

  async pinPost(postId: string): Promise<boolean> {
    const post = await this.post(postId);
    if (!post) return false;
    return this.done(async () => {
      await this.reopen(post);
      await post.pin();
    });
  }

  async openBoard(postId: string): Promise<boolean> {
    const post = await this.post(postId);
    if (!post) return false;
    return this.done(async () => {
      // Discord changes nothing but `archived` on an archived thread: open it first.
      await this.reopen(post);
      await post.edit({ locked: false, rateLimitPerUser: BOARD_SLOWMODE_SECONDS });
    });
  }

  async setBoardSlowmode(postId: string): Promise<boolean> {
    const post = await this.post(postId);
    if (!post) return false;
    return this.done(async () => {
      // As `openBoard`; left open afterwards, as the board's edits and pins leave it.
      await this.reopen(post);
      await post.edit({ rateLimitPerUser: BOARD_SLOWMODE_SECONDS });
    });
  }

  async archivePost(postId: string): Promise<boolean> {
    const post = await this.post(postId);
    if (!post) return false;
    if (post.archived && post.locked) return true;
    return this.done(async () => {
      // Discord changes nothing but `archived` on an archived thread: open it to lock it.
      await this.reopen(post);
      await post.edit({ locked: true, archived: true });
    });
  }

  async setAutoArchive(postId: string, minutes: AutoArchiveMinutes): Promise<boolean> {
    const post = await this.post(postId);
    if (!post) return false;
    // An archived post stays shut: opening it to set this would show it as active again.
    if (post.archived) return true;
    return this.done(() => post.edit({ autoArchiveDuration: minutes }));
  }

  async archiveUnlocked(postId: string): Promise<boolean> {
    const post = await this.post(postId);
    if (!post) return false;
    if (post.archived) return true;
    return this.done(() => post.setArchived(true));
  }

  async lockPost(postId: string): Promise<boolean> {
    const post = await this.post(postId);
    if (!post) return false;
    if (post.locked === true) return true;
    return this.done(async () => {
      // Discord changes nothing but `archived` on an archived thread: open it to lock it.
      await this.reopen(post);
      await post.edit({ locked: true });
    });
  }

  async archivedPosts(forumId: string): Promise<string[] | undefined> {
    const forum = await this.forum(forumId);
    if (!forum) return undefined;
    const me = this.client.user?.id;
    const found: string[] = [];
    let before: number | undefined;
    // Newest archived first, a page of 100 at a time, as Discord gives them.
    for (let read = 0; read < ARCHIVED_POSTS_READ; read += 100) {
      const page = await this.unlessGone(() =>
        forum.threads.fetchArchived({
          type: 'public',
          limit: 100,
          ...(before === undefined ? {} : { before }),
        }),
      );
      if (!page) return read === 0 ? undefined : found;
      const threads = [...page.threads.values()];
      found.push(...threads.filter((thread) => thread.ownerId === me).map((thread) => thread.id));
      before = threads.at(-1)?.archiveTimestamp ?? undefined;
      if (!page.hasMore || before === undefined) break;
    }
    return found;
  }

  async letBotManagePosts(
    forumId: string,
  ): Promise<'allowed' | 'was-allowed' | 'not-allowed' | undefined> {
    const forum = await this.forum(forumId);
    if (!forum) return undefined;
    const me = forum.guild.members.me;
    if (!me) return 'not-allowed';
    const manage = PermissionFlagsBits.ManageThreads;
    if (forum.permissionOverwrites.cache.get(me.id)?.allow.has(manage) === true) {
      return 'was-allowed';
    }
    try {
      await forum.permissionOverwrites.edit(
        me,
        { ManageThreads: true },
        { reason: 'The bot pins, locks and archives the posts of this forum' },
      );
    } catch (err) {
      if (isMissingPermission(err)) return 'not-allowed';
      if (hasCode(err, RESTJSONErrorCodes.UnknownChannel)) return undefined;
      throw err;
    }
    return 'allowed';
  }

  async rolesWithoutReplies(
    forumId: string,
    roleNames: readonly string[],
  ): Promise<string[] | undefined> {
    const forum = await this.forum(forumId);
    if (!forum) return undefined;
    const everyone = forum.guild.roles.everyone;
    const named = roleNames.flatMap((name) => {
      const role = [...forum.guild.roles.cache.values()].find((one) => one.name === name);
      return role ? [role] : [];
    });
    // Only a role that sees the forum and cannot write in its posts (re-review RR-4): a server
    // that keeps @everyone out of its channels is no fault of the forum's.
    return [everyone, ...named]
      .filter((role) => {
        const has = forum.permissionsFor(role);
        return (
          has?.has(PermissionFlagsBits.ViewChannel) === true &&
          !has.has(PermissionFlagsBits.SendMessagesInThreads)
        );
      })
      .map((role) => (role.id === everyone.id ? '@everyone' : role.name));
  }

  async openPosts(forumId: string): Promise<string[] | undefined> {
    const forum = await this.forum(forumId);
    if (!forum) return undefined;
    const active = await this.unlessGone(() => forum.threads.fetchActive());
    if (!active) return undefined;
    const me = this.client.user?.id;
    return [...active.threads.values()]
      .filter((thread) => thread.ownerId === me)
      .sort((a, b) => (a.createdTimestamp ?? 0) - (b.createdTimestamp ?? 0))
      .map((thread) => thread.id);
  }

  async deletePost(postId: string): Promise<void> {
    const post = await this.post(postId);
    if (!post) return;
    await this.done(() => post.delete());
  }

  mayDeletePost(postId: string): boolean {
    const post = this.client.channels.cache.get(postId);
    return !post?.isThread() || DiscordPartyGateway.managesThreads(post);
  }

  /**
   * What the bot lacks in a forum to make a post (`postNeeds`, by the names a forum's settings
   * show: Manage Posts only for a post with a moderated tag), from the cache; nothing where the
   * bot's member is not in it.
   */
  private static lacksForPosts(forum: ForumChannel, moderatedTag: boolean): string[] {
    const me = forum.guild.members.me;
    if (me === null) return [];
    const has = forum.permissionsFor(me)?.bitfield ?? 0n;
    return postNeeds(moderatedTag).filter((name) => (has & POST_FLAGS[name]) !== POST_FLAGS[name]);
  }

  /** Whether any of these tags is moderated, as the forum lists its tags (Pine's are). */
  private static anyModerated(forum: ForumChannel, tagIds: readonly string[]): boolean {
    const moderated = new Set(
      forum.availableTags.filter((tag) => tag.moderated).map((tag) => tag.id),
    );
    return tagIds.some((id) => moderated.has(id));
  }

  /** Whether the bot has Manage Threads in a post, from the cache: unknown counts as allowed. */
  private static managesThreads(post: AnyThreadChannel): boolean {
    const me = post.guild.members.me;
    return (
      me === null || (post.permissionsFor(me)?.has(PermissionFlagsBits.ManageThreads) ?? false)
    );
  }

  async deleteChannel(channelId: string, reason?: string): Promise<void> {
    const channel = await this.unlessGone(() => this.client.channels.fetch(channelId));
    if (!channel) return;
    await this.done(() => channel.delete(reason));
  }

  async sendMessage(
    channelId: string,
    message: OutgoingMessage,
    options?: SendOptions,
  ): Promise<string | undefined> {
    const channel = await this.unlessGone(() => this.client.channels.fetch(channelId));
    if (!channel?.isSendable()) return undefined;
    const id = await this.unlessGone(async () => {
      // An archived locked post refuses a message (50083) until it is opened (plan 8R-9, B3).
      if (options?.reopen === true && channel.isThread()) await this.reopen(channel);
      return (await channel.send(sendPayload(message, options))).id;
    });
    this.noteSent(id, message);
    return id;
  }

  async editMessage(
    channelId: string,
    messageId: string,
    message: OutgoingMessage,
    options?: EditOptions,
  ): Promise<boolean> {
    const channel = await this.unlessGone(() => this.client.channels.fetch(channelId));
    if (!channel?.isTextBased()) return false;
    return this.done(async () => {
      if (channel.isThread()) await this.reopen(channel);
      const edited = await editAs(
        message,
        (payload) => channel.messages.edit(messageId, payload),
        (body, files) =>
          this.client.rest.patch(Routes.channelMessage(channelId, messageId), { body, files }),
        this.editHow(messageId, options),
      );
      this.noteSent(messageId, message);
      if (options?.clearReactions === true && carriesReactions(edited)) {
        await this.clearAfterEdit(channel, channelId, messageId);
      }
    });
  }

  async deleteMessage(
    channelId: string,
    messageId: string,
    options?: DeleteOptions,
  ): Promise<void> {
    const channel = await this.unlessGone(() => this.client.channels.fetch(channelId));
    if (!channel?.isTextBased()) return;
    await this.done(async () => {
      // An archived post refuses a deletion (50083) until it is opened (plan 8R-9, B3).
      if (options?.reopen === true && channel.isThread()) await this.reopen(channel);
      await channel.messages.delete(messageId);
    });
  }

  async postAccess(postId: string): Promise<PostAccess> {
    const post = await this.post(postId);
    if (!post) return 'v2';
    const me = post.guild.members.me;
    const has = me === null ? null : post.parent?.permissionsFor(me);
    // Unknown counts as allowed: Discord decides.
    if (!has) return 'v2';
    if (!has.has(WRITES_IN_BOARD)) return 'refused';
    // A locked post takes Manage Posts to write in (160005): a moderator may lock the board.
    if (post.locked === true && !has.has(PermissionFlagsBits.ManageThreads)) return 'refused';
    return has.has(PermissionFlagsBits.EmbedLinks) ? 'v2' : 'plain';
  }

  async boardMessages(postId: string, limit: number): Promise<BoardMessage[] | undefined> {
    const post = await this.post(postId);
    if (!post) return undefined;
    const fetched = await this.unlessGone(() => post.messages.fetch({ limit }));
    if (!fetched) return undefined;
    const me = this.client.user?.id;
    return [...fetched.values()].map((message) => ({
      id: message.id,
      authorId: message.author.id,
      by:
        message.author.id === me
          ? 'me'
          : message.author.bot || message.webhookId !== null
            ? 'bot'
            : 'member',
      system: message.system,
      createdAt: message.createdTimestamp,
      reacted: message.reactions.cache.size > 0,
    }));
  }

  async clearReactions(
    channelId: string,
    messageId: string,
  ): Promise<'cleared' | 'gone' | 'not-allowed'> {
    try {
      const post = await this.post(channelId);
      if (!post) return 'gone';
      const cleared = await this.done(async () => {
        // An archived post refuses it (50083): opened, and left open, as the board's deletes do.
        await this.reopen(post);
        await this.removeAllReactions(post, channelId, messageId);
      });
      return cleared ? 'cleared' : 'gone';
    } catch (err) {
      if (isMissingPermission(err)) return 'not-allowed';
      throw err;
    }
  }

  async bulkDelete(
    channelId: string,
    messageIds: readonly string[],
    options?: DeleteOptions,
  ): Promise<'deleted' | 'gone' | 'not-allowed'> {
    try {
      const post = await this.post(channelId);
      if (!post) return 'gone';
      const deleted = await this.done(async () => {
        // An archived post refuses a deletion (50083) until it is opened (review W3).
        if (options?.reopen === true) await this.reopen(post);
        // `true`: one older than 14 days is passed over rather than refusing the whole request.
        await post.bulkDelete([...messageIds], true);
      });
      return deleted ? 'deleted' : 'gone';
    } catch (err) {
      if (isMissingPermission(err)) return 'not-allowed';
      throw err;
    }
  }

  async managesMessages(postId: string, memberId: string, fresh: boolean): Promise<boolean> {
    const post = await this.post(postId);
    if (!post) return false;
    const member = await fetchGuildMember(post.guild, memberId, fresh);
    return (
      member !== undefined && post.permissionsFor(member).has(PermissionFlagsBits.ManageMessages)
    );
  }

  mayDeleteMessages(forumId: string): boolean {
    const forum = this.client.channels.cache.get(forumId);
    if (forum?.type !== ChannelType.GuildForum) return true;
    const me = forum.guild.members.me;
    return me === null || forum.permissionsFor(me).has(PermissionFlagsBits.ManageMessages);
  }

  async unpinMessage(channelId: string, messageId: string): Promise<boolean> {
    const channel = await this.unlessGone(() => this.client.channels.fetch(channelId));
    if (!channel?.isTextBased() || channel.isDMBased()) return true;
    try {
      await this.done(() => channel.messages.unpin(messageId));
      return true;
    } catch (err) {
      if (isMissingPermission(err)) return false;
      throw err;
    }
  }

  async deleteReported(
    channelId: string,
    messageId: string,
    options?: ReportedDeleteOptions,
  ): Promise<'deleted' | 'gone' | 'not-allowed'> {
    try {
      const channel = await this.unlessGone(() => this.client.channels.fetch(channelId));
      if (!channel?.isTextBased()) return 'gone';
      // An archived post refuses a deletion (50083): opened for it, and archived again as it was
      // (locked or not) whether the deletion worked or not. Opening a locked post and archiving
      // it again need Manage Threads: without it nothing is opened (`not-allowed`).
      if (!channel.isThread() || channel.archived !== true) {
        return (await this.done(() => channel.messages.delete(messageId))) ? 'deleted' : 'gone';
      }
      const locked = channel.locked === true;
      if (options?.leaveOpen === true) {
        // Left open (review W3: the board): an unlocked post opens with Send Messages alone.
        if (locked && !DiscordPartyGateway.managesThreads(channel)) return 'not-allowed';
        await channel.setArchived(false);
        return (await this.done(() => channel.messages.delete(messageId))) ? 'deleted' : 'gone';
      }
      if (!DiscordPartyGateway.managesThreads(channel)) return 'not-allowed';
      await channel.setArchived(false);
      try {
        return (await this.done(() => channel.messages.delete(messageId))) ? 'deleted' : 'gone';
      } finally {
        // What came of the deletion stands: a refusal of the archiving is logged, not answered.
        await channel.edit({ locked, archived: true }).catch((err: unknown) => {
          this.log?.warn(
            { err, post: channelId },
            'could not archive a post again after deleting a reported message in it',
          );
        });
      }
    } catch (err) {
      if (isMissingPermission(err)) return 'not-allowed';
      throw err;
    }
  }

  /**
   * A region's gate as the cache has it: a forum, or the text (or announcement) channel of a
   * region that has none (plan 8H-5, `regionGate`; review F4: the same overwrites, so the same
   * rule as Share's). Undefined for a channel that is gone or of another kind. `cached`: from the
   * cache alone (with the Guilds intent it holds every channel of the bot's servers), so that a
   * look at many gates asks Discord nothing.
   */
  private async gate(gateId: string, cached = false): Promise<GateChannel | undefined> {
    const channel = cached
      ? this.client.channels.cache.get(gateId)
      : await this.unlessGone(() => this.client.channels.fetch(gateId));
    return channel?.type === ChannelType.GuildForum ||
      channel?.type === ChannelType.GuildText ||
      channel?.type === ChannelType.GuildAnnouncement
      ? channel
      : undefined;
  }

  async memberAccess(forumId: string, memberId: string): Promise<MemberAccess | undefined> {
    const forum = await this.gate(forumId);
    if (!forum) return undefined;
    // The interaction that brought the member here has put them into the cache with the roles
    // they have now; anybody else is asked for (that needs no privileged intent). Without the
    // GuildMembers intent the roles of somebody who did not just act (the others of a raid that
    // moves) are those of their last interaction: a role they got or lost since is not seen,
    // so a grant may be made that was not needed, or one for somebody a new role keeps out;
    // either ends with the party.
    const member = await fetchGuildMember(forum.guild, memberId);
    if (!member) return undefined;
    return DiscordPartyGateway.accessOf(forum, member);
  }

  /**
   * How a member stands to a gate (`MemberAccess`): `visible` by `viewsWith` over the roles they
   * hold (plan 8M-20, R1: one rule for what they see and what a role would make of it).
   */
  private static accessOf(forum: GateChannel, member: GuildMember): MemberAccess {
    const held = new Set(rolesBesideEveryone(member, forum.guild.id));
    if (viewsWith(forum, member, held)) return 'visible';
    // An entry of their own that sets nothing (what Discord's "reset to default" leaves behind)
    // keeps nobody out: it is as if it were not there, and `admitMember` replaces it.
    const own = forum.permissionOverwrites.cache.get(member.id);
    // The same holds for one that only allows: a member added to a private channel keeps
    // "Connect", which a forum's settings do not even show. Only a denial keeps them out.
    if (own && own.deny.bitfield !== 0n) return 'barred';
    return DiscordPartyGateway.roleDenies(forum, member, PermissionFlagsBits.ViewChannel, false)
      ? 'barred'
      : 'hidden';
  }

  async memberGates(
    guildId: string,
    memberId: string,
    gateIds: readonly string[],
    fresh: boolean,
  ): Promise<MemberGates | undefined> {
    const guild = this.client.guilds.cache.get(guildId);
    if (!guild) return undefined;
    const member = await fetchGuildMember(guild, memberId, fresh);
    if (!member) return undefined;
    const fetchedAt = Date.now();
    const gates = new Map<string, GateChannel>();
    for (const gateId of new Set(gateIds)) {
      const gate = await this.gate(gateId, true);
      // Only a gate of this server: another's says nothing of this member.
      if (gate?.guild.id === guildId) gates.set(gateId, gate);
    }
    return {
      held: rolesBesideEveryone(member, guildId),
      fetchedAt,
      access: new Map(
        [...gates].map(([id, gate]) => [id, DiscordPartyGateway.accessOf(gate, member)]),
      ),
      seesWith: (gateId, roleIds) => {
        const gate = gates.get(gateId);
        return gate !== undefined && viewsWith(gate, member, roleIds);
      },
      denials: (gateId) => {
        const gate = gates.get(gateId);
        if (!gate) return { own: false, roles: [] };
        const view = PermissionFlagsBits.ViewChannel;
        const own = gate.permissionOverwrites.cache.get(member.id);
        return {
          own: own?.type === OverwriteType.Member && own.deny.has(view),
          roles: gate.permissionOverwrites.cache
            .filter(
              (overwrite) =>
                overwrite.type === OverwriteType.Role &&
                overwrite.id !== guildId &&
                member.roles.cache.has(overwrite.id) &&
                overwrite.deny.has(view),
            )
            .map((overwrite) => overwrite.id),
        };
      },
    };
  }

  async ownViewDenied(channelId: string, memberId: string): Promise<boolean> {
    const channel = await this.unlessGone(() => this.client.channels.fetch(channelId));
    if (!channel || channel.isDMBased() || channel.isThread()) return false;
    const own = channel.permissionOverwrites.cache.get(memberId);
    return own?.type === OverwriteType.Member && own.deny.has(PermissionFlagsBits.ViewChannel);
  }

  /**
   * Whether the forum (or text channel) has an overwrite that denies a permission to a role the
   * member holds; `everybody` says whether the role everybody has counts.
   */
  private static roleDenies(
    forum: ForumChannel | TextChannel | NewsChannel,
    member: GuildMember,
    permission: bigint,
    everybody: boolean,
  ): boolean {
    return forum.permissionOverwrites.cache.some(
      (overwrite) =>
        overwrite.type === OverwriteType.Role &&
        (everybody || overwrite.id !== forum.guild.id) &&
        member.roles.cache.has(overwrite.id) &&
        overwrite.deny.has(permission),
    );
  }

  async admitMember(forumId: string, memberId: string): Promise<boolean> {
    const forum = await this.forum(forumId);
    if (!forum) return false;
    // Somebody whose role may not write in this forum (a muted member, a forum for reading
    // only) is let in to read: a member's own overwrite would beat what the role says.
    // Asked of Discord afresh (`fresh`), never answered from the cache: the cache keeps a
    // limited number of members as their last interaction left them, so a member who was
    // muted since would be let in to write, and so would one who is not in it.
    const member = await fetchGuildMember(forum.guild, memberId, true);
    const muted =
      member !== undefined &&
      DiscordPartyGateway.roleDenies(
        forum,
        member,
        PermissionFlagsBits.SendMessagesInThreads,
        true,
      );
    const { SendMessagesInThreads: _write, ...readOnly } = ADMITTED;
    return this.done(() =>
      // The type is given, so discord.js does not look for the member in its cache.
      forum.permissionOverwrites.create(memberId, muted ? readOnly : ADMITTED, {
        type: OverwriteType.Member,
        reason: 'Signed up for a party in this forum',
      }),
    );
  }

  async dismissMember(forumId: string, memberId: string): Promise<boolean> {
    const forum = await this.forum(forumId);
    if (!forum) return true;
    // Only what `admitMember` made: an overwrite a moderator changed since (to keep the member
    // out, or to give them more) is theirs. The cache follows the channel with the Guilds intent.
    const own = forum.permissionOverwrites.cache.get(memberId);
    if (
      own &&
      (own.type !== OverwriteType.Member ||
        own.deny.bitfield !== 0n ||
        !own.allow.has(PermissionFlagsBits.ViewChannel) ||
        (own.allow.bitfield & ~ADMITTED_BITS) !== 0n)
    ) {
      return false;
    }
    try {
      await forum.permissionOverwrites.delete(
        memberId,
        'No longer signed up for a party in this forum',
      );
    } catch (err) {
      const gone = hasCode(
        err,
        RESTJSONErrorCodes.UnknownChannel,
        RESTJSONErrorCodes.UnknownPermissionOverwrite,
      );
      if (!gone) throw err;
    }
    return true;
  }

  guildName(guildId: string): string | undefined {
    return this.client.guilds.cache.get(guildId)?.name;
  }

  channelName(channelId: string): string | undefined {
    const channel = this.client.channels.cache.get(channelId);
    return channel && 'name' in channel && typeof channel.name === 'string'
      ? channel.name
      : undefined;
  }

  findChannel(nearChannelId: string, name: string): string | undefined {
    const near = this.client.channels.cache.get(nearChannelId);
    if (!near || near.isDMBased()) return undefined;
    const me = near.guild.members.me;
    const found = near.guild.channels.cache
      .filter(
        (channel) =>
          channel.type === ChannelType.GuildText &&
          channel.name === name &&
          // Unknown (the bot's own member is not cached) counts as allowed: Discord will say.
          (me === null || (channel.permissionsFor(me)?.has(CAN_POST) ?? false)),
      )
      .sort((a, b) => (a.createdTimestamp ?? 0) - (b.createdTimestamp ?? 0))
      .first();
    return found?.id;
  }

  mayPost(channelId: string): boolean {
    const channel = this.client.channels.cache.get(channelId);
    if (!channel || channel.isDMBased()) return true;
    const me = channel.guild.members.me;
    // An unknown channel or member counts as allowed because nothing better is known: Discord
    // would not say (it drops the embed silently). On a ready client the bot's own member is
    // always cached, so this does not happen for it.
    return me === null || (channel.permissionsFor(me)?.has(CAN_POST) ?? false);
  }

  mayShare(channelId: string): boolean {
    const channel = this.client.channels.cache.get(channelId);
    if (!channel || channel.isDMBased()) return true;
    // An ended post (archived and locked) refuses a message (50083); a share never opens it.
    if (channel.isThread() && channel.archived === true && channel.locked === true) return false;
    const me = channel.guild.members.me;
    if (me === null) return true;
    const send = channel.isThread()
      ? PermissionFlagsBits.SendMessagesInThreads
      : PermissionFlagsBits.SendMessages;
    return channel.permissionsFor(me)?.has([PermissionFlagsBits.ViewChannel, send]) ?? false;
  }

  async shareKeeps(
    shareChannelId: string,
    regionChannelIds: readonly string[],
  ): Promise<ReadonlySet<string> | undefined> {
    const cache = this.client.channels.cache;
    const shared = cache.get(shareChannelId);
    if (!shared || shared.isDMBased()) return undefined;
    const into = shared.isThread() ? shared.parent : shared;
    if (!into) return undefined;
    const { guild } = into;
    const overwrites = (channel: GuildChannel): ApiOverwrite[] =>
      [...channel.permissionOverwrites.cache.values()].map((one) => ({
        id: one.id,
        type: one.type,
        allow: String(one.allow.bitfield),
        deny: String(one.deny.bitfield),
      }));
    const share = overwrites(into);
    // Members the share channel lets in by name are asked of Discord afresh (8H5-4: the cache
    // keeps a member's roles as their last interaction left them), each answer used for a
    // minute, somebody no longer in the server too; at most `SHARE_MEMBER_FETCHES` a Share,
    // those the cache lacks first (R2). One past them is taken from the cache; one who cannot be
    // fetched (nor is in the cache) stays unknown, and drops the region.
    const now = Date.now();
    this.shareMembers.dropWhile((answer) => now - answer.at >= SHARE_MEMBER_FRESH_MS);
    const keyOf = (id: string) => `${guild.id}:${id}`;
    const toAsk = namedViewers(share)
      .filter((id) => !this.shareMembers.has(keyOf(id)))
      .sort((a, b) => Number(guild.members.cache.has(a)) - Number(guild.members.cache.has(b)));
    await Promise.all(
      toAsk.slice(0, SHARE_MEMBER_FETCHES).map(async (id) => {
        try {
          const member = await fetchGuildMember(guild, id, true);
          this.shareMembers.set(keyOf(id), {
            roles: member === undefined ? null : rolesBesideEveryone(member, guild.id),
            at: now,
          });
        } catch (err) {
          this.log?.debug({ err, member: id }, 'could not fetch a member a shared tally asks of');
        }
      }),
    );
    const regions = regionChannelIds.flatMap((id) => {
      const channel = cache.get(id);
      return channel && !channel.isDMBased() && !channel.isThread() && channel.guild.id === guild.id
        ? [{ id, overwrites: overwrites(channel) }]
        : [];
    });
    return regionsKept({
      guildId: guild.id,
      roles: [...guild.roles.cache.values()].map((role) => ({
        id: role.id,
        permissions: role.permissions.bitfield,
      })),
      share,
      shareIds: [shared.id, into.id],
      regions,
      rolesOf: (memberId) => {
        const asked = this.shareMembers.get(keyOf(memberId));
        if (asked !== undefined) return asked.roles;
        const member = guild.members.cache.get(memberId);
        return member === undefined ? undefined : rolesBesideEveryone(member, guild.id);
      },
    });
  }

  emoji(channelId: string, name: string): string | undefined {
    const channel = this.client.channels.cache.get(channelId);
    if (!channel || channel.isDMBased()) return undefined;
    return channel.guild.emojis.cache.find((candidate) => candidate.name === name)?.toString();
  }

  serverChannels(guildId: string): ServerChannel[] | undefined {
    const guild = this.client.guilds.cache.get(guildId);
    if (!guild) return undefined;
    return [...guild.channels.cache.values()]
      .filter((channel) => !channel.isThread())
      .sort((a, b) => (a.createdTimestamp ?? 0) - (b.createdTimestamp ?? 0))
      .map((channel) => ({
        id: channel.id,
        name: channel.name,
        kind: DiscordPartyGateway.kindOf(channel.type),
        categoryId: channel.type === ChannelType.GuildCategory ? null : channel.parentId,
      }));
  }

  channelKind(channelId: string): ServerChannel['kind'] | undefined {
    const channel = this.client.channels.cache.get(channelId);
    if (!channel) return undefined;
    return DiscordPartyGateway.kindOf(channel.type);
  }

  private static kindOf(type: ChannelType): ServerChannel['kind'] {
    return type === ChannelType.GuildText
      ? 'text'
      : type === ChannelType.GuildCategory
        ? 'category'
        : type === ChannelType.GuildForum
          ? 'forum'
          : 'other';
  }

  mayCreateChannels(guildId: string): boolean {
    const me = this.client.guilds.cache.get(guildId)?.members.me;
    return me?.permissions.has(PermissionFlagsBits.ManageChannels) ?? false;
  }

  createCategory(
    guildId: string,
    name: string,
    reason?: string,
    like?: string,
  ): Promise<CreatedChannel> {
    return this.createChannel(guildId, name, ChannelType.GuildCategory, null, reason, like);
  }

  createTextChannel(
    guildId: string,
    name: string,
    categoryId: string | null,
    reason?: string,
  ): Promise<CreatedChannel> {
    return this.createChannel(guildId, name, ChannelType.GuildText, categoryId, reason);
  }

  private async createChannel(
    guildId: string,
    name: string,
    type: ChannelType.GuildCategory | ChannelType.GuildText,
    parent: string | null,
    reason = 'For a region',
    like?: string,
  ): Promise<CreatedChannel> {
    const guild = this.client.guilds.cache.get(guildId);
    if (!guild) return { ok: false, reason: 'no-server' };
    // A category deleted meanwhile is refused by Discord as a bad form, which reads like a
    // full one: asked of the cache first.
    if (parent !== null && guild.channels.cache.get(parent)?.type !== ChannelType.GuildCategory) {
      return { ok: false, reason: 'no-server' };
    }
    // A category that continues another (`like`) has its permissions from its first moment on,
    // never open in between; one gone meanwhile has none to give.
    const base = like === undefined ? undefined : guild.channels.cache.get(like);
    const continues = base?.type === ChannelType.GuildCategory ? base : undefined;
    if (like !== undefined && !continues) return { ok: false, reason: 'base-gone' };
    try {
      const made = await guild.channels.create({
        name,
        type,
        parent,
        reason,
        ...(continues
          ? {
              permissionOverwrites: continues.permissionOverwrites.cache.map((one) => ({
                id: one.id,
                type: one.type,
                allow: one.allow.bitfield,
                deny: one.deny.bitfield,
              })),
            }
          : {}),
      });
      // Right after the one it continues: a position given at creation shifts nothing, so it is
      // moved once made, and where it stands is no reason to fail.
      if (continues && 'setPosition' in made) {
        await made.setPosition(continues.position + 1).catch((err: unknown) => {
          this.log?.warn(
            { err, category: made.id, after: continues.id },
            'could not move a new category after the one it continues',
          );
        });
      }
      return { ok: true, id: made.id, name: made.name };
    } catch (err) {
      if (isMissingPermission(err)) return { ok: false, reason: 'no-permission' };
      // A full category is refused as a bad form, with the parent named as what is wrong.
      const full = channelLimitOf(err);
      if (full) return { ok: false, reason: full === 'server' ? 'server-full' : 'category-full' };
      if (isGone(err)) return { ok: false, reason: 'no-server' };
      if (isRefusedBody(err)) return { ok: false, reason: 'bad-name' };
      throw err;
    }
  }
}
