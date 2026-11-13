import { BoundedMap } from '../bounded-map.js';
import { serverChannel } from './server-channels.js';
import type { ServerSettingsLookup } from './server-settings.js';
import { isMissingPermission, type PartyGateway } from '../discord/party-gateway.js';
import {
  isRaid,
  isTrain,
  type MirrorKind,
  type MirrorMessage,
  type Party,
  type TrainParty,
} from '../domain/party/party.js';
import { raidMirrors } from '../domain/party/raid.js';
import type { Logger } from '../log.js';
import { renderMirror, type MirrorPlace } from '../render/mirrors.js';
import type { RenderedPost } from '../render/party-post.js';
import { Coalescer } from './coalescer.js';
import type { PartyStore } from './party-store.js';
import { stopRegionsInGuild, type ServerGymRegions } from './region-directory.js';
import { refusalSaid, sendInForms, type MessageForms, type RefusedFiles } from './refused-files.js';

const MINUTE = 60_000;
/** A channel that refused the bot is left alone for this long, then tried again. */
const REFUSED_FOR_MS = 10 * MINUTE;
/**
 * How long after a run that left something undone the copies of a party are gone through
 * again: a moment longer than a refusal lasts. The refusal is measured by the clock of the
 * services and this by a timer, and a run that came a millisecond before the refusal ended
 * would leave the channel alone once more and wait all over again.
 */
export const RETRY_AFTER_MS = REFUSED_FOR_MS + 1_000;
/** How many channels found gone are remembered (a server has a few dozen regions). */
const GONE_CHANNELS_KEPT = 1_000;

export interface PartyMirrorsOptions {
  store: PartyStore;
  gateway: Pick<
    PartyGateway,
    | 'sendMessage'
    | 'editMessage'
    | 'deleteMessage'
    | 'findChannel'
    | 'serverOf'
    | 'mayPost'
    | 'channelUnknown'
  >;
  regions: {
    byId(id: number): { channelId: string } | undefined;
    byChannel(channelId: string): { channelId: string; guildId: number | null } | undefined;
  };
  /** The gyms per server (plan 19B-2): a party's gym a stored reference, where it lies its server's. */
  gyms: ServerGymRegions & {
    stored(id: number): { taggedEx: boolean; confirmedEx: boolean } | undefined;
  };
  /**
   * The kept Wayspots (plan 8X-4): a train's copies go also where a power spot of its route lies.
   * Without them a power spot is in no region.
   */
  wayspots?: { byId(id: string): { kind: string } | undefined; regionsOf(id: string): string[] };
  /** Each server's values: whether it has the copies, and their channels (plan 19A-1). */
  servers: ServerSettingsLookup;
  /** What the post of a party shows now. */
  render: (party: Party) => RenderedPost;
  /** The channels that refused files lately (the post's own service shares them). */
  refusedFiles: RefusedFiles;
  /** Told when Discord refuses an emoji of a button (`ApplicationEmoji.refused`: read them anew). */
  emojiRefused?: () => void;
  /**
   * Told when a copy was made and recorded (plan 8X-G: a train's copy in another region's
   * channel is what that region's summary links).
   */
  copied?: (kind: MirrorKind, channelId: string) => void;
  log: Logger;
  now: () => number;
  /**
   * How long the changes of one party are gathered into one edit of its copies in the server's
   * shared channels. Default ten seconds: every raid of a server edits in those two channels
   * (and every train of a region in the channels of its neighbours), and Discord limits the
   * edits per channel.
   */
  sharedDelayMs?: number;
}

/**
 * A copy as it is sent, and the same with less (without the file of its picture, with plain
 * emoji, without its pictures: `LeftOut`), for when Discord refuses it (`sendInForms`).
 */
type Copy = MessageForms;

function copyOf(kind: MirrorKind, rendered: RenderedPost, place: MirrorPlace): Copy {
  return {
    message: renderMirror(kind, rendered, place),
    without: (left) => renderMirror(kind, rendered, place, left),
  };
}

/** The kinds of copy that stand in other channels than the post, kept by the slower queue. */
const SHARED_KINDS: readonly MirrorKind[] = ['ex', 'remote', 'region'];

