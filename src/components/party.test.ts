import { MessageFlags } from 'discord.js';
import { describe, expect, it, onTestFinished, vi } from 'vitest';
import {
  fakeButton,
  fakeModal,
  fakeSelect,
  sent,
  type FakeInteraction,
} from '../../test/support/fake-interactions.js';
import { WEST_FORUM } from '../../test/support/gyms.js';
import { ALICE, BOB } from '../../test/support/parties.js';
import { reportedRaid } from '../../test/support/party-service.js';
import { createTestContext } from '../../test/support/test-context.js';
import { createTestLogger } from '../../test/support/test-logger.js';
import { WITHDRAWN_REPLY } from '../commands/parties/reply.js';
import { ClickAnswers } from '../discord/click-answers.js';
import { LATE_DEFER_MS } from '../discord/late-reply.js';
import { InteractionRouter, STALE_COMPONENT } from '../discord/router.js';
import { attendeeOf, endParty } from '../domain/party/party.js';
import { PartyStatus } from '../domain/party/status.js';
import type { RaidReport } from '../services/party-service.js';
import { partyButtons } from './party.js';

async function setup(report: Partial<RaidReport> = {}, clickAnswers?: ClickAnswers) {
  const made = await reportedRaid(report);
  const { ctx } = createTestContext({
    partyService: made.service,
    attendance: made.attendance,
    parties: made.store,
    regions: made.regions,
    ...(clickAnswers ? { clickAnswers } : {}),
  });
  const router = new InteractionRouter(ctx, [], [partyButtons]);
  const handle = async (interaction: FakeInteraction) => {
    await router.handle(interaction as never);
    return interaction;
  };
  /** A click on a button of the post, by Alice (of team Mystic) unless said otherwise. */
  const click = (action: string, extra: object = {}) =>
    handle(
      fakeButton({
        customId: `party:${made.party.id}:${action}`,
        channelId: made.postId,
        userId: ALICE,
        displayName: 'Alice',
        roleNames: ['Mystic'],
        ...extra,
      }),
    );
  const alice = () => attendeeOf(made.current(), ALICE);
  return { ...made, ctx, router, handle, click, alice };
}

const privately = (content: string) => ({ content, flags: MessageFlags.Ephemeral });

