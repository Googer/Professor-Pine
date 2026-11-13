import { basename } from 'node:path';
import {
  ButtonStyle,
  ComponentType,
  DiscordAPIError,
  OverwriteType,
  PermissionFlagsBits,
  PermissionsBitField,
  RESTJSONErrorCodes,
  SnowflakeUtil,
} from 'discord.js';
import {
  channelPermissions,
  namedViewers,
  regionsKept,
  type ApiOverwrite,
} from '../../src/ops/permissions.js';

import type { ServerChannel } from '../../src/domain/regions/region-import.js';
import type {
  AutoArchiveMinutes,
  BoardMessage,
  CreatedChannel,
  EditOptions,
  EveryoneGates,
  ForumAccess,
  ForumHiding,
  MemberAccess,
  MemberGates,
  NewPost,
  OutgoingMessage,
  PartyGateway,
  DeleteOptions,
  PostAccess,
  ReportedDeleteOptions,
  SendOptions,
  TagIds,
} from '../../src/discord/party-gateway.js';
import {
  categoryOnlyPermissions,
  hiddenForumOverwrites,
  isHiddenForum,
  ARCHIVED_POSTS_READ,
  MAX_FORUM_TAGS,
  BOARD_SLOWMODE_SECONDS,
  PostsRefusedError,
  SHARE_MEMBER_FETCHES,
} from '../../src/discord/party-gateway.js';
import { postNeeds } from '../../src/domain/party/post-permissions.js';
import { Tally } from './tally.js';

/**
 * The everyone role's permissions in the fake's server unless a test gives them (Discord's
 * default).
 */
const DEFAULT_EVERYONE = PermissionFlagsBits.ViewChannel | PermissionFlagsBits.SendMessages;

/** What Discord answers a change the bot lacks the permission for (50013). */
export function missingPermissions(method: string): DiscordAPIError {
  const code = RESTJSONErrorCodes.MissingPermissions;
  return new DiscordAPIError({ code, message: 'Missing Permissions' }, code, 403, method, '/x', {});
}

/**
 * What undici gives while Windows' DNS is away (the staging of 8X-G): a request the network failed,
 * not a refusal of Discord's (`isNetworkError`).
 */
export function networkAway(): Error {
  return new TypeError('fetch failed', {
    cause: Object.assign(new Error('getaddrinfo ENOTFOUND discord.com'), { code: 'ENOTFOUND' }),
  });
}

/** Discord's refusal of a deletion in an archived post (50083). */
export function archivedThread(method = 'DELETE'): DiscordAPIError {
  const code = RESTJSONErrorCodes.InvalidActionOnArchivedThread;
  return new DiscordAPIError(
    { code, message: 'Thread is archived' },
    code,
    400,
    method,
    '/channels/1/messages/2',
    {},
  );
}

/** Discord's refusal of a new channel in a server that has 500. */
export function serverFull(): DiscordAPIError {
  const code = RESTJSONErrorCodes.MaximumNumberOfGuildChannelsReached;
  return new DiscordAPIError(
    { code, message: 'Maximum number of guild channels reached (500)' },
    code,
    400,
    'POST',
    '/guilds/1/channels',
    {},
  );
}

export interface FakePost {
  id: string;
  forumId: string;
  title: string;
  message: OutgoingMessage;
  /**
   * The names of the files the first message has: those it was sent with, replaced by those of
   * an edit that names its files (`V2Message.files`, none too), kept by one that does not.
   */
  attachments: string[];
  tagIds: string[];
  pinned: boolean;
  /** Archived and locked by `archivePost`; anything sent or edited in the post opens it again. */
  archived: boolean;
  locked: boolean;
  /** Its slowmode in seconds (`openBoard` sets the board's, plan 8R-9F); 0 where none. */
  slowmode: number;
  /** After how many minutes without a message Discord archives it: a week, unless set. */
  autoArchiveMinutes: AutoArchiveMinutes;
  /** How often something opened the post again after it was archived. */
  reopened: number;
  /** How often the first message was edited, the title changed, the tags set. */
  edits: number;
  renames: number;
  retags: number;
}

export interface FakeMessage {
  id: string;
  channelId: string;
  message: OutgoingMessage;
  /** The names of the files the message has, as `FakePost.attachments`. */
  attachments: string[];
  /** How often the message was edited. */
  edits: number;
  /** Sent without notifying anybody (`SendOptions.silent`, plan 8R-9). */
  silent?: boolean;
}

/** The names of the files a message carries (by their base names), or undefined: it names none. */
function filesOf(message: OutgoingMessage): string[] | undefined {
  if (!message.v2 || message.files === undefined) return undefined;
  return message.files.map((file) => (typeof file === 'string' ? basename(file) : file.name));
}

type Method = keyof PartyGateway;

/** The `errors` of an answer of Discord (the fields it refused), whose type discord.js does not export. */
export type DiscordErrorFields = NonNullable<
  Extract<ConstructorParameters<typeof DiscordAPIError>[0], { code: unknown }>['errors']
>;

/**
 * What Discord answers for a message, title or tags it will not take: 400, Invalid Form Body
 * (50035), with the reason in the message, so that the code that retries on that answer (the
 * picture, the first message of a post) runs in tests as it does against Discord. `errors` names
 * the fields refused, as Discord does (`fieldError`).
 */
export function refusedBody(what: string, errors?: object): DiscordAPIError {
  return new DiscordAPIError(
    {
      code: RESTJSONErrorCodes.InvalidFormBodyOrContentType,
      message: `Invalid Form Body: ${what}`,
      ...(errors === undefined ? {} : { errors: errors as DiscordErrorFields }),
    },
    RESTJSONErrorCodes.InvalidFormBodyOrContentType,
    400,
    'POST',
    '/channels',
    {},
  );
}

/**
 * The `errors` of Invalid Form Body for one field: nested by its path (`components`, `0`, …), as
 * Discord names what it refused.
 */
function fieldError(path: readonly string[], code: string, message: string): object {
  return path.reduceRight<object>((inner, key) => ({ [key]: inner }), {
    _errors: [{ code, message }],
  });
}

/** What Discord answers for a message with neither content, embeds nor (v2) components: 50006. */
export function emptyMessage(): DiscordAPIError {
  return new DiscordAPIError(
    { code: RESTJSONErrorCodes.CannotSendAnEmptyMessage, message: 'Cannot send an empty message' },
    RESTJSONErrorCodes.CannotSendAnEmptyMessage,
    400,
    'POST',
    '/channels',
    {},
  );
}

/** What the bot keeps the text of a v2 message to (Discord documents no total). */
const TEXT_LIMIT = 4000;

/** A menu as Discord checks it: a string select (of a message or a form) or a checkbox group. */
export interface MenuLike {
  options?: { label?: unknown; value?: unknown; description?: unknown; default?: unknown }[];
  min_values?: number;
  max_values?: number;
  required?: boolean;
  placeholder?: unknown;
}

/**
 * Refuses a menu Discord would refuse, through `fail`: `least` (1 unless given) to `most`
 * options (25 for a select, 10 for a checkbox group, 2 to 10 for a radio group), each with a
 * label and a value of 1 to 100 characters and a description of at most 100, values unique; `min_values` (1 when not given) from 0 and `max_values` (1 for
 * a select, every option for a group, when not given) from 1, both within the options and in
 * order; no more options ticked by default than may be chosen; a placeholder of at most 150. In
 * a form (`inForm`) a menu may be left empty (`min_values: 0`) only when it says `required:
 * false`.
 */
export function checkMenu(
  menu: MenuLike,
  shape: { least?: number; most: number; group: boolean; inForm: boolean },
  fail: (what: string) => never,
): void {
  const options = menu.options ?? [];
  const least = shape.least ?? 1;
  if (options.length < least || options.length > shape.most) {
    fail(`${least} to ${shape.most} options, not ${options.length}`);
  }
  const values = new Set<unknown>();
  for (const option of options) {
    for (const text of [option.label, option.value]) {
      if (typeof text !== 'string' || text.length < 1 || text.length > 100) {
        fail("an option's label and value of 1 to 100 characters");
      }
    }
    if (typeof option.description === 'string' && option.description.length > 100) {
      fail("an option's description of at most 100 characters");
    }
    if (values.has(option.value)) fail(`the value ${String(option.value)} twice`);
    values.add(option.value);
  }
  const min = menu.min_values ?? 1;
  const max = menu.max_values ?? (shape.group ? options.length : 1);
  if (min < 0 || min > options.length || max < 1 || max > options.length || min > max) {
    fail(`min_values ${min} and max_values ${max} with ${options.length} options`);
  }
  if (shape.inForm && min === 0 && menu.required !== false) {
    fail('min_values 0 in a form needs required false');
  }
  const ticked = options.filter((option) => option.default === true).length;
  if (ticked > max) fail(`${ticked} options ticked by default, at most ${max}`);
  if (typeof menu.placeholder === 'string' && menu.placeholder.length > 150) {
    fail('a placeholder of at most 150 characters');
  }
}

/** A component of a v2 message as the fake looks at it: its type and whatever else it has. */
interface V2Component {
  type: ComponentType;
  components?: unknown;
  accessory?: unknown;
  [key: string]: unknown;
}

/**
 * A `PartyGateway` kept in memory: forums with tags, posts, and messages sent to channels and
 * posts. `gone` holds ids of things that were deleted by hand; `failing` makes the named methods
 * reject. `calls` lists every call in order, as `method id`.
 *
 * It is as strict as Discord where tests rely on it: a classic message needs content or an
 * embed, an embed keeps within its limits (title 256, description 4096, 25 fields with a name of
 * 1 to 256 and a value of 1 to 1024 characters that are not all white space, 6000 over all embeds
 * of a message with footers and author names); a components-v2 message carries neither, keeps
 * within the limits of `checkV2` and stays v2 through every edit; a title
 * is 1 to 100 characters, a post has at most five tags, all of the forum, a forum has one pinned
 * post, and nothing can be sent into a forum. Like Discord, it opens an archived post again for
 * anything that is edited or sent in it, and refuses a deletion in it (`archivedThread`, 50083)
 * until then, unless the deletion asks the gateway to open it (`reopen`, plan 8R-9). A message that was deleted, or whose id is in `gone`,
 * cannot be edited. In a channel of `noEmbeds` a message is kept without its embeds, which is
 * what Discord does to a message of a bot that lacks Embed Links: it refuses nothing.
 *
 * Everybody can see every forum unless `shutOut` says otherwise; `admitted` holds the permission
 * overwrites `admitMember` made, `barred` those with which somebody keeps a member out (by an
 * overwrite of the member's own, or of a role of theirs): `dismissMember` leaves such a member
 * alone and answers false. `memberAccess` only looks (in discord.js it reads the cache), so it
 * is not listed in `calls`.
 *
 * A server has the channels a test gives it (`addChannel`) and those created through the
 * gateway, which refuses as Discord does: without Manage Channels (`noCreating`), a name that
 * is not 1 to 100 characters, a server with 500 channels, a category with 50. A forum that is
 * deleted takes its posts along.
 *
 * Its answers come on `setImmediate`, so a test that needs a fixed time must fake only `Date`
 * (`vi.useFakeTimers({ toFake: ['Date'] })`), never all timers.
 */
