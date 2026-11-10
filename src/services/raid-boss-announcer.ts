import type { Settings } from '../config/settings.js';
import type { PartyGateway } from '../discord/party-gateway.js';
import type { Logger } from '../log.js';
import { bossChangeAnnouncement, staleWarning } from '../render/boss-changes.js';
import type { FeedChange, RaidBossService, StaleFeed } from './raid-boss-service.js';

/** At most this many announcements wait for Discord; older ones are dropped first. */
const MAX_WAITING = 10;

export interface RaidBossAnnouncerOptions {
  gateway: Pick<PartyGateway, 'serverChannels' | 'mayPost' | 'sendMessage'>;
  /** The servers (snowflakes) the bot is in, as the client knows them once it is ready. */
  servers: () => readonly string[];
  settings: Pick<Settings, 'channels' | 'raidBosses'>;
  log: Logger;
}

interface Announcement {
  /** The name of the channel it goes to in every server (`settings.channels`). */
  channel: string;
  content: string;
  /** For the log. */
  what: 'change' | 'stale';
}

/**
 * Tells the servers of the bot about the raid boss list: a change of the list as members see it
 * (the feed's list with the overrides in force) in the channel for bot updates (`settings.channels['bot-updates']`, where
 * `settings.raidBosses.announceChanges` is on), and a list that is out of date in the
 * moderators' bot channel (`settings.channels['mod-bot-lab']`). A message goes to the oldest
 * text channel of that name in each server in which the bot may post embeds, and pings nobody.
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
      channel: this.options.settings.channels['bot-updates'],
      content,
      what: 'change',
    });
  }

  stale(event: StaleFeed): void {
    this.announce({
      channel: this.options.settings.channels['mod-bot-lab'],
      content: staleWarning(event.lastSyncedAt),
      what: 'stale',
    });
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
    const { gateway, servers, log } = this.options;
    for (const guildId of servers()) {
      const channel = (gateway.serverChannels(guildId) ?? []).find(
        (one) =>
          one.kind === 'text' && one.name === announcement.channel && gateway.mayPost(one.id),
      );
      if (!channel) continue;
      const sent: Promise<void> = gateway
        .sendMessage(channel.id, { content: announcement.content })
        .then(
          () => undefined,
          (err: unknown) => {
            log.warn(
              { err, guild: guildId, what: announcement.what },
              'could not announce the raid boss list',
            );
          },
        )
        .finally(() => this.sending.delete(sent));
      this.sending.add(sent);
    }
  }
}
