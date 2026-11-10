import { describe, expect, it, vi } from 'vitest';
import { boardAttendee, boardRecord } from '../../test/support/board-cases.js';
import { boardsWith } from '../../test/support/boards.js';
import { FAKE_GUILD_ID } from '../../test/support/fake-interactions.js';
import { zonedAt } from '../../test/support/time.js';
import { BOARDS } from '../domain/history/board-words.js';
import { BOARD_READ_FRESH_MS } from './boards.js';

const ZONE = 'America/New_York';
const NOW = zonedAt('2026-11-05T12:00', ZONE);
const ASH = '700000000000000001';
const BROCK = '700000000000000003';

/** Ash reported a raid this month that another member completed; Ash and Brock are on the boards. */
async function setup() {
  const made = boardsWith(ZONE);
  made.reader.records.push(
    boardRecord({
      serverId: FAKE_GUILD_ID,
      createdById: ASH,
      createdAt: NOW - 3_600_000,
      attendees: [boardAttendee(ASH, 'done'), boardAttendee(null, 'done')],
    }),
  );
  for (const id of [ASH, BROCK]) await made.optIns.joinBoards(id, FAKE_GUILD_ID, 1);
  made.members.add(ASH, 'Ash').add(BROCK, 'Brock');
  return made;
}

describe('Boards: what a board reads, and how often (W1, W2)', () => {
  it('reads a board of a server and period once a minute, its names asked each time', async () => {
    const made = await setup();
    await made.boards.board(FAKE_GUILD_ID, 'raids', 'month', NOW);
    const reads = made.reader.reads;
    const again = await made.boards.board(FAKE_GUILD_ID, 'raids', 'month', NOW + 1_000);
    expect(again.rows.map((row) => row.name)).toEqual(['Ash']);
    // Only who is on the boards is read again: a member switched off is never shown.
    expect(made.reader.reads - reads).toBe(1);
    await made.boards.board(FAKE_GUILD_ID, 'raids', 'year', NOW + 1_000);
    expect(made.reader.reads - reads).toBeGreaterThan(1);
    const later = made.reader.reads;
    await made.boards.board(FAKE_GUILD_ID, 'raids', 'month', NOW + BOARD_READ_FRESH_MS);
    expect(made.reader.reads - later).toBeGreaterThan(1);
  });

  it('reads who is on the boards once, and asks Discord for names once, for every board at once', async () => {
    const made = await setup();
    const onBoards = vi.spyOn(made.reader, 'onBoards');
    const shown = await made.boards.boards(FAKE_GUILD_ID, BOARDS, 'month', NOW, { id: BROCK });
    expect(shown.map((one) => one.board)).toEqual([...BOARDS]);
    expect(onBoards).toHaveBeenCalledTimes(1);
    expect(made.members.namedAsks).toEqual([[ASH]]);
  });

  it('asks the names of no member twice in a call, the viewer’s place from the same answer', async () => {
    const made = await setup();
    const others = Array.from(
      { length: 24 },
      (_, n) => `7000000000000002${String(n).padStart(2, '0')}`,
    );
    for (const [n, id] of others.entries()) {
      for (let k = 0; k <= n; k++) {
        made.reader.records.push(
          boardRecord({
            serverId: FAKE_GUILD_ID,
            createdById: id,
            createdAt: NOW - 7_200_000 - k,
            attendees: [boardAttendee(id, 'done'), boardAttendee(null, 'done')],
          }),
        );
      }
      await made.optIns.joinBoards(id, FAKE_GUILD_ID, 1);
      // Every other one has left the server.
      if (n % 2 === 0) made.members.add(id, `Trainer ${String(n)}`);
    }
    const [raids] = await made.boards.boards(FAKE_GUILD_ID, ['raids'], 'month', NOW, {
      id: ASH,
      name: 'Ash',
    });
    expect(made.members.namedAsks).toHaveLength(1);
    expect(made.members.namedAsks[0]).not.toContain(ASH);
    // Twelve named members above Ash, as the board shows them; the twelve who left count not.
    expect(raids?.kind === 'people' ? raids.viewer : undefined).toEqual({
      rank: 13,
      on: true,
      count: 1,
      confirmations: 0,
    });
  });
});
