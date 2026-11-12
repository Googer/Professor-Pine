import { PermissionFlagsBits } from 'discord.js';
import type { Settings } from '../config/settings.js';
import {
  staffRoleKey,
  type CreatedChannel,
  type EditOptions,
  type PartyGateway,
} from '../discord/party-gateway.js';
import type { Logger } from '../log.js';
import type { DmJob, DmSender } from './dm-sender.js';

/*
 * Rehearsal mode (`settings.rehearsal`, plan 8C): the bot with a production token against a copy
 * of the production database, while the legacy bot is off for a short while. Nothing of it may
 * reach members who are not in on it: direct messages go to the allowlist only (`RehearsalDms`),
 * nothing is posted but into the posts of parties in the rehearsed regions' forums
 * (`rehearsalGateway`) and, by meetup safety alone, its moderators' posts into their staff-only
 * channel (`rehearsalModeratorsGateway`; Matt, 2026-10-17), only staff and the allowlist are answered (the router), forums are made
 * only for the rehearsed regions and seen only by staff and the allowlist (`PartyService`), and
 * the cleanup of legacy channels only lists.
 */

export type RehearsalSettings = NonNullable<Settings['rehearsal']>;

/** Who is asking, as an interaction shows it. */
export interface Asker {
  userId: string;
  /** The member's permissions in the channel (`interaction.memberPermissions`), null in a DM. */
  permissions: bigint | null;
  /** The names of the member's roles in the server. */
  roleNames: readonly string[];
}

const STAFF = PermissionFlagsBits.ManageGuild | PermissionFlagsBits.Administrator;

export class Rehearsal {
  constructor(readonly settings: RehearsalSettings) {}

  /** Whether a member is on the allowlist. */
  allowlisted(userId: string): boolean {
    return this.settings.allowlist.includes(userId);
  }

  /** Whether the bot answers this member: on the allowlist, or staff (Manage Server, a staff role). */
  admits(asker: Asker): boolean {
    if (this.allowlisted(asker.userId)) return true;
    if (asker.permissions !== null && (asker.permissions & STAFF) !== 0n) return true;
    const staff = new Set(this.settings.staffRoles.map(staffRoleKey));
    return asker.roleNames.some((name) => staff.has(staffRoleKey(name)));
  }

  /** Whether the region whose channel has this name is rehearsed (gets a forum). */
  rehearses(channelName: string | undefined): boolean {
    return channelName !== undefined && this.settings.regions.includes(channelName);
  }

  /** Who may see a rehearsed forum besides the bot: the staff roles by name, and the allowlist. */
  get forumAccess(): { roleNames: readonly string[]; memberIds: readonly string[] } {
    return { roleNames: this.settings.staffRoles, memberIds: this.settings.allowlist };
  }
}

/** The rehearsal of the settings, or nothing when it is off. */
export function rehearsalOf(settings: Pick<Settings, 'rehearsal'>): Rehearsal | undefined {
  return settings.rehearsal === undefined ? undefined : new Rehearsal(settings.rehearsal);
}

/**
 * The settings the bot runs by: in rehearsal mode without `web`, so that the web pages (and the
 * map links of `/maps`) stay off until the rehearsal is over (the controller's ruling, plan 8C);
 * otherwise the very same object. `configWarnings` says so at the start.
 */
export function servedSettings<S extends Pick<Settings, 'rehearsal' | 'web'>>(settings: S): S {
  if (!settings.rehearsal || !settings.web) return settings;
  const { web, ...served } = settings;
  return served as S;
}

/** The owner's alert at a start in rehearsal mode (`src/index.ts`). */
export const REHEARSAL_ALERT =
  'Professor Pine started: rehearsal mode is on. Direct messages go only to the allowlist, ' +
  'nothing is announced, and only staff and the allowlist are answered. Take settings.rehearsal ' +
  "out (and './pine deploy-commands --clear-guild') when the rehearsal is over.";

/** What the bot says to a member it does not answer during a rehearsal. */
export const REHEARSAL_REFUSAL =
  'Professor Pine is being tested here for a short while and answers only the people testing it. ' +
  'Please try again later.';

/**
 * Direct messages during a rehearsal: those to the allowlist go on to the sender, the others are
 * dropped (never sent) and logged with the count so far.
 */
export class RehearsalDms implements DmSender {
  private dropped = 0;
  private timer: NodeJS.Timeout | undefined;

  constructor(
    private readonly inner: DmSender,
    private readonly rehearsal: Rehearsal,
    private readonly log: Logger,
    /** How long the dropped messages are counted before one line says how many. A minute. */
    private readonly summaryMs = 60_000,
  ) {}

  send(job: DmJob): void {
    if (this.rehearsal.allowlisted(job.userId)) {
      this.inner.send(job);
      return;
    }
    this.dropped++;
    // One line per burst, not one per message: a busy event drops hundreds.
    this.timer ??= setTimeout(() => this.flush(), this.summaryMs);
    this.timer.unref();
  }

