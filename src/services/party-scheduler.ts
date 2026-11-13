import type { Settings } from '../config/settings.js';
import type { UserSettingsReader } from '../db/repositories/user-repository.js';
import type { PartyGateway } from '../discord/party-gateway.js';
import { isRaid, type Party } from '../domain/party/party.js';
import {
  partyTick,
  tickAutoset,
  warningAddressee,
  type TickEffect,
  type TickInput,
} from '../domain/party/tick.js';
import type { Logger } from '../log.js';
import { archiveWarning } from '../render/activity.js';
import { fitItems, plain, withMentions } from '../render/text.js';
import type { AttendanceService } from './attendance-service.js';
import { LockOverdueError } from './keyed-lock.js';
import type { PartyNotifier } from './notify-service.js';
import { settingsOf } from './party-change.js';
import type { PartyLines } from './party-lines.js';
import type { PartyService } from './party-service.js';
import type { PartyStore } from './party-store.js';
import type { RaidBossProvider } from './raid-boss-service.js';

const HOUR_MS = 3_600_000;
/**
 * How old the new train of a split must be for the upkeep to take it back while it is pending
 * (`PartyService.settlePendingSplits`). The old train's moves lock keeps a split under way apart
 * from the upkeep, which looks at a train only once that split is done (and finds it settled, or
 * gone, then); the minute only spares the upkeep waiting behind a split that takes a moment from
 * its post to its one write of both trains. One older is a split whose write failed and whose
 * take-back could not end the new train.
 */
const PENDING_SPLIT_MS = 60_000;
/** The warning is said again after this many messages of others in the post. */
export const WARN_AGAIN_AFTER = 5;
/** The names in a line of the scheduler are cut so that the line stays well within a message. */
const LINE_NAMES = 1_500;

