import type { ShardStart } from './discord/shard-readiness.js';
import { taskPictureSources } from './domain/stops/pictures.js';
import type { Logger } from './log.js';
import type { PartyService } from './services/party-service.js';
import type { PartyStore } from './services/party-store.js';
import type { PictureMaking } from './services/research-task-service.js';
import type { ServerAdmission } from './services/server-admission.js';
import type { ServerSettingsLookup } from './services/server-settings.js';
import type { LeftServers, ServerStandings } from './services/server-standings.js';
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
 * which a new session, several a day, would only repeat; a server Discord said unavailable, whose
 * channels are not known yet, is only named there as such, fix round 2, G5) and the pictures of
 * the spawns that stood through the restart (after a new session nothing restarted, and later
 * spawns had theirs made when reported).
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
    shardReady: async ({ servers, first }, filled) => {
      const synced = work.syncServers(servers);
      for (const server of servers) recorded?.add(server);
      await Promise.all([synced, filled]);
      if (!first) return;
      // Every server: meetup safety passes over those Discord says are unavailable (the READY's
      // `unavailable`, which the cache marks so) and names them (fix round 2, G5).
      work.warnAtStart(servers);
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

/**
 * A server adding or removing Pine (plan 19C-1; `GuildCreate`, `GuildDelete`, after
 * `wireServerStart`'s refusal): one that may have this Pine gets its `Guild` row and, were it
 * marked left, is so no more, its return queued in its server's turn at the event itself, so that
 * a removal while its row is written comes after it (back within 30 days, it picks up where it
 * was: same row id,
 * everything on it kept); one that removes it is marked left, its row and everything on it kept
 * (plan 19C-3 deletes them after 30 days), which only a server Pine was in (a `Guild` row) can be:
 * one it refused on joining is neither written nor marked. Either way the zones in use are read
 * again (a zone of its own may come or go, fix round 1, N5). Each resolves once written; neither
 * rejects: what fails is logged.
 */
export function followServers(deps: {
  admission: Pick<ServerAdmission, 'admits'>;
  standings: Pick<ServerStandings, 'markLeft' | 'cameBack'>;
  guilds: { ensure(serverId: string): Promise<unknown> };
  presenceChanged: () => void;
  log: Logger;
}): { joined(serverId: string): Promise<void>; removed(serverId: string): Promise<void> } {
  const { admission, standings, guilds, presenceChanged, log } = deps;
  return {
    joined: async (serverId) => {
      if (admission.admits(serverId)) {
        // Its return is queued at the event, before its row is written: a removal that comes
        // meanwhile is queued after it and stays.
        const back = standings.cameBack([serverId]).catch((err: unknown) => {
          log.error({ err, guild: serverId }, 'could not take back that a server left');
        });
        try {
          await guilds.ensure(serverId);
        } catch (err) {
          log.error({ err, guild: serverId }, 'could not record guild');
        }
        await back;
      }
      presenceChanged();
    },
    removed: async (serverId) => {
      // Marked only where Pine was in it (its `Guild` row): never a server it refused, but one
      // it left at a ready because it may no longer have it (dropped from `servers`) is.
      try {
        await standings.markLeft([serverId]);
      } catch (err) {
        log.error({ err, guild: serverId }, 'could not mark a server left');
      }
      presenceChanged();
    },
  };
}

/**
 * What follows a server Pine left or that came back (plan 19C-1; `ServerStandings.whenLeftChanged`,
 * whichever way it was marked: its `GuildDelete`, a refusal, an operator's removal, a ready): the
 * direct messages queued for one left are dropped (`QueuedDmSender.dropServer`; the instance's are
 * no server's), and Google's line is told of both by their `Guild` rows (`GymUpkeep.servingChanged`:
 * the shares are worked out anew, a left server's rows are held out of the line's range at
 * `OUT_OF_SHARE_RANK`, one back has its rows ranked anew by its regions, the raids read first, and
 * the line hurried; a server without a row known has none in the line).
 */
export function followLeaving(
  standings: Pick<ServerStandings, 'whenLeftChanged'>,
  deps: {
    dms: { dropServer(serverId: string): void };
    line: { servingChanged(guildRows: readonly number[]): void };
    rowOf: (serverId: string) => number | undefined;
  },
): void {
  const { dms, line, rowOf } = deps;
  standings.whenLeftChanged(({ left, back }) => {
    for (const serverId of left) dms.dropServer(serverId);
    const rows = [...left, ...back].flatMap((serverId) => rowOf(serverId) ?? []);
    if (rows.length > 0) line.servingChanged(rows);
  });
}

/**
 * The servers Pine is in by their `Guild` rows (`GuildRepository.snowflakes`), for what must know
 * them before the login (the Google line's ranks, plan 8Z-2): since plan 19C-1 a server Pine left
 * keeps its row, so those it left are left out (`ServerStandings.isLeft`, read at each call).
 */
export function serversNotLeft(
  snowflakes: () => Promise<readonly string[]>,
  left: LeftServers,
): () => Promise<string[]> {
  return async () => (await snowflakes()).filter((serverId) => !left.isLeft(serverId));
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
 * The shutdown's step of the raid and the max boss syncs (`BossFeedService`; fix round 3, J1):
 * five seconds, as each had one of its own, so that the stack's limits keep a margin (143 s with
 * every optional step, `operations.md`). Both are stopped first (no read starts; one under way is
 * aborted), then both are waited for at once: a sync in flight may be writing its list, which
 * finishes before the pool closes.
 */
export function bossSyncStep(syncs: {
  raid: Stopping & { whenIdle(): Promise<void> };
  max: Stopping & { whenIdle(): Promise<void> };
}): ShutdownStep {
  return {
    name: 'boss syncs',
    timeoutMs: 5_000,
    run: async () => {
      syncs.raid.stop();
      syncs.max.stop();
      await Promise.all([syncs.raid.whenIdle(), syncs.max.whenIdle()]);
    },
  };
}

/**
 * The shutdown's step of the events feed and the events forum (plan 8V-1, branch review BR-2):
 * one second, as the feed's alone was (the stack's limits add up to 143 s with every optional
 * step, `operations.md`). The forum is stopped first (no draw starts; one under way ends at its
 * next post, re-review RR-3), then the feed (a read under way is aborted); both are waited for.
 * No forum in rehearsal mode.
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

/** How long direct messages that wait at shutdown are still sent (spec 9). */
const DM_DRAIN_MS = 10_000;

/**
 * The shutdown's step of the direct messages (spec 9): the queued DMs go on at their usual rate
 * for ten seconds, the rest is dropped; within the step's twelve. What a server's staff are told
 * on its way (`ServerNotices.flush`, plan 19B-1) is sent beside them while Discord is connected,
 * within the same twelve seconds, so the stack's limits gain no step (fix round 2, G3).
 */
export function directMessagesStep(parts: {
  dms: { drain(ms: number): Promise<void> };
  notices: { flush(): Promise<void> };
}): ShutdownStep {
  return {
    name: 'direct messages',
    timeoutMs: 12_000,
    run: async () => {
      await Promise.all([parts.dms.drain(DM_DRAIN_MS), parts.notices.flush()]);
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
 * limits add up to 143 s with every optional step, `operations.md`). The grunts' messages, the
 * lines and the posts are none in rehearsal mode.
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

/**
 * What follows the servers' zones (plan 19A-2; fix round 1, N5): a change of a server's zone
 * reaches each of `server` with the server, then each of `zones`; a change of the zones in use
 * that no change of a zone made (a server joining or leaving with a zone of its own) reaches each
 * of `zones`. Every hook runs, one that throws is logged.
 */
export function followZones(
  servers: Pick<ServerSettingsLookup, 'onZoneChange' | 'onZonesInUseChange'>,
  hooks: {
    server?: ReadonlyArray<(serverId: string) => void>;
    zones?: ReadonlyArray<() => void>;
  },
  log: Logger,
): void {
  const run = (hook: () => void): void => {
    try {
      hook();
    } catch (err) {
      log.error({ err }, 'a listener of a change of time zone failed');
    }
  };
  const zones = (): void => {
    for (const hook of hooks.zones ?? []) run(hook);
  };
  servers.onZoneChange((serverId) => {
    for (const hook of hooks.server ?? []) {
      run(() => {
        hook(serverId);
      });
    }
    zones();
  });
  servers.onZonesInUseChange(zones);
}
