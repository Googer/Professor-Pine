import type { MapProvider } from '../../src/services/static-maps.js';
import type {
  GymRemoval,
  RemovedGym,
  RemovingServer,
} from '../../src/db/repositories/gym-removal-repository.js';
import { AdminLock } from '../../src/services/admin-lock.js';
import { GymAdminService, type StaffPlace } from '../../src/services/gym-admin-service.js';
import { GymUpkeep } from '../../src/services/gym-upkeep.js';
import { MemoryGoogleUse } from '../../src/services/google-use.js';
import { MemoryGymLookups } from '../../src/services/gym-lookups.js';
import { MemoryWayspotLookups } from '../../src/services/wayspot-lookups.js';
import type { Party } from '../../src/domain/party/party.js';
import { FakeGeoGateway } from './geo.js';
import { gymDirectoryWith, MemoryGyms } from './gym-store.js';
import type { MemoryGymTargets } from './gym-targets.js';
import type { Gym } from '../../src/db/repositories/gym-repository.js';
import type { Region } from '../../src/db/repositories/region-repository.js';
import { NORTH_CHANNEL, NORTH_PLACE, northRegion, OTHER_GUILD_ROW, WEST_CHANNEL } from './gyms.js';
import { partyServiceWith, TestRegions, type Outliving } from './party-service.js';
import type { MemorySavedRoutes } from './saved-routes.js';
import { TEST_SERVER_CHANNELS, type TestServers } from './server-values.js';

/** The channel for bot updates of the fakes' server, under the name of the test settings. */
/** The server's channel for bot updates, as the test servers' values name it (`TEST_SERVER_CHANNELS`). */
export const UPDATES_CHANNEL = TEST_SERVER_CHANNELS['bot-updates'];

/** The staff member of `STAFF_PLACE`. */
export const STAFF = '200000000000000009';

/** A staff member of the fakes' server (the guild of row 1), using a command in West's channel. */
export const STAFF_PLACE: StaffPlace = { staffId: STAFF, guildId: 1, channelIds: [WEST_CHANNEL] };

/** A staff member of the second server (the guild of row 2), using a command in North's channel. */
export const OTHER_STAFF = '200000000000000007';
export const OTHER_STAFF_PLACE: StaffPlace = {
  staffId: OTHER_STAFF,
  guildId: OTHER_GUILD_ROW,
  channelIds: [NORTH_CHANNEL],
};

/**
 * Gives the fakes a second server: its region North (`northRegion`) and a gym in it,
 * "Northgate Clock" (the next id: 13 over the invented gyms), which is returned. The invented
 * gyms stay where they are: 1 to 9, 11 and 12 in the first server's regions, 10 in none.
 */
export async function withOtherServer(made: {
  regions: { rows: Region[] };
  gymStore: MemoryGyms;
  directory: { load(): Promise<void>; stored(id: number): Gym | undefined };
}): Promise<Gym> {
  made.regions.rows.push(northRegion());
  const created = await made.gymStore.create(
    { name: 'Northgate Clock', ...NORTH_PLACE },
    OTHER_GUILD_ROW,
  );
  await made.directory.load();
  const gym = made.directory.stored(created.id);
  if (!gym) throw new Error('the gym of the second server is not in the directory');
  return gym;
}

/**
 * The removal of a gym with what names it, over the stores in memory, as
 * `GymRemovalRepository` does it in one transaction (gym-removal-repository.db.test.ts pins
 * that down): all of it or none. When any of the three stores is failing, or `failing` is set,
 * it rejects and nothing has changed.
 */
export class MemoryGymRemoval implements GymRemoval {
  failing: Error | undefined;
  /** A promise every removal waits for before it decides anything (a test's hold). */
  holdOn: Promise<void> | undefined;

  constructor(
    private readonly gyms: MemoryGyms,
    private readonly routes: MemorySavedRoutes,
    private readonly targets: MemoryGymTargets,
  ) {}

  async remove(gymId: number, server: RemovingServer): Promise<RemovedGym> {
    await new Promise((resolve) => setImmediate(resolve));
    await this.holdOn;
    const failing =
      this.failing ??
      this.gyms.failing ??
      this.gyms.failingOn.delete ??
      this.routes.failing ??
      this.targets.failing;
    if (failing) throw failing;
    // The last server's removal takes the row and whatever still names it; another's, its own.
    const last = [...(this.gyms.servers.get(gymId) ?? [])].every(
      (guildId) => guildId === server.guildId,
    );
    // The server's counts; what others still name goes with the row, uncounted.
    const routes = await this.routes.removeGym(gymId, server.regionIds);
    if (last) await this.routes.removeGym(gymId, 'every');
    const targets = await this.targets.membersTargeting(gymId, server.guildId);
    await this.targets.removeGym(gymId, last ? 'every' : server.guildId);
    if (last) await this.gyms.delete(gymId);
    else this.gyms.unlink(gymId, server.guildId);
    return { routes: routes.changed + routes.removed, targets, deleted: last };
  }
}

/**
 * Gym administration over fakes, with everything `partyServiceWith` gives over the same gyms:
 * the invented gyms in memory (`gymStore`, each with its nearest gym) behind a real
 * `GymDirectory` that every service reads, so that a gym that is added, changed or deleted is
 * so for raids and trains too; Google as a fake (`geo`); the saved routes and gym targets of
 * `partyServiceWith`; and a server that has the channel for bot updates (`UPDATES_CHANNEL`).
 *
 * Nothing runs by itself: `upkeep.flush()` fetches what waits (the line never moves on its own),
 * `admin.flush()` waits for the announcements.
 */
export async function gymAdminWith(
  parties: readonly Party[] = [],
  kept?: Partial<Outliving>,
  options: { maps?: Pick<MapProvider, 'gym'>; servers?: TestServers } = {},
) {
  const regions = kept?.regions ?? new TestRegions();
  const { gyms: gymStore, directory } = await gymDirectoryWith(new MemoryGyms(), regions);
  const made = await partyServiceWith(
    parties,
    { gyms: directory, ...(options.servers === undefined ? {} : { servers: options.servers }) },
    { ...kept, regions },
  );
  made.gateway.channelNames.set(UPDATES_CHANNEL, made.settings.channels['bot-updates']);
  const geo = new FakeGeoGateway();
  // The line and the month's counts, for a test to fill and read (plan 8W-6).
  const lookups = new MemoryGymLookups();
  const wayspotLookups = new MemoryWayspotLookups();
  const use = new MemoryGoogleUse();
  const upkeep = new GymUpkeep({
    gyms: gymStore,
    directory,
    geo,
    parties: made.store,
    posts: made.service,
    log: made.log,
    // The line waits for `flush`.
    setTimer: () => () => undefined,
    lookups,
    wayspotLookups,
    use,
  });
  const removal = new MemoryGymRemoval(gymStore, made.routes, made.gymTargets);
  // The one lock of gym and region administration, as in the bot.
  const lock = new AdminLock();
  const admin = new GymAdminService({
    lock,
    gyms: gymStore,
    removal,
    directory,
    regions,
    store: made.store,
    trains: made.trains,
    routes: made.routes,
    targets: made.gymTargets,
    upkeep,
    geo,
    gateway: made.gateway,
    ...(options.maps === undefined ? {} : { maps: options.maps }),
    settings: made.settings,
    servers: made.servers,
    log: made.log,
  });
  return {
    ...made,
    admin,
    upkeep,
    geo,
    gymStore,
    removal,
    directory,
    lock,
    lookups,
    wayspotLookups,
    googleUse: use,
  };
}