export class FakePartyGateway implements PartyGateway {
  /**
   * The forums, with the channel of the region each was made for and the category it is in:
   * `categoryId`, or else, as Discord puts a forum made beside a channel, that channel's.
   */
  readonly forums = new Map<
    string,
    {
      name: string;
      regionChannelId?: string;
      categoryId?: string | null;
      tags: Record<string, string>;
    }
  >();
  readonly posts = new Map<string, FakePost>();
  readonly messages: FakeMessage[] = [];
  readonly deleted: { channelId: string; messageId: string }[] = [];
  readonly gone = new Set<string>();
  /**
   * Posts whose first message was deleted while the thread still exists: `editPost` answers false,
   * `postInfo` still answers.
   */
  readonly messageGone = new Set<string>();
  /**
   * Posts whose rename is refused as rate limited: `renamePost` answers `{ laterMs }` with the
   * wait given here.
   */
  readonly renameLater = new Map<string, number>();
  /** The ids of the posts deleted with `deletePost`, in order. */
  readonly deletedPosts: string[] = [];
  /** Posts that somebody else made in a forum: `openPosts` leaves them out. */
  readonly foreign = new Set<string>();
  /** The ids of the forums deleted with `deleteChannel`, in order. */
  readonly deletedChannels: string[] = [];
  readonly failing = new Map<Method, Error>();
  /**
   * The classic messages an edit made v2, in order: `direct` when the caller said it was classic
   * (`{ convert: true }`), false when the gateway converted it only after Discord refused the
   * plain edit (a request more).
   */
  readonly converted: { id: string; direct: boolean }[] = [];
  /** Makes every send and edit refuse (Invalid Form Body) a message with a thumbnail. */
  rejectThumbnails = false;
  /**
   * Makes every send and edit refuse (Invalid Form Body) a message with a button whose emoji is
   * a custom one (by id), as Discord refuses an emoji it does not know or the bot may not use.
   */
  rejectCustomEmoji = false;
  /** The same for the custom emoji of these ids alone: emoji deleted from the application. */
  readonly deletedEmojiIds = new Set<string>();
  /**
   * Refuses a message that carries files, sent or edited (a post's first message too), as
   * Discord does where the bot may not attach files: Missing Permissions (50013).
   */
  refuseFiles = false;
  /** How many sends and edits `refuseFiles` refused. */
  filesRefused = 0;
  /** The messages pinned per channel (`pin`, plan 8R-1's post before plan 8R-9). */
  private readonly pins = new Map<string, Set<string>>();
  /** Channels where the bot may not unpin (no Pin Messages). */
  readonly noPinning = new Set<string>();

  /** Refuses a message that uploads files while `refuseFiles` says so. */
  private checkFiles(message: OutgoingMessage): void {
    if (this.refuseFiles && (filesOf(message)?.length ?? 0) > 0) {
      this.filesRefused++;
      throw missingPermissions('files');
    }
  }
  /**
   * Makes `createPost` refuse a components-v2 message as the first message of a post: whether
   * Discord takes one there is not documented. `true` refuses it as Invalid Form Body (50035),
   * `'empty'` as an empty message (50006), which is what Discord answers when it drops the flag
   * of the post's nested message and finds neither content nor an embed.
   */
  refuseV2Starter: boolean | 'empty' = false;
  /**
   * Makes every new post go the moment it is made, before its components-v2 message is edited in
   * (its first message is refused as `refuseV2Starter` does): `PartyService` answers `no-post`
   * with nothing refused, a post lost while it was made.
   */
  losePosts = false;
  /**
   * The characters a components-v2 message may have over its text displays; a test lowers it to
   * have the messages of a post refused as Discord would refuse one too long.
   */
  textLimit = TEXT_LIMIT;
  readonly calls: string[] = [];
  readonly channelNames = new Map<string, string>();
  /**
   * Channels in which the bot may not send messages with embeds: `mayPost` answers false, and a
   * message sent or edited there all the same is kept without its embeds.
   */
  readonly noEmbeds = new Set<string>();
  /**
   * Channels, forums and posts where the bot may not delete what others wrote (Manage Messages,
   * Manage Threads; plan 8S-2): `mayDeletePost` answers false for a post there, and a reported
   * message there is not deleted (`deleteReported` answers `not-allowed`).
   */
  readonly noManaging = new Set<string>();
  /**
   * Forums where the bot lacks these permissions, by the names of `POST_PERMISSIONS` (plan
   * 8S-3): `createPost` throws `PostsRefusedError` naming those the post needs
   * (`postNeeds`: never Send Messages in Posts, Manage Posts only for a post with tags, which
   * are all moderated here as Pine makes them), as `DiscordPartyGateway` refuses it;
   * a post that needs none of them is made. An empty list: Discord refused all the same (Missing
   * Access), whatever the post. Manage Posts listed also refuses `pinPost` of a post there
   * (Missing Permissions), as Discord does.
   */
  readonly refusePosts = new Map<string, readonly string[]>();
  /** The forums in which only the bot makes posts (`reservePosts`). */
  readonly reserved = new Set<string>();
  /**
   * By forum: who sees it and cannot write in its posts (`@everyone` and role names;
   * `rolesWithoutReplies`, branch review BR-7, re-review RR-4). Everybody can, unless a test says
   * otherwise.
   */
  readonly noReplies = new Map<string, readonly string[]>();
  /** The forums whose posts the bot allowed itself to manage (`letBotManagePosts`, plan 8V-1). */
  readonly managedPosts = new Set<string>();
  /** The forums whose permissions the bot may not change. */
  readonly noReserving = new Set<string>();
  /**
   * The forums `hideForum` hid (rehearsal mode), with who may see them: a member not named there
   * cannot (the fake knows no roles, so staff roles only show here).
   */
  readonly hidden = new Map<string, { roleNames: string[]; memberIds: string[] }>();
  /**
   * Forums (by id) and region channels (by id, for a forum made beside them hidden) whose
   * permissions the bot may not set to hide them: `hideForum` answers refused (with whether
   * the forum's overwrites hide it already, `isHiddenForum`), and
   * `createForum` with `hidden` is refused as Discord refuses it (Missing Permissions).
   */
  readonly noHiding = new Set<string>();
  /**
   * The bot's permissions in the server, by its roles: every one (an administrator) unless a
   * test gives fewer. With them and the bot's own overwrite of a category (`categoryOverwrites`,
   * `BOT_ID`) the fake computes what the bot has where a forum is made or hidden, as Discord
   * does: a creation without Manage Channels there, and a hiding Discord would refuse (`hide`),
   * are refused.
   */
  botPermissions: bigint = PermissionsBitField.All;
  /**
   * Permissions Discord refuses to let the bot set in a forum's overwrites although it has them
   * where the forum is: how Discord checks the set of a bot that is no administrator against
   * its category is not documented, so a test can have the second hide of a new forum refused.
   */
  unsettable = 0n;
  /** The forums `createForum` made hidden from their first moment on. */
  readonly createdHidden: string[] = [];
  /** The server's roles, by id: their names and permissions (for `canSee` and hiding). */
  readonly serverRoles = new Map<
    string,
    { name: string; permissions: bigint; /** The bot a managed role is for. */ managedFor?: string }
  >();
  /** The roles of each member, by member id. */
  readonly memberRoles = new Map<string, string[]>();
  /** The overwrites of a category, by id, which a forum made in it takes over. */
  readonly categoryOverwrites = new Map<string, ApiOverwrite[]>();
  /**
   * The overwrites of a forum, by id, where a test gives them or the forum took them over: then
   * `canSee` answers by them, as Discord computes it (`src/ops/permissions.ts`).
   */
  readonly forumOverwrites = new Map<string, ApiOverwrite[]>();
  readonly emojis = new Map<string, string>();
  /** By forum: the members whose roles do not let them see it. */
  readonly outsiders = new Map<string, Set<string>>();
  /** By forum: the members `admitMember` let in with an overwrite of their own. */
  readonly admitted = new Map<string, Set<string>>();
  /**
   * By forum: the members somebody keeps out on purpose. A moderator who turns the bot's own
   * overwrite into a bar is: remove from `admitted`, add here.
   */
  readonly barred = new Map<string, Set<string>>();
  /** Members who are no longer in the server. */
  readonly leftServer = new Set<string>();
  /** The server of every channel (the fakes' `FAKE_GUILD_ID`). */
  guildId = '412345678901234567';
  /** The channels of servers as `serverChannels` lists them (`addChannel`). */
  readonly channels = new Map<
    string,
    { name: string; kind: ServerChannel['kind']; categoryId: string | null; guildId: string }
  >();
  /**
   * The servers (by snowflake) Discord says are unavailable (`serverAvailable`, plan 19B-1); their
   * channels are still listed, as the real one's cache keeps them.
   */
  readonly unavailableServers = new Set<string>();
  /** The servers (by snowflake) in which the bot may not create channels. */
  readonly noCreating = new Set<string>();
  /** The ids of the channels and categories that were created, in order. */
  readonly createdChannels: string[] = [];
  /**
   * A category made to continue another (`createCategory` with `like`): the one it was placed
   * right after, by its id. It takes that one's overwrites (`categoryOverwrites`) too.
   */
  readonly placedAfter = new Map<string, string>();
  /**
   * Refuses a category that continues another (`like`) as Discord refuses a bot that may not set
   * its overwrites: `no-permission`.
   */
  refuseCopies = false;
  /** What the server's audit log says of a channel created or deleted, by its id. */
  readonly auditReasons = new Map<string, string>();
  /** The edits of each post's message, by post (`postEdits`). */
  private readonly editsOf = new Map<string, Tally>();
  private next = 1;
  /**
   * The clock the ids of what the fake makes are of, in epoch milliseconds: unset, they are
   * `900000000000000001` and on (made in 2021); set, snowflakes of its time as Discord makes them,
   * for code that reads when something was made from its id (the events forum's cap, plan 8Z-2).
   */
  clock: (() => number) | undefined;

  private id(): string {
    const next = this.next++;
    if (this.clock === undefined) return `90000000000000${String(next).padStart(4, '0')}`;
    return SnowflakeUtil.generate({ timestamp: this.clock(), increment: BigInt(next) }).toString();
  }

  private begin(method: Method, id: string, listed: boolean): void {
    if (listed) this.calls.push(`${method} ${id}`);
    const failure = this.failing.get(method);
    if (failure) throw failure;
  }

