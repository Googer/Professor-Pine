import type { UnreadableWayfarerRow } from '../../src/db/repositories/wayfarer-repository.js';
import type { Party } from '../../src/domain/party/party.js';
import { PineStopService } from '../../src/services/pine-stops.js';
import { WayfarerImportService } from '../../src/services/wayfarer-import-service.js';
import { WayfarerReviewService } from '../../src/services/wayfarer-review-service.js';
import { WayspotDirectory } from '../../src/services/wayspot-directory.js';
import { gymAdminWith } from './gym-admin.js';
import { OTHER_GUILD_ID, OTHER_GUILD_ROW } from './gyms.js';
import type { Outliving } from './party-service.js';
import { MemoryPineStops } from './pine-stops.js';
import { MemoryWayfarer } from './wayfarer.js';
import { MemoryWayspots } from './wayspots.js';

/**
 * The Wayfarer import over gym administration on fakes (`gymAdminWith`: the invented gyms and
 * regions, Google as a fake, the channel for bot updates) and the Wayfarer tables in memory
 * (`wayfarerStore`, whose unreadable rows are in `unreadable`; the kept Wayspots in
 * `wayspotStore`, held by `wayspots`, a `WayspotDirectory` over the same regions, loaded empty),
 * with the review queue over the same (`wayfarerReview`). A gym deleted through `removal` takes
 * its Wayfarer rows with it, as the foreign keys do. Their clock is `clock.now` of
 * `partyServiceWith`.
 */
export async function wayfarerImportWith(
  parties: readonly Party[] = [],
  kept?: Partial<Outliving>,
) {
  const made = await gymAdminWith(parties, kept);
  const unreadable: UnreadableWayfarerRow[] = [];
  const wayfarerStore = new MemoryWayfarer((row) => unreadable.push(row));
  const wayspotStore = new MemoryWayspots();
  const wayspots = new WayspotDirectory({
    wayspots: wayspotStore,
    regions: made.regions,
    log: made.log,
  });
  await wayspots.load();
  // No stop of Pine's own until a test adds one (`pineStops.add`), in the fakes' two servers.
  const pineStops = new PineStopService({
    storage: new MemoryPineStops(),
    wayspots,
    guilds: {
      idFor: (serverId) =>
        Promise.resolve(
          serverId === made.gateway.guildId
            ? 1
            : serverId === OTHER_GUILD_ID
              ? OTHER_GUILD_ROW
              : undefined,
        ),
    },
    log: made.log,
  });
  const wayfarer = new WayfarerImportService({
    storage: wayfarerStore,
    wayspots: wayspotStore,
    kept: wayspots,
    admin: made.admin,
    directory: made.directory,
    regions: made.regions,
    pineStops,
    log: made.log,
    now: () => made.clock.now,
  });
  const wayfarerReview = new WayfarerReviewService({
    storage: wayfarerStore,
    wayspots: wayspotStore,
    kept: wayspots,
    importer: wayfarer,
    admin: made.admin,
    directory: made.directory,
    log: made.log,
    now: () => made.clock.now,
  });
  // What the foreign keys do: a gym's Wayfarer rows go with its row.
  const remove = made.removal.remove.bind(made.removal);
  made.removal.remove = async (gymId, server) => {
    const removed = await remove(gymId, server);
    if (removed.deleted) wayfarerStore.removeGym(gymId);
    return removed;
  };
  return {
    ...made,
    wayfarer,
    wayfarerReview,
    wayfarerStore,
    wayspotStore,
    wayspots,
    pineStops,
    unreadable,
  };
}