export interface PartySchedulerOptions {
  store: PartyStore;
  posts: Pick<
    PartyService,
    | 'changed'
    | 'end'
    | 'rulesIn'
    | 'zoneOf'
    | 'view'
    | 'redoClosings'
    | 'sweepCopies'
    | 'sweepPosts'
    | 'checkSummaries'
    | 'whileOpen'
  >;
  attendance: Pick<AttendanceService, 'ask' | 'removeQuestions'>;
  /** The access of members of other regions, whose leftovers are swept with the forums. */
  access?: { sweep(): Promise<unknown> };
  /** The staff audit log, whose entries older than 30 days go with the upkeep (`PartyAudit`). */
  audit?: { sweep(): Promise<unknown> };
  /**
   * The staff's log of the servers' settings (plan 19A-1, `ServerSettings.sweepLog`), whose
   * entries older than 30 days go with the upkeep, right after the parties' log.
   */
  settingsAudit?: { sweep(): Promise<unknown> };
  /**
   * The party history, whose parties left without a record (a record that gave up its tries,
   * a stop before them) are recorded with the forums' upkeep: at start and hourly. The sweep is
   * told of the clock's stop and ends there.
   */
  history?: { sweep(options: { isStopped: () => boolean }): Promise<unknown> };
  /**
   * The activity heatmap's buckets (plan 8H-4, `ActivityRepository.addNew`): the records the
   * history gained since the last upkeep are added after its sweep, batch by batch; told of the
   * clock's stop, it ends there (the next upkeep goes on from its mark).
   */
  activity?: { addNew(options: { isStopped: () => boolean }): Promise<unknown> };
  /**
   * The legacy fill-ins members asked for (plan 8H-10, `LegacyFillInService`): the upkeep starts
   * a run for what is left waiting (at start: what a restart found queued; hourly: a server index
   * that was being swapped, a claim of a run cut short) and does not wait for it: the fill-ins
   * have their own stop, which the shutdown waits for briefly.
   */
  legacyFillIns?: { kick(): void };
  /**
   * The routes of the trains, swept with the forums: stops whose gym the gym list no longer
   * knows are taken off (`TrainService.removeUnknownStops`).
   */
  routes?: { removeUnknownStops(): Promise<unknown> };
  /** The spawn reports that still stand, swept with the forums (`SpawnService.sweep`). */
  spawns?: { sweep(): Promise<unknown> };
  /** The reports at stops, of which those that ended go with the upkeep (plan 8R-1). */
  stops?: { sweep(): Promise<unknown> };
  /** The grunts' messages that still stand, swept as spawn reports are (plan 8R-2). */
  grunts?: { sweep(): Promise<unknown> };
  /** The map pictures of places, of which those older than a day go with the upkeep. */
  pictures?: { prunePlaces(): Promise<unknown> };
  /** The pictures of places beside a post's Where: those nobody asked for in a month go too. */
  placePictures?: { prune(): Promise<unknown> };
  /**
   * Google's answers by the point (plan 19B-3, `GoogleAnswers.sweep`): those no gym or Wayspot of
   * any server shows go with the upkeep, at most once a day (the sweep keeps its own day).
   */
  googleAnswers?: { sweep(): Promise<unknown> };
  /** The screenshots kept on disk, of which those that are due go with the upkeep. */
  screenshots?: { sweep(): Promise<unknown> };
  /** The emoji of the bot's application, read anew with the upkeep (`ApplicationEmoji`). */
  emoji?: { refresh(): Promise<unknown> };
  /** The sessions of the web pages, of which those that expired go with the upkeep. */
  webSessions?: { sweep(): Promise<unknown> };
  /**
   * The events forum (plan 8V-1), drawn with the upkeep: a post still open three days after its
   * event's end is archived then, and a listing a missed timer left stale is drawn anew.
   */
  eventForum?: { upkeep(): Promise<unknown> };
  /**
   * The new trains of splits left pending in the process (plan 8T: a split whose write failed,
   * and whose new train could not be ended then), taken back with the upkeep once they are a
   * minute old (`PartyService.settlePendingSplits`).
   */
  splits?: Pick<PartyService, 'settlePendingSplits'>;
  /**
   * The meetup requests held for the moderators (`MeetupSafety.expire`), of which those whose
   * time is up expire at every tick: an hour before the meetup's start is too fine for the
   * hourly upkeep. In the background, as the upkeep: the tick does not wait for it, and a tick
   * while one is under way starts none.
   */
  requests?: { expire(): Promise<unknown> };
  lines: Pick<PartyLines, 'say'>;
  gateway: Pick<PartyGateway, 'sendMessage' | 'deleteMessage'>;
  raidBosses: Pick<RaidBossProvider, 'autoset'>;
  /** The members' settings: whether who leads a train or meetup lets the bot ping them. */
  users?: UserSettingsReader;
  /** Told when the clock changes a raid (an egg that hatches as its only possible boss). */
  notify?: Pick<PartyNotifier, 'raidChanged'>;
  settings: Settings;
  log: Logger;
  now?: () => number;
  /** How often the clock runs. Default `settings.cleanupInterval`. */
  intervalMs?: number;
  /** How often the forums are looked through for open posts and missing summaries. Default hourly. */
  upkeepMs?: number;
}

/**
 * The clock of the parties (spec 5.3). Every `cleanupInterval` it runs `partyTick` for each
 * active party inside the store and does what the tick asks for: shows the post anew, says that
 * an egg has hatched, asks a group after its meeting time, counts silence as done, warns that
 * the post will be archived, and ends the party. A meetup or a train asks only for the first
 * and the last two of these.
 *
 * A tick compares the time with what each party records, so the first tick after a start
 * applies everything that was missed while the bot was down. The party is stored before
 * anything is done about it: what fails on Discord's side afterwards is logged and not done
 * again, except the ending, which the tick asks for until the party has ended.
 *
 * The warning would be lost in a busy post, and Discord has nothing that stays in view there, so
 * it is said again at the bottom after every few messages of others (`activity`), the earlier
 * one deleted: a post has one warning, never far up.
 */
