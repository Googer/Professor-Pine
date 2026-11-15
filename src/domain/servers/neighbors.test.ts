import { describe, expect, it } from 'vitest';
import {
  decideAccept,
  decideAsk,
  NEIGHBOR_ASK_AGAIN_MS,
  NEIGHBOR_ASK_EXPIRES_MS,
  neighborPair,
  NEIGHBORS_MAX,
  neighborRowKept,
  neighborStanding,
  readServerRef,
  type NeighborRow,
} from './neighbors.js';

/** Two neighbors to be, and a third that is neither's neighbor. */
const ASH = '412345678901234501';
const BROCK = '412345678901234502';
const MISTY = '412345678901234503';
const NOW = Date.parse('2026-11-14T15:00:00Z');

function row(overrides: Partial<NeighborRow> = {}): NeighborRow {
  return {
    ...neighborPair(ASH, BROCK),
    askedBy: ASH,
    askedAt: NOW - 60_000,
    acceptedAt: null,
    declinedAt: null,
    toldAt: null,
    withdrawnAt: null,
    ...overrides,
  };
}

/** A request of Ash's written now, told (`toldAt`) or not. */
function asked(toldAt: number | null): NeighborRow {
  return row({ askedAt: NOW, toldAt });
}

describe('neighborPair', () => {
  it('puts the pair in the order of the snowflakes as numbers, whoever names it first', () => {
    expect(neighborPair(BROCK, ASH)).toEqual({ serverA: ASH, serverB: BROCK });
    expect(neighborPair(ASH, BROCK)).toEqual({ serverA: ASH, serverB: BROCK });
    // As numbers, not as text: 17 digits come before 18.
    expect(neighborPair('100000000000000000', '99999999999999999')).toEqual({
      serverA: '99999999999999999',
      serverB: '100000000000000000',
    });
  });
});

describe('neighborStanding', () => {
  it('reads a row as neighbors, asked, declined or nothing by its times', () => {
    expect(neighborStanding(undefined, NOW)).toBe('none');
    expect(neighborStanding(row(), NOW)).toBe('asked');
    expect(neighborStanding(row({ acceptedAt: NOW - 1 }), NOW)).toBe('neighbors');
    expect(neighborStanding(row({ declinedAt: NOW - 1 }), NOW)).toBe('declined');
    // A request unanswered for a week has expired, and a decline a week old is over.
    expect(neighborStanding(row({ askedAt: NOW - NEIGHBOR_ASK_EXPIRES_MS }), NOW)).toBe('none');
    expect(neighborStanding(row({ declinedAt: NOW - NEIGHBOR_ASK_AGAIN_MS }), NOW)).toBe('none');
    // A request taken back is none.
    expect(neighborStanding(row({ withdrawnAt: NOW - 1 }), NOW)).toBe('none');
  });
});

describe('neighborRowKept', () => {
  it('keeps a row while it says something or holds a tell of the last week', () => {
    expect(neighborRowKept(row({ acceptedAt: 1 }), NOW)).toBe(true);
    expect(neighborRowKept(row(), NOW)).toBe(true);
    expect(neighborRowKept(row({ askedAt: NOW - NEIGHBOR_ASK_EXPIRES_MS }), NOW)).toBe(false);
    expect(neighborRowKept(row({ declinedAt: NOW - NEIGHBOR_ASK_AGAIN_MS + 1 }), NOW)).toBe(true);
    expect(neighborRowKept(row({ declinedAt: NOW - NEIGHBOR_ASK_AGAIN_MS }), NOW)).toBe(false);
    // Taken back: kept as long as its tell keeps the other from being told again, else not.
    expect(neighborRowKept(row({ withdrawnAt: NOW - 1 }), NOW)).toBe(false);
    expect(neighborRowKept(row({ withdrawnAt: NOW - 1, toldAt: NOW - 60_000 }), NOW)).toBe(true);
    // A request told later than it was asked (`decideAsk`, review R5) is kept a week from then.
    const toldLate = row({
      askedAt: NOW - NEIGHBOR_ASK_EXPIRES_MS,
      toldAt: NOW - NEIGHBOR_ASK_EXPIRES_MS + 60_000,
    });
    expect(neighborRowKept(toldLate, NOW)).toBe(true);
    expect(neighborRowKept(toldLate, NOW + 60_000)).toBe(false);
  });
});

