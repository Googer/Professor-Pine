import { MessageFlags } from 'discord.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  asV2,
  fakeButton,
  fakeChatInput,
  fakeModal,
  sent,
  type FakeInteraction,
} from '../../../test/support/fake-interactions.js';
import { WEST_CHANNEL } from '../../../test/support/gyms.js';
import { MOD, MODERATOR } from '../../../test/support/meetup-safety-cases.js';
import { meetupSafetyWith, MOD_CHANNEL } from '../../../test/support/meetup-safety-service.js';
import { buttonsOf, textOf } from '../../../test/support/messages.js';
import { ALICE, BOB, PARTY_NOW } from '../../../test/support/parties.js';
import { createTestContext } from '../../../test/support/test-context.js';
import { APPEAL_THROTTLE } from '../../components/meetup-appeal.js';
import { InteractionRouter } from '../../discord/router.js';
import { meetup, meetupFormControls, NO_MEETUP_HERE } from './meetup.js';
import { ASK_INPUT, ASK_SENT, placeAskControls } from './place-ask.js';

const DAY = 24 * 3_600_000;
const KEY = { kind: 'gym' as const, id: '2' };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(PARTY_NOW);
});
afterEach(() => {
  vi.useRealTimers();
});

/** Gym 2 refused for good `daysAgo` days ago, `/meetup` there and the ask's controls routed. */
async function setup(daysAgo: number) {
  const made = await meetupSafetyWith();
  await made.storage.rule(made.gateway.guildId, KEY, 'refuse', {
    ...MOD,
    at: PARTY_NOW - daysAgo * DAY,
  });
  made.clock.now = PARTY_NOW;
  const { ctx } = createTestContext({
    partyService: made.service,
    attendance: made.attendance,
    timedParties: made.timed,
    parties: made.store,
    regions: made.regions,
    meetupSafety: made.safety,
  });
  const router = new InteractionRouter(ctx, [meetup], [meetupFormControls, placeAskControls]);
  const handle = async <I extends FakeInteraction>(interaction: I) => {
    await router.handle(interaction as never);
    return interaction;
  };
  const run = (userId = ALICE) =>
    handle(
      fakeChatInput({
        commandName: 'meetup',
        channelId: WEST_CHANNEL,
        userId,
        displayName: userId === ALICE ? 'Alice' : 'Bob',
        options: { name: 'Picnic', near: 'gym:2', start: '6pm' },
      }),
    );
  /** The refusal's Ask the moderators, pressed by the member it answered. */
  const ask = async (refused: FakeInteraction, userId = ALICE) => {
    const answer = asV2(sent(refused.reply));
    const customId = buttonsOf(answer)[0]?.customId ?? '';
    return handle(
      fakeButton({
        customId,
        userId,
        channelId: WEST_CHANNEL,
        ephemeralMessage: true,
        v2Message: true,
      }),
    );
  };
  const submit = (opened: FakeInteraction, text: string, userId = ALICE) => {
    const form = opened.showModal.mock.calls[0]?.[0] as { custom_id: string };
    return handle(
      fakeModal({
        customId: form.custom_id,
        form,
        userId,
        displayName: 'Alice',
        channelId: WEST_CHANNEL,
        fields: { [ASK_INPUT]: text },
      }),
    );
  };
  const decide = (action: string, roleNames = ['Moderator']) => {
    const post = made.gateway.messagesIn(MOD_CHANNEL).at(-1)?.message;
    const customId =
      buttonsOf(post).find((button) => button.customId?.endsWith(`:${action}`))?.customId ?? '';
    return handle(
      fakeButton({
        customId,
        userId: MODERATOR,
        displayName: 'Mod',
        roleNames,
        channelId: MOD_CHANNEL,
      }),
    );
  };
  return { ...made, run, ask, submit, decide };
}

