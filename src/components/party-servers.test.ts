import type { APIModalInteractionResponseCallbackData } from 'discord.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dialogChoices, dialogOf, shownDialog } from '../../test/support/dialogs.js';
import {
  answered,
  fakeButton,
  fakeModal,
  type FakeInteraction,
} from '../../test/support/fake-interactions.js';
import { OTHER_GUILD_ID } from '../../test/support/gyms.js';
import { ALICE, BOB, MINUTE, PARTY_NOW, REPORTER } from '../../test/support/parties.js';
import {
  createdMeetup,
  createdTrain,
  partyServiceWith,
  reportedMax,
  reportedRaid,
} from '../../test/support/party-service.js';
import { createTestContext } from '../../test/support/test-context.js';
import { InteractionRouter } from '../discord/router.js';
import { attendeeOf } from '../domain/party/party.js';
import { PartyStatus } from '../domain/party/status.js';
import { MEETUP_NAME_INPUT, MEETUP_START_INPUT } from '../render/manage-dialogs.js';
import { MEET_INPUT } from '../render/meet-dialog.js';
import { TIME_INPUT } from '../render/party-controls.js';
import { GROUP_INPUT } from '../render/group-dialogs.js';
import {
  MANAGE_AT_END_INPUT,
  MANAGE_KIND_INPUT,
  MANAGE_ROUTE_INPUT,
  MANAGE_START_INPUT,
  MOVE_INPUT,
} from '../render/train-dialogs.js';
import { components } from './index.js';

/*
 * A control, a dialog and a guard that name a party by its custom id take only a party of the
 * server they came from (spec, "The rule"): a party of another server is answered as one that has
 * ended, in the words the control has for that, and nothing of it changes.
 */

const HATCH = PARTY_NOW + 30 * MINUTE;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: PARTY_NOW });
});
afterEach(() => {
  vi.useRealTimers();
});

/** Every control routed over the context of a party made through the service. */
function routed(made: Awaited<ReturnType<typeof partyServiceWith>>) {
  const { ctx } = createTestContext({
    partyService: made.service,
    attendance: made.attendance,
    raids: made.raids,
    maxBattles: made.maxes,
    timedParties: made.timed,
    trains: made.trains,
    parties: made.store,
    regions: made.regions,
  });
  const router = new InteractionRouter(ctx, [], components);
  return async <I extends FakeInteraction>(interaction: I): Promise<I> => {
    await router.handle(interaction as never);
    return interaction;
  };
}

/**
 * Where a press comes from: the party's post in its own server, or another server, which has a
 * `Guild` row of its own (`testGuildRowOf`), or a server the instance has no row of.
 */
const HOME = {};
const ABROAD = { guildId: OTHER_GUILD_ID };
const ROWLESS = { guildId: '412345678901234569' };

/** What a control answered first: its reply, or the edit of its acknowledgement. */
const answerOf = (fake: FakeInteraction): string | undefined => answered(fake).content;

/** The value of a dialog's first choice. */
function firstChoice(dialog: APIModalInteractionResponseCallbackData): string {
  const [first] = dialogChoices(dialog);
  if (!first) throw new Error(`the dialog ${dialog.title} has no choice`);
  return first.value;
}

describe('the buttons of a party’s post, named from another server', () => {
  async function setup() {
    const made = await reportedRaid({ time: { hatch: HATCH } });
    await made.attendance.signUp(made.party.id, { id: REPORTER }, PartyStatus.Coming);
    await made.attendance.flush();
    const handle = routed(made);
    const press = (action: string, where: object, userId = ALICE) =>
      handle(
        fakeButton({
          customId: `party:${made.party.id}:${action}`,
          channelId: '600000000000000077',
          userId,
          displayName: 'Alice',
          ...where,
        }),
      );
    return { ...made, press };
  }

  it('answers every press of the post as of a party that has ended, and changes nothing', async () => {
    const made = await setup();
    const before = made.current();
    const said = made.said();
    for (const action of ['maybe', 'join', 'here', 'more', 'less', 'remote', 'group:A']) {
      expect(answerOf(await made.press(action, ABROAD)), action).toBe('This has ended.');
    }
    for (const action of ['done', 'leave', 'answer:yes']) {
      const pressed = await made.press(action, ABROAD, REPORTER);
      expect(answerOf(pressed), action).toBe('This has ended.');
    }
    for (const action of ['time', 'shot']) {
      expect(answerOf(await made.press(action, ABROAD)), action).toBe('This raid is over.');
    }
    for (const action of ['manage', 'regroup', 'meet']) {
      const pressed = await made.press(action, ABROAD, REPORTER);
      expect(answerOf(pressed), action).toBe('This has ended.');
      expect(dialogOf(pressed), action).toBeUndefined();
    }
    await made.attendance.flush();
    expect(made.current()).toBe(before);
    expect(made.said()).toEqual(said);
  });

  it('answers a press from a server without a row as of a party that has ended', async () => {
    const made = await setup();
    const before = made.current();
    expect(answerOf(await made.press('join', ROWLESS))).toBe('This has ended.');
    expect(answerOf(await made.press('time', ROWLESS))).toBe('This raid is over.');
    expect(made.current()).toBe(before);
  });

  it('takes the same presses in the party’s own server', async () => {
    const made = await setup();
    expect(answerOf(await made.press('join', HOME))).toBe('You are coming.');
    expect(attendeeOf(made.current(), ALICE)?.status).toBe(PartyStatus.Coming);
    expect(dialogOf(await made.press('meet', HOME))).toBeDefined();
  });
});