describe('decideAsk', () => {
  const asking = { asker: ASH, target: BROCK, now: NOW, count: 0, reachable: true };

  it('asks a server that can be told, and writes the request with when it was told', () => {
    expect(decideAsk({ ...asking, row: undefined })).toEqual({
      kind: 'asked',
      row: asked(NOW),
      tell: true,
    });
  });

  it('writes the request of a server that cannot be told, telling nobody', () => {
    expect(decideAsk({ ...asking, row: undefined, reachable: false })).toEqual({
      kind: 'asked',
      row: asked(null),
      tell: false,
    });
  });

  it('writes the row as it is for a request pending and told, or declined within the week', () => {
    // The same write whatever the other server is (review R1): the asker learns nothing by time.
    const pending = row({ toldAt: NOW - 60_000 });
    expect(decideAsk({ ...asking, row: pending })).toEqual({
      kind: 'asked',
      row: pending,
      tell: false,
    });
    const declined = row({ declinedAt: NOW - 1, toldAt: NOW - 60_000 });
    expect(decideAsk({ ...asking, row: declined })).toEqual({
      kind: 'asked',
      row: declined,
      tell: false,
    });
    // A week after the decline it may be asked again.
    expect(decideAsk({ ...asking, row: row({ declinedAt: NOW - NEIGHBOR_ASK_AGAIN_MS }) })).toEqual(
      { kind: 'asked', row: asked(NOW), tell: true },
    );
  });

  it('tells a pending request at a repeat ask once the other can be told and was not (review R5)', () => {
    const untold = row();
    expect(decideAsk({ ...asking, row: untold, reachable: false })).toEqual({
      kind: 'asked',
      row: untold,
      tell: false,
    });
    expect(decideAsk({ ...asking, row: untold })).toEqual({
      kind: 'asked',
      row: { ...untold, toldAt: NOW },
      tell: true,
    });
  });

  it('tells the other of the pair’s requests once a week, whatever was taken back between (review R2)', () => {
    const withdrawn = row({ toldAt: NOW - 60_000, withdrawnAt: NOW - 30_000 });
    expect(decideAsk({ ...asking, row: withdrawn })).toEqual({
      kind: 'asked',
      row: asked(NOW - 60_000),
      tell: false,
    });
    // A week after the tell, a request anew is told.
    const weekOld = row({
      askedAt: NOW - NEIGHBOR_ASK_EXPIRES_MS,
      toldAt: NOW - NEIGHBOR_ASK_EXPIRES_MS,
      withdrawnAt: NOW - NEIGHBOR_ASK_EXPIRES_MS + 1,
    });
    expect(decideAsk({ ...asking, row: weekOld })).toEqual({
      kind: 'asked',
      row: asked(NOW),
      tell: true,
    });
  });

  it('lets a server that declined ask back at once, as if there were no row (review R4)', () => {
    const declined = row({ declinedAt: NOW - 1, toldAt: NOW - 60_000 });
    expect(decideAsk({ ...asking, asker: BROCK, target: ASH, row: declined })).toEqual({
      kind: 'asked',
      row: { ...asked(NOW), askedBy: BROCK },
      tell: true,
    });
  });

  it('refuses the server itself, neighbors already, and a server with as many as it may', () => {
    expect(decideAsk({ ...asking, target: ASH, row: undefined })).toEqual({ kind: 'self' });
    expect(decideAsk({ ...asking, row: row({ acceptedAt: NOW - 1 }) })).toEqual({
      kind: 'neighbors',
    });
    expect(decideAsk({ ...asking, row: undefined, count: NEIGHBORS_MAX })).toEqual({
      kind: 'full',
    });
  });

  it('points to the request the other server sent, which is in this one’s lab', () => {
    expect(decideAsk({ ...asking, row: row({ askedBy: BROCK }) })).toEqual({ kind: 'theirs' });
  });
});

describe('decideAccept', () => {
  it('accepts or declines only a pending request the other server sent this one', () => {
    expect(decideAccept({ row: row(), by: BROCK, now: NOW, count: 0 })).toBe('ok');
    // Its asker cannot answer its own request, nor a third server, nor anybody once it expired.
    expect(decideAccept({ row: row(), by: ASH, now: NOW, count: 0 })).toBe('expired');
    expect(decideAccept({ row: undefined, by: MISTY, now: NOW, count: 0 })).toBe('expired');
    expect(
      decideAccept({
        row: row({ askedAt: NOW - NEIGHBOR_ASK_EXPIRES_MS }),
        by: BROCK,
        now: NOW,
        count: 0,
      }),
    ).toBe('expired');
    expect(decideAccept({ row: row({ acceptedAt: NOW }), by: BROCK, now: NOW, count: 0 })).toBe(
      'expired',
    );
  });

  it('refuses an acceptance that would give this server more neighbors than it may have', () => {
    expect(decideAccept({ row: row(), by: BROCK, now: NOW, count: NEIGHBORS_MAX })).toBe('full');
  });
});

describe('readServerRef', () => {
  it('reads a server’s id or an invite link to it', () => {
    expect(readServerRef(` ${BROCK} `)).toEqual({ kind: 'id', id: BROCK });
    for (const link of [
      'https://discord.gg/pogo-pgh',
      'discord.gg/pogo-pgh',
      'https://discord.com/invite/pogo-pgh',
      'https://discordapp.com/invite/pogo-pgh/',
      'https://www.discord.gg/pogo-pgh?event=1',
    ]) {
      expect(readServerRef(link)).toEqual({ kind: 'invite', code: 'pogo-pgh' });
    }
  });

  it('reads nothing else', () => {
    for (const text of ['', 'pogo-pgh', '1234', 'https://example.com/invite/x', 'discord.gg/']) {
      expect(readServerRef(text)).toBeUndefined();
    }
  });
});