  /** A forum that exists already, with these tags; gives its tag ids. */
  addForum(forumId: string, tagNames: readonly string[] = [], name = 'raids'): TagIds {
    const tags: Record<string, string> = {};
    for (const tag of tagNames) tags[tag] = this.id();
    this.forums.set(forumId, { name, tags });
    return tags;
  }

  /** These members cannot see the forum by their roles. */
  shutOut(forumId: string, ...memberIds: string[]): void {
    const outside = this.outsiders.get(forumId) ?? new Set<string>();
    for (const id of memberIds) outside.add(id);
    this.outsiders.set(forumId, outside);
  }

  /**
   * A member's permissions in the server, as `shareKeeps` takes them: the everyone role's
   * (`serverRoles` by the server's id, `DEFAULT_EVERYONE` unless a test gives it) and their
   * roles'; everything for an administrator.
   */
  private basePermissions(roleIds: readonly string[]): bigint {
    let permissions = this.serverRoles.get(this.guildId)?.permissions ?? DEFAULT_EVERYONE;
    for (const id of roleIds) permissions |= this.serverRoles.get(id)?.permissions ?? 0n;
    return (permissions & PermissionFlagsBits.Administrator) !== 0n
      ? PermissionsBitField.All
      : permissions;
  }

  /**
   * The roles a member holds (not the everyone role) as `canSee` and `memberGates` read them:
   * `memberRoles` unless a test points it elsewhere (the fake role server's members, plan 8M-20).
   */
  rolesOf: (memberId: string) => readonly string[] = (memberId) =>
    this.memberRoles.get(memberId) ?? [];

  /** The looks of `memberGates`, in order: whom, and whether fetched afresh. */
  readonly gateLooks: Array<{ memberId: string; fresh: boolean }> = [];

  /** Whether the member can see the forum now: by their roles, or because they were let in. */
  canSee(forumId: string, memberId: string): boolean {
    return this.seesHolding(forumId, memberId, this.rolesOf(memberId));
  }

  /**
   * Whether the member would see the forum holding these roles: by the overwrites where a test
   * gives them (`forumOverwrites`, the roles' permissions of `serverRoles`), else by `shutOut`,
   * which no role changes; a member let in or barred stays so whatever they hold.
   */
  private seesHolding(forumId: string, memberId: string, roleIds: readonly string[]): boolean {
    if (this.barred.get(forumId)?.has(memberId)) return false;
    const overwrites = this.forumOverwrites.get(forumId);
    if (overwrites) {
      if (this.admitted.get(forumId)?.has(memberId)) return true;
      const member = { id: memberId, roleIds };
      const seen = channelPermissions(
        this.basePermissions(member.roleIds),
        this.guildId,
        member,
        overwrites,
      );
      return (seen & PermissionFlagsBits.ViewChannel) !== 0n;
    }
    return (
      !this.outsiders.get(forumId)?.has(memberId) ||
      (this.admitted.get(forumId)?.has(memberId) ?? false)
    );
  }

  /** The posts of a forum, oldest first. */
  postsIn(forumId: string): FakePost[] {
    return [...this.posts.values()].filter((post) => post.forumId === forumId);
  }

  /**
   * The edits of a post's message that the gateway made, as a count a test can wait for: a post
   * edited in the background is awaited with `postEdits(postId).reached(n)`.
   */
  postEdits(postId: string): Tally {
    let edits = this.editsOf.get(postId);
    if (!edits) {
      edits = new Tally(`the edits of post ${postId}`);
      this.editsOf.set(postId, edits);
    }
    return edits;
  }

  /** The messages sent to a channel or post that were not deleted, oldest first. */
  messagesIn(channelId: string): FakeMessage[] {
    return this.messages.filter(
      (message) =>
        message.channelId === channelId &&
        !this.deleted.some((gone) => gone.messageId === message.id),
    );
  }

  createForum(
    regionChannelId: string,
    name: string,
    tagNames: readonly string[],
    hidden?: ForumAccess,
  ) {
    return this.attempt('createForum', regionChannelId, () => {
      if (this.gone.has(regionChannelId)) return undefined;
      if (hidden && this.noHiding.has(regionChannelId)) throw missingPermissions('POST');
      // Discord checks Manage Channels where the channel is made: in its category, if any.
      const categoryId = this.channels.get(regionChannelId)?.categoryId ?? null;
      const there = this.botIn(categoryId);
      if ((there & PermissionFlagsBits.ManageChannels) === 0n) throw missingPermissions('POST');
      // As Discord: 50 channels in a category (forums included), 500 in a server.
      const listed = this.serverChannels(this.guildId) ?? [];
      if (categoryId && listed.filter((one) => one.categoryId === categoryId).length >= 50) {
        throw refusedBody('parent_id', {
          parent_id: {
            _errors: [
              {
                code: 'CHANNEL_PARENT_MAX_CHANNELS',
                message: 'Maximum number of channels in category reached (50)',
              },
            ],
          },
        });
      }
      if (listed.length >= 500) throw serverFull();
      const forumId = this.id();
      // Refused before anything is made, as Discord refuses the creation as a whole; its
      // overwrites may give only what the bot has in the server.
      if (hidden) this.hide(forumId, hidden, this.botPermissions);
      const tags = this.addForum(forumId, tagNames, name);
      const forum = this.forums.get(forumId);
      if (forum) forum.regionChannelId = regionChannelId;
      if (hidden) {
        this.createdHidden.push(forumId);
      } else {
        // As Discord does: a forum made in a category takes over the category's overwrites.
        const inherited = categoryId ? this.categoryOverwrites.get(categoryId) : undefined;
        if (inherited) this.forumOverwrites.set(forumId, [...inherited]);
      }
      return { forumId, tags };
    });
  }

  /** The bot's own member id in the fake's server. */
  static readonly BOT_ID = '400000000000000001';

  /**
   * The bot's permissions in a category (its overwrites of everyone and of the bot itself over
   * `botPermissions`), or in the server for none, as Discord computes them.
   */
  private botIn(categoryId: string | null | undefined): bigint {
    const overwrites = categoryId ? (this.categoryOverwrites.get(categoryId) ?? []) : [];
    return channelPermissions(
      this.botPermissions,
      this.guildId,
      { id: FakePartyGateway.BOT_ID, roleIds: [] },
      overwrites,
    );
  }

  /** The category a forum is in: its own channel's, or that of the region it was made beside. */
  private categoryOfForum(forumId: string): string | null {
    const own = this.channels.get(forumId)?.categoryId;
    if (own !== undefined) return own;
    const region = this.forums.get(forumId)?.regionChannelId;
    return region === undefined ? null : (this.channels.get(region)?.categoryId ?? null);
  }

  /**
   * Sets a forum's overwrites as the real gateway does (`hiddenForumOverwrites`), with the bot's
   * permissions where Discord checks the set (`where`: the server for a creation, the category
   * for a forum hidden later), refused as Discord refuses them (Missing Permissions) for a bot
   * that is no administrator: a bot without Manage Roles there, an overwrite that allows or
   * denies a permission the bot lacks there, or Manage Roles in any overwrite ("Setting
   * MANAGE_ROLES permission in channels is only possible for guild administrators"). A
   * permission of `unsettable` is refused to any bot.
   */
  private hide(forumId: string, access: ForumAccess, where: bigint): void {
    const set = hiddenForumOverwrites(
      {
        everyoneId: this.guildId,
        botId: FakePartyGateway.BOT_ID,
        botHas: where,
        roles: [...this.serverRoles].map(([id, role]) => ({ id, ...role })),
      },
      access,
    );
    const touched = set.reduce((all, one) => all | one.allow | one.deny, 0n);
    if ((touched & this.unsettable) !== 0n) throw missingPermissions('PUT');
    if ((where & PermissionFlagsBits.Administrator) === 0n) {
      const refused =
        (where & PermissionFlagsBits.ManageRoles) === 0n ||
        (touched & ~where) !== 0n ||
        (touched & PermissionFlagsBits.ManageRoles) !== 0n;
      if (refused) throw missingPermissions('PUT');
    }
    this.forumOverwrites.set(
      forumId,
      set.map((one) => ({ ...one, allow: String(one.allow), deny: String(one.deny) })),
    );
    this.hidden.set(forumId, {
      roleNames: [...access.roleNames],
      memberIds: [...access.memberIds],
    });
  }

  reservePosts(forumId: string) {
    return this.attempt('reservePosts', forumId, () => {
      if (!this.forums.has(forumId) || this.gone.has(forumId)) return undefined;
      if (this.noReserving.has(forumId)) return 'not-allowed' as const;
      // The bot allows itself Send Messages there, as `DiscordPartyGateway` does: Create Posts
      // denied is denied no more.
      const lacking = this.refusePosts.get(forumId);
      if (lacking?.includes('Create Posts')) {
        const left = lacking.filter((name) => name !== 'Create Posts');
        if (left.length === 0) this.refusePosts.delete(forumId);
        else this.refusePosts.set(forumId, left);
      }
      if (this.reserved.has(forumId)) return 'was-reserved' as const;
      this.reserved.add(forumId);
      return 'reserved' as const;
    });
  }

  hideForum(
    forumId: string,
    access: { roleNames: readonly string[]; memberIds: readonly string[] },
  ) {
    return this.attempt('hideForum', forumId, (): ForumHiding => {
      if (!this.forums.has(forumId) || this.gone.has(forumId)) return undefined;
      const where = this.botIn(this.categoryOfForum(forumId));
      // As the real gateway answers Missing Permissions: the forum's overwrites are unchanged.
      const refused = () => ({
        refused: categoryOnlyPermissions(this.botPermissions, where),
        stillHidden: isHiddenForum(
          (this.forumOverwrites.get(forumId) ?? []).map((one) => ({
            ...one,
            allow: BigInt(one.allow),
            deny: BigInt(one.deny),
          })),
          {
            everyoneId: this.guildId,
            botId: FakePartyGateway.BOT_ID,
            roles: [...this.serverRoles].map(([id, role]) => ({ id, ...role })),
          },
          access,
        ),
      });
      if (this.noHiding.has(forumId)) return refused();
      try {
        this.hide(forumId, access, where);
      } catch {
        return refused();
      }
      return 'hidden';
    });
  }

  renameForum(forumId: string, name: string) {
    return this.attempt('renameForum', forumId, () => {
      if (this.gone.has(forumId)) return false;
      this.channelNames.set(forumId, name);
      const forum = this.forums.get(forumId);
      if (forum) forum.name = name;
      return true;
    });
  }

  ensureTags(forumId: string, tagNames: readonly string[]) {
    return this.attempt('ensureTags', forumId, () => {
      const forum = this.forums.get(forumId);
      if (!forum || this.gone.has(forumId)) return undefined;
      // As the gateway: what does not fit under Discord's limit is left out.
      for (const tag of tagNames) {
        if (Object.keys(forum.tags).length >= MAX_FORUM_TAGS) break;
        forum.tags[tag] ??= this.id();
      }
      return { ...forum.tags };
    });
  }

