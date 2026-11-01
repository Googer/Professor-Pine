import { taskPictureSources } from './domain/stops/pictures.js';
import type { PartyService } from './services/party-service.js';
import type { PartyStore } from './services/party-store.js';
import type { PictureMaking } from './services/research-task-service.js';
import type { StopReportListener } from './services/stop-reports.js';
import type { ShutdownStep } from './shutdown.js';
import type { LiveSignals } from './web/live-signals.js';

/*
 * Parts of `startApp`'s wiring kept apart so that a test can reach them (plan 8R-6, review W5):
 * who is told that the web server listens, and the order in which the reports at stops close.
 */

/**
 * What tells the map's live streams that a list changed: every change of a party, every draw of a
 * post, every word of the reports at stops. Each listener decides and returns; the hub never throws.
 */
export function liveSources(
  live: Pick<LiveSignals, 'partyChanged' | 'postShown' | 'reportsChanged'>,
  sources: {
    parties: Pick<PartyStore, 'onChange'>;
    posts: Pick<PartyService, 'onPostShown'>;
    reports: { listen(listener: StopReportListener): void };
  },
): void {
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
