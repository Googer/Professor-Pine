import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ALICE, BOB, CAROL, PARTY_NOW, REPORTER } from '../../../test/support/parties.js';
import { createdTrain } from '../../../test/support/party-service.js';
import { createTestContext } from '../../../test/support/test-context.js';
import { PartyStatus } from '../../domain/party/status.js';
import { manageForm } from '../../render/train-dialogs.js';
import {
  manageRefusal,
  manageTrainAs,
  MOVED_ON,
  NOTHING_CHANGED,
  splitRefusalFor,
  trainPlaces,
} from './train-changes.js';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: PARTY_NOW });
});
afterEach(() => {
  vi.useRealTimers();
});

/** A train on a route of four gyms (4, 1, 7, 2), with Alice and Bob coming. */
async function setup(route: readonly number[] = [4, 1, 7, 2]) {
  const made = await createdTrain({ route });
  await made.attendance.signUp(made.party.id, { id: ALICE, name: 'Alice' }, PartyStatus.Coming);
  await made.attendance.signUp(made.party.id, { id: BOB, name: 'Bob' }, PartyStatus.Coming);
  const { ctx } = createTestContext({
    partyService: made.service,
    attendance: made.attendance,
    timedParties: made.timed,
    trains: made.trains,
    parties: made.store,
    regions: made.regions,
  });
  /** What Manage… shows of the train now, as its form gives it back. */
  const shown = () => manageForm(trainPlaces(ctx, made.current())).shown;
  return { ...made, ctx, shown };
}

