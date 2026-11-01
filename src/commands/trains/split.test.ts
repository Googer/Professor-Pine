import { stopsFrom } from '../../render/train-stops.js';
import {
  dialogChoices,
  dialogOf,
  shownDialog,
  withoutToken,
} from '../../../test/support/dialogs.js';
import { MessageFlags, type APIModalInteractionResponseCallbackData } from 'discord.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  asV2,
  fakeAutocomplete,
  fakeButton,
  fakeChatInput,
  fakeModal,
  fakeSelect,
  sent,
  type FakeInteraction,
} from '../../../test/support/fake-interactions.js';
import { WEST_FORUM } from '../../../test/support/gyms.js';
import { textDisplays } from '../../../test/support/messages.js';
import {
  ALICE,
  BOB,
  CAROL,
  PARTY_NOW,
  REPORTER,
  asTrain,
  stops,
} from '../../../test/support/parties.js';
import { createdMeetup, createdTrain, reportedRaid } from '../../../test/support/party-service.js';
import { createTestContext } from '../../../test/support/test-context.js';
import { partyButtons } from '../../components/party.js';
import { ACTION_THROTTLE } from '../parties/reply.js';
import { InteractionRouter, STALE_COMPONENT } from '../../discord/router.js';
import { isTrain, type GroupId } from '../../domain/party/party.js';
import { PartyStatus, RaidPrivacy } from '../../domain/party/status.js';
import { groupMark } from '../../domain/party/train.js';
import { group } from '../parties/group.js';
import { help, helpControls } from '../util/help.js';
import { SPLIT_GROUP_INPUT, splitDialog } from '../../render/train-split.js';
import { DIALOG_READ_MS, SLOW_READ } from '../../discord/dialog.js';

const DAVE = '200000000000000005';
const STAFF = { userId: DAVE, displayName: 'Dave', roleNames: ['Moderator'] } as const;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: PARTY_NOW });
});
afterEach(() => {
  vi.useRealTimers();
});

/**
 * A train on stop 2 of 3 with the maker and Carol in A, and group B (Fast): Alice opened it, Bob
 * is in it. The `/group` command and the post's controls, routed as the bot routes them.
 */
async function setup() {
  const made = await createdTrain({ route: stops(4, 1, 7) });
  const { id } = made.party;
  await made.trains.move(id, { id: REPORTER }, 'next', true);
  await made.attendance.signUp(id, { id: CAROL, name: 'Carol' }, PartyStatus.Coming);
  await made.attendance.newGroup(id, { id: ALICE, name: 'Alice' });
  await made.attendance.labelGroup(id, { id: ALICE, name: 'Alice' }, 'Fast');
  await made.attendance.joinGroup(id, { id: BOB, name: 'Bob' }, 'B');
  await made.attendance.flush();
  await made.service.flush();
  const { ctx, entries } = createTestContext({
    partyService: made.service,
    attendance: made.attendance,
    timedParties: made.timed,
    trains: made.trains,
    parties: made.store,
    regions: made.regions,
    users: made.users,
  });
  const router = new InteractionRouter(ctx, [group], [partyButtons]);
  const handle = async (interaction: FakeInteraction) => {
    await router.handle(interaction as never);
    return interaction;
  };
  const inPost = { channelId: made.postId, thread: { parentId: WEST_FORUM } };
  /** A press on a control of the train, by Alice unless `extra` says otherwise. */
  const click = (customId: string, extra: object = {}) =>
    handle(
      fakeButton({
        customId,
        channelId: made.postId,
        userId: ALICE,
        displayName: 'Alice',
        ...extra,
      }),
    );
  /**
   * The dialog as Alice (unless `as` says otherwise) would be shown it now, for `groups`;
   * `anonymous` when they asked not to be named.
   */
  const drawn = (
    groups: readonly [GroupId, ...GroupId[]] = ['B'],
    as = ALICE,
    staff = false,
    anonymous = false,
  ): APIModalInteractionResponseCallbackData =>
    splitDialog(
      {
        party: made.current(),
        stop: stopsFrom(ctx.gyms),
        memberId: as,
        staff,
        anonymous,
        now: PARTY_NOW,
      },
      groups,
    );
  /** A Submit of `dialog`, by Alice unless `extra` says otherwise; `picked` its pick. */
  const submitOf = (
    dialog: APIModalInteractionResponseCallbackData,
    picked?: string,
    extra: object = {},
  ): FakeInteraction =>
    fakeModal({
      customId: dialog.custom_id,
      form: dialog,
      ...(picked === undefined ? {} : { picked: { [SPLIT_GROUP_INPUT]: picked } }),
      channelId: made.postId,
      userId: ALICE,
      displayName: 'Alice',
      ...extra,
    });
  const submit = (
    dialog: APIModalInteractionResponseCallbackData,
    picked?: string,
    extra: object = {},
  ) => handle(submitOf(dialog, picked, extra));
  const split = (extra: object = {}) =>
    handle(
      fakeChatInput({
        commandName: 'group',
        subcommand: 'split',
        ...inPost,
        userId: ALICE,
        displayName: 'Alice',
        options: { letter: 'B' },
        ...extra,
      }),
    );
  /** The new train, once one was split off. */
  const fresh = () => made.store.active().find((party) => party.id !== made.party.id);
  return {
    ...made,
    ctx,
    entries,
    router,
    handle,
    click,
    drawn,
    submit,
    submitOf,
    split,
    inPost,
    fresh,
  };
}