describe('the dialogs of a party’s post, submitted from another server', () => {
  it('sets no time of a raid named from another server', async () => {
    const made = await reportedRaid();
    const handle = routed(made);
    const dialog = shownDialog(
      await handle(fakeButton({ customId: `party:${made.party.id}:time`, userId: ALICE })),
    );
    const abroad = await handle(
      fakeModal({
        customId: dialog.custom_id,
        form: dialog,
        fields: { [TIME_INPUT]: '20' },
        userId: ALICE,
        ...ABROAD,
      }),
    );
    expect(answerOf(abroad)).toBe('This raid is over.');
    expect(made.current().hatchTime).toBeNull();
    await handle(
      fakeModal({
        customId: dialog.custom_id,
        form: dialog,
        fields: { [TIME_INPUT]: '20' },
        userId: ALICE,
      }),
    );
    expect(made.current().hatchTime).not.toBeNull();
  });

  it('signs nobody up by Group… or "which group?" of a party of another server', async () => {
    const made = await reportedRaid({ time: { hatch: HATCH } });
    // Two groups, so that a newcomer is asked which.
    await made.attendance.signUp(made.party.id, { id: BOB }, PartyStatus.Coming);
    await made.attendance.newGroup(made.party.id, { id: REPORTER });
    const handle = routed(made);
    const which = shownDialog(
      await handle(fakeButton({ customId: `party:${made.party.id}:join`, userId: ALICE })),
    );
    const regroup = shownDialog(
      await handle(fakeButton({ customId: `party:${made.party.id}:regroup`, userId: ALICE })),
    );
    for (const dialog of [which, regroup]) {
      const submitted = await handle(
        fakeModal({
          customId: dialog.custom_id,
          form: dialog,
          picked: { [GROUP_INPUT]: firstChoice(dialog) },
          userId: ALICE,
          ...ABROAD,
        }),
      );
      expect(answerOf(submitted), dialog.title).toBe('This has ended.');
    }
    expect(attendeeOf(made.current(), ALICE)).toBeUndefined();
  });

  it('sets no meeting time of a party of another server (Meet…)', async () => {
    const made = await reportedRaid({ time: { hatch: HATCH } });
    await made.attendance.signUp(made.party.id, { id: ALICE }, PartyStatus.Coming);
    const handle = routed(made);
    const dialog = shownDialog(
      await handle(fakeButton({ customId: `party:${made.party.id}:meet`, userId: ALICE })),
    );
    const submit = (where: object) =>
      handle(
        fakeModal({
          customId: dialog.custom_id,
          form: dialog,
          selected: { [MEET_INPUT]: [String(HATCH)] },
          userId: ALICE,
          ...where,
        }),
      );
    expect(answerOf(await submit(ABROAD))).toBe('This has ended.');
    expect(made.current().groups[0]?.startTime).toBeUndefined();
    await submit(HOME);
    expect(made.current().groups[0]?.startTime).toBe(HATCH);
  });

  it('changes nothing of a raid of another server by Manage…', async () => {
    const made = await reportedRaid({ time: { hatch: HATCH } });
    const handle = routed(made);
    const dialog = shownDialog(
      await handle(fakeButton({ customId: `party:${made.party.id}:manage`, userId: ALICE })),
    );
    const abroad = await handle(
      fakeModal({ customId: dialog.custom_id, form: dialog, userId: ALICE, ...ABROAD }),
    );
    expect(answerOf(abroad)).toBe('This raid is over.');
  });
});