  removeTags(forumId: string, tagNames: readonly string[]) {
    return this.attempt('removeTags', forumId, () => {
      const forum = this.forums.get(forumId);
      if (!forum || this.gone.has(forumId)) return undefined;
      const had = tagNames.filter((tag) => tag in forum.tags);
      forum.tags = Object.fromEntries(
        Object.entries(forum.tags).filter(([tag]) => !had.includes(tag)),
      );
      return had.length;
    });
  }

  /**
   * Refuses what `rejectCustomEmoji` and `rejectThumbnails` say, naming the field as Discord
   * does: a deleted application emoji was `….emoji.id[COMPONENT_INVALID_EMOJI]` on the staging
   * run of 2026-10-17; for a picture Discord's code is not known, and the code reads only the
   * field (`….accessory.media.url`).
   */
  private checkPicture(message: OutgoingMessage): void {
    if ((this.rejectCustomEmoji || this.deletedEmojiIds.size > 0) && message.v2) {
      const button = FakePartyGateway.pathTo(message.components, (component) => {
        const id = (component.emoji as { id?: unknown } | undefined)?.id;
        return (
          component.type === ComponentType.Button &&
          id !== undefined &&
          (this.rejectCustomEmoji || (typeof id === 'string' && this.deletedEmojiIds.has(id)))
        );
      });
      if (button !== undefined) {
        throw refusedBody(
          'the emoji of a button was refused',
          fieldError([...button, 'emoji', 'id'], 'COMPONENT_INVALID_EMOJI', 'Invalid emoji'),
        );
      }
    }
    if (!this.rejectThumbnails) return;
    if (message.v2) {
      const thumbnail = FakePartyGateway.pathTo(
        message.components,
        (component) => component.type === ComponentType.Thumbnail,
      );
      if (thumbnail !== undefined) {
        throw refusedBody(
          'the picture was refused',
          fieldError([...thumbnail, 'media', 'url'], 'BASE_TYPE_INVALID', 'Invalid media'),
        );
      }
    } else if (message.embeds?.some((embed) => embed.thumbnail)) {
      throw refusedBody('the picture was refused');
    }
  }

  /** The path (`components`, `0`, …) of the first component `matches` takes, or undefined. */
  private static pathTo(
    components: readonly object[],
    matches: (component: V2Component) => boolean,
  ): string[] | undefined {
    const visit = (component: V2Component, path: string[]): string[] | undefined => {
      if (matches(component)) return path;
      if (Array.isArray(component.components)) {
        for (const [n, child] of component.components.entries()) {
          const found = visit(child as V2Component, [...path, 'components', String(n)]);
          if (found) return found;
        }
      }
      return component.accessory === undefined
        ? undefined
        : visit(component.accessory as V2Component, [...path, 'accessory']);
    };
    for (const [n, component] of components.entries()) {
      const found = visit(component as V2Component, ['components', String(n)]);
      if (found) return found;
    }
    return undefined;
  }

  /**
   * Refuses a message that Discord would refuse (see the class comment), as Discord does
   * (`refusedBody`). `textLimit` is the total of a v2 message's text displays: a test lowers it
   * on its gateway (`textLimit`) to have a message refused.
   */
  static checkMessage(
    message: OutgoingMessage,
    textLimit = TEXT_LIMIT,
    files?: ReadonlySet<string>,
  ): void {
    if ((message.mention?.users?.length ?? 0) > 100)
      throw refusedBody('a message pings at most 100 users');
    if (message.v2) {
      FakePartyGateway.checkV2(message, textLimit, files);
      return;
    }
    if ((message.content ?? '').length > 2000)
      throw refusedBody('a message has at most 2000 characters');
    if ((message.components?.length ?? 0) > 5) throw refusedBody('a message has at most 5 rows');
    for (const row of message.components ?? []) {
      if (row.components.length > 5) throw refusedBody('a row has at most 5 controls');
    }
    if (!message.content && !message.embeds?.length) {
      throw refusedBody('a message needs content or an embed');
    }
    FakePartyGateway.checkEmbeds(message.embeds ?? []);
  }

  /** Every component of a v2 message, nested ones (a section's accessory too), depth first. */
  static flatten(components: readonly object[]): V2Component[] {
    const all: V2Component[] = [];
    const visit = (component: V2Component): void => {
      all.push(component);
      if (Array.isArray(component.components)) {
        for (const child of component.components) visit(child as V2Component);
      }
      if (component.accessory !== undefined) visit(component.accessory as V2Component);
    };
    for (const component of components) visit(component as V2Component);
    return all;
  }

  /**
   * The limits of a components-v2 message: no content or embeds beside the flag, at least one
   * component and at most 40 counted with every nested one, at most 4,000 characters over its
   * text displays (Discord documents no total: the bot keeps to this), a text display of at
   * least one character, a section of one to three text displays and a button or thumbnail
   * beside them, a row of one to five controls, a button with a label of at most 80 characters
   * or an emoji or both (a custom emoji by its id and name, never as message text), a custom id of
   * at most 100 that no other control of the message has, buttons and select menus in rows (a
   * button also beside a section), a select menu alone in its row and as `checkMenu` says, a
   * thumbnail by an https address or a file of the message, a gallery of 1 to 10 pictures (by
   * https or a file of the message; Discord counts the gallery as one component, its items as
   * none), and no container but at the top. Also what the fake interactions hold an answer to
   * (`fake-interactions.ts`). A file is named `attachment://<name>`, and `files` are the names
   * of the files the message has: those it sends (`V2Message.files`, by their base names)
   * unless given; `'unchecked'` leaves that to the caller.
   */
  static checkV2(
    message: OutgoingMessage,
    textLimit: number = TEXT_LIMIT,
    files?: ReadonlySet<string> | 'unchecked',
  ): void {
    const refuse = (what: string): never => {
      throw refusedBody(what);
    };
    // Discord refuses the keys themselves, also when they are empty.
    if ('content' in message || 'embeds' in message)
      refuse('a v2 message has no content or embeds');
    const top = (message.components ?? []) as V2Component[];
    if (top.length === 0) refuse('a message needs a component');
    const attached =
      files ??
      new Set(
        (message.v2 ? (message.files ?? []) : []).map((file) =>
          typeof file === 'string' ? basename(file) : file.name,
        ),
      );
    /** An address of a file of the message, or of a picture elsewhere (https). */
    const checkUrl = (url: unknown, what: string, https: boolean): void => {
      if (typeof url !== 'string') return refuse(`${what} needs an address`);
      if (https && url.startsWith('https://')) return;
      const name = /^attachment:\/\/([^/]+)$/.exec(url)?.[1];
      if (name === undefined) {
        return refuse(
          https
            ? `${what} needs an https address or a file of the message (attachment://<name>)`
            : `${what} names a file of the message (attachment://<name>)`,
        );
      }
      if (attached !== 'unchecked' && !attached.has(name)) {
        return refuse(`${what} names ${url}, which the message does not have`);
      }
    };
    const all = FakePartyGateway.flatten(top);
    if (all.length > 40) refuse(`a message has at most 40 components, not ${all.length}`);
    const containers = all.filter((component) => component.type === ComponentType.Container);
    if (containers.some((container) => !top.includes(container))) {
      refuse('a container cannot be inside another component');
    }
    const accessories = new Set(all.map((component) => component.accessory));
    // What stands in a row of controls: a button or a select menu stands nowhere else (a button
    // also beside a section).
    const inRows = new Set(
      all
        .filter((component) => component.type === ComponentType.ActionRow)
        .flatMap((row) => (Array.isArray(row.components) ? (row.components as unknown[]) : [])),
    );
    let text = 0;
    const ids = new Set<string>();
    const useId = (id: unknown, what: string): void => {
      if (typeof id !== 'string' || id.length > 100) {
        refuse(`${what} has a custom id of at most 100 characters`);
      }
      if (ids.has(id as string)) refuse(`the custom id ${String(id)} is used twice in the message`);
      ids.add(id as string);
    };
    for (const component of all) {
      const inner = (
        Array.isArray(component.components) ? component.components : []
      ) as V2Component[];
      switch (component.type) {
        case ComponentType.TextDisplay: {
          const content = typeof component.content === 'string' ? component.content : '';
          if (content.trim() === '') refuse('a text display needs text');
          text += content.length;
          break;
        }
        case ComponentType.Section: {
          if (inner.length < 1 || inner.length > 3) {
            refuse(`a section has 1 to 3 text displays, not ${inner.length}`);
          }
          if (inner.some((child) => child.type !== ComponentType.TextDisplay)) {
            refuse('a section holds text displays only');
          }
          const accessory = component.accessory as V2Component | undefined;
          if (
            accessory?.type !== ComponentType.Button &&
            accessory?.type !== ComponentType.Thumbnail
          ) {
            refuse('a section needs a button or a thumbnail beside it');
          }
          break;
        }
        case ComponentType.ActionRow:
          if (inner.length < 1 || inner.length > 5) {
            refuse(`a row has 1 to 5 controls, not ${inner.length}`);
          }
          if (inner.length > 1 && inner.some((child) => child.type !== ComponentType.Button)) {
            refuse('a row with a select menu holds that menu alone');
          }
          break;
        case ComponentType.StringSelect:
          if (!inRows.has(component)) refuse('a select menu stands only in a row');
          checkMenu(component as MenuLike, { most: 25, group: false, inForm: false }, (what) =>
            refuse(`a select menu: ${what}`),
          );
          useId(component.custom_id, 'a select menu');
          break;
        case ComponentType.Button: {
          if (!inRows.has(component) && !accessories.has(component)) {
            refuse('a button stands only in a row or beside a section');
          }
          const label = typeof component.label === 'string' ? component.label : '';
          if (label.length > 80) refuse('a button label has at most 80 characters');
          const emoji = component.emoji as { id?: unknown; name?: unknown } | undefined;
          const shown = emoji !== undefined && (emoji.id !== undefined || emoji.name !== undefined);
          if (label.length === 0 && !shown) refuse('a button needs a label or an emoji');
          // A custom emoji by its id (with its name), anything else a pictograph by its name:
          // not message text such as `<:name:id>`, nor a custom emoji's name without its id.
          if (
            shown &&
            (emoji.id === undefined
              ? typeof emoji.name !== 'string' ||
                !/\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(emoji.name)
              : typeof emoji.id !== 'string' ||
                !/^\d{17,20}$/.test(emoji.id) ||
                typeof emoji.name !== 'string' ||
                !/^\w{2,32}$/.test(emoji.name))
          ) {
            refuse('an emoji of a button is a name or an id with its name');
          }
          const link = component.style === ButtonStyle.Link;
          if (link && (typeof component.url !== 'string' || 'custom_id' in component)) {
            refuse('a link button has an address and no custom id');
          }
          if (!link && (typeof component.custom_id !== 'string' || 'url' in component)) {
            refuse('a button has a custom id and no address');
          }
          const id = component.custom_id;
          if (typeof id === 'string') {
            if (id.length > 100) refuse('a custom id has at most 100 characters');
            useId(id, 'a button');
          }
          break;
        }
        case ComponentType.File: {
          const url = (component.file as { url?: unknown } | undefined)?.url;
          checkUrl(url, 'a file component', false);
          break;
        }
        case ComponentType.Thumbnail: {
          const url = (component.media as { url?: unknown } | undefined)?.url;
          checkUrl(url, 'a thumbnail', true);
          if (!accessories.has(component)) refuse('a thumbnail stands only beside a section');
          break;
        }
        case ComponentType.MediaGallery: {
          const items = Array.isArray(component.items) ? (component.items as unknown[]) : [];
          if (items.length < 1 || items.length > 10) {
            refuse(`a gallery holds 1 to 10 pictures, not ${items.length}`);
          }
          for (const item of items) {
            checkUrl((item as { media?: { url?: unknown } }).media?.url, 'a gallery picture', true);
            const description = (item as { description?: unknown }).description;
            if (typeof description === 'string' && description.length > 1024) {
              refuse('a picture of a gallery has a description of at most 1024 characters');
            }
          }
          break;
        }
        default:
          break;
      }
    }
    for (const container of containers) {
      const inner = Array.isArray(container.components) ? container.components : [];
      if (inner.length === 0) refuse('a container needs a component');
      const accent = container.accent_color;
      if (
        accent !== undefined &&
        accent !== null &&
        (typeof accent !== 'number' || !Number.isInteger(accent) || accent < 0 || accent > 0xffffff)
      ) {
        refuse('an accent colour is a number from 0 to 0xFFFFFF');
      }
    }
    if (text > textLimit) {
      refuse(`the text displays have at most ${textLimit} characters, not ${text}`);
    }
  }

