import { describe, expect, it, vi } from 'vitest';
import {
  PARTY_NOW,
  partyStoreWith,
  TEST_PIN,
  TEST_SPOT,
  testMax,
  testMeetup,
  testRaid,
} from '../../test/support/parties.js';
import { heldCall } from '../../test/support/held-call.js';
import { serverRecordRow, STANDING_NOW } from '../../test/support/server-record-cases.js';
import { standingsWith } from '../../test/support/server-standings.js';
import { TestServers } from '../../test/support/server-values.js';
import type { MaxParty, MaxSpot, RaidParty } from '../domain/party/party.js';
import { NeighborParties } from './neighbor-parties.js';
import { quietServers, type QuietServers } from './quiet-servers.js';

/** Three servers by row: 1 and 2 are neighbors, 3 is neither's. */
const SERVERS: Record<number, string> = { 1: 'ours', 2: 'theirs', 3: 'third' };
const ROWS = new Map(Object.entries(SERVERS).map(([row, server]) => [server, Number(row)]));

function partiesWith(quiet: Set<string> | QuietServers = new Set<string>()) {
  const isQuiet = (server: string) =>
    quiet instanceof Set ? quiet.has(server) : quiet.isQuiet(server);
  const maxes: MaxParty[] = [
    testMax({ id: '00000000-0000-4000-8000-000000000021', guildId: 2 }),
    testMax({ id: '00000000-0000-4000-8000-000000000022', guildId: 3 }),
  ].map((party) => ({ ...party, forumPostId: `9000000000000000${party.guildId}` }));
  const raids: RaidParty[] = [
    {
      ...testRaid({ id: '00000000-0000-4000-8000-000000000031', guildId: 2, gymId: 101 }),
      forumPostId: '900000000000000031',
    },
  ];
  return new NeighborParties({
    neighbors: {
      neighborsOf: (server) =>
        server === 'ours' ? ['theirs'] : server === 'theirs' ? ['ours'] : [],
    },
    quiet: { isQuiet },
    matches: {
      sameGym: (from, gymId, to) => (from === 1 && gymId === 1 && to === 2 ? 101 : undefined),
      sameSpot: (_from, spotId) => spotId === TEST_SPOT.id,
      changesOf: () => new Map(),
    },
    rowOf: (server) => ROWS.get(server),
    serverOfRow: (row) => SERVERS[row],
    parties: {
      raidAt: (row, gymId) => raids.find((raid) => raid.guildId === row && raid.gymId === gymId),
      maxAt: (row, spot: MaxSpot) =>
        maxes.find((max) => max.guildId === row && max.max.spot.kind === spot.kind),
    },
  });
}

describe('NeighborParties (plan 19E)', () => {
  it('finds a neighbor’s raid at the same gym and max battle at the same Power Spot', () => {
    const finder = partiesWith();
    const now = Date.now();
    expect(finder.of(testRaid(), now).map(({ serverId, party }) => [serverId, party.id])).toEqual([
      ['theirs', '00000000-0000-4000-8000-000000000031'],
    ]);
    expect(finder.of(testMax(), now).map(({ serverId, party }) => [serverId, party.id])).toEqual([
      ['theirs', '00000000-0000-4000-8000-000000000021'],
    ]);
    // The third server has a battle at the spot too, but is no neighbor; it finds none of ours.
    expect(finder.in(testMax(), 'third', now)?.party.guildId).toBe(3);
    expect(finder.of(testMax({ guildId: 3 }), now)).toEqual([]);
  });

  it('finds a neighbor’s raid through the store’s index, never every party (review R3)', async () => {
    const theirs = {
      ...testRaid({ id: '00000000-0000-4000-8000-000000000041', guildId: 2, gymId: 101 }),
      forumPostId: '900000000000000041',
    };
    const { store } = await partyStoreWith([theirs, testRaid({ guildId: 3, gymId: 101 })]);
    const active = vi.spyOn(store, 'active');
    const finder = new NeighborParties({
      neighbors: { neighborsOf: (server) => (server === 'ours' ? ['theirs'] : ['ours']) },
      matches: {
        sameGym: (from, gymId, to) => (from === 1 && gymId === 1 && to === 2 ? 101 : undefined),
        sameSpot: () => false,
        changesOf: () => new Map(),
      },
      rowOf: (server) => ROWS.get(server),
      serverOfRow: (row) => SERVERS[row],
      parties: store,
    });
    expect(finder.of(testRaid(), PARTY_NOW).map(({ party }) => party.id)).toEqual([theirs.id]);
    expect(active).not.toHaveBeenCalled();
  });

  it('finds nothing at a pin, for a meetup, at another gym, or of a quiet server', () => {
    const now = Date.now();
    expect(partiesWith().of(testMax({ spot: TEST_PIN }), now)).toEqual([]);
    expect(partiesWith().of(testMeetup(), now)).toEqual([]);
    expect(partiesWith().of(testRaid({ gymId: 2 }), now)).toEqual([]);
    expect(partiesWith(new Set(['theirs'])).of(testRaid(), now)).toEqual([]);
    expect(partiesWith(new Set(['ours'])).of(testRaid(), now)).toEqual([]);
  });

  it('finds nothing either way while a server is being deleted, as for one left (plan 19C-3)', async () => {
    const DAY = 24 * 3_600_000;
    const { standings } = standingsWith({
      recorded: ['ours'],
      rows: [serverRecordRow({ serverId: 'theirs', leftAt: STANDING_NOW - 31 * DAY })],
      now: () => STANDING_NOW,
    });
    await standings.load();
    const servers = new TestServers();
    const finder = partiesWith(quietServers(standings, servers));
    const held = heldCall('the deletion');
    const deletion = standings.deleteIfDue('theirs', 30 * DAY, async () => {
      held.arrive();
      await held.released;
    });
    await held.reached;
    // Being deleted, and added back meanwhile: pending, and quiet, as a server left is: neither
    // shows the other's parties (`of` asks whether either is quiet).
    for (const step of ['deleting', 'added back'] as const) {
      if (step === 'added back') await standings.cameBack(['theirs']);
      expect(standings.pending('theirs')).toBe(true);
      expect(finder.of(testRaid(), PARTY_NOW)).toEqual([]);
    }
    // Its deletion over, it is back, anew in setup (`app.ts` begins its fill): quiet still.
    servers.settingUp.add('theirs');
    held.release();
    expect(await deletion).toBe(true);
    expect(await standings.settled('theirs')).toBe(true);
    expect(standings.pending('theirs')).toBe(false);
    expect(finder.of(testRaid(), PARTY_NOW)).toEqual([]);
    // Set up (in the test its rows are not gone): it shows again.
    servers.settingUp.delete('theirs');
    expect(finder.of(testRaid(), PARTY_NOW).map(({ serverId }) => serverId)).toEqual(['theirs']);
  });
});