  /** Logs the count so far now, if there is one (the summary's time, or the shutdown). */
  flush(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
    if (this.dropped === 0) return;
    this.log.info(
      { dropped: this.dropped },
      'rehearsal: direct messages to members not on the allowlist were dropped',
    );
    this.dropped = 0;
  }
}

/** Where the bot may post during a rehearsal (`rehearsalPosts`). */
export interface RehearsalPosts {
  /** A message into this channel: only into the post of a party in a rehearsed forum. */
  mayPostIn(channelId: string): boolean;
  /** A post in this forum: only in the forum of a rehearsed region. */
  mayCreatePostIn(forumId: string): boolean;
  /** A forum beside this region channel: only for a rehearsed region. */
  mayCreateForumFor(regionChannelId: string): boolean;
}

export interface RehearsalPostsOptions {
  rehearsal: Rehearsal;
  /** The party whose post this is (`PartyStore.byPost`). */
  byPost: (postId: string) => { forumChannelId: string | null } | undefined;
  /** The regions as they are now. */
  regions: () => readonly { channelId: string; forumChannelId: string | null }[];
  /** A channel's name (`PartyGateway.channelName`). */
  channelName: (channelId: string) => string | undefined;
}

/** The rules of `RehearsalPosts` over the parties, the regions and the channels' names. */
export function rehearsalPosts(options: RehearsalPostsOptions): RehearsalPosts {
  const { rehearsal, byPost, regions, channelName } = options;
  const rehearsedForum = (forumId: string): boolean =>
    regions().some(
      (region) =>
        region.forumChannelId === forumId && rehearsal.rehearses(channelName(region.channelId)),
    );
  return {
    mayPostIn(channelId) {
      const forumId = byPost(channelId)?.forumChannelId;
      return forumId !== undefined && forumId !== null && rehearsedForum(forumId);
    },
    mayCreatePostIn: rehearsedForum,
    mayCreateForumFor: (regionChannelId) => rehearsal.rehearses(channelName(regionChannelId)),
  };
}

/** The gateway's methods a rehearsal answers itself (`rehearsalGateway`). */
type GuardedMethod =
  | 'sendMessage'
  | 'createPost'
  | 'createForum'
  | 'createCategory'
  | 'createTextChannel'
  | 'deleteChannel'
  | 'deleteReported'
  | 'bulkDelete'
  | 'clearReactions'
  | 'editPost'
  | 'editMessage'
  | 'unpinMessage';

/**
 * The gateway as a rehearsal uses it: a message, a post or a forum where `posts` does not allow
 * it is not sent (logged, answered as Discord answers for a channel that is gone: undefined);
 * everything else goes to `inner` as it is. So no announcement reaches a channel (the boss list,
 * gyms and Wayfarer imports, the link to a new post in its region's channel, copies in the
 * remote and elite channels, spawn reports and their Unown copies), whoever sends it. No
 * category or text channel is made (answered as a refused permission), no message
 * unpinned or deleted for a member outside the posts of parties (`deleteReported`, `bulkDelete`;
 * refused the same way), no reaction removed there (plan 8R-9G: `clearReactions` refused, and an
 * edit's `clearReactions` dropped, said once per channel: a board is never a party's post),
 * and no channel deleted but a forum made through this gateway.
 */