  /** A message that is v2 cannot be edited back into a classic one. */
  /** Records an edit that makes a classic message v2 (`converted`). */
  private noteConversion(
    id: string,
    before: OutgoingMessage,
    after: OutgoingMessage,
    options?: EditOptions,
  ): void {
    if (!before.v2 && after.v2) this.converted.push({ id, direct: options?.convert === true });
  }

  private static checkEdit(before: OutgoingMessage, after: OutgoingMessage): void {
    if (before.v2 && !after.v2) {
      throw refusedBody('a components-v2 message cannot become classic');
    }
  }

  /**
   * The limits of the embeds of a message, which Discord answers with "Invalid Form Body" when
   * one is passed. The 6000 characters are counted over all embeds of the message together,
   * with the footer's text and the author's name; a field whose name or value is nothing but
   * white space is refused like an empty one.
   */
  private static checkEmbeds(embeds: NonNullable<OutgoingMessage['embeds']>): void {
    const refuse = (what: string): never => {
      throw refusedBody(what);
    };
    let total = 0;
    for (const embed of embeds) {
      const title = embed.title ?? '';
      const description = embed.description ?? '';
      const fields = embed.fields ?? [];
      if (title.length > 256) {
        refuse(`an embed title has at most 256 characters, not ${title.length}`);
      }
      if (description.length > 4096) {
        refuse(`an embed description has at most 4096 characters, not ${description.length}`);
      }
      if (fields.length > 25) refuse(`an embed has at most 25 fields, not ${fields.length}`);
      total += title.length + description.length;
      total += (embed.footer?.text ?? '').length + (embed.author?.name ?? '').length;
      for (const field of fields) {
        if (field.name.trim() === '' || field.name.length > 256) {
          refuse(
            `a field name is 1 to 256 characters, not ${field.name.trim() === '' ? 0 : field.name.length}`,
          );
        }
        if (field.value.trim() === '' || field.value.length > 1024) {
          refuse(
            `a field value is 1 to 1024 characters, not ${field.value.trim() === '' ? 0 : field.value.length}`,
          );
        }
        total += field.name.length + field.value.length;
      }
    }
    if (total > 6000) refuse(`the embeds have at most 6000 characters in all, not ${total}`);
  }

  /** The message as Discord keeps it in this channel: without its embeds where the bot may not. */
  private kept(channelId: string, message: OutgoingMessage): OutgoingMessage {
    // What Discord does to a v2 message there is not known: it is kept as it is.
    if (!this.noEmbeds.has(channelId) || message.v2 || message.embeds === undefined) {
      return message;
    }
    const { embeds: _dropped, ...rest } = message;
    return rest;
  }

  private static checkTitle(title: string): void {
    if (title.length < 1 || title.length > 100) {
      throw refusedBody(`a title is 1 to 100 characters, not ${title.length}`);
    }
  }

  private static checkTags(forum: { tags: Record<string, string> }, tagIds: readonly string[]) {
    if (tagIds.length > 5) throw refusedBody('at most five tags');
    const known = new Set(Object.values(forum.tags));
    for (const tag of tagIds) {
      if (!known.has(tag)) throw refusedBody(`the forum has no tag ${tag}`);
    }
  }

  createPost(forumId: string, post: NewPost) {
    return this.attempt('createPost', forumId, () => {
      const forum = this.forums.get(forumId);
      if (!forum || this.gone.has(forumId)) return undefined;
      // Without what it needs there, as `DiscordPartyGateway` refuses it.
      const lacking = this.refusePosts.get(forumId);
      if (lacking !== undefined) {
        const needs: readonly string[] = postNeeds(post.tagIds.length > 0);
        const missing = lacking.filter((name) => needs.includes(name));
        if (lacking.length === 0 || missing.length > 0) {
          throw new PostsRefusedError(forumId, missing);
        }
      }
      FakePartyGateway.checkMessage(post.message, this.textLimit);
      if (this.refuseV2Starter === 'empty' && post.message.v2) throw emptyMessage();
      if ((this.refuseV2Starter === true || this.losePosts) && post.message.v2) {
        throw refusedBody('a components-v2 message as the first message of a post');
      }
      this.checkPicture(post.message);
      this.checkFiles(post.message);
      FakePartyGateway.checkTitle(post.title);
      FakePartyGateway.checkTags(forum, post.tagIds);
      const id = this.id();
      this.posts.set(id, {
        id,
        forumId,
        title: post.title,
        message: post.message,
        attachments: filesOf(post.message) ?? [],
        tagIds: [...post.tagIds],
        pinned: false,
        archived: false,
        locked: false,
        slowmode: 0,
        autoArchiveMinutes: post.autoArchiveMinutes ?? 10_080,
        reopened: 0,
        edits: 0,
        renames: 0,
        retags: 0,
      });
      if (this.losePosts) this.gone.add(id);
      return id;
    });
  }

  /** What Discord does to an archived post when something is edited or sent in it. */
  private static reopen(post: FakePost): void {
    if (!post.archived) return;
    post.archived = false;
    post.reopened++;
  }

  postInfo(postId: string) {
    return this.attempt('postInfo', postId, () => {
      const post = this.posts.get(postId);
      if (!post || this.gone.has(postId)) return undefined;
      return {
        title: post.title,
        tagIds: [...post.tagIds],
        pinned: post.pinned,
        locked: post.locked,
        slowmode: post.slowmode,
        archived: post.archived,
      };
    });
  }

  editPost(postId: string, message: OutgoingMessage, options?: EditOptions) {
    return this.attempt('editPost', postId, () => {
      const post = this.posts.get(postId);
      if (!post || this.gone.has(postId) || this.messageGone.has(postId)) return false;
      const attachments = filesOf(message) ?? post.attachments;
      FakePartyGateway.checkMessage(message, this.textLimit, new Set(attachments));
      FakePartyGateway.checkEdit(post.message, message);
      this.checkPicture(message);
      this.checkFiles(message);
      this.noteConversion(postId, post.message, message, options);
      FakePartyGateway.reopen(post);
      post.message = message;
      post.attachments = attachments;
      post.edits++;
      this.postEdits(postId).add();
      if (options?.clearReactions === true) this.clearAfterEdit(postId, postId);
      return true;
    });
  }

  renamePost(postId: string, title: string): Promise<'renamed' | 'gone' | { laterMs: number }> {
    return this.attempt('renamePost', postId, () => {
      const post = this.posts.get(postId);
      if (!post || this.gone.has(postId)) return 'gone' as const;
      FakePartyGateway.checkTitle(title);
      const laterMs = this.renameLater.get(postId);
      if (laterMs !== undefined) return { laterMs };
      FakePartyGateway.reopen(post);
      post.title = title;
      post.renames++;
      return 'renamed' as const;
    });
  }

  setPostTags(postId: string, tagIds: readonly string[]) {
    return this.attempt('setPostTags', postId, () => {
      const post = this.posts.get(postId);
      if (!post || this.gone.has(postId)) return false;
      const forum = this.forums.get(post.forumId);
      if (forum) FakePartyGateway.checkTags(forum, tagIds);
      FakePartyGateway.reopen(post);
      post.tagIds = [...tagIds];
      post.retags++;
      return true;
    });
  }

  pinPost(postId: string) {
    return this.attempt('pinPost', postId, () => {
      const post = this.posts.get(postId);
      if (!post || this.gone.has(postId)) return false;
      // A pin needs Manage Posts (Manage Threads), as Discord refuses it without.
      if (this.refusePosts.get(post.forumId)?.includes('Manage Posts')) {
        throw missingPermissions('PUT');
      }
      if (
        this.postsIn(post.forumId).some(
          (other) => other.pinned && other.id !== postId && !this.gone.has(other.id),
        )
      ) {
        throw new Error('Maximum number of pinned threads reached');
      }
      FakePartyGateway.reopen(post);
      post.pinned = true;
      return true;
    });
  }

  /**
   * Opens the board to members (plan 8R-9F): unlocked, with the board's slowmode, opening it
   * first; refused as a pin is without Manage Posts.
   */
  openBoard(postId: string) {
    return this.attempt('openBoard', postId, () => {
      const post = this.posts.get(postId);
      if (!post || this.gone.has(postId)) return false;
      if (this.refusePosts.get(post.forumId)?.includes('Manage Posts')) {
        throw missingPermissions('PATCH');
      }
      FakePartyGateway.reopen(post);
      post.locked = false;
      post.slowmode = BOARD_SLOWMODE_SECONDS;
      return true;
    });
  }

  /**
   * Sets the board's slowmode alone (plan 8R-9H), opening it first; refused as `openBoard` is.
   */
  setBoardSlowmode(postId: string) {
    return this.attempt('setBoardSlowmode', postId, () => {
      const post = this.posts.get(postId);
      if (!post || this.gone.has(postId)) return false;
      if (this.refusePosts.get(post.forumId)?.includes('Manage Posts')) {
        throw missingPermissions('PATCH');
      }
      FakePartyGateway.reopen(post);
      post.slowmode = BOARD_SLOWMODE_SECONDS;
      return true;
    });
  }

