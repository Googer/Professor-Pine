import { MessageFlags } from 'discord.js';
import { describe, expect, it } from 'vitest';
import {
  fakeButton,
  fakeModal,
  sent,
  type FakeInteraction,
} from '../../test/support/fake-interactions.js';
import { WEST_CHANNEL } from '../../test/support/gyms.js';
import { MOD, MODERATOR } from '../../test/support/meetup-safety-cases.js';
import { MOD_CHANNEL, meetupSafetyWith } from '../../test/support/meetup-safety-service.js';
import { textOf } from '../../test/support/messages.js';
import { ALICE, BOB, PARTY_NOW } from '../../test/support/parties.js';
import { createTestContext } from '../../test/support/test-context.js';
import { InteractionRouter, STALE_COMPONENT } from '../discord/router.js';
import { MEMBER_READ_THROTTLE } from '../discord/throttle.js';
import {
  APPEAL_INPUT,
  APPEAL_THROTTLE,
  appealForm,
  meetupAppealControls,
} from './meetup-appeal.js';

const DAY = 86_400_000;

async function setup() {
  const made = await meetupSafetyWith();
  const server = made.gateway.guildId;
  await made.storage.addBlock(server, ALICE, { ...MOD, at: PARTY_NOW - DAY });
  const { ctx } = createTestContext({ meetupSafety: made.safety, parties: made.store });
  const router = new InteractionRouter(ctx, [], [meetupAppealControls]);
  /** Alice presses Appeal under the refusal of `/meetup`. */
  const open = async (userId = ALICE, id = server): Promise<FakeInteraction> => {
    const interaction = fakeButton({
      customId: `mappeal:${id}:open`,
      channelId: WEST_CHANNEL,
      userId,
      displayName: userId === ALICE ? 'Alice' : 'Bob',
      ephemeralMessage: true,
      v2Message: true,
    });
    await router.handle(interaction as never);
    return interaction;
  };
  /** Alice sends the form of an appeal with `text`. */
  const send = async (text: string, userId = ALICE): Promise<FakeInteraction> => {
    const interaction = fakeModal({
      customId: `mappeal:${server}:form`,
      form: appealForm(server),
      fields: { [APPEAL_INPUT]: text },
      channelId: WEST_CHANNEL,
      userId,
      displayName: 'Alice',
    });
    await router.handle(interaction as never);
    return interaction;
  };
  /** A moderator presses Lift block or Keep block on the appeal's post. */
  const decide = async (appealId: string, action: string, extra: object = {}) => {
    const interaction = fakeButton({
      customId: `mappeal:${appealId}:${action}`,
      channelId: MOD_CHANNEL,
      userId: MODERATOR,
      displayName: 'Mod',
      roleNames: ['Moderator'],
      v2Message: true,
      ...extra,
    });
    await router.handle(interaction as never);
    return interaction;
  };
  return { ...made, server, open, send, decide };
}

function told(used: FakeInteraction): string | undefined {
  for (const responder of [used.editReply, used.reply, used.followUp]) {
    if (responder.mock.calls.length > 0) return sent(responder).content;
  }
  return undefined;
}