/** A copy a party should have: of this kind, in this channel. */
interface WantedCopy {
  kind: MirrorKind;
  channelId: string;
}

/**
 * What a party has one copy of: a kind, and for the copies in region channels (`region`) a
 * kind in a channel, since a train has one in every region it stops in. Of several copies with
 * the same slot the newest counts and the others are deleted.
 */
function slotOf(copy: WantedCopy): string {
  return copy.kind === 'region' ? `region:${copy.channelId}` : copy.kind;
}

/**
 * The copies of a party's message besides the first message of its post (spec 5.2): one in the
 * server's channel for raids at elite raid gyms, one in its channel for raids that can be joined
 * remotely, one of a train in the text channel of every other region its route has a stop in,
 * and the one `/status` puts at the bottom of the post. Each carries the controls of the post,
 * which name the party in their custom ids, so a member signs up where they see it.
 *
 * The party's record (`mirrorMessages`) is the list of what exists: a copy is recorded as soon
 * as it is sent and taken off the record only once it is deleted, so that whatever fails on the
 * way is tried again with the next render and nothing with buttons is left that nobody knows
 * of. A kind has one copy (the copies in region channels: one in each channel, `slotOf`); of
 * several (a new one was sent, the old one could not be deleted yet) the newest counts.
 *
 * The copy in the post is brought up to date with the post itself (`syncStatus`). The copies in
 * the shared channels have a queue of their own (`changed`), slower than the
 * post's: all raids of a server edit in those channels, and a post must never wait for them.
 * The copies of a train in region channels are kept by that queue too.
 *
 * A server without such a channel (by the ids its staff set, `ServerSettings`), with the feature
 * switched off, or with a channel the bot may not write in, simply has no copy there.
 *
 * A run of the queue that left something undone (an edit or a send failed, a channel was left
 * alone because it refused the bot) is followed by one more for that party once the refusal is
 * over (`retryLater`, `RETRY_AFTER_MS`), so that a copy does not stay out of date until the
 * party happens to change again.
 */
export class PartyMirrors {
  private readonly shared: Coalescer<string>;
  /** What each copy last showed, by its message id. A copy that would show the same is not edited. */
  private readonly sent = new Map<string, string>();
  /** `/status` calls that are under way, by party: the end of the party waits for them. */
  private readonly reposting = new Map<string, Set<Promise<unknown>>>();
  /**
   * Channels that refused the bot (a missing permission, a channel that is gone), and until
   * when they are left alone.
   */
  private readonly refused = new Map<string, number>();
  /**
   * Channels that Discord said are not there (a region's text channel deleted while its region
   * stays): no copy is sent there any more, until a restart.
   */
  private readonly gone = new BoundedMap<string, true>(GONE_CHANNELS_KEPT);
  /** Parties whose copies are gone through once more, and the timer that will ask for it. */
  private readonly retries = new Map<string, NodeJS.Timeout>();

  constructor(private readonly options: PartyMirrorsOptions) {
    this.shared = new Coalescer({
      delayMs: options.sharedDelayMs ?? 10_000,
      work: (partyId) => this.syncShared(partyId),
      onError: (err, party) =>
        options.log.warn({ err, party }, 'could not update the copies of a party'),
    });
  }

  private isRefused(channelId: string): boolean {
    const until = this.refused.get(channelId);
    if (until === undefined) return false;
    if (this.options.now() < until) return true;
    this.refused.delete(channelId);
    return false;
  }

  /** The channel that takes copies of this kind for a party of this region; undefined for none. */
  private channelFor(kind: 'ex' | 'remote', near: string | undefined): string | undefined {
    const { gateway, servers } = this.options;
    if (near === undefined) return undefined;
    const server = gateway.serverOf(near);
    if (server === undefined) return undefined;
    const { features } = servers.of(server);
    const enabled = kind === 'ex' ? features.exGymChannel : features.remoteRaidChannel;
    if (!enabled) return undefined;
    return serverChannel(
      gateway,
      servers,
      near,
      kind === 'ex' ? 'elite-gym-raids' : 'remote-raids',
    );
  }