  /**
   * Somebody writes in a channel or post (plan 8R-9F): a member unless `by` says another
   * application (or this bot), `system` one of Discord's own; `createdAt` by default the time
   * nothing (0). A message in a post opens it, as Discord does. Gives its id.
   */
  write(
    channelId: string,
    authorId: string,
    more: { by?: BoardMessage['by']; system?: boolean; createdAt?: number } = {},
  ): string {
    const id = this.id();
    let list = this.written.get(channelId);
    if (!list) this.written.set(channelId, (list = []));
    list.push({
      id,
      authorId,
      by: more.by ?? 'member',
      system: more.system === true,
      createdAt: more.createdAt ?? 0,
    });
    const post = this.posts.get(channelId);
    if (post) FakePartyGateway.reopen(post);
    return id;
  }

  /**
   * What others wrote in each channel (`write`), oldest first; deleted ones are in `deleted` and
   * left out by `boardMessages`.
   */
  readonly written = new Map<string, BoardMessage[]>();
  /** The members with Manage Messages (in every channel; plan 8R-9F, Q1). */
  readonly managers = new Set<string>();
  /** The members `managesMessages` asked for, each with whether afresh. */
  readonly memberAsks: { memberId: string; fresh: boolean }[] = [];
  /** The ids `bulkDelete` deleted, a list per request. */
  readonly bulkDeleted: string[][] = [];
  /**
   * How many reactions each message has, by its id (a post's first message has the post's id):
   * added by `react`, all removed by an edit that asks for it (`EditOptions.clearReactions`) and
   * by `clearReactions` (plan 8R-9G).
   */
  readonly reactions = new Map<string, number>();
  /** The messages whose reactions were removed, in order (a refused removal is not listed). */
  readonly reactionsCleared: string[] = [];

  /** Somebody reacts to a message (`count` reactions); the gateway learns of it when it reads it. */
  react(messageId: string, count = 1): void {
    this.reactions.set(messageId, (this.reactions.get(messageId) ?? 0) + count);
  }

  /**
   * The newest messages of a post, newest first: what others wrote (`write`) and what this bot
   * sent there (its first message too, unless a member made the post: `foreign`), without what
   * was deleted, each with whether it has reactions (`react`).
   */
  boardMessages(postId: string, limit: number) {
    return this.attempt('boardMessages', postId, () => {
      if (!this.posts.has(postId) || this.gone.has(postId)) return undefined;
      const deleted = new Set(
        this.deleted.filter((one) => one.channelId === postId).map((one) => one.messageId),
      );
      const mine: BoardMessage[] = [
        ...(this.foreign.has(postId) || this.messageGone.has(postId) ? [] : [postId]),
        ...this.messages.filter((one) => one.channelId === postId).map((one) => one.id),
      ].map((id) => ({ id, authorId: 'bot', by: 'me', system: false, createdAt: 0 }));
      return [...(this.written.get(postId) ?? []), ...mine]
        .filter((one) => !deleted.has(one.id))
        .sort((a, b) => (a.id < b.id ? 1 : -1))
        .slice(0, limit)
        .map((one) => ({ ...one, reacted: (this.reactions.get(one.id) ?? 0) > 0 }));
    });
  }

  /**
   * Removes a message's reactions (plan 8R-9G), as Discord: `gone` for a message or post that is
   * gone, `not-allowed` where the bot may not manage messages (`noManaging`); an archived post is
   * opened for it and left open, as the gateway does.
   */
  clearReactions(channelId: string, messageId: string) {
    return this.attempt('clearReactions', messageId, (): 'cleared' | 'gone' | 'not-allowed' => {
      if (this.gone.has(channelId) || this.gone.has(messageId)) return 'gone';
      if (this.deleted.some((one) => one.messageId === messageId)) return 'gone';
      if (!this.managesIn(channelId)) return 'not-allowed';
      const post = this.posts.get(channelId);
      if (post) FakePartyGateway.reopen(post);
      this.reactions.delete(messageId);
      this.reactionsCleared.push(messageId);
      return 'cleared';
    });
  }

  /**
   * After an edit that asks for it, the edited message's reactions are removed where it has any,
   * unless the bot may not manage messages there: refused, which the edit never minds.
   */
  private clearAfterEdit(channelId: string, messageId: string): void {
    if ((this.reactions.get(messageId) ?? 0) === 0 || !this.managesIn(channelId)) return;
    this.reactions.delete(messageId);
    this.reactionsCleared.push(messageId);
  }

  /** Whether the bot may manage messages in a channel: not in one of `noManaging`, or its forum. */
  private managesIn(channelId: string): boolean {
    const forumId = this.posts.get(channelId)?.forumId;
    return (
      !this.noManaging.has(channelId) && (forumId === undefined || !this.noManaging.has(forumId))
    );
  }

  /**
   * Deletes many messages at once, refused where the bot may not manage them (`noManaging`); as
   * Discord, refused in an archived post (50083) unless `options.reopen` opens it (review W3).
   */
  bulkDelete(channelId: string, messageIds: readonly string[], options?: DeleteOptions) {
    return this.attempt('bulkDelete', channelId, (): 'deleted' | 'gone' | 'not-allowed' => {
      if (this.gone.has(channelId)) return 'gone';
      const post = this.posts.get(channelId);
      const forumId = post?.forumId;
      if (this.noManaging.has(channelId) || (forumId !== undefined && this.noManaging.has(forumId)))
        return 'not-allowed';
      if (messageIds.length < 2 || messageIds.length > 100) {
        throw new Error('A bulk delete takes 2 to 100 messages');
      }
      if (post?.archived && options?.reopen !== true) throw archivedThread('POST');
      if (post) FakePartyGateway.reopen(post);
      this.bulkDeleted.push([...messageIds]);
      for (const messageId of messageIds) this.deleted.push({ channelId, messageId });
      return 'deleted';
    });
  }

  /** Whether a member has Manage Messages (`managers`); one who left the server has none. */
  managesMessages(postId: string, memberId: string, fresh: boolean) {
    return this.attempt('managesMessages', postId, () => {
      this.memberAsks.push({ memberId, fresh });
      return !this.leftServer.has(memberId) && this.managers.has(memberId);
    });
  }

  /** Whether the bot may delete members' messages in a forum: not where it is in `noManaging`. */
  mayDeleteMessages(forumId: string): boolean {
    return !this.noManaging.has(forumId);
  }

  archivePost(postId: string) {
    return this.attempt('archivePost', postId, () => {
      const post = this.posts.get(postId);
      if (!post || this.gone.has(postId)) return false;
      post.archived = true;
      post.locked = true;
      return true;
    });
  }

  /** As Discord: an archived post is left shut, its duration unchanged (plan 8V-1). */
  setAutoArchive(postId: string, minutes: AutoArchiveMinutes) {
    return this.attempt('setAutoArchive', postId, () => {
      const post = this.posts.get(postId);
      if (!post || this.gone.has(postId)) return false;
      if (!post.archived) post.autoArchiveMinutes = minutes;
      return true;
    });
  }

  /** Archives a post and leaves its lock as it is (plan 8V-1). */
  archiveUnlocked(postId: string) {
    return this.attempt('archiveUnlocked', postId, () => {
      const post = this.posts.get(postId);
      if (!post || this.gone.has(postId)) return false;
      post.archived = true;
      return true;
    });
  }

  /** Locks a post, opening it where archived (plan 8V-1). */
  lockPost(postId: string) {
    return this.attempt('lockPost', postId, () => {
      const post = this.posts.get(postId);
      if (!post || this.gone.has(postId)) return false;
      if (post.locked) return true;
      FakePartyGateway.reopen(post);
      post.locked = true;
      return true;
    });
  }

  /** `@everyone` and the roles named that `noReplies` keeps from writing in the posts (BR-7). */
  /** The fake knows no roles: a role's id stands for its name here (`noReplies`). */
  rolesWithoutReplies(forumId: string, roleIds: readonly string[]) {
    return this.attempt('rolesWithoutReplies', forumId, () => {
      if (!this.forums.has(forumId) || this.gone.has(forumId)) return undefined;
      const without = this.noReplies.get(forumId) ?? [];
      return ['@everyone', ...roleIds].filter((name) => without.includes(name));
    });
  }

  /** The bot's archived posts of a forum, the latest made first (plan 8V-1). */
  archivedPosts(forumId: string, most = ARCHIVED_POSTS_READ) {
    return this.attempt('archivedPosts', forumId, () => {
      if (!this.forums.has(forumId) || this.gone.has(forumId)) return undefined;
      const archived = this.postsIn(forumId)
        .filter((post) => post.archived && !this.gone.has(post.id))
        .reverse()
        .slice(0, most);
      return archived.filter((post) => !this.foreign.has(post.id)).map((post) => post.id);
    });
  }

  /** The bot's overwrite lets it manage the posts; refused in a forum of `noReserving`. */
  letBotManagePosts(forumId: string) {
    return this.attempt('letBotManagePosts', forumId, () => {
      if (!this.forums.has(forumId) || this.gone.has(forumId)) return undefined;
      if (this.noReserving.has(forumId)) return 'not-allowed' as const;
      if (this.managedPosts.has(forumId)) return 'was-allowed' as const;
      this.managedPosts.add(forumId);
      return 'allowed' as const;
    });
  }

  openPosts(forumId: string) {
    return this.attempt('openPosts', forumId, () => {
      if (!this.forums.has(forumId) || this.gone.has(forumId)) return undefined;
      return this.postsIn(forumId)
        .filter((post) => !post.archived && !this.gone.has(post.id) && !this.foreign.has(post.id))
        .map((post) => post.id);
    });
  }

  deletePost(postId: string) {
    return this.attempt('deletePost', postId, () => {
      if (this.posts.delete(postId)) this.deletedPosts.push(postId);
    });
  }

  /** The bot may delete posts but in the forums (or posts) of `noManaging`. */
  mayDeletePost(postId: string): boolean {
    const forumId = this.posts.get(postId)?.forumId;
    return !this.noManaging.has(postId) && (forumId === undefined || !this.noManaging.has(forumId));
  }

  deleteChannel(channelId: string, reason?: string) {
    return this.attempt('deleteChannel', channelId, () => {
      if (reason !== undefined) this.auditReasons.set(channelId, reason);
      // Its posts go with a forum, for good.
      for (const post of this.postsIn(channelId)) this.posts.delete(post.id);
      const known = this.forums.delete(channelId);
      if (this.channels.delete(channelId) || known) this.deletedChannels.push(channelId);
    });
  }

