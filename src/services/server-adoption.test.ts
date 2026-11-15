import { describe, expect, it } from 'vitest';
import { RecordingDms } from '../../test/support/dms.js';
import { textOf } from '../../test/support/messages.js';
import { standingsWith } from '../../test/support/server-standings.js';
import { createTestLogger } from '../../test/support/test-logger.js';
import type { ShardStart } from '../discord/shard-readiness.js';
import { ServerAdoption } from './server-adoption.js';

const OWNER = '323456789012345670';
const OPERATOR = '323456789012345671';
const STRANGER = '323456789012345672';
/** The owner's server. */
const OWNERS = '412345678901234567';
/** An operator's server. */
const OPERATORS = '412345678901234568';
/** A server somebody else added Pine to. */
const STRANGERS = '412345678901234569';
/** Down at the start: its owner is not known yet. */
const DOWN = '412345678901234570';

const NAMES = new Map([
  [OWNERS, 'Owner’s Raids'],
  [OPERATORS, 'Operator’s Raids'],
  [STRANGERS, 'Somebody’s Raids'],
  [DOWN, 'Down Raids'],
]);

function shardStart(overrides: Partial<ShardStart> = {}): ShardStart {
  return {
    shard: 0,
    servers: [],
    gone: [],
    unavailable: new Set(),
    first: true,
    ...overrides,
  };
}

/**
 * A new install's adoption over real standings with nothing recorded (`servers` unset unless
 * given), `owners` each server's Discord owner as the cache knows it (none for one that is
 * down), `publicBot` what the application says.
 */
function adoptionWith(
  options: {
    publicBot?: boolean | undefined;
    servers?: 'open' | string[];
    owners?: Map<string, string>;
  } = {},
) {
  const { log, entries } = createTestLogger();
  const { standings, store } = standingsWith({
    recorded: [],
    log,
    ...(options.servers === undefined ? {} : { servers: options.servers }),
  });
  const owners =
    options.owners ??
    new Map([
      [OWNERS, OWNER],
      [OPERATORS, OPERATOR],
      [STRANGERS, STRANGER],
    ]);
  const dms = new RecordingDms();
  const refused: string[] = [];
  const adoption = new ServerAdoption({
    standings,
    publicBot: 'publicBot' in options ? options.publicBot : true,
    ownerOf: (serverId) => owners.get(serverId),
    nameOf: (serverId) => NAMES.get(serverId),
    mayOwn: (userId) => userId === OWNER || userId === OPERATOR,
    ownerId: OWNER,
    dms,
    refuse: (serverId) => {
      refused.push(serverId);
    },
    log,
    now: () => Date.parse('2026-11-13T18:00:00Z'),
  });
  return { adoption, standings, store, dms, refused, entries, owners };
}

