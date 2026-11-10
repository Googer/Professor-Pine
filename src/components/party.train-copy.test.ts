import { customIdsOf } from '../../test/support/messages.js';
import { MessageFlags } from 'discord.js';
import { describe, expect, it } from 'vitest';
import { dialogChoices, dialogOf } from '../../test/support/dialogs.js';
import {
  fakeButton,
  fakeModal,
  sent,
  type FakeInteraction,
} from '../../test/support/fake-interactions.js';
import { EAST_CHANNEL, WEST_FORUM } from '../../test/support/gyms.js';
import { ALICE, BOB, CAROL } from '../../test/support/parties.js';
import { createdTrain } from '../../test/support/party-service.js';
import { createTestContext } from '../../test/support/test-context.js';
import { ACTION_THROTTLE } from '../commands/parties/reply.js';
import { decodeCustomId } from '../discord/custom-id.js';
import { controlThrottleKey, InteractionRouter } from '../discord/router.js';
import { attendeeOf } from '../domain/party/party.js';
import { PartyStatus } from '../domain/party/status.js';
import { ACCESS_UNKNOWN } from '../render/activity.js';
import { GROUP_INPUT } from '../render/group-dialogs.js';
import { PARTY_KIND } from '../render/party-controls.js';
import { partyButtons } from './party.js';

const DAVE = '200000000000000005';
const ERIN = '200000000000000006';
const FRANK = '200000000000000007';

/**
 * A train from West with a stop in East, and so with a copy of its message in East's channel.
 * It has two groups, so the copy has their buttons too.
 */
async function setup() {
  const made = await createdTrain({ route: [4, 7] });
  // Somebody else opens B; the maker stays in A (a group nobody is in would go).
  await made.attendance.newGroup(made.party.id, { id: FRANK, name: 'Frank' });
  await made.attendance.flush();
  await made.service.flush();
  for (const message of made.gateway.messagesIn(made.postId)) {
    await made.gateway.deleteMessage(made.postId, message.id);
  }
  const { ctx } = createTestContext({
    partyService: made.service,
    attendance: made.attendance,
    timedParties: made.timed,
    trains: made.trains,
    parties: made.store,
    regions: made.regions,
  });
  const router = new InteractionRouter(ctx, [], [partyButtons]);
  const copy = made.gateway.messagesIn(EAST_CHANNEL).find((sent) => sent.message.v2 === true);
  if (!copy) throw new Error('the train has no copy in the channel of East');
  const ids = customIdsOf(copy.message);
  /** A press on the last button of the copy that has this action, by Alice unless said otherwise. */
  const press = async (action: string, userId = ALICE): Promise<FakeInteraction> => {
    const customId = ids.findLast((id) => decodeCustomId(id)?.action === action);
    if (customId === undefined) throw new Error(`the copy has no button ${action}`);
    const interaction = fakeButton({
      customId,
      channelId: EAST_CHANNEL,
      userId,
      displayName: userId === ALICE ? 'Alice' : 'Somebody',
    });
    await router.handle(interaction as never);
    return interaction;
  };
  /**
   * A press, and where it asks which group (a newcomer's Interested, Join or Here, plan 8X-1B),
   * the Submit of the choice picked to start with: what the member was told either way.
   */
  const pressAndPick = async (
    action: string,
    userId = ALICE,
    beforeSubmit?: () => void,
  ): Promise<string | undefined> => {
    const pressed = await press(action, userId);
    const dialog = dialogOf(pressed);
    if (!dialog) return sent(pressed.reply).content;
    beforeSubmit?.();
    const first = dialogChoices(dialog).find((choice) => choice.picked);
    const submitted = fakeModal({
      customId: dialog.custom_id,
      form: dialog,
      picked: { [GROUP_INPUT]: first?.value ?? '' },
      channelId: EAST_CHANNEL,
      userId,
      displayName: userId === ALICE ? 'Alice' : 'Somebody',
    });
    await router.handle(submitted as never);
    // A refusal the router says follows the Submit's acknowledgement up, or comes before it.
    const answer = (['editReply', 'followUp', 'reply'] as const).find(
      (way) => submitted[way].mock.calls.length > 0,
    );
    return answer === undefined ? undefined : sent(submitted[answer]).content;
  };
  return { ...made, ctx, press, pressAndPick, ids };
}

const privately = (content: string) => ({ content, flags: MessageFlags.Ephemeral });

