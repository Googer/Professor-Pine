import { MessageFlags, type APIModalInteractionResponseCallbackData } from 'discord.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dialogChoices, dialogOf, shownDialog } from '../../test/support/dialogs.js';
import {
  fakeButton,
  fakeChatInput,
  fakeModal,
  sent,
  type FakeInteraction,
} from '../../test/support/fake-interactions.js';
import { WEST_FORUM } from '../../test/support/gyms.js';
import { ALICE, BOB, MINUTE, PARTY_NOW } from '../../test/support/parties.js';
import { reportedRaid } from '../../test/support/party-service.js';
import { createTestContext } from '../../test/support/test-context.js';
import { meet } from '../commands/parties/meet.js';
import { meetControls } from '../commands/parties/meet-dialog.js';
import { InteractionRouter } from '../discord/router.js';
import { PartyStatus } from '../domain/party/status.js';
import { MEET_INPUT, NO_MEETING } from '../render/meet-dialog.js';
import { timestamp } from '../render/text.js';
import { partyButtons } from './party.js';

const HATCH = PARTY_NOW + 30 * MINUTE;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: PARTY_NOW });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

/** An egg hatching in half an hour, Alice coming, with the post's controls and `/meet` routed. */
async function setup(
  report: Parameters<typeof reportedRaid>[0] = { time: { hatch: HATCH } },
  emoji: Record<string, string> = {},
) {
  const made = await reportedRaid(report);
  await made.attendance.signUp(made.party.id, { id: ALICE, name: 'Alice' }, PartyStatus.Coming);
  const { ctx } = createTestContext({
    partyService: made.service,
    attendance: made.attendance,
    parties: made.store,
    regions: made.regions,
    emoji: { find: (name) => emoji[name] },
  });
  const router = new InteractionRouter(ctx, [meet], [partyButtons, meetControls]);
  const handle = async (interaction: FakeInteraction) => {
    await router.handle(interaction as never);
    return interaction;
  };
  const press = (userId = ALICE) =>
    handle(
      fakeButton({
        customId: `party:${made.party.id}:meet`,
        channelId: made.postId,
        userId,
        displayName: 'Alice',
      }),
    );
  const submit = (dialog: APIModalInteractionResponseCallbackData, value: string, userId = ALICE) =>
    handle(
      fakeModal({
        customId: dialog.custom_id,
        form: dialog,
        selected: { [MEET_INPUT]: [value] },
        channelId: made.postId,
        userId,
        displayName: 'Alice',
      }),
    );
  const typed = (time: string) =>
    handle(
      fakeChatInput({
        commandName: 'meet',
        channelId: made.postId,
        thread: { parentId: WEST_FORUM },
        userId: ALICE,
        displayName: 'Alice',
        options: { time },
      }),
    );
  return { ...made, press, submit, typed };
}

const answerOf = (submitted: FakeInteraction) => sent(submitted.editReply).content;