describe('Ask the moderators (a place refused for good)', () => {
  it('is not offered in the first fourteen days', async () => {
    const made = await setup(13);
    const refused = await made.run();
    expect(sent(refused.reply)).toEqual({ content: NO_MEETUP_HERE, flags: MessageFlags.Ephemeral });
  });

  it('is offered afterwards, opens a form and sends the ask to the moderators', async () => {
    const made = await setup(14);
    const refused = await made.run();
    const answer = asV2(sent(refused.reply));
    expect(textOf(answer)).toBe(NO_MEETUP_HERE);
    expect(buttonsOf(answer).map((button) => button.label)).toEqual(['Ask the moderators…']);
    const opened = await made.ask(refused);
    const form = opened.showModal.mock.calls[0]?.[0] as { title: string };
    expect(form.title).toBe('Ask about this place');
    const submitted = await made.submit(opened, 'It is a public park now.');
    expect(sent(submitted.editReply).content).toBe(ASK_SENT);
    const post = made.gateway.messagesIn(MOD_CHANNEL).at(-1)?.message;
    expect(textOf(post)).toContain('It is a public park now.');
    // While it is open, others hear that it is with the moderators.
    const other = await made.run(BOB);
    expect(sent(other.reply).content).toBe(`${NO_MEETUP_HERE} It is with the moderators already.`);
  });

  it('lets staff alone decide, and tells the member', async () => {
    const made = await setup(20);
    await made.submit(await made.ask(await made.run()), 'A park.');
    const refused = await made.decide('allow', ['Valor']);
    expect(sent(refused.reply).content).toBe('Only admins and moderators can do that.');
    const allowed = await made.decide('allow');
    expect(sent(allowed.editReply).content).toBe(
      'Allowed: meetups can be held there from now on. The member is told.',
    );
    expect(await made.storage.ruling(made.gateway.guildId, KEY)).toBe('allow');
    expect(made.dms.to(ALICE)).toHaveLength(1);
  });

  it('has a button that works after a restart: it names the place, not something kept', async () => {
    const made = await setup(20);
    const refused = await made.run();
    const customId = buttonsOf(asV2(sent(refused.reply)))[0]?.customId;
    expect(customId).toBe('mplace:gym:open:2');
  });

  it('refuses a member blocked since the refusal, with Appeal', async () => {
    const made = await setup(20);
    const refused = await made.run();
    await made.storage.addBlock(made.gateway.guildId, ALICE, MOD);
    const pressed = await made.ask(refused);
    const answer = asV2(sent(pressed.reply));
    expect(textOf(answer)).toBe("You can't create meetups on this server.");
    expect(buttonsOf(answer).map((button) => button.label)).toEqual(['Appeal…']);
  });

  it('takes the button from any member, and says when the ask was sent already', async () => {
    const made = await setup(20);
    const refused = await made.run();
    const other = await made.ask(refused, BOB);
    expect(other.showModal).toHaveBeenCalled();
    await made.submit(await made.ask(refused), 'A park.');
    const again = await made.ask(refused);
    expect(sent(again.reply).content).toBe('It is with the moderators already.');
  });

  it('opens no form while the asks of the hour are used up, before anything is typed', async () => {
    const made = await setup(20);
    const refused = await made.run();
    // Forms opened before the first was sent: the others are told it is with the moderators.
    const forms: FakeInteraction[] = [];
    for (let n = 0; n < APPEAL_THROTTLE.uses; n++) forms.push(await made.ask(refused));
    for (const opened of forms) {
      expect(opened.showModal).toHaveBeenCalled();
      await made.submit(opened, 'A park.');
    }
    const full = await made.ask(refused);
    expect(full.showModal).not.toHaveBeenCalled();
    expect(sent(full.reply).content).toMatch(/^That was a lot of clicks\. Try again in /);
  });

  it('gives back the asks that could not reach the moderators: none of the member’s doing', async () => {
    const made = await setup(20);
    const refused = await made.run();
    made.gateway.failing.set('sendMessage', new Error('Discord is away'));
    for (let n = 0; n <= APPEAL_THROTTLE.uses; n++) {
      const opened = await made.ask(refused);
      expect(opened.showModal).toHaveBeenCalled();
      const submitted = await made.submit(opened, `A park ${String(n)}.`);
      expect(sent(submitted.followUp).content).toMatch(/^I could not send your question/);
    }
  });
});
