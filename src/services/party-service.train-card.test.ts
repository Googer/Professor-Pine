import { describe, expect, it, vi } from 'vitest';
import { boardRecord } from '../../test/support/board-cases.js';
import { networkAway } from '../../test/support/fake-gateway.js';
import { EAST_CHANNEL, WEST_CHANNEL } from '../../test/support/gyms.js';
import { HISTORY_SERVER } from '../../test/support/history.js';
import { buttonsOf, textDisplays } from '../../test/support/messages.js';
import { MINUTE, REPORTER } from '../../test/support/parties.js';
import { createdTrain, type ServiceOverrides } from '../../test/support/party-service.js';
import { Tally } from '../../test/support/tally.js';
import { watchEachTest } from '../../test/support/timers.js';
import { PartyStatus } from '../domain/party/status.js';
import { TRAIN_CARD_HEADING, TRAIN_CARD_NOTE } from '../render/train-card.js';
import { RAIDS_ALONG_WAIT_MS } from './party-service.js';

const background = watchEachTest();

const reporter = { id: REPORTER, name: 'Reporter' };

/**
 * A train from gym 1 (West) to gym 7 (East), its maker Here from the start, ten minutes at each;
 * and a raid recorded at gym 1 while it was there.
 */
async function rideAndRaid(overrides: ServiceOverrides = {}) {
  const made = await createdTrain({ route: [1, 7] }, overrides);
  await made.attendance.signUp(made.party.id, reporter, PartyStatus.Present);
  const start = made.clock.now;
  made.history.records.push(
    boardRecord({
      serverId: HISTORY_SERVER,
      gymId: 1,
      tier: 'T5',
      createdAt: start - 30 * MINUTE,
      hatchTime: start - 5 * MINUTE,
      endTime: start + 40 * MINUTE,
      endedAt: start + 45 * MINUTE,
    }),
  );
  made.clock.now = start + 10 * MINUTE;
  await made.trains.move(made.party.id, { id: REPORTER }, 'next', false);
  made.clock.now = start + 20 * MINUTE;
  await made.trains.flush();
  await made.attendance.flush();
  await made.service.flush();
  return made;
}

/** The card's text in the post (its text display), or undefined. */
const cardOf = (made: Awaited<ReturnType<typeof rideAndRaid>>): string | undefined =>
  textDisplays(made.gateway.posts.get(made.postId)?.message).find((text) =>
    text.startsWith(TRAIN_CARD_HEADING),
  );