/** Holds the making of the next post (the new train's) until `release` is called. */
function holdPost(made: Awaited<ReturnType<typeof setup>>): {
  release: () => void;
  reached: Promise<void>;
} {
  let release: () => void = () => undefined;
  let arrive: () => void = () => undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const reached = new Promise<void>((resolve) => {
    arrive = resolve;
  });
  const original = made.gateway.createPost.bind(made.gateway);
  vi.spyOn(made.gateway, 'createPost').mockImplementation(async (forumId, post) => {
    arrive();
    await held;
    return original(forumId, post);
  });
  return { release, reached };
}

/** What a Submit was answered with, after its private deferral. */
function answerOf(submitted: FakeInteraction): string | undefined {
  expect(submitted.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
  return sent(submitted.editReply).content;
}

describe('the button "Split group…" of a train post', () => {
  it('opens the dialog of the one group a member of it may split, and says nothing else', async () => {
    const made = await setup();
    const pressed = await made.click(`party:${made.party.id}:split`);
    expect(dialogOf(pressed)).toEqual(made.drawn(['B']));
    expect(pressed.reply).not.toHaveBeenCalled();
    expect(pressed.deferReply).not.toHaveBeenCalled();
    expect(made.store.active()).toHaveLength(1);
  });

  it('says that a member who asked not to be named will not lead the new train', async () => {
    const made = await setup();
    made.userSettings.set(ALICE, { raidPrivacy: RaidPrivacy.Anonymous });
    const pressed = await made.click(`party:${made.party.id}:split`);
    const dialog = dialogOf(pressed);
    expect(dialog).toEqual(made.drawn(['B'], ALICE, false, true));
    expect(dialog?.components[0]).toMatchObject({
      content: expect.stringMatching(/^- it has no conductor$/mu) as unknown,
    });
    if (dialog) await made.submit(dialog);
    expect(asTrain(made.fresh())).toMatchObject({ anonymous: true, train: { conductorId: null } });
  });

  it('opens no dialog when the privacy it needs takes too long to read', async () => {
    const made = await setup();
    let arrive: () => void = () => undefined;
    const asked = new Promise<void>((resolve) => {
      arrive = resolve;
    });
    vi.spyOn(made.users, 'get').mockImplementation(() => {
      arrive();
      return new Promise(() => undefined);
    });
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'], now: PARTY_NOW });
    const pressing = made.click(`party:${made.party.id}:split`);
    await asked;
    await vi.advanceTimersByTimeAsync(DIALOG_READ_MS);
    const pressed = await pressing;
    expect(pressed.showModal).not.toHaveBeenCalled();
    expect(sent(pressed.reply)).toEqual({ content: SLOW_READ, flags: MessageFlags.Ephemeral });
  });

  it('opens the dialog that asks which group for staff and the conductor, who may split several', async () => {
    const made = await setup();
    const forStaff = await made.click(`party:${made.party.id}:split`, STAFF);
    expect(dialogOf(forStaff)).toEqual(made.drawn(['A', 'B'], DAVE, true));
    await made.trains.setConductor(made.party.id, { id: CAROL, name: 'Carol' });
    const forConductor = await made.click(`party:${made.party.id}:split`, {
      userId: CAROL,
      displayName: 'Carol',
    });
    // In letter order, the presser's own group too (plan 8X-G).
    expect(dialogOf(forConductor)).toEqual(made.drawn(['A', 'B'], CAROL));
  });

  it('offers the groups in letter order, whatever their size and whoever presses (plan 8X-G)', async () => {
    // Plan 8X-G (Matt, 2026-10-22): every list of groups is in letter order. None is marked, the
    // group that leaves is picked on purpose (Android picks the first by itself).
    const made = await setup();
    const id = made.party.id;
    const ERIN = '200000000000000006';
    await made.attendance.newGroup(id, { id: ERIN, name: 'Erin' });
    for (const member of ['200000000000000007', '200000000000000008']) {
      await made.attendance.joinGroup(id, { id: member }, 'C');
    }
    const order = async (who: object) => {
      const pressed = await made.click(`party:${id}:split`, who);
      return dialogChoices(shownDialog(pressed)).map(({ value, picked }) => [
        value.split(':')[0],
        picked,
      ]);
    };
    // Staff, in no group: A and B (2 each), C (3).
    const letters = [
      ['A', false],
      ['B', false],
      ['C', false],
    ];
    expect(await order(STAFF)).toEqual(letters);
    await made.trains.setConductor(id, { id: CAROL, name: 'Carol' });
    expect(await order({ userId: CAROL, displayName: 'Carol' })).toEqual(letters);
  });

  it('tells a member who may split no group why, and opens no dialog', async () => {
    const made = await setup();
    const refused = async (extra: object) => {
      const pressed = await made.click(`party:${made.party.id}:split`, extra);
      expect(pressed.showModal).not.toHaveBeenCalled();
      return sent(pressed.reply).content;
    };
    expect(await refused({ userId: DAVE, displayName: 'Dave' })).toBe(
      "Only a group's members, the conductor and the moderators can split a group off.",
    );
    // With the conductor in group B, Bob may not split it.
    await made.trains.setConductor(made.party.id, { id: ALICE, name: 'Alice' });
    expect(await refused({ userId: BOB, displayName: 'Bob' })).toBe(
      'The conductor is in that group: only they and the moderators can split it off.',
    );
    expect(made.store.active()).toHaveLength(1);
  });

  it('says so when everybody on the train is in that group', async () => {
    const made = await setup();
    // The maker and Carol leave group A: Alice and Bob in B are the whole train.
    // A keeps its label, so it stays when it empties (a group nobody is in goes, plan 8X-1B).
    await made.attendance.labelGroup(made.party.id, { id: REPORTER, name: 'Ash' }, 'Slow');
    await made.attendance.leave(made.party.id, { id: REPORTER, name: 'Ash' });
    await made.attendance.leave(made.party.id, { id: CAROL, name: 'Carol' });
    const pressed = await made.click(`party:${made.party.id}:split`);
    const whole =
      'Everybody on this train is in group B (Fast): there is nothing to split it from.';
    expect(sent(pressed.reply).content).toBe(whole);
    const used = await made.split();
    expect(sent(used.reply).content).toBe(whole);
    expect(used.showModal).not.toHaveBeenCalled();
    expect(made.store.active()).toHaveLength(1);
  });

  it('tells staff in no group why no group can be split: the group that has everybody, or none', async () => {
    const made = await setup();
    const refused = async () =>
      sent((await made.click(`party:${made.party.id}:split`, STAFF)).reply).content;
    // A keeps its label, so it stays when it empties (a group nobody is in goes, plan 8X-1B).
    await made.attendance.labelGroup(made.party.id, { id: REPORTER, name: 'Ash' }, 'Slow');
    await made.attendance.leave(made.party.id, { id: REPORTER, name: 'Ash' });
    await made.attendance.leave(made.party.id, { id: CAROL, name: 'Carol' });
    expect(await refused()).toBe(
      'Everybody on this train is in group B (Fast): there is nothing to split it from.',
    );
    await made.attendance.leave(made.party.id, { id: ALICE, name: 'Alice' });
    await made.attendance.leave(made.party.id, { id: BOB, name: 'Bob' });
    expect(await refused()).toBe('Nobody is in that group: there is nobody to split off.');
    expect(made.store.active()).toHaveLength(1);
  });

  it('tells staff a train without a post yet has none to split', async () => {
    const made = await setup();
    await made.store.update(made.party.id, (party) => ({ party: { ...party, forumPostId: null } }));
    const pressed = await made.click(`party:${made.party.id}:split`, STAFF);
    expect(sent(pressed.reply).content).toBe('This train has no post yet: try again in a moment.');
  });

  it('tells staff a new train whose own split is not settled yet has none to split', async () => {
    const made = await setup();
    await made.store.update(made.party.id, (party) =>
      isTrain(party)
        ? {
            party: {
              ...party,
              train: {
                ...party.train,
                splitFrom: { partyId: party.id, postId: made.postId, pending: true },
              },
            },
          }
        : {},
    );
    const pressed = await made.click(`party:${made.party.id}:split`, STAFF);
    expect(sent(pressed.reply).content).toBe(
      'This train is still being split off another: try again in a moment.',
    );
  });

  it('says a train of one group has none to split', async () => {
    const made = await setup();
    // Group B went its own way: the train has group A alone (a post drawn before shows the button).
    await made.trains.split(made.party.id, { id: ALICE, name: 'Alice' }, false, 'B');
    const pressed = await made.click(`party:${made.party.id}:split`, {
      userId: CAROL,
      displayName: 'Carol',
    });
    expect(sent(pressed.reply).content).toBe(
      'This train has one group: there is no group to split off it.',
    );
  });

  it('says the train is over when it ended', async () => {
    const made = await setup();
    await made.service.end(made.party.id);
    const pressed = await made.click(`party:${made.party.id}:split`);
    expect(sent(pressed.reply).content).toBe('This train is over.');
    expect(pressed.showModal).not.toHaveBeenCalled();
  });
});

describe('a Submit of the dialog', () => {
  it('splits the group off from a dialog opened before its id had a per-open token', async () => {
    const made = await setup();
    const dialog = made.drawn();
    const submitted = await made.submit({ ...dialog, custom_id: withoutToken(dialog.custom_id) });
    expect(answerOf(submitted)).toBe(`Split off: <#${made.fresh()?.forumPostId}>`);
  });

  it('splits the group off, and says privately where the new train is', async () => {
    const made = await setup();
    const submitted = await made.submit(made.drawn());
    const fresh = made.fresh();
    expect(fresh?.forumPostId).toBeDefined();
    expect(answerOf(submitted)).toBe(`Split off: <#${fresh?.forumPostId}>`);
    expect(Object.keys(made.current().attendees)).toEqual([REPORTER, CAROL]);
    expect(Object.keys(asTrain(fresh).attendees)).toEqual([ALICE, BOB]);
  });

  it('splits the group picked off', async () => {
    const made = await setup();
    const dialog = made.drawn(['A', 'B'], DAVE, true);
    const submitted = await made.submit(dialog, `A:${groupMark(made.current(), 'A') ?? ''}`, STAFF);
    const fresh = made.fresh();
    expect(answerOf(submitted)).toBe(`Split off: <#${fresh?.forumPostId}>`);
    expect(Object.keys(made.current().attendees)).toEqual([ALICE, BOB]);
    expect(Object.keys(asTrain(fresh).attendees)).toEqual([REPORTER, CAROL]);
  });

  it('gives a Submit without the group picker (a dialog of an older shape) the stale answer', async () => {
    const made = await setup();
    const forged = await made.handle(
      fakeModal({
        customId: `party:${made.party.id}:splitform`,
        channelId: made.postId,
        userId: DAVE,
        displayName: 'Dave',
        roleNames: ['Moderator'],
      }),
    );
    expect(sent(forged.reply).content).toBe(STALE_COMPONENT);
    expect(made.store.active()).toHaveLength(1);
  });

  it('splits nothing and says the groups changed when the group was called otherwise meanwhile', async () => {
    const made = await setup();
    const before = made.drawn();
    await made.attendance.labelGroup(made.party.id, { id: ALICE, name: 'Alice' }, 'Slow');
    const submitted = await made.submit(before);
    expect(answerOf(submitted)).toBe(
      'The groups of this train changed meanwhile: press Split… again.',
    );
    expect(made.store.active()).toHaveLength(1);
  });

  it('says there is no such group when the group emptied and went meanwhile', async () => {
    const made = await setup();
    const before = made.drawn();
    // Without its label group B goes once nobody is in it (plan 8X-1B).
    await made.attendance.labelGroup(made.party.id, { id: ALICE, name: 'Alice' }, '');
    await made.attendance.leave(made.party.id, { id: ALICE, name: 'Alice' });
    await made.attendance.leave(made.party.id, { id: BOB, name: 'Bob' });
    expect(made.current().groups.map((group) => group.id)).toEqual(['A']);
    const submitted = await made.submit(before);
    expect(answerOf(submitted)).toBe('This train has no such group.');
    expect(made.store.active()).toHaveLength(1);
  });

  it('says so of a pick whose group changed meanwhile too', async () => {
    const made = await setup();
    const dialog = made.drawn(['A', 'B'], DAVE, true);
    const pick = `B:${groupMark(made.current(), 'B') ?? ''}`;
    await made.attendance.labelGroup(made.party.id, { id: ALICE, name: 'Alice' }, 'Slow');
    const submitted = await made.submit(dialog, pick, STAFF);
    expect(answerOf(submitted)).toBe(
      'The groups of this train changed meanwhile: press Split… again.',
    );
    expect(made.store.active()).toHaveLength(1);
  });

  it('splits who is in the group at Submit, also when that changed meanwhile', async () => {
    const made = await setup();
    const before = made.drawn();
    await made.attendance.leave(made.party.id, { id: BOB, name: 'Bob' });
    const submitted = await made.submit(before);
    expect(answerOf(submitted)).toBe(`Split off: <#${made.fresh()?.forumPostId}>`);
    expect(Object.keys(asTrain(made.fresh()).attendees)).toEqual([ALICE]);
  });

  it('says where the group went when somebody split that very group off first', async () => {
    const made = await setup();
    const before = made.drawn();
    // Bob splits the group off first: Alice is on the new train, the old has nothing of hers.
    await made.trains.split(made.party.id, { id: BOB, name: 'Bob' }, false, 'B');
    const submitted = await made.submit(before);
    expect(answerOf(submitted)).toBe(`Split off: <#${made.fresh()?.forumPostId}>`);
    expect(made.store.active()).toHaveLength(2);
  });

  it('answers two Submits of one dialog with where the group went, and splits once', async () => {
    const made = await setup();
    const dialog = made.drawn();
    const { release, reached } = holdPost(made);
    const first = made.submit(dialog);
    await reached;
    // The second Submit waits for the first split to settle.
    const second = made.submit(dialog);
    release();
    const submits = await Promise.all([first, second]);
    for (const submitted of submits) {
      expect(answerOf(submitted)).toBe(`Split off: <#${made.fresh()?.forumPostId}>`);
    }
    expect(made.store.active()).toHaveLength(2);
    expect(made.gateway.postsIn(WEST_FORUM)).toHaveLength(2);
  });

  it('says why when the member may split nothing any more', async () => {
    const made = await setup();
    const before = made.drawn();
    await made.attendance.leave(made.party.id, { id: ALICE, name: 'Alice' });
    const submitted = await made.submit(before);
    expect(answerOf(submitted)).toBe(
      "Only a group's members, the conductor and the moderators can split a group off.",
    );
    expect(made.store.active()).toHaveLength(1);
  });

  it('says the train is over when it ended before the Submit, or while the group was split off', async () => {
    const made = await setup();
    const dialog = made.drawn();
    const { release, reached } = holdPost(made);
    const submitting = made.submit(dialog);
    await reached;
    await made.service.end(made.party.id);
    release();
    expect(answerOf(await submitting)).toBe('This train is over.');
    expect(made.store.active()).toEqual([]);
    const late = await made.submit(dialog);
    expect(sent(late.reply).content).toBe('This train is over.');
  });

  it('says the split did not work when it failed, and the router says what went wrong', async () => {
    const made = await setup();
    made.gateway.failing.set('createPost', new Error('Discord is away'));
    const submitted = await made.submit(made.drawn());
    made.gateway.failing.delete('createPost');
    expect(answerOf(submitted)).toBe('The split did not work: nothing was split off.');
    expect(sent(submitted.followUp).content).toMatch(/^Something went wrong/u);
    expect(made.store.active()).toHaveLength(1);
  });

  it('logs an answer that could not be given and lets the failure of the split go to the router', async () => {
    const made = await setup();
    made.gateway.failing.set('createPost', new Error('Discord is away'));
    const submitted = made.submitOf(made.drawn());
    submitted.editReply.mockRejectedValueOnce(new Error('Unknown Webhook'));
    await made.handle(submitted);
    made.gateway.failing.delete('createPost');
    const failed = made.entries.find((entry) => entry.msg === 'interaction failed');
    expect(failed?.err).toMatchObject({ message: 'Discord is away' });
    const note = made.entries.find(
      (entry) => entry.msg === 'could not say that the split did not work',
    );
    expect(note?.err).toMatchObject({ message: 'Unknown Webhook' });
    expect(made.store.active()).toHaveLength(1);
  });

  it('says plainly where the bot may not make the new post, and counts none of the Submits', async () => {
    const made = await setup();
    made.gateway.refusePosts.set(WEST_FORUM, ['Manage Posts']);
    // More Submits than the post's controls allow a minute: none of them is the member's doing.
    for (let n = 0; n <= ACTION_THROTTLE.uses; n++) {
      const submitted = await made.submit(made.drawn());
      expect(answerOf(submitted)).toBe(
        `I am not allowed to make posts in <#${WEST_FORUM}>: I lack the permission Manage Posts ` +
          "there. Nothing was made. The server's staff must give it to me.",
      );
      // Said there, once.
      expect(submitted.followUp).not.toHaveBeenCalled();
    }
    expect(made.store.active()).toHaveLength(1);
  });

  it('counts with the presses of the post', async () => {
    const made = await setup();
    for (let n = 0; n < ACTION_THROTTLE.uses; n++) {
      await made.click(`party:${made.party.id}:split`, { userId: DAVE, displayName: 'Dave' });
    }
    const submitted = await made.submit(made.drawn(), undefined, {
      userId: DAVE,
      displayName: 'Dave',
    });
    expect(sent(submitted.reply).content).toMatch(/^That was a lot of clicks/u);
    expect(made.store.active()).toHaveLength(1);
  });
});

describe('the controls of the private confirmation of plan 8T', () => {
  it('are no longer active', async () => {
    const made = await setup();
    const mark = groupMark(made.current(), 'B') ?? '';
    for (const customId of [
      `party:${made.party.id}:splitgo:B:${mark}`,
      `party:${made.party.id}:splitno`,
    ]) {
      expect(sent((await made.click(customId)).reply).content).toBe(STALE_COMPONENT);
    }
    const picked = await made.handle(
      fakeSelect({
        customId: `party:${made.party.id}:splitpick`,
        values: ['B'],
        channelId: made.postId,
        userId: ALICE,
        displayName: 'Alice',
      }),
    );
    expect(sent(picked.reply).content).toBe(STALE_COMPONENT);
    expect(made.store.active()).toHaveLength(1);
  });
});

describe('/help group split', () => {
  it('explains the subcommand with an example, and /group lists it', async () => {
    const { ctx } = createTestContext({ commands: [help, group] });
    const ask = async (command: string) => {
      const asked = fakeChatInput({ commandName: 'help', options: { command } });
      await new InteractionRouter(ctx, [help, group], [helpControls]).handle(asked as never);
      return textDisplays(asV2(sent(asked.reply))).join('\n');
    };
    const page = await ask('group split');
    expect(page).toMatch(/^### \/group split/u);
    expect(page).toContain('/group split letter:B');
    expect(page).toContain('"Split…"');
    expect(page).toContain('You are asked first, in a dialog.');
    expect((await ask('group')).split('\n')).toContain(
      '`/group split <letter>` Split a group off this train into a train of its own',
    );
  });
});

describe('/group split', () => {
  it('opens the dialog of that group', async () => {
    const made = await setup();
    const used = await made.split();
    expect(dialogOf(used)).toEqual(made.drawn(['B']));
    expect(used.reply).not.toHaveBeenCalled();
    expect(made.store.active()).toHaveLength(1);
  });

  it('opens the dialog of that one group for staff too, who may split several', async () => {
    const made = await setup();
    const used = await made.split({ ...STAFF, options: { letter: 'A' } });
    const dialog = dialogOf(used);
    expect(dialog).toEqual(made.drawn(['A'], DAVE, true));
    // Its Submit, from a dialog a command opened, splits group A.
    if (dialog) {
      const submitted = await made.submit(dialog, undefined, { ...STAFF, modalFromCommand: true });
      expect(answerOf(submitted)).toBe(`Split off: <#${made.fresh()?.forumPostId}>`);
    }
    expect(Object.keys(asTrain(made.fresh()).attendees)).toEqual([REPORTER, CAROL]);
  });

  it('refuses a group the member may not split, and a raid or meetup', async () => {
    const made = await setup();
    const refusedCarol = await made.split({ userId: CAROL, displayName: 'Carol' });
    expect(sent(refusedCarol.reply).content).toBe(
      "Only a group's members, the conductor and the moderators can split a group off.",
    );
    expect(refusedCarol.showModal).not.toHaveBeenCalled();
    expect(sent((await made.split({ options: { letter: 'Q' } })).reply).content).toBe(
      'This train has no such group.',
    );
    const raid = await reportedRaid();
    const { ctx } = createTestContext({
      partyService: raid.service,
      attendance: raid.attendance,
      parties: raid.store,
      regions: raid.regions,
    });
    const router = new InteractionRouter(ctx, [group], [partyButtons]);
    const used = fakeChatInput({
      commandName: 'group',
      subcommand: 'split',
      channelId: raid.postId,
      thread: { parentId: WEST_FORUM },
      userId: ALICE,
      options: { letter: 'A' },
    });
    await router.handle(used as never);
    expect(sent(used.reply).content).toBe(
      'This is the post of a raid: that only works in the post of a train.',
    );
  });

  it('refuses in the post of a meetup', async () => {
    const meetup = await createdMeetup();
    const { ctx } = createTestContext({
      partyService: meetup.service,
      attendance: meetup.attendance,
      parties: meetup.store,
      regions: meetup.regions,
    });
    const used = fakeChatInput({
      commandName: 'group',
      subcommand: 'split',
      channelId: meetup.postId,
      thread: { parentId: WEST_FORUM },
      userId: ALICE,
      options: { letter: 'A' },
    });
    await new InteractionRouter(ctx, [group], [partyButtons]).handle(used as never);
    expect(sent(used.reply).content).toBe(
      'This is the post of a meetup: that only works in the post of a train.',
    );
  });

  it('offers only the groups the member may split', async () => {
    const made = await setup();
    const offered = async (userId: string, extra: object = {}) => {
      const interaction = fakeAutocomplete({
        commandName: 'group',
        subcommand: 'split',
        ...made.inPost,
        userId,
        focused: '',
        focusedName: 'letter',
        ...extra,
      });
      await made.router.handle(interaction as never);
      return interaction.respond.mock.calls[0]?.[0];
    };
    expect(await offered(ALICE)).toEqual([{ name: 'Group B: Fast (2)', value: 'B' }]);
    expect(await offered(CAROL)).toEqual([{ name: 'Group A (2)', value: 'A' }]);
    expect(await offered(DAVE)).toEqual([]);
    expect(await offered(DAVE, { roleNames: ['Moderator'] })).toEqual([
      { name: 'Group A (2)', value: 'A' },
      { name: 'Group B: Fast (2)', value: 'B' },
    ]);
  });
});