describe('the buttons of a party post', () => {
  it('Join signs the member up as coming, with name and team, and answers privately', async () => {
    const made = await setup();
    const click = await made.click('join');
    expect(click.reply).toHaveBeenCalledWith(privately('You are coming.'));
    expect(made.alice()).toMatchObject({
      status: PartyStatus.Coming,
      number: 1,
      name: 'Alice',
      team: 'mystic',
    });
    await made.attendance.flush();
    expect(made.said()).toEqual([`**Alice** (<@${ALICE}>) is coming.`]);
  });

  it('Interested and Here set those statuses', async () => {
    const made = await setup();
    expect(sent((await made.click('maybe')).reply).content).toBe('You are interested.');
    expect(sent((await made.click('here')).reply).content).toBe('You are here.');
    expect(made.alice()?.status).toBe(PartyStatus.Present);
  });

  it('+1 from somebody who is not signed up marks them interested; -1 never goes below one', async () => {
    const made = await setup();
    expect(sent((await made.click('more')).reply).content).toBe('You are interested.');
    expect(sent((await made.click('more')).reply).content).toBe('You are interested with 1 more.');
    await made.click('less');
    expect(sent((await made.click('less')).reply).content).toBe('You are interested.');
    expect(made.alice()?.number).toBe(1);
    const stranger = await made.click('less', { userId: BOB });
    expect(sent(stranger.reply).content).toBe('You are not signed up for this raid.');
  });

  it('the remote button switches between remote and in person', async () => {
    const made = await setup();
    await made.click('join');
    expect(sent((await made.click('remote')).reply).content).toBe('You are coming, remotely.');
    expect(sent((await made.click('remote')).reply).content).toBe('You are coming, in person.');
  });

  it('+1 at the most a member may bring says so', async () => {
    const made = await setup();
    await made.attendance.signUp(made.party.id, { id: ALICE }, PartyStatus.Coming, { number: 21 });
    const click = await made.click('more');
    expect(sent(click.reply).content).toBe(
      'You are coming with 20 more. That is the most one member may bring.',
    );
  });

  it('refuses remote on an elite raid, should the button be there from before', async () => {
    const made = await setup({ tier: { level: 'Elite', shadow: false } });
    const click = await made.click('remote');
    expect(click.reply).toHaveBeenCalledWith(privately('Elite raids can only be done in person.'));
    expect(made.alice()).toBeUndefined();
  });

  it('Leave removes the member, and says so to one who was not signed up', async () => {
    const made = await setup();
    await made.click('join');
    expect(sent((await made.click('leave')).reply).content).toBe('You have left this raid.');
    expect(made.alice()).toBeUndefined();
    expect(sent((await made.click('leave')).reply).content).toBe(
      'You are not signed up for this raid.',
    );
  });

  // The audit of 2026-11-10 (L-D2): whom somebody keeps out of the raid's forum.
  it('refuse a newcomer somebody keeps out of the forum, without saying by whom or why; Leave still works for one signed up', async () => {
    const made = await setup();
    made.gateway.barred.set(WEST_FORUM, new Set([ALICE]));
    const keptOut = 'You cannot sign up for this raid: you are kept out of its forum.';
    for (const action of ['join', 'maybe', 'here', 'more', 'remote']) {
      expect((await made.click(action)).reply).toHaveBeenCalledWith(privately(keptOut));
    }
    expect(made.alice()).toBeUndefined();
    await made.attendance.flush();
    expect(made.said()).toEqual([]);
    // Bob signed up before he was kept out: he changes his line and leaves.
    const bob = { userId: BOB, displayName: 'Bob', roleNames: [] };
    await made.click('join', bob);
    made.gateway.barred.set(WEST_FORUM, new Set([ALICE, BOB]));
    expect(sent((await made.click('here', bob)).reply).content).toBe('You are here.');
    expect(sent((await made.click('leave', bob)).reply).content).toBe('You have left this raid.');
    expect(sent((await made.click('join', bob)).reply).content).toBe(keptOut);
  });

  it('Done is refused for an egg', async () => {
    const made = await setup();
    await made.click('join');
    const click = await made.click('done');
    expect(click.reply).toHaveBeenCalledWith(privately('This raid has not hatched yet.'));
    expect(made.alice()?.status).toBe(PartyStatus.Coming);
  });

  it('Done completes the raid for the member and asks the others who are here', async () => {
    const made = await setup({ boss: { key: 'yveltal' } });
    await made.click('here');
    await made.click('here', { userId: BOB, displayName: 'Bob', roleNames: [] });
    const done = await made.click('done');
    expect(sent(done.reply).content).toBe(
      'You are done. I have asked the others of your group who are here whether they are too.',
    );
    await made.attendance.flush();
    expect(attendeeOf(made.current(), BOB)?.status).toBe(PartyStatus.CompletePending);
    expect(sent((await made.click('done')).reply).content).toBe('You were done already.');

    const yes = await made.click('answer:yes', { userId: BOB });
    expect(sent(yes.reply).content).toBe('You are done.');
    await made.attendance.flush();
    expect(made.current().prompts.completion).toEqual([]);
    const again = await made.click('answer:no', { userId: BOB });
    expect(sent(again.reply).content).toBe('You were not asked, or you have answered already.');
  });

  it('a member who is done cannot adjust how they come', async () => {
    const made = await setup({ boss: { key: 'yveltal' } });
    await made.click('here');
    await made.click('done');
    for (const action of ['more', 'less', 'remote', 'group:A']) {
      const click = await made.click(action);
      expect(click.reply).toHaveBeenCalledWith(
        privately('You are done with this raid. Use Join or Here if you are back.'),
      );
    }
    expect(made.alice()?.status).toBe(PartyStatus.Complete);
  });

  it('"Not yet" puts a member who was asked back to here', async () => {
    const made = await setup({ boss: { key: 'yveltal' } });
    await made.click('here');
    await made.click('here', { userId: BOB });
    await made.click('done');
    const no = await made.click('answer:no', { userId: BOB });
    expect(sent(no.reply).content).toBe('You are here.');
    expect(attendeeOf(made.current(), BOB)?.status).toBe(PartyStatus.Present);
  });

  it('the Join of a group makes a member coming in that group, and only moves one who is coming', async () => {
    const made = await setup();
    await made.attendance.newGroup(made.party.id, { id: BOB });
    await made.click('maybe');
    expect(sent((await made.click('group:A')).reply).content).toBe('You are coming, in group A.');
    expect(made.alice()).toMatchObject({ status: PartyStatus.Coming, group: 'A' });
    await made.click('here');
    expect(sent((await made.click('group:B')).reply).content).toBe('You are coming, in group B.');
    expect(made.alice()).toMatchObject({ status: PartyStatus.Coming, group: 'B' });
    expect(sent((await made.click('group:A')).reply).content).toBe('You are coming, in group A.');
    expect(made.alice()).toMatchObject({ status: PartyStatus.Coming, group: 'A' });
    const bob = await made.click('group:B', { userId: BOB });
    expect(sent(bob.reply).content).toBe('You are coming, in group B.');
  });

  it('a group button moves the member and names the group in the answer', async () => {
    const made = await setup();
    await made.attendance.newGroup(made.party.id, { id: BOB });
    expect(sent((await made.click('group:A')).reply).content).toBe('You are coming, in group A.');
    expect(sent((await made.click('group:B')).reply).content).toBe('You are coming, in group B.');
    expect(made.alice()?.group).toBe('B');
    // A button from before, for a group this raid does not have.
    expect(sent((await made.click('group:D')).reply).content).toBe('This raid has no such group.');
  });

  it('works from any channel: the party is the one the control names', async () => {
    const made = await setup();
    const click = await made.click('join', { channelId: '600000000000000099' });
    expect(sent(click.reply).content).toBe('You are coming.');
  });

  it('answers a control of a raid that has ended', async () => {
    const made = await setup();
    await made.store.update(made.party.id, (party) => ({ party: endParty(party) }));
    const click = await made.click('join');
    // The party has left the store, and a control names it by its id alone: what kind it was
    // is no longer known, unless only a raid has such a control (Set time, Screenshot feedback).
    expect(click.reply).toHaveBeenCalledWith(privately('This has ended.'));
    // A group button is no longer among them: a train has groups too.
    expect((await made.click('group:A')).reply).toHaveBeenCalledWith(privately('This has ended.'));
    // Done and the completion question's answers are a max battle's too (plan 8X-3, review B6).
    for (const action of ['done', 'answer:yes']) {
      const battles = await made.click(action);
      expect(battles.reply).toHaveBeenCalledWith(privately('This has ended.'));
    }
  });

  it('refuses a newcomer to a raid over by the clock, before the scheduler ends it', async () => {
    const made = await setup({ boss: { key: 'yveltal' } });
    await made.attendance.signUp(made.party.id, { id: BOB }, PartyStatus.Coming);
    await made.attendance.newGroup(made.party.id, { id: BOB });
    made.clock.now = (made.current().lastPossibleTime ?? 0) + 60_000;
    for (const action of ['maybe', 'join', 'here', 'more', 'remote', 'regroup']) {
      const click = await made.click(action);
      expect(click.reply, action).toHaveBeenCalledWith(privately('This raid is over.'));
      // Nobody is asked which group of a raid that is over.
      expect(click.showModal, action).not.toHaveBeenCalled();
    }
    expect(made.alice()).toBeUndefined();
    // Who is signed up goes on until the post is archived.
    const bob = { userId: BOB, displayName: 'Bob' };
    expect(sent((await made.click('here', bob)).reply).content).toBe('You are here, in group B.');
    expect(sent((await made.click('more', bob)).reply).content).toBe(
      'You are here with 1 more, in group B.',
    );
    expect(sent((await made.click('leave', bob)).reply).content).toBe('You have left this raid.');
  });

  it('still takes Done from somebody here once the raid is over by the clock', async () => {
    const made = await setup({ boss: { key: 'yveltal' } });
    await made.click('here');
    made.clock.now = (made.current().lastPossibleTime ?? 0) + 60_000;
    await made.click('done');
    expect(made.alice()?.status).toBe(PartyStatus.Complete);
  });

  it('answers what it does not know as no longer active', async () => {
    const made = await setup();
    for (const action of ['explode', 'group', 'group:Z', 'answer', 'answer:perhaps']) {
      const click = await made.click(action);
      expect(sent(click.reply).content).toBe(STALE_COMPONENT);
    }
    const menu = await made.handle(
      fakeSelect({ customId: `party:${made.party.id}:group`, userId: ALICE, values: ['A'] }),
    );
    expect(sent(menu.reply).content).toBe(STALE_COMPONENT);
    const form = await made.handle(fakeModal({ customId: `party:${made.party.id}:join` }));
    expect(sent(form.reply).content).toBe(STALE_COMPONENT);
    expect(made.alice()).toBeUndefined();
  });

  it('works only in a server', async () => {
    const made = await setup();
    const click = await made.click('join', { isDm: true });
    expect(sent(click.reply).content).toBe('This only works in a server.');
    expect(made.alice()).toBeUndefined();
  });

  it('holds back a member who clicks more than thirty times a minute', async () => {
    const made = await setup();
    for (let n = 0; n < 30; n++) await made.click(n % 2 === 0 ? 'more' : 'less');
    const click = await made.click('more');
    expect(sent(click.reply).content).toMatch(/^That was a lot of clicks\. Try again in /);
    const other = await made.click('join', { userId: BOB });
    expect(sent(other.reply).content).toBe('You are coming.');
  });
});