  /**
   * The channels that take a copy of a train: the text channel of every region of the train's
   * server that a gym of its route lies in, each once, without the channel of the region the
   * train was made in (that one has the line that links to the post). The whole route counts,
   * also the stops the train has left and those of a finished route: the copy stays until the
   * train ends or the route no longer touches the region. A gym can lie in several regions.
   * When the train's own region is gone, no channel is left out.
   *
   * A channel in which the bot may not post embeds is none of them: Discord would not refuse the
   * copy there but show it without its embed, a line with buttons that says nothing of the
   * train. A copy that stands in such a channel goes, like one of a region the route has left.
   */
  private regionChannels(party: TrainParty): string[] {
    const { regions, gyms, wayspots, gateway } = this.options;
    const own = party.regionId === null ? undefined : regions.byId(party.regionId)?.channelId;
    const channels = new Set<string>();
    const places = { gyms, ...(wayspots === undefined ? {} : { wayspots }) };
    for (const ref of party.train.route) {
      for (const { channelId } of stopRegionsInGuild(places, regions, ref, party.guildId)) {
        if (channelId !== own) channels.add(channelId);
      }
    }
    return [...channels].filter((channelId) => gateway.mayPost(channelId));
  }

  private place(party: Party, postId: string): MirrorPlace {
    const region = party.regionId === null ? undefined : this.options.regions.byId(party.regionId);
    return { postId, regionChannelId: region?.channelId };
  }

  /**
   * A party changed: its copies in the shared channels are brought up to
   * date shortly (the first change at once, later ones gathered). Returns at once.
   */
  changed(partyId: string): void {
    this.shared.request(partyId);
  }

  /**
   * Runs `work` for one copy or one channel; a failure is logged and tried again with the next
   * render. A channel that refuses the bot for lack of a permission is left alone for a while
   * (for edits and sends), and said once: every render of every raid would otherwise ask Discord
   * again and be refused. A failed deletion (`refuse` false) does not refuse the channel: it is
   * tried again at every render, and must not extend the refusal for ever. False when the work
   * failed.
   */
  private async attempt(
    what: string,
    partyId: string,
    channelId: string,
    work: () => Promise<unknown>,
    refuse = true,
  ): Promise<boolean> {
    const { log, now } = this.options;
    try {
      await work();
      return true;
    } catch (err) {
      if (refuse && isMissingPermission(err)) {
        this.refused.set(channelId, now() + REFUSED_FOR_MS);
        log.warn(
          { err, party: partyId, channel: channelId },
          `could not ${what}: I lack a permission in that channel, and leave it alone for a while`,
        );
      } else {
        log.warn({ err, party: partyId, channel: channelId }, `could not ${what}`);
      }
      return false;
    }
  }