describe('the card of an ended train in its post (plan 8H-7A)', () => {
  it('shows the card in the last showing, drawn from the record its end wrote', async () => {
    const made = await rideAndRaid();
    expect(await made.service.end(made.party.id, undefined, { ended: { how: 'clock' } })).toBe(
      true,
    );
    const post = made.gateway.posts.get(made.postId);
    expect(post).toMatchObject({ archived: true, locked: true });
    expect(buttonsOf(post?.message)).toEqual([]);
    expect(cardOf(made)?.split('\n')).toEqual([
      TRAIN_CARD_HEADING,
      // Ten minutes at gym 1, and gym 7 from then to the end: twenty.
      'About 2 stops in 20 min',
      `Through <#${WEST_CHANNEL}> · <#${EAST_CHANNEL}>`,
      // The maker alone, aboard throughout: no most at once to say.
      '1 rider',
      'Recorded along the way: 1 Level 5 raid',
      TRAIN_CARD_NOTE,
    ]);
    // The card is in the last showing: nothing is edited after the archiving.
    const calls = made.gateway.calls.filter((call) => call.endsWith(` ${made.postId}`));
    expect(calls.at(-1)).toBe(`archivePost ${made.postId}`);
  });

  it('shows the card under the closing words of staff, too', async () => {
    const made = await rideAndRaid();
    await made.service.end(made.party.id, undefined, {
      lastWords: 'Closed by a moderator.',
      ended: { how: 'cancelled', by: 'staff' },
    });
    // The closing words in the header, in the place of the times; the card further down.
    const parts = textDisplays(made.gateway.posts.get(made.postId)?.message);
    expect(parts[0]?.split('\n')[1]).toBe('Closed by a moderator.');
    const at = parts.findIndex((text) => text.startsWith(TRAIN_CARD_HEADING));
    expect(at).toBeGreaterThan(0);
    expect(parts[at]).toContain('About 2 stops in 20 min');
  });

  it('deletes the post a moderator asked to delete, with no card and no read of the raids', async () => {
    const made = await rideAndRaid();
    const reads = vi.spyOn(made.history, 'raidsAlong');
    expect(
      await made.service.endAs(made.party.id, undefined, {
        ended: { how: 'cancelled', by: 'staff' },
        removal: 'delete',
      }),
    ).toBe('deleted');
    expect(made.gateway.deletedPosts).toEqual([made.postId]);
    expect(reads).not.toHaveBeenCalled();
  });

  it('shows the card without raids when their read does not answer in time', async () => {
    const timers: { run: () => void; ms: number; cancelled: boolean }[] = [];
    const waiting = new Tally('the waits for the raids along the way');
    const made = await rideAndRaid({
      setTimer: (run, ms) => {
        const timer = { run, ms, cancelled: false };
        timers.push(timer);
        if (ms === RAIDS_ALONG_WAIT_MS) waiting.add();
        return () => {
          timer.cancelled = true;
        };
      },
    });
    let fail: (err: Error) => void = () => undefined;
    vi.spyOn(made.history, 'raidsAlong').mockReturnValue(
      new Promise((_resolve, reject) => {
        fail = reject;
      }),
    );
    const ending = made.service.end(made.party.id, undefined, { ended: { how: 'clock' } });
    await waiting.reached(1);
    expect(made.gateway.posts.get(made.postId)?.archived).toBe(false);
    const waits = timers.filter((timer) => timer.ms === RAIDS_ALONG_WAIT_MS && !timer.cancelled);
    expect(waits).toHaveLength(1);
    waits[0]?.run();
    expect(await ending).toBe(true);
    const card = cardOf(made);
    expect(card).toContain('About 2 stops in 20 min');
    expect(card).not.toContain('along the way');
    expect(made.gateway.posts.get(made.postId)).toMatchObject({ archived: true, locked: true });
    // The read fails after the wait (review R4): said once more, but only at debug.
    fail(new Error('the database is away'));
    await background.settle();
    const said = (msg: string) =>
      made.entries
        .filter((entry) => entry.msg === msg && entry.party === made.party.id)
        .map((entry) => entry.level);
    expect(said('could not read the raids along the way of a train that ended')).toEqual([40]);
    expect(said('the raids along the way of a train that ended failed after the wait')).toEqual([
      20,
    ]);
  });

  it('shows the card without raids where they cannot be read, and says so in the log', async () => {
    const made = await rideAndRaid();
    vi.spyOn(made.history, 'raidsAlong').mockRejectedValue(new Error('the database is away'));
    await made.service.end(made.party.id, undefined, { ended: { how: 'clock' } });
    const card = cardOf(made);
    expect(card).toContain('About 2 stops in 20 min');
    expect(card).not.toContain('along the way');
    expect(made.entries).toContainEqual(
      expect.objectContaining({
        msg: 'could not read the raids along the way of a train that ended',
        party: made.party.id,
        err: expect.objectContaining({ message: 'the database is away' }) as unknown,
      }),
    );
    expect(made.gateway.posts.get(made.postId)?.archived).toBe(true);
  });

  it('shows no card where the record could not be written with the end', async () => {
    const made = await rideAndRaid();
    made.history.failing = new Error('the history is down');
    await made.service.end(made.party.id, undefined, { ended: { how: 'clock' } });
    made.history.failing = undefined;
    expect(cardOf(made)).toBeUndefined();
    expect(made.gateway.posts.get(made.postId)?.archived).toBe(true);
  });

  it('keeps the card for a closing redone after the network failed it (review F-B2)', async () => {
    const made = await rideAndRaid();
    made.gateway.failing.set('editPost', networkAway());
    made.gateway.failing.set('archivePost', networkAway());
    await made.service.end(made.party.id, undefined, { ended: { how: 'clock' } });
    expect(cardOf(made)).toBeUndefined();
    made.gateway.failing.clear();
    // The raids are not read again: the card is the one made when the train ended.
    const reads = vi.spyOn(made.history, 'raidsAlong');
    expect(await made.service.redoClosings()).toEqual({ redone: 1, failed: 0 });
    expect(reads).not.toHaveBeenCalled();
    expect(cardOf(made)).toContain('Recorded along the way: 1 Level 5 raid');
    expect(made.gateway.posts.get(made.postId)?.archived).toBe(true);
  });

  it('reads the raids once more for a redone closing whose card could not read them', async () => {
    const made = await rideAndRaid();
    const reads = vi
      .spyOn(made.history, 'raidsAlong')
      .mockRejectedValueOnce(new Error('the database is away'));
    made.gateway.failing.set('editPost', networkAway());
    made.gateway.failing.set('archivePost', networkAway());
    await made.service.end(made.party.id, undefined, { ended: { how: 'clock' } });
    made.gateway.failing.clear();
    expect(await made.service.redoClosings()).toEqual({ redone: 1, failed: 0 });
    expect(reads).toHaveBeenCalledTimes(2);
    expect(cardOf(made)).toContain('Recorded along the way: 1 Level 5 raid');
  });

  it('reads the raids once more only once, however often the closing is redone (review R5)', async () => {
    const made = await rideAndRaid();
    const away = new Error('the database is away');
    const reads = vi
      .spyOn(made.history, 'raidsAlong')
      .mockRejectedValueOnce(away)
      .mockRejectedValueOnce(away);
    made.gateway.failing.set('editPost', networkAway());
    made.gateway.failing.set('archivePost', networkAway());
    await made.service.end(made.party.id, undefined, { ended: { how: 'clock' } });
    // The first redo reads again, fails again, and the network fails it once more.
    await made.service.redoClosings();
    expect(reads).toHaveBeenCalledTimes(2);
    made.gateway.failing.clear();
    expect(await made.service.redoClosings()).toEqual({ redone: 1, failed: 0 });
    expect(reads).toHaveBeenCalledTimes(2);
    expect(cardOf(made)).toContain('About 2 stops in 20 min');
    expect(cardOf(made)).not.toContain('along the way');
  });

  it('shows nothing where the post was deleted by hand, and the train is recorded all the same', async () => {
    const made = await rideAndRaid();
    made.gateway.gone.add(made.postId);
    await made.service.end(made.party.id, undefined, { ended: { how: 'cancelled' } });
    expect(made.gateway.posts.get(made.postId)?.archived ?? false).toBe(false);
    expect(made.gateway.calls.some((call) => call.startsWith('archivePost'))).toBe(false);
    const trains = made.history.records.filter((record) => record.kind === 'train');
    expect(trains.map((record) => record.partyId)).toEqual([made.party.id]);
  });
});
