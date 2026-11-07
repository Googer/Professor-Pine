import type { Settings } from '../config/settings.js';
import type { SpawnReportStorage } from '../db/repositories/spawn-report-repository.js';
import {
  isMissingPermission,
  isRefusedBody,
  type OutgoingMessage,
  type PartyGateway,
} from '../discord/party-gateway.js';
import type { Logger } from '../log.js';
import {
  sightingMessage,
  SPAWN_MINUTES,
  spawnFooter,
  spawnMessage,
  spawnTextMessage,
  type SpawnPlace,
  type SpawnView,
} from '../render/spawn.js';
import { placeImage } from '../render/place.js';
import type { NamedMember } from '../render/text.js';
import { pokemonPicture } from '../domain/pogo/pokemon-icons.js';
import { costumedSpawn } from '../domain/time/spawn-events.js';
import type { EventSpawnProvider } from './event-page-service.js';
import type { GameDataProvider } from './game-data-service.js';
import type { RaidBossProvider } from './raid-boss-service.js';

/** The Pokédex number of Unown, whose sightings a server may collect in a channel of their own. */
export const UNOWN_DEX = 201;

/** A wild Pokémon as a member reported it with `/wild`. */
export interface SpawnReport {
  /** Snowflake of the server. */
  guildId: string;
  /** The text channel of the region it was reported in. */
  regionChannelId: string;
  /** The catalogue entry that was reported. */
  pokemon: { dex: number; key: string; name: string };
  /** Where it is, as typed; null when nothing was said. */
  details: string | null;
  iv?: 'perfect' | 'zero' | undefined;
  reporter: NamedMember;
  /** The gym, PokéStop or power spot the reporter said it is near (`/wild near:`). */
  near?: SpawnPlace | undefined;
}

/** What members are told about a spawn (`NotifyService.spawnReported`). */
export interface SpawnNews extends SpawnReport {
  view: SpawnView;
  /** The report is of a costumed Pokémon (plan 8R-4: an active event lists it costumed). */
  costumed?: boolean;
  /** The report in the region's channel: a direct message links to it. */
  messageId: string;
  eventAt: number;
  /** When the report goes away (the report says so too): a direct message says the same. */
  goneAt: number;
}

export type SpawnOutcome =
  /**
   * The report stands in the region's channel, as this message; `costumed` where an event on
   * lists the Pokémon costumed (plan 8R-4).
   */
  | { kind: 'posted'; channelId: string; messageId: string; costumed?: true }
  /** The region's channel is gone. */
  | { kind: 'no-channel' }
  /** Discord refused the message: the bot may not post in the region's channel, or not see it. */
  | { kind: 'refused' }
  /** The bot is shutting down: nothing is posted any more. */
  | { kind: 'closed' };

/** What became of the deletion of a report: done, or why not. */
type Removal = { removed: true } | { removed: false; err: unknown };

/** How long after a deletion that failed at its time it is tried once more. */
export const DELETE_AGAIN_MS = 60_000;

/** How long after its time a report that cannot be deleted is still tried at every sweep. */
export const GIVE_UP_MS = 24 * 60 * 60_000;

export interface SpawnServiceOptions {
  /**
   * The few things spawn reports ask of Discord are all things the party gateway does (send
   * and delete a message, find a channel by name where the bot may post embeds, ask whether it
   * may post embeds in one), with a fake that is as strict: no port of their own.
   */
  gateway: Pick<PartyGateway, 'sendMessage' | 'deleteMessage' | 'findChannel' | 'mayPost'>;
  /** The pictures of the Pokémon that are raid bosses now: what the feed shows wins. */
  raidBosses: Pick<RaidBossProvider, 'bosses'>;
  /** The catalogue and the icon files that exist: the picture of every other Pokémon. */
  gameData: GameDataProvider;
  /**
   * The spawns of the events on (plan 8R-4): a report is costumed where one lists the
   * Pokémon's entry costumed (`costumedSpawn`). Without it no report is.
   */
  costumes?: Pick<EventSpawnProvider, 'sightingsAt'>;
  /** Told of every report that was posted, to tell who wants that Pokémon. */
  notify?: { spawnReported(news: SpawnNews): void };
  /**
   * Where the reports that stand are recorded, so that those of a process that was killed are
   * deleted by the next one (`sweep`). Without it they are kept in memory only.
   */
  store?: SpawnReportStorage;
  settings: Settings;
  log: Logger;
  now?: () => number;
  /** How long a report stands before it is deleted. Default `SPAWN_MINUTES`. */
  deleteAfterMs?: number;
  /**
   * Starts the timer that deletes a report and gives the function that cancels it. Default:
   * `setTimeout`, unref'd. A test passes its own to fire the timer by hand.
   */
  setTimer?: (run: () => void, ms: number) => () => void;
}

