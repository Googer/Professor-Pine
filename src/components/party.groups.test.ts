import { MessageFlags } from 'discord.js';
import { describe, expect, it } from 'vitest';
import { dialogChoices, dialogOf, shownDialog } from '../../test/support/dialogs.js';
import {
  fakeButton,
  fakeModal,
  sent,
  type FakeInteraction,
} from '../../test/support/fake-interactions.js';
import { textDisplays } from '../../test/support/messages.js';
import { ALICE, BOB, REPORTER } from '../../test/support/parties.js';
import { reportedRaid } from '../../test/support/party-service.js';
import { createTestContext } from '../../test/support/test-context.js';
import type { APIModalInteractionResponseCallbackData } from 'discord.js';
import { decodeCustomId, encodeCustomId } from '../discord/custom-id.js';
import { InteractionRouter } from '../discord/router.js';
import { attendeeOf } from '../domain/party/party.js';
import { PartyStatus } from '../domain/party/status.js';
import {
  ANY_GROUP,
  GROUP_INPUT,
  groupChoice,
  LABEL_INPUT,
  NEW_GROUP,
} from '../render/group-dialogs.js';
import { partyButtons } from './party.js';

const DAVE = '200000000000000005';

/**
 * A raid reported through the service, with the party controls routed; `grouped` gives it a
 * second group, B, that Bob opened (the reporter stays in A).
 */
async function setup(options: { grouped?: boolean; lobbySize?: number } = {}) {
  const made = await reportedRaid(
    {},
    options.lobbySize === undefined ? {} : { lobbySize: () => options.lobbySize },
  );
  if (options.grouped !== false) {
    await made.attendance.newGroup(made.party.id, { id: BOB, name: 'Bob' });
  }
  const { ctx } = createTestContext({
    partyService: made.service,
    attendance: made.attendance,
    parties: made.store,
    regions: made.regions,
  });
  const router = new InteractionRouter(ctx, [], [partyButtons]);
  const handle = async (interaction: FakeInteraction) => {
    await router.handle(interaction as never);
    return interaction;
  };
  /** A press of a button of the post, by Alice unless said otherwise. */
  const click = (action: string, userId = ALICE) =>
    handle(
      fakeButton({
        customId: `party:${made.party.id}:${action}`,
        channelId: made.postId,
        userId,
        displayName: userId === ALICE ? 'Alice' : 'Somebody',
      }),
    );
  /** The Submit of a dialog with this choice picked, by Alice unless said otherwise. */
  const submit = (
    dialog: APIModalInteractionResponseCallbackData,
    picked: string,
    userId = ALICE,
  ) =>
    handle(
      fakeModal({
        customId: dialog.custom_id,
        form: dialog,
        picked: { [GROUP_INPUT]: picked },
        channelId: made.postId,
        userId,
        displayName: userId === ALICE ? 'Alice' : 'Somebody',
      }),
    );
  /** The Submit of a dialog with its choice picked (where it has one) and its line of text. */
  const submitForm = (
    dialog: APIModalInteractionResponseCallbackData,
    inputs: { picked?: string; label?: string },
    userId = ALICE,
  ) =>
    handle(
      fakeModal({
        customId: dialog.custom_id,
        form: dialog,
        ...(inputs.picked === undefined ? {} : { picked: { [GROUP_INPUT]: inputs.picked } }),
        ...(inputs.label === undefined ? {} : { fields: { [LABEL_INPUT]: inputs.label } }),
        channelId: made.postId,
        userId,
        displayName: userId === ALICE ? 'Alice' : 'Somebody',
      }),
    );
  const group = (id: 'A' | 'B') => {
    const found = made.current().groups.find((one) => one.id === id);
    if (!found) throw new Error(`no group ${id}`);
    return groupChoice(made.current(), found);
  };
  return { ...made, click, submit, submitForm, group };
}

/** What a Submit answered, privately. */
const answerOf = (submitted: FakeInteraction) => sent(submitted.editReply).content;