  /**
   * Brings the copies of these kinds up to date with `rendered`: edits those that would show
   * something else, creates the ones in `wanted` that the party lacks, and deletes the ones it
   * should no longer have, as well as every copy of a slot (`slotOf`) but the newest. A copy
   * that somebody deleted is taken off the record. Never rejects.
   *
   * False when something is left to do that the next run can do without the party changing: an
   * edit or a send failed, or a channel was left alone because it refused the bot. (A deletion
   * that failed is tried with the next change; the copy stays on the record until then.)
   */
  private async sync(
    party: Party,
    rendered: RenderedPost,
    kinds: readonly MirrorKind[],
    wanted: readonly WantedCopy[],
  ): Promise<boolean> {
    const { log, now } = this.options;
    const postId = party.forumPostId;
    if (postId === null) return true;
    let complete = true;
    const place = this.place(party, postId);
    const mine = party.mirrorMessages.filter((mirror) => kinds.includes(mirror.kind));
    const newest = new Map<string, MirrorMessage>();
    for (const mirror of mine) newest.set(slotOf(mirror), mirror);
    const wantedIn = new Map(wanted.map((copy) => [slotOf(copy), copy.channelId]));

    const have = new Set<string>();
    for (const mirror of mine) {
      const slot = slotOf(mirror);
      const current = newest.get(slot) === mirror;
      // The copy in the post stays while it is in this post; one in another channel only while
      // that channel takes it (an elite boss was named, the raid is over, the channel was
      // replaced by another, the route of the train no longer has a stop in that region).
      const keep =
        current &&
        (mirror.kind === 'status'
          ? mirror.channelId === postId
          : wantedIn.get(slot) === mirror.channelId);
      if (!keep) {
        // A deletion is always tried, also in a channel that refuses edits and sends.
        await this.attempt(
          'delete a copy of a party message',
          party.id,
          mirror.channelId,
          () => this.drop(party.id, mirror),
          false,
        );
        continue;
      }
      // Not edited while its channel refuses the bot; it counts as there.
      if (this.isRefused(mirror.channelId)) {
        have.add(slot);
        complete = false;
        continue;
      }
      let gone = false;
      const edited = await this.attempt(
        'update a copy of a party message',
        party.id,
        mirror.channelId,
        async () => {
          gone = !(await this.edit(mirror, copyOf(mirror.kind, rendered, place)));
          if (gone) await this.forget(party.id, mirror);
        },
      );
      complete &&= edited;
      // A copy whose edit failed is still there.
      if (!gone) have.add(slot);
    }
    for (const copy of wanted) {
      const { kind, channelId } = copy;
      if (have.has(slotOf(copy))) continue;
      // Gone for good: nothing is left to do there, now or later.
      if (this.gone.has(channelId)) continue;
      if (this.isRefused(channelId)) {
        complete = false;
        continue;
      }
      let noChannel = false;
      const sent = await this.attempt(
        'send a copy of a party message',
        party.id,
        channelId,
        async () => {
          const copy = copyOf(kind, rendered, place);
          noChannel = (await this.create(party.id, kind, channelId, copy)) === 'no-channel';
        },
      );
      complete &&= sent;
      if (sent && noChannel) {
        // A channel Discord does not know (Unknown Channel, 10003: deleted, as a region's text
        // channel can be while its region stays) is gone for good: said once, for every party,
        // and never tried again, also not by a retry (follow-ups 748). Its region stays until
        // staff remove it, as any region whose channel is gone (`/region list`). Anything else
        // that took nothing (a server Discord does not answer for, a channel that takes no
        // message, the question failing) is left alone for a while, as before.
        if (await this.unknownChannel(channelId)) {
          this.gone.set(channelId, true);
          log.warn(
            { party: party.id, channel: channelId },
            'could not send a copy of a party message: its channel is gone, and I send no ' +
              'copy there any more',
          );
        } else {
          this.refused.set(channelId, now() + REFUSED_FOR_MS);
          log.warn(
            { party: party.id, channel: channelId },
            'could not send a copy of a party message: nothing can be sent to that channel ' +
              'now, and I leave it alone for a while',
          );
          complete = false;
        }
      }
    }
    return complete;
  }

  /** Whether Discord says the channel is unknown; false where it cannot be found out. */
  private async unknownChannel(channelId: string): Promise<boolean> {
    try {
      return await this.options.gateway.channelUnknown(channelId);
    } catch (err) {
      this.options.log.debug(
        { err, channel: channelId },
        'could not ask whether a channel is gone',
      );
      return false;
    }
  }

  /**
   * Has the copies of a party gone through once more a moment after the time is over for which
   * a channel that refused the bot is left alone (`RETRY_AFTER_MS`): what a run could not do is
   * then done although the party did not change. One timer per party; nothing is asked for a
   * party that has ended by then.
   */
  private retryLater(partyId: string): void {
    if (this.retries.has(partyId)) return;
    const timer = setTimeout(() => {
      this.retries.delete(partyId);
      if (this.options.store.get(partyId)) this.shared.request(partyId);
    }, RETRY_AFTER_MS);
    timer.unref();
    this.retries.set(partyId, timer);
  }

  /** Nothing is left to try again for a party. */
  private settled(partyId: string): void {
    clearTimeout(this.retries.get(partyId));
    this.retries.delete(partyId);
  }

  /**
   * Brings the copy in the post (`/status`) up to date with what the post shows. Call it from
   * the render of the post, which runs once at a time per party. Never rejects.
   */
  async syncStatus(party: Party, rendered: RenderedPost): Promise<void> {
    await this.sync(party, rendered, ['status'], []);
  }