describe('a train’s controls, named from another server', () => {
  async function setup() {
    const made = await createdTrain({ route: [4, 1, 7, 2] });
    const handle = routed(made);
    const press = (action: string, where: object) =>
      handle(
        fakeButton({ customId: `party:${made.party.id}:${action}`, userId: REPORTER, ...where }),
      );
    return { ...made, handle, press };
  }

  it('opens nothing and shows no route of a train of another server', async () => {
    const made = await setup();
    for (const action of ['move', 'route', 'split']) {
      const pressed = await made.press(action, ABROAD);
      expect(dialogOf(pressed), action).toBeUndefined();
      expect(answerOf(pressed), action).toBe('This train is over.');
    }
    const manage = await made.press('manage', ABROAD);
    expect(dialogOf(manage)).toBeUndefined();
    expect(answerOf(manage)).toBe('This has ended.');
    expect(dialogOf(await made.press('move', HOME))).toBeDefined();
  });

  it('moves no train of another server by Move…, and splits off no group by Split…', async () => {
    const made = await setup();
    const move = shownDialog(await made.press('move', HOME));
    const moved = await made.handle(
      fakeModal({
        customId: move.custom_id,
        form: move,
        picked: { [MOVE_INPUT]: firstChoice(move) },
        userId: REPORTER,
        ...ABROAD,
      }),
    );
    expect(answerOf(moved)).toBe('This train is over.');
    expect(made.current().train.stop).toBe(0);
    const split = await made.handle(
      fakeModal({ customId: `party:${made.party.id}:splitform:A:x`, userId: REPORTER, ...ABROAD }),
    );
    expect(answerOf(split)).toBe('This train is over.');
  });

  it('reads no times of a train of another server in Manage…’s Submit (its guard)', async () => {
    const made = await setup();
    const dialog = shownDialog(await made.press('manage', HOME));
    const submit = (where: object) =>
      made.handle(
        fakeModal({
          customId: dialog.custom_id,
          form: dialog,
          fields: { [MANAGE_START_INPUT]: 'banana' },
          picked: { [MANAGE_ROUTE_INPUT]: 'keep' },
          selected: {
            [MANAGE_AT_END_INPUT]: [made.current().train.atEnd],
            [MANAGE_KIND_INPUT]: [made.current().train.kind],
          },
          userId: REPORTER,
          ...where,
        }),
      );
    expect(answerOf(await submit(ABROAD))).toBe('This train is over.');
    // In the train's own server the guard reads the start, and refuses what is no time.
    expect(answerOf(await submit(HOME))).toMatch(
      /^I could not read "banana" as the time the train starts\. /,
    );
  });
});

describe('a meetup’s Manage…, submitted from another server', () => {
  it('renames no meetup of another server and reads none of its times', async () => {
    const made = await createdMeetup();
    const handle = routed(made);
    const dialog = shownDialog(
      await handle(fakeButton({ customId: `party:${made.party.id}:manage`, userId: REPORTER })),
    );
    const submit = (where: object, fields: Record<string, string>) =>
      handle(
        fakeModal({ customId: dialog.custom_id, form: dialog, fields, userId: REPORTER, ...where }),
      );
    const renamed = { [MEETUP_NAME_INPUT]: 'Raid night' };
    expect(answerOf(await submit(ABROAD, renamed))).toBe('This meetup is over.');
    // Its guard reads no time typed for a meetup of another server.
    expect(answerOf(await submit(ABROAD, { [MEETUP_START_INPUT]: 'banana' }))).toBe(
      'This meetup is over.',
    );
    expect(made.current().timed.name).toBe('Community Day picnic');
    await submit(HOME, renamed);
    expect(made.current().timed.name).toBe('Raid night');
  });
});

describe('Delete… of the moderators’ notice of a max battle at a pin', () => {
  it('opens no dialog for a battle of another server', async () => {
    const made = await reportedMax();
    const handle = routed(made);
    const press = (where: object) =>
      handle(
        fakeButton({
          customId: `maxpin:${made.party.id}:delete`,
          userId: REPORTER,
          roleNames: ['Moderator'],
          ...where,
        }),
      );
    const abroad = await press(ABROAD);
    expect(dialogOf(abroad)).toBeUndefined();
    expect(answerOf(abroad)).toBe('This max battle has ended.');
    expect(dialogOf(await press(HOME))).toBeDefined();
  });
});