export class PartyScheduler {
  private readonly now: () => number;
  private timer: NodeJS.Timeout | undefined;
  private running: Promise<void> | undefined;
  private upkeeping: Promise<void> | undefined;
  /** The expiry of the meetup requests under way (`requests`), started by a tick. */
  private expiring: Promise<void> | undefined;
  private previous: number | null = null;
  private lastUpkeep: number;
  private stopped = false;
  /** Messages of others since the warning was last said, by post. Not stored: a restart starts anew. */
  private readonly sinceWarning = new Map<string, number>();
  /** Warnings being said again; `stop` waits for them. */
  private readonly repeating = new Map<string, Promise<void>>();

  constructor(private readonly options: PartySchedulerOptions) {
    this.now = options.now ?? (() => Date.now());
    this.lastUpkeep = this.now();
  }

  /**
   * Starts the clock once `ready` has settled: the first tick catches up and shows every post
   * anew (nothing else does that after a restart), the forums are looked through once in the
   * background (see `upkeep`), and from then on a tick runs at every interval. `ready` is for what the clock
   * must not run without: the connection to Discord (a post that cannot be asked for yet would
   * be taken for deleted) and, with a limit of the caller's, the first read of the raid events.
   * Never rejects.
   */
  async start(ready: Promise<unknown> = Promise.resolve()): Promise<void> {
    const { store, log, settings } = this.options;
    await ready.catch(() => undefined);
    if (this.stopped) return;
    await this.tick();
    if (this.stopped) return;
    this.timer = setInterval(
      () => void this.tick(),
      this.options.intervalMs ?? settings.cleanupInterval,
    );
    this.timer.unref();
    // Not awaited: a slow forum sweep must not hold the clock. `stop` and `whenIdle` wait for it.
    this.upkeep();
    log.info({ parties: store.active().length }, 'the party clock is running');
  }

  /**
   * Stops the clock and waits for what is under way. Call before the services are flushed. A
   * `start` that is still waiting for `ready` does nothing once that settles.
   */
  async stop(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    await this.whenIdle();
  }

  /**
   * The gateway is back after a real disconnect (plan 8X-H, review R6): the upkeep (the closings
   * the network failed, the sweep of ended parties' posts, the summaries, the access, the application's emoji and the rest) runs
   * now, whenever the last one ran: its steps never fail as a whole, so whether one is owed is not
   * known, and an hour is long to wait. One under way is waited for first (the upkeep at a
   * laptop's wake, while the network was still away); then one of its own. Nothing before the
   * clock runs or after it stopped. Says whether it ran one (review F6: the catch-up's line does
   * not call an upkeep done that never ran). Never rejects.
   */
  async catchUp(): Promise<boolean> {
    if (this.stopped || this.timer === undefined) return false;
    await this.upkeeping;
    if (this.stopped) return false;
    this.upkeep();
    await this.upkeeping;
    return true;
  }

  /** How many posts have a count of messages since their warning. For tests. */
  get counted(): number {
    return this.sinceWarning.size;
  }

  /** Resolves once nothing the clock started is under way. For `stop` and for tests. */
  async whenIdle(): Promise<void> {
    await this.running;
    await this.upkeeping;
    await this.expiring;
    await Promise.all(this.repeating.values());
  }

  /**
   * A member (not a bot) wrote in a channel. When that is the post of a party that has
   * been warned, the message counts, and with every `WARN_AGAIN_AFTER`th the warning is said
   * again below it. Returns at once; never throws.
   */
  activity(channelId: string): void {
    const { store, log } = this.options;
    if (this.stopped) return;
    let party: Party | undefined;
    try {
      party = store.byPost(channelId);
    } catch {
      // The parties are not loaded yet.
      return;
    }
    if (!party || party.deletionTime === null || party.prompts.warning === null) {
      this.sinceWarning.delete(channelId);
      return;
    }
    const count = (this.sinceWarning.get(channelId) ?? 0) + 1;
    if (count < WARN_AGAIN_AFTER || this.repeating.has(channelId)) {
      this.sinceWarning.set(channelId, count);
      return;
    }
    this.sinceWarning.set(channelId, 0);
    const again = this.warn(party.id)
      .catch((err: unknown) => {
        log.warn({ err, party: party.id }, 'could not say the archive warning again');
      })
      .finally(() => this.repeating.delete(channelId));
    this.repeating.set(channelId, again);
  }