describe('Manage…’s Submit as one code path for the dialog and the map (plan 8M-8C)', () => {
  it('sets the start with what else was picked, and removes it with null', async () => {
    const made = await setup();
    const alice = made.shown();
    const at = made.current().createdAt + 3_600_000;
    const answer = await manageTrainAs(
      made.ctx,
      made.current(),
      { id: ALICE, name: 'Alice' },
      false,
      alice,
      { kind: 'gigantamax', route: 'keep', atEnd: 'finish', start: at },
      'post',
    );
    expect(answer.kind).toBe('ok');
    expect(answer.text).toMatch(/^This train is a Gigantamax Train now\. This train starts at /u);
    expect(made.current().timed.startTime).toBe(at);
    expect(made.current().train.kind).toBe('gigantamax');
    const removed = await manageTrainAs(
      made.ctx,
      made.current(),
      { id: ALICE, name: 'Alice' },
      false,
      made.shown(),
      { kind: 'gigantamax', route: 'keep', atEnd: 'finish', start: null },
      'post',
    );
    expect(removed.text).toMatch(/^This train has no start time any more\./u);
    expect(made.current().timed.startTime).toBeNull();
  });

  it('says only the start where what else was asked was so already', async () => {
    const made = await setup();
    const alice = made.shown();
    await made.trains.manage(
      made.party.id,
      { id: BOB, name: 'Bob' },
      false,
      { kind: 'dynamax' },
      {
        from: alice.from,
        first: alice.first,
      },
    );
    const answer = await manageTrainAs(
      made.ctx,
      made.current(),
      { id: ALICE, name: 'Alice' },
      false,
      alice,
      {
        kind: 'dynamax',
        route: 'keep',
        atEnd: 'finish',
        start: made.current().createdAt + 3_600_000,
      },
      'post',
    );
    expect(answer.text).toMatch(/^This train starts at /u);
  });

  it('sends the end first where the new start lies past the end as it is, the start first otherwise', async () => {
    const made = await setup();
    const hour = 3_600_000;
    const from = Math.ceil(made.current().createdAt / hour) * hour;
    const alice = { id: ALICE, name: 'Alice' };
    await made.timed.setStartTime(made.party.id, alice, from + hour);
    await made.timed.setEndTime(made.party.id, alice, from + 2 * hour);
    const manage = async (start: number, end: string) =>
      manageTrainAs(
        made.ctx,
        made.current(),
        alice,
        false,
        made.shown(),
        { kind: 'raid', route: 'keep', atEnd: 'finish', start, end },
        'post',
        made.current().createdAt,
      );
    const later = await manage(from + 3 * hour, 'in 1000');
    expect(later).toMatchObject({ kind: 'ok' });
    expect(later.text).toMatch(/^This train starts at .* This train ends at /u);
    expect(made.current().timed.startTime).toBe(from + 3 * hour);
    const earlier = await manage(from + hour, 'in 500');
    expect(earlier).toMatchObject({ kind: 'ok' });
    expect(earlier.text).toMatch(/^This train starts at .* This train ends at /u);
    expect(made.current().timed.startTime).toBe(from + hour);
  });

  // Staging of 2026-11-07: the post said "set the end" at once and "set the start" seconds later.
  it('says the start before the end in the post, whichever of them was set first', async () => {
    const made = await setup();
    const hour = 3_600_000;
    const from = Math.ceil(made.current().createdAt / hour) * hour;
    const alice = { id: ALICE, name: 'Alice' };
    await made.timed.setStartTime(made.party.id, alice, from + hour);
    await made.timed.setEndTime(made.party.id, alice, from + 2 * hour);
    await made.timed.flush();
    await made.attendance.flush();
    const seen = made.gateway.messagesIn(made.postId).length;
    const manage = (start: number, end: string) =>
      manageTrainAs(
        made.ctx,
        made.current(),
        alice,
        false,
        made.shown(),
        { kind: 'raid', route: 'keep', atEnd: 'finish', start, end },
        'post',
        made.current().createdAt,
      );
    const said = async () => {
      // The lines that ping nobody first, as they would go out before the start's message.
      await made.attendance.flush();
      await made.timed.flush();
      const texts = made.gateway
        .messagesIn(made.postId)
        .slice(seen)
        .map((message) => message.message.content ?? '');
      return texts
        .join('\n')
        .split('\n')
        .filter((line) => /set the (start|end)/u.test(line));
    };
    // Both later: the end is set first, as the start would be refused against it.
    expect(await manage(from + 3 * hour, 'in 1000')).toMatchObject({ kind: 'ok' });
    const lines = await said();
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/set the start of this train/u);
    expect(lines[1]).toMatch(/set the end of this train/u);
  });

  // Review SF1-6: the kind was said at once, the start and the end later.
  it('says what one Submit changed in one message, the start first, when it moves the start', async () => {
    const made = await setup();
    const hour = 3_600_000;
    const from = Math.ceil(made.current().createdAt / hour) * hour;
    const alice = { id: ALICE, name: 'Alice' };
    await made.attendance.flush();
    const seen = made.gateway.messagesIn(made.postId).length;
    const answer = await manageTrainAs(
      made.ctx,
      made.current(),
      alice,
      false,
      made.shown(),
      { kind: 'dynamax', route: 'keep', atEnd: 'finish', start: from + hour, end: 'in 500' },
      'post',
      made.current().createdAt,
    );
    expect(answer).toMatchObject({ kind: 'ok' });
    await made.attendance.flush();
    await made.timed.flush();
    await made.trains.flush();
    const sent = made.gateway.messagesIn(made.postId).slice(seen);
    expect(sent).toHaveLength(1);
    const lines = (sent[0]?.message.content ?? '').split('\n');
    expect(lines[0]).toMatch(/set the start of this train/u);
    const others = lines.slice(1).filter((line) => !line.startsWith('<@'));
    expect(others.some((line) => /set the end of this train/u.test(line))).toBe(true);
    expect(others.some((line) => !/set the (start|end)/u.test(line))).toBe(true);
  });

  it('says which times went through when one is refused', async () => {
    const made = await setup();
    const alice = { id: ALICE, name: 'Alice' };
    const at = made.current().createdAt + 3_600_000;
    vi.spyOn(made.timed, 'setEndTime').mockResolvedValueOnce({
      kind: 'refused',
      reason: 'end-before-start',
    });
    const answer = await manageTrainAs(
      made.ctx,
      made.current(),
      alice,
      false,
      made.shown(),
      { kind: 'raid', route: 'keep', atEnd: 'finish', start: at, end: 'in 90' },
      'post',
    );
    expect(answer).toMatchObject({ kind: 'refused', applied: true, went: ['start'] });
  });

  it('marks a refused start after the rest went through as a change that was made', async () => {
    const made = await setup();
    const end = made.current().createdAt + 3_600_000;
    await made.timed.setEndTime(made.party.id, { id: ALICE, name: 'Alice' }, end);
    const answer = await manageTrainAs(
      made.ctx,
      made.current(),
      { id: ALICE, name: 'Alice' },
      false,
      made.shown(),
      { kind: 'gigantamax', route: 'keep', atEnd: 'finish', start: end + 3_600_000 },
      'post',
    );
    expect(answer).toMatchObject({ kind: 'refused', applied: true });
    expect(answer.text).toMatch(/^This train is a Gigantamax Train now\. /u);
    expect(made.current().train.kind).toBe('gigantamax');
    expect(made.current().timed.startTime).toBeNull();
    const alone = await manageTrainAs(
      made.ctx,
      made.current(),
      { id: ALICE, name: 'Alice' },
      false,
      made.shown(),
      { kind: 'gigantamax', route: 'keep', atEnd: 'finish', start: end + 3_600_000 },
      'post',
    );
    expect(alone.kind).toBe('refused');
    expect(alone).not.toHaveProperty('applied');
  });

  it('refuses the start of who may not arrange the train, and leaves it as it was', async () => {
    const made = await setup();
    const answer = await manageTrainAs(
      made.ctx,
      made.current(),
      { id: 'staff-not-signed-up', name: 'Staff' },
      true,
      made.shown(),
      { kind: 'raid', route: 'keep', atEnd: 'finish', start: made.current().createdAt + 3_600_000 },
      'post',
    );
    expect(answer.kind).toBe('refused');
    expect(made.current().timed.startTime).toBeNull();
  });

  it('applies only what was picked otherwise than shown, and nothing asked is "Nothing changed."', async () => {
    const made = await setup();
    const alice = made.shown();
    // Bob makes it loop while Alice's form is open; she changes only the kind.
    await made.setAtEnd({ id: BOB }, false, 'loop');
    const answer = await manageTrainAs(
      made.ctx,
      made.current(),
      { id: ALICE, name: 'Alice' },
      false,
      alice,
      { kind: 'gigantamax', route: 'keep', atEnd: 'finish' },
      'post',
    );
    expect(answer).toEqual({ kind: 'ok', text: 'This train is a Gigantamax Train now.' });
    expect(made.current().train).toMatchObject({ kind: 'gigantamax', atEnd: 'loop' });
    const again = made.shown();
    expect(
      await manageTrainAs(
        made.ctx,
        made.current(),
        { id: ALICE },
        false,
        again,
        { kind: again.kind, atEnd: again.atEnd },
        'post',
      ),
    ).toEqual({ kind: 'ok', text: NOTHING_CHANGED });
  });

  it('refuses a route change from a form drawn where the train no longer is, with where it is now, and says nothing of several parts was changed', async () => {
    const made = await setup();
    const early = made.shown();
    await made.trains.move(made.party.id, { id: BOB }, 'next', false);
    const late = await manageTrainAs(
      made.ctx,
      made.current(),
      { id: ALICE },
      false,
      early,
      { kind: 'dynamax', route: 'finish' },
      'post',
    );
    expect(late.kind).toBe('refused');
    expect(late.text.startsWith(`${MOVED_ON}The train is at stop 2 of 4`)).toBe(true);
    expect(late.text.endsWith(' Nothing was changed.')).toBe(true);
    expect(made.current().train).toMatchObject({ stop: 1, kind: 'raid' });
  });

  it('names what takes a finished route back as the member has it there', async () => {
    const made = await setup();
    const finished = await manageTrainAs(
      made.ctx,
      made.current(),
      { id: ALICE },
      false,
      made.shown(),
      { kind: 'raid', route: 'finish' },
      'command',
    );
    expect(finished.text).toMatch(
      /^The train has finished its route of 4 stops\. `\/previous` takes it back to stop 1: /,
    );
  });

  it('says why Manage… does not open, as the dialog refuses it: for who may move the train and staff', async () => {
    const made = await setup();
    expect(manageRefusal(made.ctx, made.current(), ALICE, false)).toBeUndefined();
    expect(manageRefusal(made.ctx, made.current(), CAROL, false)).toBe(
      'You are not signed up for this train.',
    );
    expect(manageRefusal(made.ctx, made.current(), CAROL, true)).toBeUndefined();
  });

  it('says why a member may split no group, as the dialog refuses it', async () => {
    const made = await setup();
    expect(splitRefusalFor(made.ctx, made.current(), ALICE, false)).toBe(
      'This train has one group: there is no group to split off it.',
    );
    expect(splitRefusalFor(made.ctx, made.current(), REPORTER, true)).toBe(
      'This train has one group: there is no group to split off it.',
    );
  });
});