describe('Interested, Join and Here of a post of several groups (plan 8X-1B)', () => {
  it('ask a newcomer which group in a dialog, in letter order, the default group marked', async () => {
    const made = await setup();
    for (const action of ['maybe', 'join', 'here']) {
      const pressed = await made.click(action);
      const dialog = shownDialog(pressed);
      expect(dialogChoices(dialog).map(({ value, picked }) => [value, picked])).toEqual([
        [made.group('A'), false],
        [made.group('B'), true],
      ]);
      // Nothing is signed up by the press itself.
      expect(attendeeOf(made.current(), ALICE)).toBeUndefined();
    }
  });

  it('lists a letter given again in its place in the post and the dialog (plan 8X-G)', async () => {
    const made = await setup();
    const id = made.party.id;
    // Alice joins A, the reporter opens C, Alice follows (A goes); three more open D, E and A
    // again, the last.
    await made.attendance.joinGroup(id, { id: ALICE, name: 'Alice' }, 'A');
    await made.attendance.newGroup(id, { id: REPORTER, name: 'Reporter' });
    await made.attendance.joinGroup(id, { id: ALICE, name: 'Alice' }, 'C');
    for (const member of ['200000000000000011', '200000000000000012', DAVE]) {
      expect((await made.attendance.newGroup(id, { id: member, name: 'Somebody' })).kind).toBe(
        'ok',
      );
    }
    expect(made.current().groups.map((group) => group.id)).toEqual(['A', 'B', 'C', 'D', 'E']);
    await made.service.flush();
    const post = made.gateway.posts.get(made.postId);
    const headings = textDisplays(post?.message).flatMap((text) =>
      [...text.matchAll(/\*\*Group ([A-E])\*\*/g)].map((match) => match[1]),
    );
    expect(headings).toEqual(['A', 'B', 'C', 'D', 'E']);
    // A newcomer is asked.
    const dialog = shownDialog(await made.click('join', '200000000000000099'));
    expect(dialogChoices(dialog).map(({ value }) => value.split(':')[0])).toEqual([
      'A',
      'B',
      'C',
      'D',
      'E',
    ]);
  });

  it('signs the newcomer up at Submit in the group they chose, with the status of the button', async () => {
    const made = await setup();
    const dialog = shownDialog(await made.click('here'));
    const submitted = await made.submit(dialog, made.group('A'));
    expect(submitted.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
    expect(answerOf(submitted)).toBe('You are here, in group A.');
    expect(attendeeOf(made.current(), ALICE)).toMatchObject({
      status: PartyStatus.Present,
      group: 'A',
      name: 'Alice',
    });
    await made.attendance.flush();
    expect(made.said().at(-1)).toBe(`**Alice** (<@${ALICE}>) is here, in group A.`);
  });

  it('change only the status of a member signed up already, without asking', async () => {
    const made = await setup();
    const pressed = await made.click('join', BOB);
    expect(dialogOf(pressed)).toBeUndefined();
    expect(sent(pressed.reply).content).toBe('You are coming, in group B.');
    // Done and Leave never ask.
    expect(dialogOf(await made.click('done'))).toBeUndefined();
    expect(dialogOf(await made.click('leave'))).toBeUndefined();
  });

  it('leave +1 and Remote to place a newcomer silently, as before', async () => {
    const made = await setup();
    const more = await made.click('more');
    expect(dialogOf(more)).toBeUndefined();
    expect(sent(more.reply).content).toBe('You are interested, in group B.');
    const remote = await made.click('remote', DAVE);
    expect(dialogOf(remote)).toBeUndefined();
    expect(attendeeOf(made.current(), DAVE)).toMatchObject({ group: 'B', remote: true });
  });

  it('never ask in a post of one group', async () => {
    const made = await setup({ grouped: false });
    const pressed = await made.click('join');
    expect(dialogOf(pressed)).toBeUndefined();
    expect(sent(pressed.reply).content).toBe('You are coming.');
  });

  it('take the member who signed up meanwhile as they are, saying they stayed in their group', async () => {
    const made = await setup();
    const dialog = shownDialog(await made.click('join'));
    await made.attendance.signUp(
      made.party.id,
      { id: ALICE, name: 'Alice' },
      PartyStatus.Interested,
    );
    const submitted = await made.submit(dialog, made.group('A'));
    expect(answerOf(submitted)).toBe(
      'You are coming, in group B. You were signed up already, so you stay in your group: ' +
        'Group… moves you.',
    );
    expect(attendeeOf(made.current(), ALICE)).toMatchObject({ group: 'B' });
  });

  it('says where coming took the member who signed up meanwhile, where it moved them (a lobby size)', async () => {
    const made = await setup({ lobbySize: 2 });
    const b = made.group('B');
    const dialog = shownDialog(await made.click('join'));
    // Alice is interested in B meanwhile, which Bob and Dave fill: coming takes her to A.
    await made.attendance.signUp(made.party.id, { id: DAVE }, PartyStatus.Coming, { group: 'B' });
    await made.attendance.signUp(made.party.id, { id: ALICE }, PartyStatus.Interested, {
      group: 'B',
    });
    const submitted = await made.submit(dialog, b);
    expect(answerOf(submitted)).toBe('You are coming, in group A.');
    expect(attendeeOf(made.current(), ALICE)).toMatchObject({ group: 'A' });
  });

  it('refuses a group that went meanwhile, and one opened again under its letter', async () => {
    const made = await setup();
    const dialog = shownDialog(await made.click('join'));
    const b = made.group('B');
    // Bob leaves: B goes; Dave opens a new B.
    await made.attendance.leave(made.party.id, { id: BOB });
    made.clock.now += 60_000;
    const gone = await made.submit(dialog, b);
    expect(answerOf(gone)).toBe('Group B has changed since: press Join again.');
    expect(attendeeOf(made.current(), ALICE)).toBeUndefined();
    await made.attendance.newGroup(made.party.id, { id: DAVE });
    expect(made.current().groups.map((group) => group.id)).toEqual(['A', 'B']);
    const again = await made.submit(dialog, b);
    expect(answerOf(again)).toBe('Group B has changed since: press Join again.');
    expect(attendeeOf(made.current(), ALICE)).toBeUndefined();
  });

  it('offers any group with room first where groups have a size, and chooses at the Submit', async () => {
    const made = await setup({ lobbySize: 2 });
    const dialog = shownDialog(await made.click('join'));
    expect(dialogChoices(dialog)[0]).toMatchObject({ value: ANY_GROUP, picked: true });
    // B fills meanwhile: any group with room is A then (the reporter is only interested).
    await made.attendance.signUp(made.party.id, { id: DAVE }, PartyStatus.Coming, { group: 'B' });
    const submitted = await made.submit(dialog, ANY_GROUP);
    expect(answerOf(submitted)).toBe('You are coming, in group A.');
    expect(attendeeOf(made.current(), ALICE)?.group).toBe('A');
  });

  it('answers a Submit for a raid that ended as over', async () => {
    const made = await setup();
    const dialog = shownDialog(await made.click('join'));
    const a = made.group('A');
    await made.service.end(made.party.id);
    const submitted = await made.submit(dialog, a);
    // A control names its party by id alone: once it has ended, its kind is not known.
    expect(answerOf(submitted)).toBe('This has ended.');
  });
});

describe('Group… (plan 8X-1B, decision 3)', () => {
  it('moves a member to the group they pick, as /group join does', async () => {
    const made = await setup();
    const dialog = shownDialog(await made.click('regroup', BOB));
    expect(dialog.title).toBe('Change group');
    // Bob is alone in B: a new group would change nothing, so the move to A is the one way.
    expect(dialogChoices(dialog)).toEqual([]);
    const submitted = await made.submitForm(dialog, {}, BOB);
    expect(submitted.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
    // B is left empty and goes: one group, which the answer does not name.
    expect(answerOf(submitted)).toBe('You are coming.');
    expect(attendeeOf(made.current(), BOB)?.group).toBe('A');
    // B is empty now, and went.
    expect(made.current().groups.map((group) => group.id)).toEqual(['A']);
  });

  it('takes the Submit of a dialog opened before its custom id had a per-open token (plan 8X-F)', async () => {
    const made = await setup();
    const dialog = shownDialog(await made.click('regroup', BOB));
    const id = decodeCustomId(dialog.custom_id);
    if (!id) throw new Error('no custom id');
    // As drawn before: `party:<id>:regroupform:in:A:<stamp>`, the one way in its arguments.
    const older = { ...dialog, custom_id: encodeCustomId({ ...id, args: id.args.slice(0, -1) }) };
    expect(older.custom_id).not.toBe(dialog.custom_id);
    expect(answerOf(await made.submitForm(older, {}, BOB))).toBe('You are coming.');
    expect(attendeeOf(made.current(), BOB)?.group).toBe('A');
  });

  it('signs a newcomer up as coming in the group they pick', async () => {
    const made = await setup();
    const dialog = shownDialog(await made.click('regroup'));
    expect(dialog.title).toBe('Join a group');
    const submitted = await made.submitForm(dialog, { picked: made.group('A') });
    expect(answerOf(submitted)).toBe('You are coming, in group A.');
    expect(attendeeOf(made.current(), ALICE)).toMatchObject({
      group: 'A',
      status: PartyStatus.Coming,
    });
  });

  it('opens a new group with its label, and tells the others as /group new does', async () => {
    const made = await setup();
    await made.attendance.signUp(made.party.id, { id: DAVE }, PartyStatus.Coming, { group: 'B' });
    const dialog = shownDialog(await made.click('regroup', BOB));
    const submitted = await made.submitForm(
      dialog,
      { picked: NEW_GROUP, label: 'by the bridge' },
      BOB,
    );
    expect(answerOf(submitted)).toBe('You opened group C (by the bridge) and are in it.');
    expect(made.current().groups.at(-1)).toMatchObject({ id: 'C', label: 'by the bridge' });
    await made.attendance.flush();
    expect(made.gateway.messagesIn(made.postId).at(-1)?.message.content).toMatch(
      /opened group C \(by the bridge\)\. To move to it, press Group… on the post/,
    );
  });

  it('refuses a Change group Submit of a member who left meanwhile, instead of signing them up', async () => {
    const made = await setup();
    await made.attendance.signUp(made.party.id, { id: DAVE }, PartyStatus.Coming, { group: 'B' });
    const dialog = shownDialog(await made.click('regroup', BOB));
    expect(dialog.title).toBe('Change group');
    await made.attendance.leave(made.party.id, { id: BOB });
    for (const picked of [made.group('A'), NEW_GROUP]) {
      const submitted = await made.submitForm(dialog, { picked }, BOB);
      expect(answerOf(submitted)).toBe('You are no longer signed up: press Group… again.');
      expect(attendeeOf(made.current(), BOB)).toBeUndefined();
    }
    // A dialog of one way, which its id names, the same.
    const alone = await setup();
    const only = shownDialog(await alone.click('regroup', BOB));
    expect(dialogChoices(only)).toEqual([]);
    await alone.attendance.leave(alone.party.id, { id: BOB });
    const submitted = await alone.submitForm(only, {}, BOB);
    expect(answerOf(submitted)).toBe('You are no longer signed up: press Group… again.');
    expect(attendeeOf(alone.current(), BOB)).toBeUndefined();
  });

  it('ignores the label for a move', async () => {
    const made = await setup();
    await made.attendance.signUp(made.party.id, { id: DAVE }, PartyStatus.Coming, { group: 'B' });
    const dialog = shownDialog(await made.click('regroup', BOB));
    await made.submitForm(dialog, { picked: made.group('A'), label: 'never' }, BOB);
    expect(made.current().groups.some((group) => group.label === 'never')).toBe(false);
  });

  it('refuses a new group at Submit to a member left alone in their group meanwhile', async () => {
    const made = await setup();
    await made.attendance.signUp(made.party.id, { id: ALICE }, PartyStatus.Coming, { group: 'A' });
    const dialog = shownDialog(await made.click('regroup', REPORTER));
    expect(dialogChoices(dialog).at(-1)?.value).toBe(NEW_GROUP);
    await made.attendance.leave(made.party.id, { id: ALICE });
    const submitted = await made.submitForm(dialog, { picked: NEW_GROUP }, REPORTER);
    expect(answerOf(submitted)).toBe(
      'You are alone in group A already: a new group would change nothing.',
    );
    expect(made.current().groups.map((group) => group.id)).toEqual(['A', 'B']);
  });

  it('refuses at the press the one member of a party of one group, whom a new group would not change', async () => {
    const made = await setup({ grouped: false });
    const pressed = await made.click('regroup', REPORTER);
    expect(dialogOf(pressed)).toBeUndefined();
    expect(sent(pressed.reply).content).toBe(
      'You are the only one here: a new group would change nothing.',
    );
  });

  it('asks nothing where only a new group is left: Submit opens it', async () => {
    const made = await setup({ grouped: false });
    await made.attendance.signUp(made.party.id, { id: BOB }, PartyStatus.Coming);
    const dialog = shownDialog(await made.click('regroup', BOB));
    expect(dialogChoices(dialog)).toEqual([]);
    const submitted = await made.submitForm(dialog, {}, BOB);
    expect(answerOf(submitted)).toBe('You opened group B and are in it.');
  });

  it('refuses a group that went meanwhile', async () => {
    const made = await setup();
    const dialog = shownDialog(await made.click('regroup', REPORTER));
    await made.attendance.leave(made.party.id, { id: BOB });
    // The reporter is alone in A: the move to B is the one way, which the dialog's id names.
    const submitted = await made.submitForm(dialog, {}, REPORTER);
    expect(answerOf(submitted)).toBe('Group B has changed since: press Group… again.');
  });

  it('refuses at the press a member who has completed the raid', async () => {
    const made = await setup();
    await made.store.update(made.party.id, (party) => ({
      party: {
        ...party,
        attendees: {
          ...party.attendees,
          [ALICE]: { number: 1, status: PartyStatus.Complete, group: 'A', remote: false },
        },
      },
    }));
    const pressed = await made.click('regroup');
    expect(dialogOf(pressed)).toBeUndefined();
    expect(sent(pressed.reply).content).toMatch(/^You are done with this raid\./);
  });
});