/**
 * Reports of wild Pokémon (`/wild`): a public message in the text channel of the region, which
 * is deleted after half an hour (a spawn is gone by then), and the direct messages to who wants
 * that Pokémon, which the notifier sends. A message that Discord refuses for its picture is sent
 * once more without it. Where the bot may not post embeds the report goes out
 * as text.
 *
 * A graceful shutdown deletes the messages that wait for their deletion at once (`flush`) and
 * takes no report from then on (one whose message was on its way to Discord just then is
 * deleted as soon as it is there, and answered as closed). A deletion that fails at its time
 * is tried once more a minute later, unless the bot shuts down meanwhile: then the failure is
 * said.
 *
 * Every report that stands is also recorded (`store`) until it is deleted. `sweep` (at start
 * and hourly, with the upkeep of the forums) takes up what is recorded and does not wait in
 * this process: the reports of a process that was killed, and those whose deletion failed.
 * What is overdue is deleted at once, the rest at its time; a report that still cannot be
 * deleted a day after its time is given up.
 *
 * Unown is a species like any other (Matt, 2026-10-12): the region message and the direct
 * messages as for every Pokémon. Where the server has the channel for Unown sightings
 * (`settings.channels.unown`, found by name, only where the bot may post embeds) the report
 * is also posted there, and stays. No role is assigned or pinged and nothing is pinned.
 */
export class SpawnService {
  private readonly now: () => number;
  private readonly setTimer: (run: () => void, ms: number) => () => void;
  /** The reports that wait for their deletion, by message. */
  private readonly waiting = new Map<string, { channelId: string; cancel: () => void }>();
  private readonly deleting = new Set<Promise<Removal>>();
  /** The messages whose deletion is on its way. */
  private readonly removing = new Set<string>();
  /** The reports that are being posted: a shutdown waits for them. */
  private readonly posting = new Set<Promise<SpawnOutcome>>();
  private readonly deleteAfterMs: number;
  /** Set at shutdown (`flush`): a report made later would stand for good. */
  private closed = false;

  constructor(private readonly options: SpawnServiceOptions) {
    this.now = options.now ?? (() => Date.now());
    this.deleteAfterMs = options.deleteAfterMs ?? SPAWN_MINUTES * 60_000;
    this.setTimer =
      options.setTimer ??
      ((run, ms) => {
        const timer = setTimeout(run, ms);
        timer.unref();
        return () => {
          clearTimeout(timer);
        };
      });
  }

  /** How many reports wait for their deletion. */
  get pending(): number {
    return this.waiting.size;
  }

  /**
   * The picture of a Pokémon (`pokemonPicture`): that of the raid boss feed when it is a boss
   * now, otherwise the icon of its catalogue entry; none when neither is known. A report goes
   * out without its picture rather than not at all.
   */
  private pictureOf(key: string): string | undefined {
    const { raidBosses, gameData, log } = this.options;
    try {
      const feed = raidBosses.bosses().find((boss) => boss.entry?.key === key)?.image;
      return pokemonPicture(feed, gameData.catalogue.byKey(key), gameData);
    } catch (err) {
      log.warn({ err, pokemon: key }, 'could not find the picture of a Pokémon');
      return undefined;
    }
  }

  /**
   * Posts a report in the region's channel and has it deleted later; for Unown also in the
   * sightings channel. Throws when the region message cannot be sent for another reason than
   * the outcomes name; what fails after that is logged.
   */
  report(report: SpawnReport): Promise<SpawnOutcome> {
    if (this.closed) return Promise.resolve({ kind: 'closed' });
    const posting: Promise<SpawnOutcome> = this.post(report).finally(() =>
      this.posting.delete(posting),
    );
    this.posting.add(posting);
    return posting;
  }