  /**
   * One run of the queue of a party: its copies in other channels than its post. A raid has
   * them in the server's shared channels, a train in the channels of the other regions it
   * stops in, a meetup nowhere.
   */
  private async syncShared(partyId: string): Promise<void> {
    const { store, gyms, now, render } = this.options;
    const party = store.get(partyId);
    const postId = party?.forumPostId;
    if (!party || !postId) {
      this.settled(partyId);
      return;
    }
    const rendered = render(party);
    const place = this.place(party, postId);
    const gym = party.gymId === null ? undefined : gyms.stored(party.gymId);
    // Without a channel of the server to start from, no channel is found and the copies go;
    // they are made again once there is one.
    const near = place.regionChannelId ?? party.forumChannelId ?? undefined;
    const wanted: WantedCopy[] = [];
    // Only a raid has copies in the shared channels (they are the channels for raids).
    for (const kind of isRaid(party) ? raidMirrors(party, gym, now()) : []) {
      const channelId = this.channelFor(kind, near);
      if (channelId !== undefined) wanted.push({ kind, channelId });
    }
    // Only a train has a route that can lead into other regions.
    for (const channelId of isTrain(party) ? this.regionChannels(party) : []) {
      wanted.push({ kind: 'region', channelId });
    }
    if (await this.sync(party, rendered, SHARED_KINDS, wanted)) this.settled(partyId);
    else this.retryLater(partyId);
  }

  /**
   * Edits a copy unless it shows this already. False when the copy is gone. Sent in the forms of
   * `sendInForms`: without its files (an egg's picture) where the channel refuses them; with
   * plain emoji and its pictures kept where Discord names an emoji or nothing, then bare; without
   * its pictures, the custom emoji kept, where it names a picture, then bare.
   */
  private async edit(mirror: MirrorMessage, copy: Copy): Promise<boolean> {
    const { gateway, log, refusedFiles } = this.options;
    const key = JSON.stringify(copy.message);
    if (this.sent.get(mirror.messageId) === key) return true;
    // Forgotten before anything is tried: a failure must not hide an edit that is still needed.
    this.sent.delete(mirror.messageId);
    const there = await sendInForms(
      copy,
      mirror.channelId,
      refusedFiles,
      (message) => gateway.editMessage(mirror.channelId, mirror.messageId, message),
      (err, what, dropped) => {
        log.warn(
          { err, channel: mirror.channelId, message: mirror.messageId },
          refusalSaid(what, 'editing a copy', dropped),
        );
        if (what === 'emoji') this.options.emojiRefused?.();
      },
    );
    if (there) this.sent.set(mirror.messageId, key);
    return there;
  }

  /** Sends a copy, in the forms of `sendInForms` as `edit` does (plain emoji first where named). */
  private async send(channelId: string, copy: Copy): Promise<string | undefined> {
    const { gateway, log, refusedFiles } = this.options;
    return sendInForms(
      copy,
      channelId,
      refusedFiles,
      (message) => gateway.sendMessage(channelId, message),
      (err, what, dropped) => {
        log.warn({ err, channel: channelId }, refusalSaid(what, 'sending a copy', dropped));
        if (what === 'emoji') this.options.emojiRefused?.();
      },
    );
  }

  /**
   * Sends a copy and records it on the party, then deletes the earlier copies of its slot (its
   * kind, and for a copy in a region channel that channel) and takes each off the record once
   * it is gone; one that cannot be deleted stays recorded, for the next render to try again. A
   * copy that cannot be recorded (the party ended meanwhile, the write failed) is deleted
   * again: `unrecorded`. `no-channel` when there is no such channel to send to.
   */
  private async create(
    partyId: string,
    kind: MirrorKind,
    channelId: string,
    copy: Copy,
  ): Promise<'recorded' | 'no-channel' | 'unrecorded'> {
    const { store, gateway, log } = this.options;
    const messageId = await this.send(channelId, copy);
    if (messageId === undefined) return 'no-channel';
    const mirror: MirrorMessage = { channelId, messageId, kind };
    let earlier: MirrorMessage[] = [];
    let recorded = false;
    try {
      const result = await store.update(partyId, (current) => {
        earlier = current.mirrorMessages.filter((other) => slotOf(other) === slotOf(mirror));
        return { party: { ...current, mirrorMessages: [...current.mirrorMessages, mirror] } };
      });
      recorded = result?.written ?? false;
    } finally {
      if (!recorded) {
        try {
          await gateway.deleteMessage(channelId, messageId);
        } catch (err) {
          log.error(
            { err, party: partyId, channel: channelId, message: messageId },
            'could not delete a copy that could not be recorded; it stays, with its buttons',
          );
        }
      }
    }
    if (!recorded) return 'unrecorded';
    this.sent.set(messageId, JSON.stringify(copy.message));
    for (const stale of earlier) {
      await this.attempt(
        'delete an earlier copy of a party message',
        partyId,
        stale.channelId,
        () => this.drop(partyId, stale),
        false,
      );
    }
    // Once the earlier copies are gone, so that what is told of it names the new one alone.
    this.options.copied?.(kind, channelId);
    return 'recorded';
  }

