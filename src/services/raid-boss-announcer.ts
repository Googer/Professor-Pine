import type { Settings } from '../config/settings.js';
import type { PartyGateway } from '../discord/party-gateway.js';
import type { Logger } from '../log.js';
import { bossChangeAnnouncement, staleWarning } from '../render/boss-changes.js';
import { BOT_UPDATES_GONE, botUpdatesRefusedWords } from '../render/server-notices.js';
import { DM_PRIORITY, type DmSender } from './dm-sender.js';
import type { FeedChange, RaidBossService, StaleFeed } from './raid-boss-service.js';
import type { ServerNotices } from './server-notices.js';
import type { ServerSettingsLookup } from './server-settings.js';

/** At most this many announcements wait for Discord; older ones are dropped first. */
const MAX_WAITING = 10;

/** How long the owner's DM of a stale list is worth sending: a day, the spell may be over. */
const STALE_DM_MS = 24 * 3_600_000;

export interface RaidBossAnnouncerOptions {
  gateway: Pick<PartyGateway, 'serverChannels' | 'serverAvailable' | 'mayPost' | 'sendMessage'>;
  /** The servers (snowflakes) the bot is in, as the client knows them once it is ready. */
  serverIds: () => readonly string[];
  /** Each server's values: its channel for bot updates (plan 19A-1). */
  servers: ServerSettingsLookup;
  settings: Pick<Settings, 'raidBosses'>;
  log: Logger;
  /** The DM queue, for the owner's warning of a stale list (plan 19B-1). */
  dms: DmSender;
  /** `OWNER_ID`; blank: nobody is told of a stale list. */
  ownerId: string;
  /** What is wrong with a server's bot updates channel, told to its staff (plan 19B-1). */
  notices: Pick<ServerNotices, 'tell'>;
}

type Announcement =
  | {
      /** A change of the list, to every server's channel for bot updates. */
      to: 'bot-updates';
      content: string;
      /**
       * The zone whose list changed (`FeedChange.zone`, plan 19A-2): only the servers in it are
       * told. None: every server.
       */
      zone?: string;
    }
  | {
      /** A list out of date, to the owner: the feed is the instance's (plan 19B-1). */
      to: 'owner';
      content: string;
      at: number;
    };

/**
 * Tells about the raid boss list: a change of the list as members see it (the feed's list with
 * the overrides in force; plan 19A-2: each zone's change to the servers in that zone,
 * `FeedChange.zone`, so that each server is told of its own once) in each server's channel for
 * bot updates (where `settings.raidBosses.announceChanges` is on), the text channel its staff set
 * (plan 19A-1, by id), where the bot may post embeds; and a list that is out of date to the
 * owner by DM (plan 19B-1: an alert about the instance, once per stale spell as the service
 * reports it; no server's lab hears of it). A bot updates channel set and gone, or one the bot
 * may not post in, is told to that server's staff (`ServerNotices`). A message pings nobody.
 *
 * What the service reports before the client is ready waits (`ready`). A message is worded when
 * the event comes. Nobody waits for the sending, and a failure is logged.
 */
export class RaidBossAnnouncer {
  private isReady = false;
  private closed = false;
  private waiting: Announcement[] = [];
  private readonly sending = new Set<Promise<void>>();

  constructor(private readonly options: RaidBossAnnouncerOptions) {}

  /**
   * Listens to the service; call it before the service's first sync. Only the raid bosses: the
   * max bosses (`MaxBossService`, plan 8X-2) are not announced, their changes nor a max boss list
   * out of date (which is only logged); a follow-up if Matt wants them, which would word them
   * with the max tiers and attach here.
   */
  attach(source: Pick<RaidBossService, 'onChange' | 'onStale'>): void {
    source.onChange((change) => {
      this.changed(change);
    });
    source.onStale((stale) => {
      this.stale(stale);
    });
  }

  /** The client is ready: what waited is sent, and from now on everything at once. */
  ready(): void {
    if (this.isReady) return;
    this.isReady = true;
    const waiting = this.waiting;
    this.waiting = [];
    for (const announcement of waiting) this.send(announcement);
  }

  /** The feed's list changed: what members see change is announced (`FeedChange.seen`). */
  changed(change: FeedChange): void {
    if (!this.options.settings.raidBosses.announceChanges) return;
    const content = bossChangeAnnouncement(change.seen);
    if (content === undefined) return;
    this.announce({
      to: 'bot-updates',
      content,
      ...(change.zone === undefined ? {} : { zone: change.zone }),
    });
  }

  /** The list is out of date: the owner is told (none without `OWNER_ID`). */
  stale(event: StaleFeed): void {
    if (this.options.ownerId.trim() === '') return;
    this.announce({ to: 'owner', content: staleWarning(event.lastSyncedAt), at: Date.now() });
  }

  /** Waits for the messages that are on their way. For tests. */
  async flush(): Promise<void> {
    while (this.sending.size > 0) await Promise.allSettled([...this.sending]);
  }

  /**
   * For shutdown: waits for the messages on their way, and from then on sends nothing (the
   * client is about to go), also not what still waits for the client.
   */
  async close(): Promise<void> {
    this.closed = true;
    this.waiting = [];
    await this.flush();
  }

  private announce(announcement: Announcement): void {
    if (this.closed) return;
    if (this.isReady) {
      this.send(announcement);
      return;
    }
    this.waiting.push(announcement);
    if (this.waiting.length > MAX_WAITING) this.waiting.shift();
  }

  private send(announcement: Announcement): void {
    if (announcement.to === 'owner') {
      this.options.dms.send({
        userId: this.options.ownerId.trim(),
        message: { content: announcement.content },
        priority: DM_PRIORITY.normal,
        eventAt: announcement.at,
        expiresAt: announcement.at + STALE_DM_MS,
      });
      return;
    }
    const { gateway, serverIds, servers, log, notices } = this.options;
    for (const guildId of serverIds()) {
      if (announcement.zone !== undefined && servers.zoneOf(guildId) !== announcement.zone)
        continue;
      const id = servers.of(guildId).channels['bot-updates'];
      if (id === undefined) continue;
      // Unavailable (its channels may be out of date), or left: nothing is sent, and nothing is
      // said to be gone (plan 19B-1).
      if (!gateway.serverAvailable(guildId)) continue;
      const channels = gateway.serverChannels(guildId);
      if (channels === undefined) continue;
      const channel = channels.find((one) => one.kind === 'text' && one.id === id);
      if (!channel) {
        notices.tell(guildId, 'bot-updates:gone', BOT_UPDATES_GONE);
        continue;
      }
      if (!gateway.mayPost(channel.id)) {
        notices.tell(guildId, 'bot-updates:cannot-post', botUpdatesRefusedWords(channel.id));
        continue;
      }
      const sent: Promise<void> = gateway
        .sendMessage(channel.id, { content: announcement.content })
        .then(
          () => undefined,
          (err: unknown) => {
            log.warn(
              { err, guild: guildId, what: 'change' },
              'could not announce the raid boss list',
            );
          },
        )
        .finally(() => this.sending.delete(sent));
      this.sending.add(sent);
    }
  }
}
