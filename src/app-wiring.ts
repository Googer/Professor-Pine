import type { ShardStart } from './discord/shard-readiness.js';
import { taskPictureSources } from './domain/stops/pictures.js';
import type { PartyService } from './services/party-service.js';
import type { PartyStore } from './services/party-store.js';
import type { PictureMaking } from './services/research-task-service.js';
import type { SpawnService } from './services/spawn-service.js';
import type { StopReportListener } from './services/stop-reports.js';
import type { ShutdownStep } from './shutdown.js';
import type { LiveSignals } from './web/live-signals.js';

/*
 * Parts of `startApp`'s wiring kept apart so that a test can reach them (plan 8R-6, review W5):
 * who is told that the web server listens, and the order in which the reports at stops close.
 */

/**
 * What tells the map's live streams that a list changed: every change of a party, every draw of a
 * post, every word of the reports at stops, every wild spawn recorded. Each listener decides and
 * returns; the hub never throws.
 */
export function liveSources(
  live: Pick<LiveSignals, 'partyChanged' | 'postShown' | 'reportsChanged' | 'spawnsChanged'>,
  sources: {
    parties: Pick<PartyStore, 'onChange'>;
    posts: Pick<PartyService, 'onPostShown'>;
    reports: { listen(listener: StopReportListener): void };
    spawns: Pick<SpawnService, 'onReported'>;
  },
): void {
  sources.spawns.onReported((guildId) => {
    live.spawnsChanged(guildId);
  });
  sources.parties.onChange((_before, after) => {
    live.partyChanged(after);
  });
  sources.posts.onPostShown((partyId, row, changed) => {
    live.postShown(partyId, row, changed);
  });
  sources.reports.listen({
    listChanged: (serverId) => {
      live.reportsChanged(serverId);
    },
  });
}

/** A service that names its pictures at the web server's address once it listens. */
export interface ServedPictures {
  serving(): void;
}

/**
 * Has the pictures of reported research made square (plan 8M-9B, B1): a typed task's reward is
 * on no list that `ResearchTaskService` makes square when it reads it, so the map's view would
 * name the feed's address all day. Every other picture of a report is a list's (the tasks', the
 * lineups' with the portraits), made when the list is read; asked again it is passed over.
 */
export function reportPictures(pictures: PictureMaking): StopReportListener {
  return {
    reported: (news) => {
      void pictures.prepare(taskPictureSources(news.reports.map((report) => report.research)));
    },
  };
}

/** The start-up work for the servers of a shard (`shardStartWork`); each never throws. */
export interface ShardStartWork {
  /** Makes sure every server has its `Guild` row (`syncGuilds`); never rejects. */
  syncServers(servers: readonly string[]): Promise<void>;
  /** Says in the log where meetup safety cannot work (`MeetupSafety.warnAtStart`). */
  warnAtStart(servers: readonly string[]): void;
  /** The square pictures of the spawns that stood through the restart (`SpawnService`). */
  prepareStanding(servers: readonly string[]): void;
}

/**
 * What a shard's ready does for its servers (plan 19D; `ShardReadiness.onShardReady`), so that a
 * server on a late shard is not missed. At every ready the servers are recorded: one that added
 * the bot while its shard was away comes in the new session's READY, and discord.js then says
 * `GuildAvailable` of it, never `GuildCreate`, so nothing else would record it. Only at the
 * shard's first ready (the start): the warnings of meetup safety (lines of the log at the start,
 * which a new session, several a day, would only repeat; not of a server Discord said unavailable,
 * whose channels are not known yet) and the pictures of the spawns that stood through the restart
 * (after a new session nothing restarted, and later spawns had theirs made when reported).
 * Servers a new session's READY no longer names (`ShardStart.gone`) are not recorded; nothing
 * acts on them yet (plan C marks them left).
 *
 * `clientReady`, at `ClientReady` (19D fix round 1, F1; round 2, R2: the very moment discord.js
 * begins to say `GuildCreate`, which an every-shard-ready after a resume is not): discord.js says
 * `GuildCreate` only once the client is ready, so a server that adds the bot on a shard already
 * ready while later shards still identify lands in the cache without an event; the cached servers
 * the shards' readies did not cover are recorded then. Only the first time: afterwards
 * `GuildCreate` is said, and the servers recorded are forgotten.
 *
 * The first ready's work reads the servers' values (plan 19A-1): it waits for the shard's
 * servers' rows (`filled`, `wireServerStart`) and their `Guild` rows. Each resolves once its
 * work is done (the start waits for the first readies' and `clientReady`'s, fix round 3, H1).
 */