describe('Meet… (plan 8X-1B, decision 5)', () => {
  it('opens the dialog of the member’s group, the hatch chosen to start with on an egg', async () => {
    const made = await setup();
    const dialog = shownDialog(await made.press());
    expect(dialog.title).toBe('Meeting time');
    expect(dialogChoices(dialog).find(({ picked }) => picked)?.value).toBe(String(HATCH));
  });

  it('sets the group’s meeting time as /meet does, and says so in /meet’s words', async () => {
    const made = await setup();
    const dialog = shownDialog(await made.press());
    const at = HATCH + 15 * MINUTE;
    const submitted = await made.submit(dialog, String(at));
    expect(submitted.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
    expect(answerOf(submitted)).toBe(
      `The meeting time of your group is ${timestamp(at)} (${timestamp(at, 'R')}). I have told the others.`,
    );
    expect(made.current().groups[0]?.startTime).toBe(at);
    await made.attendance.flush();
    expect(made.said().at(-1)).toMatch(/set the meeting time: <t:\d+:t>/);
    // And removes it again.
    const again = shownDialog(await made.press());
    expect(dialogChoices(again).at(-1)?.value).toBe(NO_MEETING);
    const removed = await made.submit(again, NO_MEETING);
    expect(answerOf(removed)).toBe('The meeting time of your group is canceled.');
    expect(made.current().groups[0]?.startTime).toBeUndefined();
  });

  it('refuses before the dialog opens: not signed up, a raid without times, no time left', async () => {
    const made = await setup();
    const stranger = await made.press(BOB);
    expect(dialogOf(stranger)).toBeUndefined();
    expect(sent(stranger.reply).content).toBe('You are not signed up for this raid.');
    const untimed = await setup({});
    const pressed = await untimed.press();
    expect(dialogOf(pressed)).toBeUndefined();
    expect(sent(pressed.reply).content).toBe('This raid has no times yet: "Set time…" gives them.');
    vi.setSystemTime(HATCH + 44 * MINUTE + 30_000);
    const late = await made.press();
    expect(dialogOf(late)).toBeUndefined();
    expect(sent(late.reply).content).toBe('There is no time left to meet before this raid ends.');
  });

  it('refuses a Submit for a group the member left meanwhile, and a time that passed', async () => {
    const made = await setup();
    const dialog = shownDialog(await made.press());
    await made.attendance.newGroup(made.party.id, { id: ALICE, name: 'Alice' });
    expect(answerOf(await made.submit(dialog, String(HATCH)))).toBe(
      'Group A has changed since: press ⏰ again.',
    );
    const own = shownDialog(await made.press());
    vi.setSystemTime(HATCH + MINUTE);
    made.clock.now = HATCH + MINUTE;
    expect(answerOf(await made.submit(own, String(HATCH)))).toBe(
      'That time is no longer offered: press ⏰ again.',
    );
    expect(made.current().groups.every((group) => group.startTime === undefined)).toBe(true);
  });

  it("names Meet… by its icon, the application's where it has one", async () => {
    const made = await setup(undefined, { pinemeet: '<:pinemeet:1400823744760905729>' });
    const dialog = shownDialog(await made.press());
    vi.setSystemTime(HATCH + MINUTE);
    made.clock.now = HATCH + MINUTE;
    expect(answerOf(await made.submit(dialog, String(HATCH)))).toBe(
      'That time is no longer offered: press <:pinemeet:1400823744760905729> again.',
    );
  });

  it('decides in the store: a Group… move queued before the Submit has it refused', async () => {
    const made = await setup();
    const dialog = shownDialog(await made.press());
    // Alice's move to a new group is on its way: its write waits until the Submit has asked
    // the store (the second change asked of it), so the Submit's own checks see her in A.
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const save = made.storage.save.bind(made.storage);
    let first = true;
    vi.spyOn(made.storage, 'save').mockImplementation(async (party, note) => {
      if (first) {
        first = false;
        await held;
      }
      return save(party, note);
    });
    const update = made.store.update.bind(made.store);
    let asked = 0;
    vi.spyOn(made.store, 'update').mockImplementation(
      (id: string, change: Parameters<typeof update>[1]) => {
        asked += 1;
        const result = update(id, change);
        if (asked === 2) release();
        return result;
      },
    );
    const moving = made.attendance.newGroup(made.party.id, { id: ALICE, name: 'Alice' });
    const submitted = await made.submit(dialog, String(HATCH));
    await moving;
    expect(answerOf(submitted)).toBe('Group A has changed since: press ⏰ again.');
    expect(made.current().groups.every((group) => group.startTime === undefined)).toBe(true);
  });

  it('draws on the budget of /meet: three a minute, press and command alike', async () => {
    const made = await setup();
    for (const time of ['3:00pm', '3:05pm']) await made.typed(time);
    const dialog = shownDialog(await made.press());
    await made.submit(dialog, String(HATCH));
    // The fourth use, by the button: refused before its dialog opens.
    const fourth = await made.press();
    expect(dialogOf(fourth)).toBeUndefined();
    expect(sent(fourth.reply).content).toBe('You can use /meet again in 1 minute.');
    const command = await made.typed('3:10pm');
    expect(sent(command.reply).content).toBe('You can use /meet again in 1 minute.');
  });
});