  /**
   * One run of the clock over every active party. A tick that is asked for while one is running
   * is that same run: ticks never overlap. Never rejects.
   */
  tick(): Promise<void> {
    this.running ??= this.run()
      .catch((err: unknown) => {
        this.options.log.error({ err }, 'the party clock failed');
      })
      .finally(() => {
        this.running = undefined;
      });
    return this.running;
  }

  private async run(): Promise<void> {
    const { store, posts, raidBosses, settings, log } = this.options;
    const now = this.now();
    // One input per zone in use, not per party (plan 19A-2): each party ticks by the rules of
    // its server's zone, whose days it is shown anew at.
    const inputs = new Map<string, TickInput>();
    const inputOf = (party: Party): TickInput => {
      const zone = posts.zoneOf(party);
      let input = inputs.get(zone);
      if (input === undefined) {
        const autoset = tickAutoset({ autoset: (tier) => raidBosses.autoset(tier, zone) });
        input = { now, previous: this.previous, settings, rules: posts.rulesIn(zone), autoset };
        inputs.set(zone, input);
      }
      return input;
    };
    for (const { id } of store.active()) {
      if (this.stopped) return;
      try {
        await this.tickParty(id, inputOf);
      } catch (err) {
        // A change of the party is stuck past its lock's limit, which the store logged once: the
        // next tick tries again (2026-11-07).
        if (err instanceof LockOverdueError) {
          log.debug({ party: id }, 'the clock passed over a busy party');
          continue;
        }
        log.error({ err, party: id }, 'could not run the clock for a party');
      }
    }
    this.previous = now;
    const { requests } = this.options;
    if (requests && !this.stopped) {
      // In the background, as the upkeep: one at a time, and the tick does not wait for it.
      this.expiring ??= requests
        .expire()
        .then(
          () => undefined,
          (err: unknown) => {
            log.error({ err }, 'could not expire the meetup requests whose time is up');
          },
        )
        .finally(() => {
          this.expiring = undefined;
        });
    }
    if (now - this.lastUpkeep >= (this.options.upkeepMs ?? HOUR_MS) && !this.stopped) {
      this.upkeep();
    }
  }

