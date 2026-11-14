import { describe, expect, it } from 'vitest';
import { neighborCopyWith as copyWith } from '../../test/support/neighbor-gyms.js';

const STAFF = '200000000000000001';

describe('NeighborCopy (plan 19E)', () => {
  it('copies a neighbor’s curated texts onto the same gyms where this server’s are empty', async () => {
    const made = await copyWith();
    const { ours, theirs } = made.rows;
    const copied = await made.copy.copy(ours, theirs, STAFF);
    expect(copied).toEqual({
      gyms: 2,
      nickname: 1,
      notice: 1,
      description: 0,
      keywords: 1,
      shared: 1,
    });
    const view = made.directory.of(ours);
    // The library keeps its own nickname and description; it takes the notice and search words.
    expect(view.get(1)).toMatchObject({
      nickname: 'The Stacks',
      description: 'Mural of readers beside the front doors',
      notice: 'Closed on Mondays',
      keywords: ['books', 'reading'],
    });
    // The fountain takes the nickname and keeps its own search words.
    expect(view.get(2)).toMatchObject({ nickname: 'Splash', keywords: ['plaza', 'square'] });
    // Another gym at the harbor's place is not the same gym; the third server's library is not
    // the second's.
    expect(view.get(7)?.nickname).toBeNull();
    expect(made.directory.stored(201)?.notice).toBeNull();
    expect(made.edits.map(({ id, staffId }) => [id, staffId])).toEqual([
      [1, STAFF],
      [2, STAFF],
    ]);
  });

  it('copies nothing more when run again, and nothing of a server whose gyms are not the same', async () => {
    const made = await copyWith();
    const { ours, theirs, third } = made.rows;
    await made.copy.copy(ours, theirs, STAFF);
    expect(await made.copy.copy(ours, theirs, STAFF)).toEqual({
      gyms: 0,
      nickname: 0,
      notice: 0,
      description: 0,
      keywords: 0,
      shared: 1,
    });
    // The third server's library has nothing to give.
    expect((await made.copy.copy(ours, third, STAFF)).gyms).toBe(0);
  });

  it('never writes over a text set between its read and its write (review R7)', async () => {
    const made = await copyWith();
    const { ours, theirs } = made.rows;
    // Staff give the fountain a nickname of their own; the copy's read is from before it.
    await made.gyms.update(2, { nickname: 'Our Fountain' });
    const copied = await made.copy.copy(ours, theirs, STAFF);
    expect(made.gyms.row(2)?.nickname).toBe('Our Fountain');
    expect(made.directory.of(ours).get(2)?.nickname).toBe('Our Fountain');
    // Counted as it was written: the library's notice and search words alone.
    expect(copied).toMatchObject({ gyms: 1, nickname: 0, notice: 1, keywords: 1 });
  });

  it('works in batches, a turn of the event loop between them', async () => {
    const made = await copyWith({ batch: 1 });
    await made.copy.copy(made.rows.ours, made.rows.theirs, STAFF);
    // Three gyms matched (the library, the fountain, the shared bridge): a pause after each but the last.
    expect(made.pauses.count).toBe(2);
  });
});