describe('appeals of a meetup block', () => {
  it('opens the form of an appeal for a blocked member', async () => {
    const made = await setup();
    const used = await made.open();
    expect(used.showModal).toHaveBeenCalledExactlyOnceWith(appealForm(made.server));
    const form = appealForm(made.server);
    expect(form.title).toBe('Appeal your block');
    expect(JSON.stringify(form.components)).toContain('"label":"Why should the block be lifted?"');
  });

  it('sends the appeal to the moderators and tells the member they will hear by DM', async () => {
    const made = await setup();
    const used = await made.send('It was a library box at the church.');
    expect(used.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
    expect(told(used)).toBe(
      'Your appeal is with the moderators. I will tell you by direct message what they decide.',
    );
    expect(made.gateway.messagesIn(MOD_CHANNEL)).toHaveLength(1);
  });

  it('opens no form for a member who is not blocked, who has an appeal open or must wait', async () => {
    const made = await setup();
    expect(told(await made.open(BOB))).toBe('You are not blocked from creating meetups here.');
    await made.send('Please.');
    expect(told(await made.open())).toBe(
      'Your appeal is with the moderators already. I will tell you by direct message what they decide.',
    );
    const [appeal] = made.storage.appeals.values();
    await made.decide(appeal?.id ?? '', 'keep');
    expect(told(await made.open())).toBe(
      `You can appeal again <t:${String((PARTY_NOW + 7 * DAY) / 1000)}:R>.`,
    );
  });

  it('answers Appeal of another server as no longer active', async () => {
    const made = await setup();
    expect(told(await made.open(ALICE, '412345678901234599'))).toBe(STALE_COMPONENT);
  });

  it('lets staff alone lift or keep a block, the first press winning', async () => {
    const made = await setup();
    await made.send('Please.');
    const [appeal] = made.storage.appeals.values();
    const id = appeal?.id ?? '';
    expect(told(await made.decide(id, 'lift', { userId: BOB, roleNames: [] }))).toBe(
      'Only admins and moderators can do that.',
    );
    expect(told(await made.decide(id, 'lift'))).toBe(
      `Lifted: **Alice** (<@${ALICE}>) can create meetups again. They are told.`,
    );
    expect(await made.storage.block(made.server, ALICE)).toBeUndefined();
    expect(told(await made.decide(id, 'keep'))).toMatch(
      new RegExp(
        `^\\*\\*Mod\\*\\* \\(<@${MODERATOR}>\\) decided this already <t:\\d+:R>: lifted\\.$`,
      ),
    );
  });

  it('counts the presses of Appeal lightly, and the appeals sent three an hour', async () => {
    const made = await setup();
    for (let n = 0; n < MEMBER_READ_THROTTLE.uses; n++) {
      expect(told(await made.open(BOB))).toBe('You are not blocked from creating meetups here.');
    }
    expect(told(await made.open(BOB))).toMatch(/again in/);
    for (let n = 0; n < APPEAL_THROTTLE.uses; n++) await made.send(`Please ${String(n)}.`);
    expect(told(await made.send('Please again.'))).toMatch(/again in/);
  });

  it('opens no form while the appeals of the hour are used up, before anything is typed', async () => {
    const made = await setup();
    // The first is sent; the others are told it is with the moderators, and count as well.
    for (let n = 0; n < APPEAL_THROTTLE.uses; n++) await made.send(`Please ${String(n)}.`);
    const full = await made.open();
    expect(full.showModal).not.toHaveBeenCalled();
    expect(told(full)).toMatch(/^That was a lot of clicks\. Try again in /);
  });

  it('gives back the appeals that could not reach the moderators: none of the member’s doing', async () => {
    const made = await setup();
    made.gateway.failing.set('sendMessage', new Error('Discord is away'));
    for (let n = 0; n <= APPEAL_THROTTLE.uses; n++) {
      expect(told(await made.send(`Please ${String(n)}.`))).toMatch(
        /^I could not send your appeal/,
      );
    }
    made.gateway.failing.delete('sendMessage');
    expect((await made.open()).showModal).toHaveBeenCalled();
  });

  it('sends no appeal of a block lifted while its form was open', async () => {
    const made = await setup();
    await made.open();
    await made.storage.liftBlock(made.server, ALICE, MOD);
    expect(told(await made.send('Please.'))).toBe(
      'You are not blocked from creating meetups here.\nWhat you wrote:\n```\nPlease.\n```',
    );
    expect(made.gateway.messagesIn(MOD_CHANNEL)).toEqual([]);
  });

  it('names the server in what it tells the member', async () => {
    const made = await setup();
    await made.send('Please.');
    const [appeal] = made.storage.appeals.values();
    await made.decide(appeal?.id ?? '', 'lift');
    expect(textOf(made.dms.to(ALICE)[0])).toContain('on **Test Server**');
  });

  it('keeps a block and says when they may appeal again', async () => {
    const made = await setup();
    await made.send('Please.');
    const [appeal] = made.storage.appeals.values();
    expect(told(await made.decide(appeal?.id ?? '', 'keep'))).toBe(
      `Kept: **Alice** (<@${ALICE}>) stays blocked, and may appeal again in 7 days. They are told.`,
    );
  });
});
