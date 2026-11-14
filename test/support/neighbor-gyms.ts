import type { FillableTexts, Gym } from '../../src/db/repositories/gym-repository.js';
import type { Region } from '../../src/db/repositories/region-repository.js';
import type { GymLink } from '../../src/domain/gyms/gym-server.js';
import type { GymTexts } from '../../src/domain/gyms/gym-text.js';
import { NeighborCopy } from '../../src/services/neighbor-copy.js';
import { NeighborMatches } from '../../src/services/neighbor-matches.js';
import { gymDirectoryWith, MemoryGyms } from './gym-store.js';
import {
  OTHER_GUILD_ROW,
  TEST_GUILD_ROW,
  testGyms,
  testLinks,
  testRegions,
  wideRegion,
} from './gyms.js';

/** A third server's `Guild` row: a neighbor of neither of the two (plan 19E). */
export const THIRD_GUILD_ROW = 3;
/** Its one region, over West. */
export const THIRD_CHANNEL = '100000000000000033';

/**
 * The second server's gyms of `neighborGymsWith`: the same as the test server's in three ways,
 * and two that are not.
 */
export const NEIGHBOR_GYMS = {
  /** The Pinewood Public Library (gym 1) of its own: the same place and name, no Wayfarer id. */
  library: 101,
  /** The Old Stone Fountain (gym 2) by its Wayfarer id, 30 m away and called otherwise. */
  fountain: 102,
  /** At the Harbor Lighthouse Mural (gym 7), but called otherwise: not the same gym. */
  harbor: 107,
  /** The Lakeview Trailhead (gym 10) of its own, outside every region: not shown. */
  lakeview: 110,
} as const;

/** The test server's gyms with Wayfarer ids where the second's has the same. */
export const FOUNTAIN_WAYFARER_ID = 'f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0.16';

/** The third server's region, over West (`THIRD_GUILD_ROW`). */
export function thirdRegion(): Region {
  return {
    ...testRegions()[0]!,
    id: 33,
    guildId: THIRD_GUILD_ROW,
    channelId: THIRD_CHANNEL,
    forumChannelId: null,
  };
}

/**
 * Gyms of three servers in a real `GymDirectory` (plan 19E): the test server's (row 1) as the
 * fixtures have them, the Fountain given a Wayfarer id; the second server's (row 2, Wide over West
 * and East) `NEIGHBOR_GYMS` and gym 4, the Veterans Memorial Bridge, which the upgrade linked to
 * both (one row); the third's (row 3, a region over West) a library of its own at gym 1's place.
 */
export async function neighborGymsWith() {
  const ours = testGyms().map((gym) =>
    gym.id === 2 ? { ...gym, pogoId: FOUNTAIN_WAYFARER_ID } : gym,
  );
  const byId = new Map(ours.map((gym) => [gym.id, gym]));
  const copy = (id: number, of: number, changes: Partial<Gym> = {}): Gym => ({
    ...byId.get(of)!,
    id,
    nickname: null,
    description: null,
    notice: null,
    keywords: [],
    ...changes,
  });
  const fountain = byId.get(2)!;
  const theirs = [
    copy(NEIGHBOR_GYMS.library, 1),
    copy(NEIGHBOR_GYMS.fountain, 2, {
      name: 'Fountain in the square',
      lat: fountain.lat + 0.00027,
    }),
    copy(NEIGHBOR_GYMS.harbor, 7, { name: 'Lighthouse', pogoId: null }),
    copy(NEIGHBOR_GYMS.lakeview, 10),
  ];
  const third = [copy(201, 1)];
  const links: GymLink[] = [
    ...testLinks(ours),
    ...theirs.map((gym) => ({ gymId: gym.id, guildId: OTHER_GUILD_ROW })),
    { gymId: 4, guildId: OTHER_GUILD_ROW },
    { gymId: 201, guildId: THIRD_GUILD_ROW },
  ];
  const store = new MemoryGyms([...ours, ...theirs, ...third], links);
  const regions = { rows: [...testRegions(), wideRegion(), thirdRegion()] };
  const made = await gymDirectoryWith(store, regions);
  return {
    ...made,
    rows: { ours: TEST_GUILD_ROW, theirs: OTHER_GUILD_ROW, third: THIRD_GUILD_ROW },
  };
}

/**
 * The gyms of `neighborGymsWith`, the second server's with curated texts of their own, and a copy
 * whose writes go through the storage, filling only what is empty then, and read the gym again
 * (as `GymAdminService.fillEmpty`).
 */
export async function neighborCopyWith(options: { batch?: number } = {}) {
  const made = await neighborGymsWith();
  const theirs: Record<number, Partial<GymTexts>> = {
    [NEIGHBOR_GYMS.library]: {
      nickname: 'Big Library',
      notice: 'Closed on Mondays',
      description: 'Their own words',
      keywords: ['books', 'reading'],
    },
    [NEIGHBOR_GYMS.fountain]: { nickname: 'Splash', keywords: ['water'] },
    [NEIGHBOR_GYMS.harbor]: { nickname: 'Lighthouse' },
    // The row both servers share: whatever it says is both servers' already.
    4: { notice: 'Shared notice' },
  };
  for (const [id, texts] of Object.entries(theirs)) {
    await made.gyms.update(Number(id), texts);
    await made.directory.refreshGym(Number(id));
  }
  const edits: { id: number; texts: FillableTexts; staffId: string }[] = [];
  const pauses = { count: 0 };
  const copy = new NeighborCopy({
    gyms: made.directory,
    matches: new NeighborMatches({ gyms: made.directory }),
    fill: async (id, texts, staffId) => {
      edits.push({ id, texts, staffId });
      const written = await made.gyms.fillEmpty(id, texts);
      await made.directory.refreshGym(id);
      return written;
    },
    ...(options.batch === undefined ? {} : { batch: options.batch }),
    pause: () => {
      pauses.count += 1;
      return Promise.resolve();
    },
  });
  return { ...made, copy, edits, pauses };
}