  sendMessage(channelId: string, message: OutgoingMessage, options?: SendOptions) {
    return this.attempt('sendMessage', channelId, () => {
      if (this.gone.has(channelId) || this.forums.has(channelId)) return undefined;
      FakePartyGateway.checkMessage(message, this.textLimit);
      this.checkFiles(message);
      this.checkPicture(message);
      const post = this.posts.get(channelId);
      // As Discord: an archived, locked post refuses a message until it is opened (50083); the
      // gateway opens it where asked (plan 8R-9, review R3).
      if (post?.archived && post.locked && options?.reopen !== true) throw archivedThread('POST');
      if (post) FakePartyGateway.reopen(post);
      const id = this.id();
      this.messages.push({
        id,
        channelId,
        message: this.kept(channelId, message),
        attachments: filesOf(message) ?? [],
        edits: 0,
        ...(options?.silent === true ? { silent: true } : {}),
      });
      return id;
    });
  }

  editMessage(
    channelId: string,
    messageId: string,
    message: OutgoingMessage,
    options?: EditOptions,
  ) {
    return this.attempt('editMessage', messageId, () => {
      if (this.gone.has(channelId) || this.gone.has(messageId)) return false;
      const found = this.messagesIn(channelId).find((sent) => sent.id === messageId);
      if (!found) return false;
      const attachments = filesOf(message) ?? found.attachments;
      FakePartyGateway.checkMessage(message, this.textLimit, new Set(attachments));
      FakePartyGateway.checkEdit(found.message, message);
      this.checkPicture(message);
      this.checkFiles(message);
      this.noteConversion(messageId, found.message, message, options);
      const post = this.posts.get(channelId);
      if (post) FakePartyGateway.reopen(post);
      found.message = this.kept(channelId, message);
      found.attachments = attachments;
      found.edits++;
      if (options?.clearReactions === true) this.clearAfterEdit(channelId, messageId);
      return true;
    });
  }

  deleteMessage(channelId: string, messageId: string, options?: DeleteOptions) {
    return this.attempt('deleteMessage', messageId, () => {
      // As Discord: an archived post refuses a deletion until something opens it (8X-H, F4);
      // the gateway opens it where asked (plan 8R-9, B3, review P4).
      const post = this.posts.get(channelId);
      if (post?.archived && options?.reopen !== true) throw archivedThread();
      if (post) FakePartyGateway.reopen(post);
      this.deleted.push({ channelId, messageId });
      this.pins.get(channelId)?.delete(messageId);
    });
  }

  /**
   * Pins a message as the bot before plan 8R-9 pinned the post "Today’s Stops" in a region's
   * channel (a test's own setup: no code pins a message any more).
   */
  pin(channelId: string, messageId: string): void {
    let pinned = this.pins.get(channelId);
    if (!pinned) this.pins.set(channelId, (pinned = new Set()));
    pinned.add(messageId);
  }

  unpinMessage(channelId: string, messageId: string) {
    return this.attempt('unpinMessage', messageId, () => {
      if (this.noPinning.has(channelId)) return false;
      this.pins.get(channelId)?.delete(messageId);
      return true;
    });
  }

  /** The messages pinned in a channel (`pin`), in the order pinned. */
  pinnedIn(channelId: string): string[] {
    return [...(this.pins.get(channelId) ?? [])];
  }

  /**
   * A reported message deleted (plan 8S-2): `gone` for one in `gone` (or deleted before) or in a
   * channel that is gone, `not-allowed` in a channel, post or forum of `noManaging`. An archived
   * post is opened for it and archived again, or left open where `options.leaveOpen` asks.
   */
  deleteReported(channelId: string, messageId: string, options?: ReportedDeleteOptions) {
    return this.attempt('deleteReported', messageId, (): 'deleted' | 'gone' | 'not-allowed' => {
      if (this.gone.has(channelId) || this.gone.has(messageId)) return 'gone';
      if (this.deleted.some((one) => one.messageId === messageId)) return 'gone';
      const post = this.posts.get(channelId);
      const forumId = post?.forumId;
      if (this.noManaging.has(channelId) || (forumId !== undefined && this.noManaging.has(forumId)))
        return 'not-allowed';
      // As Discord: an archived post refuses a deletion (50083) until it is opened for it, and is
      // archived and locked again afterwards, as the gateway does, unless it is to stay open.
      if (post?.archived && options?.leaveOpen === true) FakePartyGateway.reopen(post);
      else if (post?.archived) post.reopened += 1;
      this.deleted.push({ channelId, messageId });
      return 'deleted';
    });
  }

  memberAccess(
    forumId: string,
    memberId: string,
    fresh = false,
  ): Promise<MemberAccess | undefined> {
    return this.attempt(
      'memberAccess',
      forumId,
      () => {
        if (!this.isGate(forumId)) return undefined;
        if (this.leftServer.has(memberId)) return undefined;
        if (fresh) this.memberFetched(memberId);
        // The cache's roles where a look put the member there (plan 8M-20), else as they are.
        return this.accessNow(
          forumId,
          memberId,
          this.cachedRoles.get(memberId) ?? this.rolesOf(memberId),
        );
      },
      false,
    );
  }

  /** A forum, or a text channel (a region's without a forum, plan 8H-5), as the gateway. */
  private isGate(channelId: string): boolean {
    const known = this.forums.has(channelId) || this.channels.get(channelId)?.kind === 'text';
    return known && !this.gone.has(channelId);
  }

  /**
   * How everybody stands to each gate, and what roles would make of it for them (plan 8Z-2,
   * F-B10), as the real gateway says it: the permissions of the everyone role and the roles held
   * (`serverRoles`, Discord's default unless a test gives them), then the gate's overwrites
   * where a test gives them (`forumOverwrites`), for somebody of no overwrite of their own.
   * `shutOut`, `admitted` and `barred` are of single members and change nothing for everybody.
   * A gate that is gone or unknown is left out.
   */
  everyoneGates(gateIds: readonly string[]): EveryoneGates {
    const gates = [...new Set(gateIds)].filter((id) => this.isGate(id));
    const sees = (gateId: string, roleIds: readonly string[]): boolean => {
      const nobody = { id: '', roleIds };
      const seen = channelPermissions(
        this.basePermissions(roleIds),
        this.guildId,
        nobody,
        this.forumOverwrites.get(gateId) ?? [],
      );
      return (seen & PermissionFlagsBits.ViewChannel) !== 0n;
    };
    return {
      access: new Map(gates.map((id) => [id, sees(id, []) ? 'visible' : 'hidden'])),
      seesWith: (gateId, roleIds) => gates.includes(gateId) && sees(gateId, [...roleIds]),
      denials: () => ({ own: false, roles: [] }),
    };
  }

  private accessNow(
    forumId: string,
    memberId: string,
    roleIds: readonly string[] = this.rolesOf(memberId),
  ): MemberAccess {
    if (this.seesHolding(forumId, memberId, roleIds)) return 'visible';
    // As the real gateway: kept out by their own overwrite, or by a role of theirs that denies
    // the view (W3: the party lists' `barred`, also where the page says only hidden).
    const kept = this.denialsOf(forumId, memberId, roleIds);
    return kept.own || kept.roles.length > 0 ? 'barred' : 'hidden';
  }

  /**
   * The roles of each member as discord.js's cache holds them (plan 8M-20, A7): what `memberGates`
   * and `memberAccess` without `fresh` read (a member never put there is fetched, so as
   * `rolesOf` has them). A forced fetch (`fresh`, or `memberFetched` for one made elsewhere: the
   * member directory's, the acting member's) brings it up to `rolesOf`.
   */
  private readonly cachedRoles = new Map<string, readonly string[]>();

  /** A forced fetch of the member somewhere else: the cache holds their roles as they are now. */
  memberFetched(memberId: string): void {
    this.cachedRoles.set(memberId, [...this.rolesOf(memberId)]);
  }

  /** What denies a member the view of a forum: their own overwrite (or a bar), their roles'. */
  private denialsOf(
    forumId: string,
    memberId: string,
    roleIds: readonly string[],
  ): { own: boolean; roles: string[] } {
    const view = PermissionFlagsBits.ViewChannel;
    const overwrites = this.forumOverwrites.get(forumId) ?? [];
    const denies = (one: { deny: string }) => (BigInt(one.deny) & view) !== 0n;
    return {
      own:
        (this.barred.get(forumId)?.has(memberId) ?? false) ||
        overwrites.some(
          (one) => one.type === OverwriteType.Member && one.id === memberId && denies(one),
        ),
      roles: overwrites
        .filter(
          (one) =>
            one.type === OverwriteType.Role &&
            one.id !== this.guildId &&
            roleIds.includes(one.id) &&
            denies(one),
        )
        .map((one) => one.id),
    };
  }

  memberGates(
    guildId: string,
    memberId: string,
    gateIds: readonly string[],
    fresh: boolean,
  ): Promise<MemberGates | undefined> {
    return this.attempt(
      'memberGates',
      memberId,
      () => {
        if (guildId !== this.guildId || this.leftServer.has(memberId)) return undefined;
        this.gateLooks.push({ memberId, fresh });
        if (fresh || !this.cachedRoles.has(memberId)) this.memberFetched(memberId);
        const held = [...(this.cachedRoles.get(memberId) ?? [])];
        const gates = [...new Set(gateIds)].filter((id) => this.isGate(id));
        return {
          held,
          // As the real gateway: a look at the cache is of unknown age (W4).
          fetchedAt: fresh ? Date.now() : 0,
          access: new Map(gates.map((id) => [id, this.accessNow(id, memberId, held)])),
          seesWith: (gateId: string, roleIds: ReadonlySet<string>) =>
            gates.includes(gateId) && this.seesHolding(gateId, memberId, [...roleIds]),
          denials: (gateId: string) =>
            gates.includes(gateId)
              ? this.denialsOf(gateId, memberId, held)
              : { own: false, roles: [] },
        };
      },
      false,
    );
  }

  admitMember(forumId: string, memberId: string) {
    return this.attempt('admitMember', `${forumId} ${memberId}`, () => {
      if (!this.forums.has(forumId) || this.gone.has(forumId)) return false;
      // Like Discord, the new overwrite takes the place of the one the member had.
      this.barred.get(forumId)?.delete(memberId);
      const inside = this.admitted.get(forumId) ?? new Set<string>();
      inside.add(memberId);
      this.admitted.set(forumId, inside);
      return true;
    });
  }

  dismissMember(forumId: string, memberId: string) {
    return this.attempt('dismissMember', `${forumId} ${memberId}`, () => {
      // Not what `admitMember` made: it is left as it is.
      if (this.barred.get(forumId)?.has(memberId)) return false;
      this.admitted.get(forumId)?.delete(memberId);
      return true;
    });
  }

  channelName(channelId: string): string | undefined {
    return this.channelNames.get(channelId);
  }

  /** The name of the fake's server, as the fake interactions name it; none of another. */
  serverName = 'Test Server';