describe('ServerAdoption: a new install keeps its owner’s server (plan 19C-1)', () => {
  it('with Public Bot off adopts every server present at a shard’s first ready, at once, and writes them once every shard is ready', async () => {
    const { adoption, standings, store, dms, entries } = adoptionWith({ publicBot: false });
    adoption.shardReady(shardStart({ servers: [OWNERS, STRANGERS], unavailable: new Set([DOWN]) }));
    // Admitted in that very moment, so that the start fills them.
    expect(standings.mayHave(OWNERS)).toBe(true);
    expect(standings.mayHave(STRANGERS)).toBe(true);
    expect(standings.mayHave(DOWN)).toBe(true);
    expect(store.rows.size).toBe(0);
    await adoption.everyShardReady();
    expect([...store.rows.keys()].sort()).toEqual([OWNERS, STRANGERS, DOWN].sort());
    expect(standings.adopting).toBe(false);
    const warned = entries.find((entry) => entry['msg'] === 'adopted the servers of a new install');
    expect(warned).toMatchObject({ level: 40 });
    const told = dms.to(OWNER).map(textOf);
    expect(told).toHaveLength(1);
    expect(told[0]).toContain(`Owner’s Raids** · ${OWNERS}`);
    expect(told[0]).toContain(`Down Raids** · ${DOWN}`);
  });

  it('with Public Bot on adopts only the servers its owner or an operator owns', async () => {
    const { adoption, standings, store } = adoptionWith({ publicBot: true });
    adoption.shardReady(shardStart({ servers: [OWNERS, OPERATORS, STRANGERS] }));
    expect(standings.mayHave(OWNERS)).toBe(true);
    expect(standings.mayHave(OPERATORS)).toBe(true);
    expect(standings.mayHave(STRANGERS)).toBe(false);
    await adoption.everyShardReady();
    expect([...store.rows.keys()].sort()).toEqual([OWNERS, OPERATORS]);
  });

  it('where Public Bot could not be read keeps a stranger’s server waiting for the owner, neither adopted nor refused', async () => {
    const owners = new Map([
      [OWNERS, OWNER],
      [STRANGERS, STRANGER],
    ]);
    const { adoption, standings, store, dms, refused } = adoptionWith({
      publicBot: undefined,
      owners,
    });
    adoption.shardReady(shardStart({ servers: [OWNERS, STRANGERS], unavailable: new Set([DOWN]) }));
    expect(standings.mayHave(OWNERS)).toBe(true);
    expect(standings.mayHave(STRANGERS)).toBe(false);
    expect(adoption.undecided(STRANGERS)).toBe(true);
    await adoption.everyShardReady();
    expect([...store.rows.keys()]).toEqual([OWNERS]);
    // A server that was down comes, a stranger's: it waits as well.
    owners.set(DOWN, STRANGER);
    await adoption.available(DOWN);
    expect(adoption.undecided(DOWN)).toBe(true);
    expect(standings.mayHave(DOWN)).toBe(false);
    expect(refused).toEqual([]);
    // The owner is told of what was kept, and of each server that waits for their word.
    const told = dms.to(OWNER).map(textOf);
    expect(told).toHaveLength(3);
    expect(told[0]).toContain(`Owner’s Raids** · ${OWNERS}`);
    expect(told[1]).toContain(`Somebody’s Raids** · ${STRANGERS}`);
    expect(told[1]).toContain('/operator servers allow');
    expect(told[2]).toContain(`Down Raids** · ${DOWN}`);
  });

  it('after the first start adopts a server that joins only where its owner or an operator owns it, even with Public Bot off', async () => {
    const { adoption, standings, refused } = adoptionWith({ publicBot: false });
    // The first start found no server.
    adoption.shardReady(shardStart());
    await adoption.everyShardReady();
    // A stranger adds it (by GuildCreate, or found at the client's ready): not adopted, and the
    // refusal is the admission's.
    await adoption.joined(STRANGERS);
    expect(standings.mayHave(STRANGERS)).toBe(false);
    expect(adoption.undecided(STRANGERS)).toBe(false);
    expect(refused).toEqual([]);
    await adoption.joined(OWNERS);
    expect(standings.mayHave(OWNERS)).toBe(true);
  });

  it('where Public Bot could not be read refuses a stranger’s server that joins after the first start', async () => {
    const { adoption, standings } = adoptionWith({ publicBot: undefined });
    adoption.shardReady(shardStart());
    await adoption.everyShardReady();
    await adoption.joined(STRANGERS);
    expect(standings.mayHave(STRANGERS)).toBe(false);
    expect(adoption.undecided(STRANGERS)).toBe(false);
  });

  it('with Public Bot on decides a server that was down once it comes: adopted if the owner’s, else refused', async () => {
    const owners = new Map([[OWNERS, OWNER]]);
    const { adoption, standings, store, refused } = adoptionWith({ publicBot: true, owners });
    adoption.shardReady(shardStart({ servers: [OWNERS], unavailable: new Set([DOWN, STRANGERS]) }));
    expect(adoption.undecided(DOWN)).toBe(true);
    expect(adoption.undecided(OWNERS)).toBe(false);
    await adoption.everyShardReady();
    // It comes: its owner is the bot's.
    owners.set(DOWN, OWNER);
    await adoption.available(DOWN);
    expect(standings.mayHave(DOWN)).toBe(true);
    expect(store.rows.get(DOWN)?.recordedAt).not.toBeNull();
    // A stranger's comes: refused, never recorded.
    owners.set(STRANGERS, STRANGER);
    await adoption.available(STRANGERS);
    expect(refused).toEqual([STRANGERS]);
    expect(standings.mayHave(STRANGERS)).toBe(false);
    expect(adoption.undecided(STRANGERS)).toBe(false);
  });

  it('adopts a server added while nothing was ever recorded, then closes for good', async () => {
    const { adoption, standings, store, dms } = adoptionWith({ publicBot: true });
    // The first start found no server.
    adoption.shardReady(shardStart());
    await adoption.everyShardReady();
    expect(standings.adopting).toBe(true);
    // A stranger adds it first: not adopted, and the window stays open.
    await adoption.joined(STRANGERS);
    expect(standings.mayHave(STRANGERS)).toBe(false);
    expect(standings.adopting).toBe(true);
    await adoption.joined(OWNERS);
    expect(standings.mayHave(OWNERS)).toBe(true);
    expect(store.rows.get(OWNERS)?.recordedAt).not.toBeNull();
    expect(standings.adopting).toBe(false);
    expect(dms.to(OWNER)).toHaveLength(1);
    // A later server, even the owner's operator's, is not adopted: it needs an allowance.
    await adoption.joined(OPERATORS);
    expect(standings.mayHave(OPERATORS)).toBe(false);
  });

  it('adopts nothing at a later ready, nor on an instance whose file lists servers or is open', async () => {
    const later = adoptionWith({ publicBot: false });
    later.adoption.shardReady(shardStart({ servers: [OWNERS], first: false }));
    expect(later.standings.mayHave(OWNERS)).toBe(false);
    // A list names its own servers: one it does not name is not adopted.
    const listing = adoptionWith({ publicBot: false, servers: [OPERATORS] });
    listing.adoption.shardReady(shardStart({ servers: [OWNERS] }));
    await listing.adoption.everyShardReady();
    expect(listing.standings.mayHave(OWNERS)).toBe(false);
    expect(listing.store.rows.size).toBe(0);
    // An open instance needs none.
    const open = adoptionWith({ publicBot: false, servers: 'open' });
    open.adoption.shardReady(shardStart({ servers: [OWNERS] }));
    await open.adoption.everyShardReady();
    expect(open.store.rows.size).toBe(0);
  });

  it('logs a write that failed, keeps the adopted for this run and writes them at the next ready', async () => {
    const { adoption, standings, store, entries } = adoptionWith({ publicBot: false });
    adoption.shardReady(shardStart({ servers: [OWNERS] }));
    store.failing.set('record', new Error('the database is away'));
    await adoption.everyShardReady();
    expect(entries.some((entry) => entry['msg'] === 'could not record the adopted servers')).toBe(
      true,
    );
    expect(standings.mayHave(OWNERS)).toBe(true);
    store.failing.delete('record');
    await adoption.everyShardReady();
    expect(store.rows.get(OWNERS)?.recordedAt).not.toBeNull();
  });
});