  /**
   * Whether an event on at `at` lists the Pokémon costumed (plan 8R-4); a provider that fails
   * is logged, and the report goes out plain.
   */
  private costumed(key: string, at: number): boolean {
    const { costumes, log } = this.options;
    try {
      return costumes !== undefined && costumedSpawn(costumes.sightingsAt(at), { key });
    } catch (err) {
      log.warn({ err, pokemon: key }, 'could not tell whether a spawn is costumed');
      return false;
    }
  }

  private async post(report: SpawnReport): Promise<SpawnOutcome> {
    const { gateway, notify, settings, log } = this.options;
    const eventAt = this.now();
    const costumed = this.costumed(report.pokemon.key, eventAt);
    const view: SpawnView = {
      pokemon: report.pokemon.name,
      iv: report.iv,
      details: report.details,
      reporter: report.reporter,
      image: this.pictureOf(report.pokemon.key),
      near: report.near,
      ...(costumed ? { costumed: true } : {}),
    };
    // Without the permission to embed Discord would show the sentence alone: as text then.
    const footer = spawnFooter(settings.features.notifications);
    const goneAt = eventAt + this.deleteAfterMs;
    const embeds = gateway.mayPost(report.regionChannelId);
    const message = (shown: SpawnView): OutgoingMessage =>
      embeds ? spawnMessage(shown, footer, goneAt) : spawnTextMessage(shown, footer);
    let messageId: string | undefined;
    try {
      messageId = await this.sendWithoutPicture(report.regionChannelId, view, message);
    } catch (err) {
      if (!isMissingPermission(err)) throw err;
      log.warn(
        { err, guild: report.guildId, channel: report.regionChannelId },
        'the bot may not post a spawn report in the channel of a region',
      );
      return { kind: 'refused' };
    }
    if (messageId === undefined) return { kind: 'no-channel' };
    if (this.closed) {
      // The bot began to shut down while the message was on its way: nothing would delete it
      // later, so it goes at once, and nobody is told of it.
      await this.remove(report.regionChannelId, messageId, true);
      return { kind: 'closed' };
    }
    await this.record(report.regionChannelId, messageId);
    this.deleteLater(report.regionChannelId, messageId, this.deleteAfterMs, true);
    if (report.pokemon.dex === UNOWN_DEX) {
      try {
        const sightings = gateway.findChannel(report.regionChannelId, settings.channels.unown);
        if (sightings !== undefined && sightings !== report.regionChannelId) {
          await this.sendWithoutPicture(sightings, view, (shown) =>
            sightingMessage(shown, report.regionChannelId),
          );
        }
      } catch (err) {
        log.warn({ err, guild: report.guildId }, 'could not post an Unown sighting');
      }
    }
    notify?.spawnReported({
      ...report,
      view,
      messageId,
      eventAt,
      goneAt,
      ...(costumed ? { costumed: true } : {}),
    });
    return {
      kind: 'posted',
      channelId: report.regionChannelId,
      messageId,
      ...(costumed ? { costumed: true as const } : {}),
    };
  }

  /**
   * Sends a message made of `view`; when Discord refuses it for what it holds (Invalid Form Body:
   * the picture's address, as a post's copy is) and the view has a picture, once more without it.
   * Any other error is the caller's.
   */
  private async sendWithoutPicture(
    channelId: string,
    view: SpawnView,
    make: (view: SpawnView) => OutgoingMessage,
  ): Promise<string | undefined> {
    const { gateway, log } = this.options;
    try {
      return await gateway.sendMessage(channelId, make(view));
    } catch (err) {
      const pictured = view.image !== undefined || placeImage(view.near) !== null;
      if (!pictured || !isRefusedBody(err)) throw err;
      log.warn({ err, channel: channelId }, 'Discord refused the picture of a spawn report');
      // Which of the two pictures it was is not said: both go.
      const near =
        view.near?.kind === 'pin' ? view.near : view.near && { ...view.near, image: null };
      return gateway.sendMessage(channelId, make({ ...view, image: undefined, near }));
    }
  }

  /** Records a report that stands; never rejects (a report that is not recorded still goes). */
  private async record(channelId: string, messageId: string): Promise<void> {
    const { store, log } = this.options;
    try {
      await store?.add({ channelId, messageId, deleteAt: this.now() + this.deleteAfterMs });
    } catch (err) {
      log.warn({ err, channel: channelId }, 'could not record a spawn report');
    }
  }