  guildName(guildId: string): string | undefined {
    return guildId === this.guildId ? this.serverName : undefined;
  }

  /**
   * A channel the fake knows (`channelNames`) in the server of `nearChannelId` (`serverOf`), and
   * like the real gateway only a text channel (not a forum, nor a channel `addChannel` gave another
   * kind) in which the bot may post embeds (`noEmbeds`).
   */
  findChannel(nearChannelId: string, channelId: string): string | undefined {
    if (!this.channelNames.has(channelId) || this.gone.has(channelId)) return undefined;
    if (this.forums.has(channelId)) return undefined;
    const known = this.channels.get(channelId);
    if (known !== undefined && known.kind !== 'text') return undefined;
    if (this.noEmbeds.has(channelId)) return undefined;
    return this.serverOf(channelId) === this.serverOf(nearChannelId) ? channelId : undefined;
  }

  /** Every channel of the fake is in its one server, but one `addChannel` put in another. */
  serverOf(channelId: string): string | undefined {
    return this.channels.get(channelId)?.guildId ?? this.guildId;
  }

  /**
   * What the bot may write in a post (plan 8R-9): nothing where `refusePosts` names Send Messages
   * in Posts there, or Manage Posts while the post is locked (plan 8R-9F, B5); plain text
   * where the post or its forum is in `noEmbeds`; else messages with components.
   */
  postAccess(postId: string): Promise<PostAccess> {
    return Promise.resolve(this.accessTo(postId));
  }

  private accessTo(postId: string): PostAccess {
    const post = this.posts.get(postId);
    const forumId = post?.forumId;
    const where = forumId === undefined ? [postId] : [postId, forumId];
    const lacking = forumId === undefined ? [] : (this.refusePosts.get(forumId) ?? []);
    // An open board takes no Manage Posts to write in, a locked one does (plan 8R-9F, B5).
    if (
      lacking.some(
        (name) =>
          name === 'Send Messages in Posts' || (name === 'Manage Posts' && post?.locked === true),
      )
    ) {
      return 'refused';
    }
    return where.some((id) => this.noEmbeds.has(id)) ? 'plain' : 'v2';
  }

  /**
   * Channels where the bot may not post a shared answer (`mayShare`, plan 8H-5): none unless a
   * test says, and, as the gateway says, no ended post (archived and locked).
   */
  readonly noSharing = new Set<string>();

  mayShare(channelId: string): boolean {
    // As the gateway: never in an ended post (archived and locked).
    const post = this.posts.get(channelId);
    if (post?.archived === true && post.locked) return false;
    return !this.noSharing.has(channelId);
  }

  /**
   * Members Discord has and the cache lacks (`memberRoles` is the cache): `shareKeeps` fetches
   * them, at most `SHARE_MEMBER_FETCHES`, each recorded in `memberFetches`; null for somebody not
   * in the server. One in neither cannot be fetched.
   */
  readonly fetchableMembers = new Map<string, string[] | null>();
  readonly memberFetches: string[] = [];

  /**
   * `regionsKept` of `src/ops/permissions.ts` as the real gateway asks it (plan 8H-5, R-A, R2),
   * over the fake's own: a channel's overwrites are its `forumOverwrites` (any channel's, text
   * channels too; none given, none), the server's roles `serverRoles` (the everyone role, the
   * server's id, Discord's default of View Channel and Send Messages unless a test gives it), a
   * member's roles `memberRoles` (the cache) or `fetchableMembers` (fetched). A post is judged by
   * its forum; a region channel the fake does not know (no forum or channel of that id) is not
   * kept, and an unknown share channel answers undefined.
   */
  shareKeeps(
    shareChannelId: string,
    regionChannelIds: readonly string[],
  ): Promise<ReadonlySet<string> | undefined> {
    const known = (id: string) => this.forums.has(id) || this.channels.has(id);
    const into = this.posts.get(shareChannelId)?.forumId ?? shareChannelId;
    if (!known(into)) return Promise.resolve(undefined);
    const share = this.forumOverwrites.get(into) ?? [];
    const fetched = new Map<string, readonly string[] | null>();
    for (const id of namedViewers(share)
      .filter((one) => !this.memberRoles.has(one))
      .slice(0, SHARE_MEMBER_FETCHES)) {
      this.memberFetches.push(id);
      const roles = this.fetchableMembers.get(id);
      if (roles !== undefined) fetched.set(id, roles);
    }
    const everyone = this.serverRoles.get(this.guildId)?.permissions ?? DEFAULT_EVERYONE;
    return Promise.resolve(
      regionsKept({
        guildId: this.guildId,
        roles: [
          { id: this.guildId, permissions: everyone },
          ...[...this.serverRoles]
            .filter(([id]) => id !== this.guildId)
            .map(([id, role]) => ({ id, permissions: role.permissions })),
        ],
        share,
        shareIds: [shareChannelId, into],
        regions: regionChannelIds
          .filter((id) => known(id))
          .map((id) => ({ id, overwrites: this.forumOverwrites.get(id) ?? [] })),
        rolesOf: (memberId) => this.memberRoles.get(memberId) ?? fetched.get(memberId),
      }),
    );
  }

  /** The bot may post embeds everywhere but in the channels of `noEmbeds`. */
  /** Unknown Channel for a channel in `gone`, as Discord answers for one deleted. */
  channelUnknown(channelId: string): Promise<boolean> {
    return this.attempt('channelUnknown', channelId, () => this.gone.has(channelId));
  }

  mayPost(channelId: string): boolean {
    return !this.noEmbeds.has(channelId);
  }

  emoji(_channelId: string, name: string): string | undefined {
    return this.emojis.get(name);
  }

  /**
   * Gives a server a channel (`serverChannels`): an ordinary text channel of the fakes' own
   * server unless told otherwise. Its name is also what `channelName` answers.
   */
  addChannel(
    id: string,
    name: string,
    more: { kind?: ServerChannel['kind']; categoryId?: string | null; guildId?: string } = {},
  ): void {
    this.channels.set(id, {
      name,
      kind: more.kind ?? 'text',
      categoryId: more.categoryId ?? null,
      guildId: more.guildId ?? this.guildId,
    });
    this.channelNames.set(id, name);
  }

  /**
   * The channels of a server: those given with `addChannel` or made with `createCategory` and
   * `createTextChannel`, in that order, then the forums (those of the fake are in its own
   * server). Undefined for a server that has none of either and is not the fakes' own.
   */
  serverChannels(guildId: string): ServerChannel[] | undefined {
    const listed: ServerChannel[] = [];
    for (const [id, channel] of this.channels) {
      if (channel.guildId !== guildId || this.gone.has(id)) continue;
      const { name, kind, categoryId } = channel;
      listed.push({ id, name: this.channelNames.get(id) ?? name, kind, categoryId });
    }
    if (guildId === this.guildId) {
      for (const [id, forum] of this.forums) {
        if (this.gone.has(id) || this.channels.has(id)) continue;
        const beside =
          forum.regionChannelId === undefined
            ? null
            : (this.channels.get(forum.regionChannelId)?.categoryId ?? null);
        listed.push({
          id,
          name: forum.name,
          kind: 'forum',
          categoryId: forum.categoryId ?? beside,
        });
      }
    }
    return listed.length === 0 && guildId !== this.guildId ? undefined : listed;
  }

  /**
   * A server the bot is in (one `serverChannels` lists) and not in `unavailableServers` (plan
   * 19B-1; fix round 3, J2: as the real one, false for a server the bot is not in).
   */
  serverAvailable(guildId: string): boolean {
    return !this.unavailableServers.has(guildId) && this.serverChannels(guildId) !== undefined;
  }

  /** A forum of the fake, a channel given with `addChannel`; none that is gone. */
  channelKind(channelId: string): ServerChannel['kind'] | undefined {
    if (this.gone.has(channelId)) return undefined;
    if (this.forums.has(channelId)) return 'forum';
    return this.channels.get(channelId)?.kind;
  }

  mayCreateChannels(guildId: string): boolean {
    return !this.noCreating.has(guildId);
  }

  createCategory(
    guildId: string,
    name: string,
    reason?: string,
    like?: string,
  ): Promise<CreatedChannel> {
    return this.attempt('createCategory', name, () => {
      const base = like === undefined || this.gone.has(like) ? undefined : this.channels.get(like);
      const continues = base?.kind === 'category' ? like : undefined;
      if (like !== undefined && continues === undefined) {
        return { ok: false, reason: 'base-gone' } as const;
      }
      if (continues !== undefined && this.refuseCopies) {
        return { ok: false, reason: 'no-permission' } as const;
      }
      const made = this.createChannel(guildId, name, 'category', null, reason);
      if (made.ok && continues !== undefined) {
        this.placedAfter.set(made.id, continues);
        const overwrites = this.categoryOverwrites.get(continues);
        if (overwrites) this.categoryOverwrites.set(made.id, [...overwrites]);
      }
      return made;
    });
  }

  createTextChannel(
    guildId: string,
    name: string,
    categoryId: string | null,
    reason?: string,
  ): Promise<CreatedChannel> {
    return this.attempt('createTextChannel', name, () =>
      this.createChannel(guildId, name, 'text', categoryId, reason),
    );
  }

  /** As Discord: Manage Channels, a name of 1 to 100 characters, 500 channels, 50 in a category. */
  private createChannel(
    guildId: string,
    name: string,
    kind: 'category' | 'text',
    categoryId: string | null,
    reason: string | undefined,
  ): CreatedChannel {
    const existing = this.serverChannels(guildId);
    if (existing === undefined) return { ok: false, reason: 'no-server' };
    if (this.noCreating.has(guildId)) return { ok: false, reason: 'no-permission' };
    if ([...name].length < 1 || [...name].length > 100) return { ok: false, reason: 'bad-name' };
    if (categoryId !== null) {
      const category = existing.find((channel) => channel.id === categoryId);
      if (category?.kind !== 'category') return { ok: false, reason: 'no-server' };
      const inside = existing.filter((channel) => channel.categoryId === categoryId).length;
      if (inside >= 50) return { ok: false, reason: 'category-full' };
    }
    if (existing.length >= 500) return { ok: false, reason: 'server-full' };
    const id = this.id();
    // Discord writes the name of a text channel its own way.
    const written = kind === 'text' ? name.toLowerCase().replace(/\s+/gu, '-') : name;
    this.addChannel(id, written, { kind, categoryId, guildId });
    this.createdChannels.push(id);
    if (reason !== undefined) this.auditReasons.set(id, reason);
    return { ok: true, id, name: written };
  }

  /** Like a real call, the answer never comes in the same turn of the event loop. */
  private attempt<T>(method: Method, id: string, work: () => T, listed = true): Promise<T> {
    return new Promise((resolve, reject) => {
      setImmediate(() => {
        try {
          this.begin(method, id, listed);
          resolve(work());
        } catch (err) {
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      });
    });
  }
}
