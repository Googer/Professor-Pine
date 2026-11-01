import { describe, expect, it } from 'vitest';
import { joinedServers, mapServers, type MapServerSources } from './map-servers.js';

const OUTLINE = [
  { lat: 40, lon: -80 },
  { lat: 40.01, lon: -80 },
  { lat: 40.01, lon: -79.99 },
  { lat: 40, lon: -80 },
];

/** A region of a server's row, with an outline or without. */
const region = (guildId: number | null, outlined: boolean, channelId = '600000000000000001') => ({
  guildId,
  channelId,
  bounds: outlined ? OUTLINE : null,
});

/**
 * Servers the bot is in, the rows of servers (snowflake to row id), and the regions of the rows;
 * `asked` records each row whose snowflake was asked for.
 */
function sources(
  joined: { id: string; name: string }[],
  rows: Record<string, number>,
  regions: ReturnType<typeof region>[],
  unavailable: string[] = [],
) {
  const asked: number[] = [];
  const made: MapServerSources = {
    joined: () => ({ servers: joined, unavailable }),
    guilds: {
      snowflakeOf(id) {
        asked.push(id);
        return Promise.resolve(Object.entries(rows).find(([, row]) => row === id)?.[0]);
      },
    },
    regions: { all: () => regions },
  };
  return { made, asked };
}

describe('mapServers', () => {
  it('gives the servers the bot is in that have a region with an outline', async () => {
    const { made } = sources(
      [
        { id: '410000000000000001', name: 'Pinewood' },
        { id: '410000000000000002', name: 'Oakvale' },
        { id: '410000000000000003', name: 'No row yet' },
        { id: '410000000000000004', name: 'No regions' },
      ],
      {
        '410000000000000001': 1,
        '410000000000000002': 2,
        '410000000000000004': 4,
        '419999999999999999': 3,
      },
      [
        region(1, true),
        region(1, false),
        // Only a region without an outline: an empty map is no place to send anybody.
        region(2, false),
        // The server of row 3 is one the bot is not in: never named.
        region(3, true),
        region(null, true),
      ],
    );
    expect(await mapServers(made)()).toEqual({
      servers: [{ id: '410000000000000001', name: 'Pinewood' }],
      unavailable: [],
    });
  });

  it('asks only for the rows of regions with an outline, once each, whatever the servers joined', async () => {
    const joined = Array.from({ length: 50 }, (_, i) => ({
      id: `4200000000000000${String(i).padStart(2, '0')}`,
      name: `Server ${i}`,
    }));
    const { made, asked } = sources(joined, { '420000000000000007': 7 }, [
      region(7, true),
      region(7, true, '600000000000000002'),
      region(8, false),
    ]);
    expect(await mapServers(made)()).toEqual({
      servers: [{ id: '420000000000000007', name: 'Server 7' }],
      unavailable: [],
    });
    expect(asked).toEqual([7]);
  });

  it('counts a region whose channel is gone, as the map draws it', async () => {
    // No channels are asked at all: a region's outline is enough.
    const { made } = sources(
      [{ id: '410000000000000001', name: 'Pinewood' }],
      { '410000000000000001': 1 },
      [region(1, true, '699999999999999999')],
    );
    expect(await mapServers(made)()).toEqual({
      servers: [{ id: '410000000000000001', name: 'Pinewood' }],
      unavailable: [],
    });
  });

  it('gives the servers with a map Discord has not made available apart, by id alone', async () => {
    const { made } = sources(
      [{ id: '410000000000000001', name: 'Pinewood' }],
      { '410000000000000001': 1, '410000000000000002': 2, '410000000000000003': 3 },
      [region(1, true), region(2, true), region(3, false)],
      // Row 3 has no outline; the fourth server has no row: neither has a map.
      ['410000000000000002', '410000000000000003', '410000000000000004'],
    );
    expect(await mapServers(made)()).toEqual({
      servers: [{ id: '410000000000000001', name: 'Pinewood' }],
      unavailable: ['410000000000000002'],
    });
  });

  it('gives none while the bot is in no server', async () => {
    const { made } = sources([], { '410000000000000001': 1 }, [region(1, true)]);
    expect(await mapServers(made)()).toEqual({ servers: [], unavailable: [] });
  });
});

describe('joinedServers', () => {
  it('names the servers Discord has made available, and gives the others by id alone', () => {
    expect(
      joinedServers([
        { id: '410000000000000001', available: true, name: 'Pinewood' },
        // Sent unavailable when the bot started: discord.js has no name for it yet.
        { id: '410000000000000002', available: false, name: undefined },
        // After a reconnect with a new session, or an outage: discord.js keeps the name it had,
        // and the server is still not to be named until Discord sends it again.
        { id: '410000000000000003', available: false, name: 'Oakvale' },
        { id: '410000000000000004', available: true, name: undefined },
      ]),
    ).toEqual({
      servers: [{ id: '410000000000000001', name: 'Pinewood' }],
      unavailable: ['410000000000000002', '410000000000000003', '410000000000000004'],
    });
  });
});