  /**
   * Closes again the parties whose closing the network failed (plan 8X-H, review r0 B4: before
   * the sweep, which would only archive them), deletes the copies and link lines ended parties
   * left that no closing dealt with (a stop or a restart came between), archives open posts of
   * ended parties, looks after
   * the summaries, takes back the access to
   * forums that nothing calls for any more, takes stops off the routes of trains whose gym is
   * gone, has the spawn reports and grunts' messages deleted that no process deleted at their
   * time, forgets the reports at stops that ended, and the kept
   * screenshots that are due, Google's answers no place uses (once a day), and the expired
   * sessions of the web pages, settles the new trains
   * of splits left pending, records the parties the party history was left without and adds the
   * history's new records to the activity heatmap, and reads the application's emoji anew: at
   * start and hourly.
   */
  private upkeep(): void {
    const { posts, access, routes, spawns, pictures, screenshots, emoji, webSessions, log } =
      this.options;
    const { history, activity, splits, stops, grunts, eventForum, legacyFillIns, audit } =
      this.options;
    const { settingsAudit } = this.options;
    const { placePictures, googleAnswers } = this.options;
    this.lastUpkeep = this.now();
    // Each by itself: one that fails does not keep the others from running. Once the clock has
    // stopped none starts: the shutdown waits for the upkeep (review r1 C3).
    const step = async (work: () => Promise<unknown>): Promise<void> => {
      if (this.stopped) return;
      try {
        await work();
      } catch (err) {
        log.error({ err }, 'the upkeep of the forums failed');
      }
    };
    this.upkeeping ??= (async () => {
      // Party by party: it ends with the clock's stop (what is left, the next start's sweep
      // archives).
      await step(() => posts.redoClosings({ isStopped: () => this.stopped }));
      // What ended parties left that no closing in memory owns (a stop mid-closing, a restart).
      await step(() => posts.sweepCopies({ isStopped: () => this.stopped }));
      await step(() => posts.sweepPosts());
      await step(() => posts.checkSummaries());
      if (access) await step(() => access.sweep());
      if (audit) await step(() => audit.sweep());
      if (settingsAudit) await step(() => settingsAudit.sweep());
      if (routes) await step(() => routes.removeUnknownStops());
      if (spawns) await step(() => spawns.sweep());
      if (stops) await step(() => stops.sweep());
      if (grunts) await step(() => grunts.sweep());
      if (pictures) await step(() => pictures.prunePlaces());
      if (placePictures) await step(() => placePictures.prune());
      if (googleAnswers) await step(() => googleAnswers.sweep());
      if (screenshots) await step(() => screenshots.sweep());
      if (emoji) await step(() => emoji.refresh());
      if (webSessions) await step(() => webSessions.sweep());
      if (splits) await step(() => splits.settlePendingSplits(PENDING_SPLIT_MS));
      // Party by party, over what may be many old rows: it ends with the clock's stop.
      if (history) await step(() => history.sweep({ isStopped: () => this.stopped }));
      // After the sweep, whose records it adds too; batch by batch, it ends with the clock's stop.
      if (activity) await step(() => activity.addNew({ isStopped: () => this.stopped }));
      // Started, not waited for (plan 8H-10): a queue of fill-ins may take minutes.
      if (legacyFillIns) {
        await step(() => {
          legacyFillIns.kick();
          return Promise.resolve();
        });
      }
      // Last, after the days have the history's new records: "On this day" waits for them
      // (plan 8H-8, A1).
      if (eventForum) await step(() => eventForum.upkeep());
    })()
      .catch((err: unknown) => {
        log.error({ err }, 'the upkeep of the forums failed');
      })
      .finally(() => {
        this.upkeeping = undefined;
      });
  }

  private async tickParty(id: string, inputOf: (party: Party) => TickInput): Promise<void> {
    const { store, posts, notify, log } = this.options;
    const seen: { before?: Party } = {};
    const result = await store.update(id, (party) => {
      seen.before = party;
      return partyTick(party, inputOf(party));
    });
    if (!result) return;
    if (result.render) posts.changed(id);
    for (const effect of result.effects) {
      try {
        await this.act(result.party, effect);
      } catch (err) {
        log.warn({ err, party: id, effect: effect.kind }, 'could not do what the clock asked for');
      }
    }
    // The clock has no actor: whoever a boss it set is news for is told, nobody is left out.
    // After everything the clock itself does: telling members must never be in its way.
    const { before } = seen;
    if (result.written && before && isRaid(before) && isRaid(result.party)) {
      notify?.raidChanged(before, result.party, null);
    }
    if (!result.effects.some((effect) => effect.kind === 'end')) await this.settleWarning(id);
  }