  /** Forgets a recorded report; never rejects. */
  private async forget(channelId: string, messageId: string): Promise<void> {
    const { store, log } = this.options;
    try {
      await store?.remove(messageId);
    } catch (err) {
      log.warn({ err, channel: channelId }, 'could not forget a spawn report');
    }
  }

  /**
   * Takes up the recorded reports that do not wait in this process; answers how many. Each is
   * deleted when it is due (now, when that has passed), and tried again at the next sweep when
   * that fails, until `GIVE_UP_MS` after its time.
   */
  async sweep(): Promise<number> {
    const { store, log } = this.options;
    if (!store || this.closed) return 0;
    const rows = await store.all();
    const now = this.now();
    let taken = 0;
    for (const { channelId, messageId, deleteAt } of rows) {
      if (this.closed) break;
      if (this.waiting.has(messageId) || this.removing.has(messageId)) continue;
      if (now - deleteAt >= GIVE_UP_MS) {
        await this.forget(channelId, messageId);
        log.warn({ channel: channelId, message: messageId }, 'gave up deleting a spawn report');
        continue;
      }
      this.deleteLater(channelId, messageId, Math.max(0, deleteAt - now), false);
      taken += 1;
    }
    return taken;
  }

  /**
   * Has a report deleted after `ms`. One whose deletion fails then is tried once more
   * `DELETE_AGAIN_MS` later (`again`), and until then still waits: a shutdown tries it too.
   */
  private deleteLater(channelId: string, messageId: string, ms: number, again: boolean): void {
    const cancel = this.setTimer(() => {
      this.waiting.delete(messageId);
      void this.remove(channelId, messageId, !again).then((removal) => {
        if (removal.removed || !again) return;
        if (!this.closed) {
          this.deleteLater(channelId, messageId, DELETE_AGAIN_MS, false);
          return;
        }
        // The bot began to shut down while the deletion was on its way: there is no minute
        // later, and `flush` did not count this report (it no longer waited).
        this.options.log.warn(
          { err: removal.err, channel: channelId, message: messageId },
          'could not delete a spawn report',
        );
      });
    }, ms);
    // A sweep may have taken the report up between its recording and this: one timer only.
    this.waiting.get(messageId)?.cancel();
    this.waiting.set(messageId, { channelId, cancel });
  }

  /**
   * Deletes a report; never rejects. A failure is logged when `last` says nothing follows, and
   * given back with its reason for whoever decides what follows.
   */
  private remove(channelId: string, messageId: string, last: boolean): Promise<Removal> {
    this.removing.add(messageId);
    const removal: Promise<Removal> = this.options.gateway
      .deleteMessage(channelId, messageId)
      .then(
        async (): Promise<Removal> => {
          await this.forget(channelId, messageId);
          return { removed: true };
        },
        (err: unknown): Removal => {
          if (last) {
            this.options.log.warn({ err, channel: channelId }, 'could not delete a spawn report');
          }
          return { removed: false, err };
        },
      )
      .finally(() => {
        this.removing.delete(messageId);
        this.deleting.delete(removal);
      });
    this.deleting.add(removal);
    return removal;
  }

  /**
   * For shutdown: takes no report from now on, deletes the reports that still wait, now, and
   * waits for every deletion, also that of a report that was being posted. A report that
   * stayed would stand in its channel for good: how many could not be removed is said.
   */
  async flush(): Promise<void> {
    this.closed = true;
    // A report on its way deletes its own message; a send that fails is its caller's to hear.
    await Promise.allSettled(this.posting);
    const removals: Promise<Removal>[] = [];
    for (const [messageId, { channelId, cancel }] of [...this.waiting]) {
      cancel();
      this.waiting.delete(messageId);
      removals.push(this.remove(channelId, messageId, true));
    }
    const standing = (await Promise.all(removals)).filter(({ removed }) => !removed).length;
    if (standing > 0) {
      this.options.log.warn(
        { standing },
        'spawn reports could not be removed at shutdown and stay',
      );
    }
    while (this.deleting.size > 0) await Promise.all(this.deleting);
  }
}
