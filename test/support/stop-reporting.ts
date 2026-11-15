import type { WayspotRow } from '../../src/domain/wayspots/kept.js';
import { boardedRegions } from './gyms.js';
import { regionsFixture } from './providers.js';
import { GruntMessageService } from '../../src/services/grunt-messages.js';
import { RocketService } from '../../src/services/rocket-reports.js';
import { StopReportService } from '../../src/services/stop-reports.js';
import { rewardHash } from '../../src/domain/research/versions.js';
import { partyServiceWith } from './party-service.js';
import { MemoryGruntMessages } from './rocket-store.js';
import { MemoryStopReports } from './stop-reports.js';
import { createTestContext } from './test-context.js';
import { keptRow } from './wayspot-cases.js';
import { wayspotsWith } from './wayspots.js';

/** Noon in Pittsburgh on 2026-10-22, an ordinary Thursday: no report meets a real midnight. */
export const STOP_NOON = Date.UTC(2026, 9, 22, 16);

/** PokéStops in West (1, 2) and East (3), and a power spot in West (5). */
export const STOP_ROWS: readonly WayspotRow[] = [
  keptRow(1, { title: 'Yellow Mural', lat: 40.06, lon: -80.06, address: null }),
  keptRow(2, { title: 'Paititi Inti', lat: 40.061, lon: -80.06, address: null }),
  keptRow(3, { title: 'East Fountain', lat: 40.05, lon: -79.95, address: null }),
  keptRow(5, { title: 'Library Garden', kind: 'powerspot', lat: 40.0502, lon: -80.0502 }),
];

/**
 * Reporting at stops over the services, as `/research`, `/rocket` and the map do (plan 8R-3): the
 * party services of `partyServiceWith` (`made`: its fake gateway holds the forums, who is barred,
 * and the grunts' messages), the kept stops `rows`, a context (`createTestContext`) with the stop
 * reports (`store`), the kept stops (`wayspots`, the directory: `setPineStops`), the grunts'
 * messages (`grunts`, over `gruntStore`; their timers never run) and `RocketService`, and its
 * place search built. The services read `Date.now()`: fake `Date` to `STOP_NOON` before calling
 * it.
 */
export async function stopReportingWith(rows: readonly WayspotRow[] = STOP_ROWS) {
  const made = await partyServiceWith();
  const { wayspots } = await wayspotsWith(rows);
  const store = new MemoryStopReports();
  // West and East with their boards recorded, as after `/admin setup-forums` (plan 8R-9).
  const { ctx, entries } = createTestContext({
    wayspots,
    regions: regionsFixture(boardedRegions()),
  });
  const stopReports = new StopReportService({
    store,
    events: ctx.raidEvents,
    zoneOf: (serverId) => ctx.servers.zoneOf(serverId),
    log: ctx.log,
    rewardHash: (reward) => rewardHash(reward, ctx.gameData.catalogue),
  });
  const gruntStore = new MemoryGruntMessages();
  const grunts = new GruntMessageService({
    gateway: made.gateway,
    store: gruntStore,
    reports: stopReports,
    log: ctx.log,
    setTimer: () => () => undefined,
  });
  const rocket = new RocketService({
    reports: stopReports,
    messages: grunts,
    regions: ctx.regions,
    guilds: ctx.guilds,
    log: ctx.log,
  });
  Object.assign(ctx, { stopReports, rocket });
  await ctx.placeFinder.built();
  return { made, ctx, wayspots, store, grunts, gruntStore, entries };
}