  private async act(party: Party, effect: TickEffect): Promise<void> {
    const { posts, attendance, lines } = this.options;
    const postId = party.forumPostId;
    switch (effect.kind) {
      case 'stage': {
        // Catching up over hatch and end at once says nothing: the raid is over.
        if (effect.from !== 'egg' || effect.to !== 'hatched' || postId === null) return;
        // Only a raid has stages.
        if (!isRaid(party)) return;
        const boss = posts.view(party).boss?.name;
        lines.say(
          postId,
          boss === undefined ? 'The egg has hatched.' : `The egg has hatched: **${plain(boss)}**.`,
          'stage',
        );
        return;
      }
      case 'ask-complete':
        await attendance.ask(party, effect.members);
        return;
      case 'completed': {
        if (postId !== null) {
          const names = fitItems(
            effect.members.map((id) => `<@${id}>`),
            LINE_NAMES,
          );
          const verb = effect.members.length === 1 ? 'counts' : 'count';
          lines.say(postId, `${names} did not answer and ${verb} as done.`);
        }
        await attendance.removeQuestions(party.id);
        return;
      }
      case 'warn':
        await this.warn(party.id);
        return;
      case 'end':
        // Decided again inside the store: a corrected time may have been stored since the tick.
        await posts.end(
          party.id,
          (current) =>
            !current.saved && current.deletionTime !== null && this.now() >= current.deletionTime,
          { ended: { how: 'clock' } },
        );
        if (postId !== null) this.sinceWarning.delete(postId);
        return;
    }
  }

  /**
   * Whom the first warning of a party pings: the member it is meant for (`warningAddressee`:
   * the conductor of a train, or who made a train or meetup, that has no end time), when they
   * allow mentions. Nobody when the warning is said again.
   */
  private async warned(party: Party): Promise<string[]> {
    const { users, log } = this.options;
    const addressee = warningAddressee(party);
    if (!users || addressee === undefined || party.prompts.warning !== null) return [];
    const settings = await settingsOf(users, [addressee], log);
    return settings.get(addressee)?.mentions === true ? [addressee] : [];
  }

  /**
   * Says in the post when it will be archived, and remembers the message to remove it again. An
   * earlier warning that is still remembered is deleted: a post has one warning, the newest.
   */
  private async warn(partyId: string): Promise<void> {
    const { store, posts } = this.options;
    const before = store.get(partyId);
    if (!before) return;
    const pinged = await this.warned(before);
    // Read again: the party may have changed, or ended, while the settings were read. A party
    // that ends while the warning is on its way has its closing wait for it (`whileOpen`): a
    // message after the archiving would open the post again.
    await posts.whileOpen(partyId, () => this.sayWarning(partyId, pinged));
  }

  private async sayWarning(partyId: string, pinged: string[]): Promise<void> {
    const { store, gateway } = this.options;
    const party = store.get(partyId);
    const postId = party?.forumPostId ?? null;
    if (!party || postId === null || party.deletionTime === null) return;
    const text = archiveWarning(party, party.deletionTime);
    const messageId = await gateway.sendMessage(
      postId,
      pinged.length === 0 ? { content: text } : withMentions(text, pinged),
    );
    if (messageId === undefined) return;
    const replaced: { id?: string } = {};
    let recorded = false;
    try {
      const result = await store.update(partyId, (current) => {
        if (current.deletionTime === null) return {};
        if (current.prompts.warning !== null) replaced.id = current.prompts.warning;
        return { party: { ...current, prompts: { ...current.prompts, warning: messageId } } };
      });
      recorded = result?.written ?? false;
      // A warning, fresh or repeated, starts the count of messages below it anew.
      if (recorded) this.sinceWarning.delete(postId);
    } finally {
      // Not recorded: a corrected time called the archiving off meanwhile, or the party ended.
      const stale = recorded ? replaced.id : messageId;
      if (stale !== undefined) await gateway.deleteMessage(postId, stale);
    }
  }

  /** Removes the warning of a party whose archiving was called off (a time was corrected). */
  private async settleWarning(id: string): Promise<void> {
    const { store, gateway } = this.options;
    const stale: { message?: { postId: string; messageId: string } } = {};
    await store.update(id, (party) => {
      const { warning } = party.prompts;
      if (party.deletionTime !== null || warning === null) return {};
      if (party.forumPostId !== null) {
        stale.message = { postId: party.forumPostId, messageId: warning };
      }
      return { party: { ...party, prompts: { ...party.prompts, warning: null } } };
    });
    if (stale.message) await gateway.deleteMessage(stale.message.postId, stale.message.messageId);
  }
}