describe('the buttons of the copy of a train in another region', () => {
  it('sign a member up who cannot see the forum of the train, and let them into it', async () => {
    const made = await setup();
    made.gateway.shutOut(WEST_FORUM, ALICE);
    // Join asks a newcomer which group, B (the default group, where Join would put them) marked.
    expect(await made.pressAndPick('join')).toBe('You are coming, in group B.');
    expect(attendeeOf(made.current(), ALICE)).toMatchObject({
      status: PartyStatus.Coming,
      name: 'Alice',
    });
    await made.access.flush();
    expect(made.gateway.canSee(WEST_FORUM, ALICE)).toBe(true);
    // The post says who came, like for a press on its own buttons.
    await made.attendance.flush();
    expect(made.said()).toEqual([`**Alice** (<@${ALICE}>) is coming, in group B.`]);
  });

  it('have no button that moves the train', async () => {
    const made = await setup();
    expect(made.ids.map((id) => decodeCustomId(id)?.action)).not.toContain('move');
  });

  it('sign up and let in whoever presses Interested, Here, +1, Remote or Join', async () => {
    const made = await setup();
    const members = [ALICE, BOB, CAROL, ERIN, DAVE];
    made.gateway.shutOut(WEST_FORUM, ...members);
    const answers: (string | undefined)[] = [];
    for (const [index, action] of ['maybe', 'here', 'more', 'remote', 'join'].entries()) {
      answers.push(await made.pressAndPick(action, members[index]));
    }
    expect(answers).toEqual([
      'You are interested, in group B.',
      'You are here, in group B.',
      // +1 by somebody who is not signed up signs them up; so does Join.
      'You are interested, in group B.',
      // So does Remote: whoever is not signed up is interested then, remotely.
      'You are interested, in group B, remotely.',
      'You are coming, in group B.',
    ]);
    await made.access.flush();
    for (const member of members) {
      expect(attendeeOf(made.current(), member)).toBeDefined();
      expect(made.gateway.canSee(WEST_FORUM, member)).toBe(true);
    }
    expect(attendeeOf(made.current(), ERIN)).toMatchObject({
      status: PartyStatus.Interested,
      remote: true,
    });
    expect(made.gateway.calls).toContain(`admitMember ${WEST_FORUM} ${ERIN}`);
  });

  // The audit of 2026-11-10 (L-D2): the copy stands where the member can press it, the forum
  // they are kept out of does not; `AccessService` only logged such a sign-up.
  it('refuse a member somebody keeps out of the forum of the train, whom the copy would sign up', async () => {
    const made = await setup();
    made.gateway.barred.set(WEST_FORUM, new Set([ALICE]));
    const keptOut = 'You cannot sign up for this train: you are kept out of its forum.';
    // Join asks a newcomer which group first; the Submit is refused.
    expect(await made.pressAndPick('join')).toBe(keptOut);
    expect(await made.pressAndPick('maybe')).toBe(keptOut);
    expect(await made.pressAndPick('more')).toBe(keptOut);
    await made.access.flush();
    await made.attendance.flush();
    expect(attendeeOf(made.current(), ALICE)).toBeUndefined();
    expect(made.said()).toEqual([]);
    expect(made.gateway.calls.filter((call) => call.startsWith('admitMember'))).toEqual([]);
    // Bob, whom the forum is only hidden from, is signed up and let in as before.
    made.gateway.shutOut(WEST_FORUM, BOB);
    expect(await made.pressAndPick('join', BOB)).toBe('You are coming, in group B.');
  });

  // Plan 8Z-2, fix round F-A1: none of the member's doing, so the Submit's use goes back.
  it('refuse a newcomer while Discord cannot say how they stand to the forum, and count the Submit not', async () => {
    const made = await setup();
    for (let n = 0; n < ACTION_THROTTLE.uses - 3; n++) {
      made.ctx.throttles.use(controlThrottleKey(PARTY_KIND), ALICE, ACTION_THROTTLE, Date.now());
    }
    // Discord answers at the press (the dialog opens) and cannot say at the Submit.
    const away = () => made.gateway.failing.set('memberAccess', new Error('Discord is away'));
    expect(await made.pressAndPick('join', ALICE, away)).toBe(ACCESS_UNKNOWN);
    expect(attendeeOf(made.current(), ALICE)).toBeUndefined();
    made.gateway.failing.delete('memberAccess');
    // Two uses were left: the dialog and its Submit.
    expect(await made.pressAndPick('join')).toBe('You are coming, in group B.');
  });

  it('tell who presses Leave or −1 without being signed up so, and let nobody in', async () => {
    const made = await setup();
    made.gateway.shutOut(WEST_FORUM, ALICE, BOB);
    const left = await made.press('leave', ALICE);
    const less = await made.press('less', BOB);
    for (const pressed of [left, less]) {
      expect(pressed.reply).toHaveBeenCalledWith(
        privately('You are not signed up for this train.'),
      );
    }
    await made.access.flush();
    expect(attendeeOf(made.current(), ALICE)).toBeUndefined();
    expect(attendeeOf(made.current(), BOB)).toBeUndefined();
    expect(made.gateway.canSee(WEST_FORUM, ALICE)).toBe(false);
    expect(made.gateway.canSee(WEST_FORUM, BOB)).toBe(false);
    expect(made.gateway.calls.filter((call) => call.startsWith('admitMember'))).toEqual([]);
  });

  it('answer as a control of a party that has ended once the train is over', async () => {
    const made = await setup();
    await made.service.end(made.party.id);
    await made.service.flush();
    // The copy is deleted with the train; a press that was on its way still arrives.
    expect(made.gateway.messagesIn(EAST_CHANNEL)).toEqual([]);
    const late = await made.press('join');
    expect(late.reply).toHaveBeenCalledWith(privately('This has ended.'));
  });
});