export function shardStartWork(work: ShardStartWork): {
  shardReady(start: ShardStart, filled?: Promise<unknown>): Promise<void>;
  clientReady(cached: readonly string[]): Promise<void>;
} {
  let recorded: Set<string> | undefined = new Set();
  return {
    shardReady: async ({ servers, unavailable, first }, filled) => {
      const synced = work.syncServers(servers);
      for (const server of servers) recorded?.add(server);
      await Promise.all([synced, filled]);
      if (!first) return;
      work.warnAtStart(servers.filter((server) => !unavailable.has(server)));
      work.prepareStanding(servers);
    },
    clientReady: async (cached) => {
      if (recorded === undefined) return;
      const covered = recorded;
      recorded = undefined;
      const missed = cached.filter((server) => !covered.has(server));
      if (missed.length > 0) await work.syncServers(missed);
    },
  };
}

/** Something the shutdown closes and waits for. */
interface Closing {
  close(): Promise<void>;
}

/**
 * Tells the picture services that the web server listens (`startWebServer` answered true): the
 * eggs (plan 8M-1) and the pictures at the stops (plan 8R-6, `StopPictures`) are named at its
 * address from then on.
 */
export function picturesServed(pictures: { eggs: ServedPictures; stops: ServedPictures }): void {
  pictures.eggs.serving();
  pictures.stops.serving();
}

/** What the shutdown stops of the events feed (`RaidEventService`) and the events forum. */
export interface Stopping {
  stop(): void;
}

/**
 * The shutdown's step of the events feed and the events forum (plan 8V-1, branch review BR-2):
 * one second, as the feed's alone was, so the stack's limits still add up to 145 s
 * (`operations.md`). The forum is stopped first (no draw starts; one under way ends at its next
 * post, re-review RR-3), then the feed (a read under way is aborted); both are waited for. No
 * forum in rehearsal mode or without `settings.channels.events`.
 */
export function eventsFeedStep(parts: {
  events: Stopping & { whenIdle(): Promise<void> };
  forum: (Stopping & { flush(): Promise<void> }) | undefined;
}): ShutdownStep {
  return {
    name: 'raid events',
    timeoutMs: 1_000,
    run: async () => {
      parts.forum?.stop();
      parts.events.stop();
      await Promise.all([parts.forum?.flush(), parts.events.whenIdle()]);
    },
  };
}

/**
 * The shutdown's steps of the reports at stops, in their order, after the spawn reports: the
 * pictures first, so that no picture is fetched any more (the fetches on their way are aborted,
 * and what is drawn from then on names the pictures made or the feeds' addresses); then the
 * grunts' messages, which stand on with their reports (the next start's sweep deletes them); then
 * the lines of the region channels on their way (plan 8R-9, which wait for the posts' links) and
 * what waits to be drawn in the posts of the stops, in one step. Ten seconds in all (the stack's
 * limits add up to 145 s, `operations.md`). The grunts' messages, the lines and the posts are none
 * in rehearsal mode.
 */
export function stopReportSteps(parts: {
  pictures: Closing;
  grunts: Closing | undefined;
  lines: Closing | undefined;
  posts: Closing | undefined;
}): ShutdownStep[] {
  return [
    { name: 'pictures of the stops', timeoutMs: 1_000, run: () => parts.pictures.close() },
    {
      name: 'grunt reports',
      timeoutMs: 4_000,
      run: async () => {
        await parts.grunts?.close();
      },
    },
    {
      name: 'posts of the stops',
      timeoutMs: 5_000,
      run: async () => {
        await parts.lines?.close();
        await parts.posts?.close();
      },
    },
  ];
}