export function rehearsalGateway<G extends PartyGateway>(
  inner: G,
  posts: RehearsalPosts,
  log: Logger,
): G {
  // The forums made during the rehearsal: the only channels it may delete (one made but never
  // hidden, or left by no region, is taken away again).
  const made = new Set<string>();
  const refused: CreatedChannel = { ok: false, reason: 'no-permission' };
  // The channels where a removal of reactions was dropped, said once each (review R-F3: the
  // board is edited at every change).
  const keptReactionsIn = new Set<string>();
  const noReactionsRemoved = (channelId: string): void => {
    if (keptReactionsIn.has(channelId)) return;
    keptReactionsIn.add(channelId);
    log.info(
      { channel: channelId },
      'rehearsal: no reactions are removed outside the posts of parties',
    );
  };
  /** An edit's options without `clearReactions` outside the posts of rehearsed parties. */
  const keepReactions = (
    channelId: string,
    options: EditOptions | undefined,
  ): EditOptions | undefined => {
    if (options?.clearReactions !== true || posts.mayPostIn(channelId)) return options;
    noReactionsRemoved(channelId);
    const { clearReactions: _dropped, ...rest } = options;
    return rest;
  };
  const guarded: Pick<PartyGateway, GuardedMethod> = {
    sendMessage(channelId, message, options) {
      if (posts.mayPostIn(channelId)) return inner.sendMessage(channelId, message, options);
      log.info({ channel: channelId }, 'rehearsal: no message outside the posts of parties');
      return Promise.resolve(undefined);
    },
    createPost(forumId, post) {
      if (posts.mayCreatePostIn(forumId)) return inner.createPost(forumId, post);
      log.info({ forum: forumId }, 'rehearsal: no post outside the rehearsed forums');
      return Promise.resolve(undefined);
    },
    createForum(regionChannelId, name, tagNames, hidden) {
      // A forum members could see for a moment is never made, whoever asks.
      if (!hidden) {
        log.info({ region: regionChannelId }, 'rehearsal: no forum but a hidden one');
        return Promise.resolve(undefined);
      }
      if (posts.mayCreateForumFor(regionChannelId)) {
        return inner.createForum(regionChannelId, name, tagNames, hidden).then((forum) => {
          if (forum) made.add(forum.forumId);
          return forum;
        });
      }
      log.info({ region: regionChannelId }, 'rehearsal: no forum for a region not rehearsed');
      return Promise.resolve(undefined);
    },
    // The channels of /region (refused there too): never made, renamed or deleted for members.
    createCategory(guildId) {
      log.info({ guild: guildId }, 'rehearsal: no category is made');
      return Promise.resolve(refused);
    },
    createTextChannel(guildId) {
      log.info({ guild: guildId }, 'rehearsal: no text channel is made');
      return Promise.resolve(refused);
    },
    deleteChannel(channelId, reason) {
      if (made.has(channelId)) return inner.deleteChannel(channelId, reason);
      log.info({ channel: channelId }, 'rehearsal: no channel is deleted but a forum it made');
      return Promise.resolve();
    },
    // No message is unpinned outside the posts of parties (answered as a refused permission).
    unpinMessage(channelId, messageId) {
      if (posts.mayPostIn(channelId)) return inner.unpinMessage(channelId, messageId);
      log.info({ channel: channelId }, 'rehearsal: no message is unpinned outside the posts');
      return Promise.resolve(false);
    },
    // A report's Delete message (plan 8S-2): a real member's message is never deleted, but in
    // the post of a rehearsed party, which only staff and the testers see.
    deleteReported(channelId, messageId, options) {
      if (posts.mayPostIn(channelId)) return inner.deleteReported(channelId, messageId, options);
      log.info(
        { channel: channelId },
        'rehearsal: no member’s message is deleted outside the posts of parties',
      );
      return Promise.resolve('not-allowed' as const);
    },
    // The board's catch-up (plan 8R-9F; review W2: the keeper is off in rehearsal mode, and this
    // holds whoever asks): by the same rule as a reported message.
    bulkDelete(channelId, messageIds, options) {
      if (posts.mayPostIn(channelId)) return inner.bulkDelete(channelId, messageIds, options);
      log.info(
        { channel: channelId },
        'rehearsal: no member’s message is deleted outside the posts of parties',
      );
      return Promise.resolve('not-allowed' as const);
    },
    // Reactions (plan 8R-9G): by the same rule as a reported message. A board is never the post
    // of a party, so no board's reactions are removed in a rehearsal (`operations.md`); an edit
    // is made all the same, without removing them.
    clearReactions(channelId, messageId) {
      if (posts.mayPostIn(channelId)) return inner.clearReactions(channelId, messageId);
      noReactionsRemoved(channelId);
      return Promise.resolve('not-allowed' as const);
    },
    editPost(postId, message, options) {
      return inner.editPost(postId, message, keepReactions(postId, options));
    },
    editMessage(channelId, messageId, message, options) {
      return inner.editMessage(channelId, messageId, message, keepReactions(channelId, options));
    },
  };
  // The guarded methods are the keys of `guarded` itself (review F4: a list beside it was
  // forgotten once), so every method answered above is answered here.
  const guardedKeys: ReadonlySet<string> = new Set(Object.keys(guarded));
  return new Proxy(inner, {
    get(target, key) {
      if (typeof key === 'string' && guardedKeys.has(key)) return guarded[key as GuardedMethod];
      const value: unknown = Reflect.get(target, key, target);
      return typeof value === 'function'
        ? (value as (...args: unknown[]) => unknown).bind(target)
        : value;
    },
  });
}

/**
 * The gateway meetup safety uses during a rehearsal (Matt, 2026-10-17): its own posts, the
 * requests and appeals, go into the moderators' channel (a text channel that `moderators` says
 * is a server's moderators' channel, by its values), so the staff who rehearse see them; every
 * other message, and everything else, goes through `guarded` (the rehearsal's gateway). Only
 * meetup safety is given this gateway: the rest of the bot (the boss list, bot updates) posts
 * through `guarded`, and nothing of it reaches that channel.
 */
export function rehearsalModeratorsGateway<G extends PartyGateway>(
  guarded: G,
  inner: PartyGateway,
  moderators: (channelId: string) => boolean,
  log: Logger,
): G {
  const sendMessage: PartyGateway['sendMessage'] = (channelId, message) => {
    if (inner.channelKind(channelId) === 'text' && moderators(channelId)) {
      return inner.sendMessage(channelId, message);
    }
    log.info(
      { channel: channelId },
      "rehearsal: meetup safety posts only in the moderators' channel",
    );
    return Promise.resolve(undefined);
  };
  return new Proxy(guarded, {
    get(target, key) {
      if (key === 'sendMessage') return sendMessage;
      const value: unknown = Reflect.get(target, key, target);
      return typeof value === 'function'
        ? (value as (...args: unknown[]) => unknown).bind(target)
        : value;
    },
  });
}
