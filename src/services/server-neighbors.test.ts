import { describe, expect, it } from 'vitest';
import {
  NEIGHBOR_ASH as ASH,
  NEIGHBOR_BROCK as BROCK,
  NEIGHBOR_MISTY as MISTY,
  NEIGHBOR_NOW as NOW,
  neighborRow,
  serverNeighborCases,
} from '../../test/support/server-neighbor-cases.js';
import { MemoryServerNeighbors, neighborsWith } from '../../test/support/server-neighbors.js';
import type { LabPost } from './moderators-lab.js';
import { buttonsOf, textOf } from '../../test/support/messages.js';
import {
  NEIGHBOR_ASK_AGAIN_MS,
  NEIGHBOR_ASK_EXPIRES_MS,
  neighborPair,
  NEIGHBORS_MAX,
} from '../domain/servers/neighbors.js';

serverNeighborCases(() => Promise.resolve(new MemoryServerNeighbors()));

describe('ServerNeighbors (plan 19E)', () => {
  it('writes a request and posts it in the other server’s moderators’ bot lab, with its buttons', async () => {
    const made = await neighborsWith();
    expect(await made.neighbors.ask(ASH, BROCK)).toEqual({ kind: 'asked' });
    expect([...made.store.rows.values()]).toEqual([neighborRow({ askedAt: NOW, toldAt: NOW })]);
    await made.neighbors.idle();
    const [post, ...more] = made.lab.of(BROCK);
    expect(more).toEqual([]);
    expect(textOf(post)).toContain('**Pallet Town** (`412345678901234501`) asks');
    expect(buttonsOf(post).map((button) => [button.label, button.customId])).toEqual([
      ['Accept', `neighbor:${ASH}:accept`],
      ['Decline', `neighbor:${ASH}:decline`],
    ]);
    // Nothing anywhere else: the asker and a third server hear nothing yet.
    expect(made.lab.of(ASH)).toEqual([]);
    expect(made.lab.of(MISTY)).toEqual([]);
    expect(made.neighbors.areNeighbors(ASH, BROCK)).toBe(false);
  });

  it('answers a server it cannot tell as any other, telling nobody', async () => {
    const made = await neighborsWith({ reachable: [ASH, MISTY] });
    expect(await made.neighbors.ask(ASH, BROCK)).toEqual({ kind: 'asked' });
    expect(made.lab.posted).toEqual([]);
    // The request is kept as any other (and expires unanswered).
    expect(made.store.rows.size).toBe(1);
  });

  it('asks again only a week after a decline, answering as asked meanwhile', async () => {
    const declined = neighborRow({ declinedAt: NOW - 60_000 });
    const made = await neighborsWith({ rows: [declined] });
    expect(await made.neighbors.ask(ASH, BROCK)).toEqual({ kind: 'asked' });
    expect(made.lab.posted).toEqual([]);
    expect([...made.store.rows.values()]).toEqual([declined]);
    made.clock.now = NOW - 60_000 + NEIGHBOR_ASK_AGAIN_MS;
    expect(await made.neighbors.ask(ASH, BROCK)).toEqual({ kind: 'asked' });
    expect(made.lab.of(BROCK)).toHaveLength(1);
  });

  it('accepts: both are neighbors, the asker’s lab is told, a third server is neither’s', async () => {
    const made = await neighborsWith({ rows: [neighborRow()] });
    const heard: string[] = [];
    made.neighbors.whenChanged((pair, neighbors) => {
      heard.push(`${pair.serverA}-${pair.serverB}:${String(neighbors)}`);
    });
    expect(await made.neighbors.answer(ASH, BROCK, true)).toEqual({
      kind: 'accepted',
      name: 'Pallet Town',
    });
    expect(made.neighbors.areNeighbors(BROCK, ASH)).toBe(true);
    expect(made.neighbors.neighborsOf(ASH)).toEqual([BROCK]);
    expect(made.neighbors.neighborsOf(BROCK)).toEqual([ASH]);
    expect(made.neighbors.neighborsOf(MISTY)).toEqual([]);
    expect(heard).toEqual([`${ASH}-${BROCK}:true`]);
    expect(made.lab.of(ASH).map(textOf)).toEqual([
      '**Pewter City** (`412345678901234502`) accepted this server’s request: the two ' +
        'servers are neighbors now. The posts of their raids and max battles show the other’s ' +
        'at the gyms and Power Spots both cover.',
    ]);
    // A second answer finds nothing to answer.
    expect(await made.neighbors.answer(ASH, BROCK, false)).toEqual({ kind: 'expired' });
  });

  it('declines: the asker hears only that it was declined', async () => {
    const made = await neighborsWith({ rows: [neighborRow()] });
    expect(await made.neighbors.answer(ASH, BROCK, false)).toEqual({
      kind: 'declined',
      name: 'Pallet Town',
    });
    expect(made.neighbors.areNeighbors(ASH, BROCK)).toBe(false);
    expect(made.lab.of(ASH).map(textOf)).toEqual([
      'The server `412345678901234502` declined this server’s request to be neighbors.',
    ]);
    expect(made.store.rows.get(`${ASH}:${BROCK}`)?.declinedAt).toBe(NOW);
  });

  it('answers as expired a request of another pair, its asker’s own, or one a week old', async () => {
    const made = await neighborsWith({ rows: [neighborRow()] });
    // A press in Misty's lab, by Ash itself, and of a request Misty never had.
    expect(await made.neighbors.answer(ASH, MISTY, true)).toEqual({ kind: 'expired' });
    expect(await made.neighbors.answer(BROCK, ASH, true)).toEqual({ kind: 'expired' });
    made.clock.now = NOW - 60_000 + NEIGHBOR_ASK_EXPIRES_MS;
    expect(await made.neighbors.answer(ASH, BROCK, true)).toEqual({ kind: 'expired' });
    expect(made.lab.posted).toEqual([]);
  });

  it('refuses an acceptance past the limit of neighbors and requests', async () => {
    const others = Array.from({ length: NEIGHBORS_MAX }, (_, n) =>
      neighborRow({
        ...neighborPair(BROCK, String(512345678901234500n + BigInt(n))),
        askedBy: BROCK,
        acceptedAt: NOW - 1,
      }),
    );
    const made = await neighborsWith({ rows: [neighborRow(), ...others] });
    expect(await made.neighbors.answer(ASH, BROCK, true)).toEqual({ kind: 'full' });
    expect(await made.neighbors.ask(BROCK, MISTY)).toEqual({ kind: 'full' });
  });

  it('ends: the row goes, and both labs are told', async () => {
    const made = await neighborsWith({ rows: [neighborRow({ acceptedAt: NOW - 1 })] });
    expect(await made.neighbors.end(BROCK, ASH)).toBe('ended');
    expect(made.store.rows.size).toBe(0);
    expect(made.neighbors.areNeighbors(ASH, BROCK)).toBe(false);
    expect(made.lab.of(ASH).map(textOf)).toEqual([
      '**Pewter City** (`412345678901234502`) ended being neighbors with this server: their ' +
        'raids and max battles no longer show in this server’s posts, nor this server’s in theirs.',
    ]);
    expect(made.lab.of(BROCK).map(textOf)).toEqual([
      'This server’s staff ended being neighbors with **Pallet Town** (`412345678901234501`).',
    ]);
    expect(made.lab.of(MISTY)).toEqual([]);
  });

  it('withdraws its own request, telling nobody; a pair without one has nothing to end', async () => {
    const made = await neighborsWith({ rows: [neighborRow()] });
    expect(await made.neighbors.end(BROCK, ASH)).toBe('none');
    expect(await made.neighbors.end(ASH, BROCK)).toBe('withdrawn');
    expect(made.store.rows.size).toBe(0);
    expect(made.lab.posted).toEqual([]);
  });

  it('posts the other server’s request again where this one asks it back', async () => {
    const made = await neighborsWith({ rows: [neighborRow()] });
    expect(await made.neighbors.ask(BROCK, ASH)).toEqual({ kind: 'theirs' });
    await made.neighbors.idle();
    expect(buttonsOf(made.lab.of(BROCK)[0]).map((button) => button.customId)).toEqual([
      `neighbor:${ASH}:accept`,
      `neighbor:${ASH}:decline`,
    ]);
  });

  it('answers an ask, an answer and an end while the labs’ posts hang (review R1)', async () => {
    const made = await neighborsWith();
    made.lab.hold = new Promise<void>(() => undefined);
    expect(await made.neighbors.ask(ASH, BROCK)).toEqual({ kind: 'asked' });
    expect(await made.neighbors.answer(ASH, BROCK, true)).toEqual({
      kind: 'accepted',
      name: 'Pallet Town',
    });
    expect(await made.neighbors.end(ASH, BROCK)).toBe('ended');
    // Each was asked of the labs after its turn, none waited for.
    expect(made.lab.posted.map((one) => one.serverId)).toEqual([BROCK, ASH, BROCK, ASH]);
    // A third server's ask is not held behind them either.
    expect(await made.neighbors.ask(MISTY, ASH)).toEqual({ kind: 'asked' });
  });

  it('logs a post that fails, the change standing', async () => {
    const made = await neighborsWith();
    made.lab.fails = new Error('Discord is down');
    expect(await made.neighbors.ask(ASH, BROCK)).toEqual({ kind: 'asked' });
    await made.neighbors.idle();
    expect(made.store.rows.size).toBe(1);
    expect(made.entries.map((entry) => entry.msg)).toContain(
      'could not tell a server’s staff of its neighbors in its moderators’ bot lab',
    );
  });

  it('does the same awaited work for an ask whatever the other server is (review R1)', async () => {
    const declined = { ...neighborRow({ declinedAt: NOW - 1 }), ...neighborPair(ASH, MISTY) };
    const made = await neighborsWith({ rows: [declined], reachable: [ASH, BROCK] });
    const writes = () => made.store.asked.put;
    // A server that can be told, one that cannot, and one that declined within the week.
    const counts: number[] = [];
    for (const target of [BROCK, '412345678901234509', MISTY]) {
      const before = writes();
      expect(await made.neighbors.ask(ASH, target)).toEqual({ kind: 'asked' });
      counts.push(writes() - before);
    }
    expect(counts).toEqual([1, 1, 1]);
    await made.neighbors.idle();
    expect(made.lab.posted.map((one) => one.serverId)).toEqual([BROCK]);
  });

  it('tells the other of a pair’s requests once a week, whatever was taken back (review R2)', async () => {
    const made = await neighborsWith();
    await made.neighbors.ask(ASH, BROCK);
    expect(await made.neighbors.end(ASH, BROCK)).toBe('withdrawn');
    made.clock.now += 60_000;
    expect(await made.neighbors.ask(ASH, BROCK)).toEqual({ kind: 'asked' });
    expect(await made.neighbors.end(ASH, BROCK)).toBe('withdrawn');
    expect(await made.neighbors.ask(ASH, BROCK)).toEqual({ kind: 'asked' });
    await made.neighbors.idle();
    expect(made.lab.of(BROCK)).toHaveLength(1);
    // The request asked anew is pending: the post Brock has answers it.
    expect(await made.neighbors.answer(ASH, BROCK, true)).toMatchObject({ kind: 'accepted' });
    // A week after the tell, a request anew is told again.
    const made2 = await neighborsWith();
    await made2.neighbors.ask(ASH, BROCK);
    await made2.neighbors.end(ASH, BROCK);
    made2.clock.now += NEIGHBOR_ASK_EXPIRES_MS;
    await made2.neighbors.ask(ASH, BROCK);
    await made2.neighbors.idle();
    expect(made2.lab.of(BROCK)).toHaveLength(2);
  });

  it('tells a request written while the other could not be told at a repeat ask (review R5)', async () => {
    const made = await neighborsWith({ reachable: [ASH] });
    expect(await made.neighbors.ask(ASH, BROCK)).toEqual({ kind: 'asked' });
    made.clock.now += 60_000;
    made.reachable.add(BROCK);
    expect(await made.neighbors.ask(ASH, BROCK)).toEqual({ kind: 'asked' });
    expect(await made.neighbors.ask(ASH, BROCK)).toEqual({ kind: 'asked' });
    await made.neighbors.idle();
    const [post, ...more] = made.lab.of(BROCK);
    expect(more).toEqual([]);
    // It expires a week after it was asked, not told.
    expect(textOf(post)).toContain(`<t:${String((NOW + NEIGHBOR_ASK_EXPIRES_MS) / 1000)}:R>`);
    expect(made.store.rows.get(`${ASH}:${BROCK}`)?.toldAt).toBe(NOW + 60_000);
  });

  it('tells a request whose post did not go at a repeat ask, once the lab works: one post (review RR1)', async () => {
    const made = await neighborsWith();
    made.lab.noLab.add(BROCK);
    expect(await made.neighbors.ask(ASH, BROCK)).toEqual({ kind: 'asked' });
    await made.neighbors.idle();
    // Not told: the pair's tell is written back as it was before the ask.
    expect(made.store.rows.get(`${ASH}:${BROCK}`)?.toldAt).toBeNull();
    made.lab.noLab.delete(BROCK);
    made.clock.now += 60_000;
    expect(await made.neighbors.ask(ASH, BROCK)).toEqual({ kind: 'asked' });
    expect(await made.neighbors.ask(ASH, BROCK)).toEqual({ kind: 'asked' });
    await made.neighbors.idle();
    expect(made.lab.of(BROCK)).toHaveLength(1);
    expect(made.store.rows.get(`${ASH}:${BROCK}`)?.toldAt).toBe(NOW + 60_000);
  });

  it('writes back the tell of a post that failed, and of a request taken back while it was on its way (review RR1)', async () => {
    const made = await neighborsWith();
    made.lab.fails = new Error('Discord is down');
    await made.neighbors.ask(ASH, BROCK);
    await made.neighbors.idle();
    made.lab.fails = undefined;
    made.clock.now += 60_000;
    await made.neighbors.ask(ASH, BROCK);
    await made.neighbors.idle();
    // The failed post and the one that went.
    expect(made.lab.of(BROCK)).toHaveLength(2);
    // A post that hangs while its request is taken back, and then fails: the row, told of
    // nothing and taken back, is kept no longer.
    const other = await neighborsWith();
    let fail: () => void = () => undefined;
    other.lab.hold = new Promise<void>((resolve) => {
      fail = resolve;
    });
    other.lab.fails = new Error('Discord is down');
    await other.neighbors.ask(ASH, BROCK);
    expect(await other.neighbors.end(ASH, BROCK)).toBe('withdrawn');
    fail();
    await other.neighbors.idle();
    expect(other.store.rows.size).toBe(0);
    expect(other.neighbors.rowsOf(ASH)).toEqual([]);
  });

  it('writes back no tell that a later one replaced (review RR1)', async () => {
    const made = await neighborsWith();
    // Each post answers when the test says.
    const answers: ((posted: LabPost) => void)[] = [];
    made.lab.post = () => new Promise<LabPost>((resolve) => answers.push(resolve));
    await made.neighbors.ask(ASH, BROCK);
    made.clock.now += NEIGHBOR_ASK_EXPIRES_MS;
    await made.neighbors.ask(ASH, BROCK);
    expect(answers).toHaveLength(2);
    // The tell of a week later went; the first post did not: the later tell stands.
    answers[1]?.('sent');
    answers[0]?.('not-sent');
    await made.neighbors.idle();
    expect(made.store.rows.get(`${ASH}:${BROCK}`)?.toldAt).toBe(NOW + NEIGHBOR_ASK_EXPIRES_MS);
  });

  it('lets a server that declined ask back at once (review R4)', async () => {
    const made = await neighborsWith({ rows: [neighborRow()] });
    await made.neighbors.answer(ASH, BROCK, false);
    expect(await made.neighbors.ask(BROCK, ASH)).toEqual({ kind: 'asked' });
    await made.neighbors.idle();
    expect(buttonsOf(made.lab.of(ASH).at(-1)).map((button) => button.customId)).toEqual([
      `neighbor:${BROCK}:accept`,
      `neighbor:${BROCK}:decline`,
    ]);
    expect(await made.neighbors.answer(BROCK, ASH, true)).toMatchObject({ kind: 'accepted' });
  });

  it('deletes with the upkeep, by their keys, the rows no longer kept, memory with them (review R8)', async () => {
    const declined = { ...neighborRow({ declinedAt: NOW - 60_000 }), ...neighborPair(ASH, MISTY) };
    const accepted = {
      ...neighborRow({ acceptedAt: NOW - 1 }),
      ...neighborPair(BROCK, MISTY),
      askedBy: BROCK,
    };
    const made = await neighborsWith({ rows: [neighborRow(), declined, accepted] });
    expect(await made.neighbors.sweep()).toBe(0);
    made.clock.now = NOW - 60_000 + NEIGHBOR_ASK_EXPIRES_MS;
    expect(await made.neighbors.sweep()).toBe(2);
    expect([...made.store.rows.values()]).toEqual([accepted]);
    expect(made.neighbors.rowsOf(ASH)).toEqual([]);
    expect(made.neighbors.rowsOf(MISTY)).toEqual([accepted]);
  });

  it('forgets a server whose data was deleted: added back, it has no neighbors (plan 19C-3)', async () => {
    const asked = { ...neighborRow(), ...neighborPair(ASH, MISTY) };
    const others = {
      ...neighborRow({ acceptedAt: NOW - 1 }),
      ...neighborPair(BROCK, MISTY),
      askedBy: BROCK,
    };
    const made = await neighborsWith({
      rows: [neighborRow({ acceptedAt: NOW - 1 }), asked, others],
    });
    // The deletion took its rows, by either column.
    made.store.rows.delete(`${ASH}:${BROCK}`);
    made.store.rows.delete(`${ASH}:${MISTY}`);
    await made.neighbors.forgetServer(ASH);
    expect(made.neighbors.neighborsOf(ASH)).toEqual([]);
    expect(made.neighbors.rowsOf(ASH)).toEqual([]);
    expect(made.neighbors.neighborsOf(BROCK)).toEqual([MISTY]);
    expect(made.neighbors.rowsOf(MISTY)).toEqual([others]);
    // Added back, it asks anew, and is asked anew.
    expect(await made.neighbors.ask(ASH, BROCK)).toEqual({ kind: 'asked' });
    await made.neighbors.idle();
    expect(made.lab.of(BROCK)).toHaveLength(1);
  });

  it('deletes at the start the requests and declines that say nothing any more', async () => {
    const expired = neighborRow({ askedAt: NOW - NEIGHBOR_ASK_EXPIRES_MS - 1 });
    const kept = {
      ...neighborRow({ acceptedAt: NOW - NEIGHBOR_ASK_EXPIRES_MS * 4 }),
      ...neighborPair(ASH, MISTY),
    };
    const made = await neighborsWith({ rows: [expired, kept] });
    expect([...made.store.rows.values()]).toEqual([kept]);
    expect(made.neighbors.neighborsOf(MISTY)).toEqual([ASH]);
  });
});