describe('a burst of clicks by one member', () => {
  const gathering = () => new ClickAnswers({ log: createTestLogger().log, windowMs: 60_000 });

  it('is answered once at the start and once at the end, with how things stand then', async () => {
    const answers = gathering();
    const made = await setup({}, answers);
    const join = await made.click('join');
    const more = [await made.click('more'), await made.click('more'), await made.click('less')];
    expect(join.reply).toHaveBeenCalledWith(privately('You are coming.'));
    for (const click of more) {
      expect(click.deferUpdate).toHaveBeenCalledOnce();
      expect(click.reply).not.toHaveBeenCalled();
    }
    expect(made.alice()?.number).toBe(2);
    await answers.flush();
    expect(join.editReply).toHaveBeenCalledExactlyOnceWith({
      content: 'You are coming with 1 more.',
    });
  });

  it('shows a refusal at once, and still the standing at the end', async () => {
    const answers = gathering();
    const made = await setup({ tier: { level: 'Elite', shadow: false } }, answers);
    const join = await made.click('join');
    const remote = await made.click('remote');
    const more = await made.click('more');
    expect(sent(remote.reply).content).toBe('Elite raids can only be done in person.');
    await answers.flush();
    expect(join.editReply).toHaveBeenCalledExactlyOnceWith({
      content: 'You are coming with 1 more.',
    });
    expect(more.reply).not.toHaveBeenCalled();
  });

  it('answers each member, and each party, by itself', async () => {
    const answers = gathering();
    const made = await setup({}, answers);
    const alice = await made.click('join');
    const bob = await made.click('join', { userId: BOB, displayName: 'Bob' });
    expect(alice.reply).toHaveBeenCalledOnce();
    expect(bob.reply).toHaveBeenCalledOnce();
    await answers.flush();
  });
});