  /** Takes a copy off the party's record; the message itself is not touched. */
  private async forget(partyId: string, mirror: MirrorMessage): Promise<void> {
    this.sent.delete(mirror.messageId);
    await this.options.store.update(partyId, (current) =>
      current.mirrorMessages.some((other) => other.messageId === mirror.messageId)
        ? {
            party: {
              ...current,
              mirrorMessages: current.mirrorMessages.filter(
                (other) => other.messageId !== mirror.messageId,
              ),
            },
          }
        : {},
    );
  }

  /** Deletes a copy and, once that is done, takes it off the party's record. */
  private async drop(partyId: string, mirror: MirrorMessage): Promise<void> {
    await this.options.gateway.deleteMessage(mirror.channelId, mirror.messageId);
    await this.forget(partyId, mirror);
  }

  /**
   * `/status`: puts a fresh copy of the party's message at the bottom of its post and deletes
   * the one an earlier `/status` put there. It is kept up to date like the other copies; the
   * caller asks for a render afterwards, since the party may have changed while the copy was
   * on its way. False when the party has ended or has no post, or the post cannot be sent to.
   */
  repost(partyId: string): Promise<boolean> {
    const run = (async () => {
      const party = this.options.store.get(partyId);
      const postId = party?.forumPostId;
      if (!party || !postId) return false;
      const copy = copyOf('status', this.options.render(party), this.place(party, postId));
      return (await this.create(partyId, 'status', postId, copy)) === 'recorded';
    })();
    const running = this.reposting.get(partyId) ?? new Set();
    running.add(run);
    this.reposting.set(partyId, running);
    const done = (): void => {
      running.delete(run);
      if (running.size === 0) this.reposting.delete(partyId);
    };
    run.then(done, done);
    return run;
  }

  /**
   * Resolves once nothing of this class is sending or editing for a party: a run of its queue,
   * a `/status`. Whoever ends a party waits for this after the party has left the store (from
   * then on nothing new starts), so that nothing lands in the post after it was archived. A run
   * that is waiting for its delay is not started.
   */
  async idle(partyId: string): Promise<void> {
    await this.shared.idle(partyId);
    for (
      let running = this.reposting.get(partyId);
      running;
      running = this.reposting.get(partyId)
    ) {
      await Promise.allSettled(running);
    }
  }

  /**
   * Does what is waiting in the queues now, and gives up what was to be tried again later, so
   * that nothing is asked for afterwards. For shutdown and for tests.
   */
  async flush(): Promise<void> {
    await this.shared.flush();
    for (const timer of this.retries.values()) clearTimeout(timer);
    this.retries.clear();
  }

  /** Parties with a run of their queue waiting or going on. */
  get pending(): number {
    return this.shared.pending;
  }

  /**
   * Deletes every copy of the message of a party that has ended, also the one in its post, and
   * forgets what is kept for them, also that its copies were to be gone through again. Gives the
   * failures, each logged as a warning, for the closing to judge whether it is owed (plan 8X-H,
   * review r0 B2). Never rejects.
   */
  async remove(party: Party): Promise<unknown[]> {
    const { gateway, log } = this.options;
    this.settled(party.id);
    const failures: unknown[] = [];
    for (const mirror of party.mirrorMessages) {
      this.sent.delete(mirror.messageId);
      try {
        await gateway.deleteMessage(mirror.channelId, mirror.messageId);
      } catch (err) {
        failures.push(err);
        log.warn(
          { err, party: party.id, channel: mirror.channelId, message: mirror.messageId },
          'could not delete a copy of the message of an ended party',
        );
      }
    }
    return failures;
  }
}