describe('a press whose write is slow', () => {
  /** The party's next write waits until `release` is called. */
  function holdNextWrite(made: Awaited<ReturnType<typeof setup>>) {
    const held = Promise.withResolvers<undefined>();
    const update = made.store.update.bind(made.store);
    vi.spyOn(made.store, 'update').mockImplementationOnce((id, change) =>
      held.promise.then(() => update(id, change)),
    );
    return () => held.resolve(undefined);
  }

  it('is acknowledged privately in time, and answered in that place once the write is done', async () => {
    const made = await setup();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    onTestFinished(() => {
      vi.useRealTimers();
    });
    const release = holdNextWrite(made);
    const press = fakeButton({
      customId: `party:${made.party.id}:join`,
      channelId: made.postId,
      userId: ALICE,
      displayName: 'Alice',
    });
    const handled = made.handle(press);
    await vi.advanceTimersByTimeAsync(LATE_DEFER_MS - 1);
    expect(press.deferReply).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(press.deferReply).toHaveBeenCalledExactlyOnceWith({ flags: MessageFlags.Ephemeral });
    release();
    await handled;
    expect(press.reply).not.toHaveBeenCalled();
    expect(press.editReply).toHaveBeenCalledExactlyOnceWith({ content: 'You are coming.' });
    expect(made.alice()?.status).toBe(PartyStatus.Coming);
  });

  it('says a refusal privately after a late acknowledgement', async () => {
    const made = await setup();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    onTestFinished(() => {
      vi.useRealTimers();
    });
    const release = holdNextWrite(made);
    const press = fakeButton({ customId: `party:${made.party.id}:leave`, userId: ALICE });
    const handled = made.handle(press);
    await vi.advanceTimersByTimeAsync(LATE_DEFER_MS);
    release();
    await handled;
    expect(press.deferReply).toHaveBeenCalledExactlyOnceWith({ flags: MessageFlags.Ephemeral });
    expect(press.followUp).toHaveBeenCalledExactlyOnceWith(
      privately('You are not signed up for this raid.'),
    );
  });

  it('is answered at once, unacknowledged, when the write is quick', async () => {
    const made = await setup();
    const click = await made.click('done');
    expect(click.deferReply).not.toHaveBeenCalled();
    expect(sent(click.reply).flags).toBe(MessageFlags.Ephemeral);
  });
});

describe('going back after Done', () => {
  it('tells the member that the question to the others was taken back', async () => {
    const made = await setup({ boss: { key: 'yveltal' } });
    await made.click('here');
    await made.click('here', { userId: BOB, displayName: 'Bob' });
    await made.click('done');
    await made.attendance.flush();
    expect(attendeeOf(made.current(), BOB)?.status).toBe(PartyStatus.CompletePending);
    const back = await made.click('here');
    expect(sent(back.reply).content).toBe(`You are here. ${WITHDRAWN_REPLY}`);
    await made.attendance.flush();
    expect(attendeeOf(made.current(), BOB)?.status).toBe(PartyStatus.Present);
    expect(made.current().prompts.completion).toEqual([]);
  });
});
