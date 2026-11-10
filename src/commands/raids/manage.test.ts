import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  dialogOf,
  dialogField,
  dialogFields,
  shownDialog,
  withoutToken,
} from '../../../test/support/dialogs.js';
import {
  fakeButton,
  fakeModal,
  sent,
  type FakeInteraction,
} from '../../../test/support/fake-interactions.js';
import { ALICE, at, BOB, PARTY_NOW } from '../../../test/support/parties.js';
import { reportedRaid } from '../../../test/support/party-service.js';
import { createTestContext } from '../../../test/support/test-context.js';
import { WEST_FORUM } from '../../../test/support/gyms.js';
import { NOT_ALLOWED } from '../../discord/errors.js';
import { partyButtons } from '../../components/party.js';
import { raidManageControls } from './manage.js';
import { InteractionRouter } from '../../discord/router.js';
import { CHANGE_THROTTLE } from './change.js';
import { PartyStatus } from '../../domain/party/status.js';
import { MOVES_LATER, NOTHING_CHANGED } from '../../domain/web/raid-manage.js';
import type { RaidReport } from '../../services/party-service.js';
import {
  RAID_BOSS_INPUT,
  RAID_CHARGE_INPUT,
  RAID_END_INPUT,
  RAID_HATCH_INPUT,
  RAID_QUICK_INPUT,
} from '../../render/manage-dialogs.js';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: PARTY_NOW });
});
afterEach(() => {
  vi.useRealTimers();
});

const HATCH = at('2026-10-13T14:30');
const END = at('2026-10-13T15:15');
const stamp = (time: number) => `<t:${String(time / 1000)}:t>`;

/** A raid of the party services of a test (`reportedRaid`), with Alice coming, on Discord. */
async function setup(report: Partial<RaidReport> = {}) {
  const made = await reportedRaid(report);
  await made.attendance.signUp(made.party.id, { id: ALICE, name: 'Alice' }, PartyStatus.Coming);
  const { ctx } = createTestContext({
    partyService: made.service,
    attendance: made.attendance,
    raids: made.raids,
    parties: made.store,
    regions: made.regions,
  });
  const router = new InteractionRouter(ctx, [], [partyButtons, raidManageControls]);
  const handle = async (interaction: FakeInteraction) => {
    await router.handle(interaction as never);
    return interaction;
  };
  const who = (userId: string) => ({
    userId,
    displayName: userId === ALICE ? 'Alice' : 'Bob',
    channelId: made.postId,
  });
  /** A press of Manage… on the raid's post. */
  const open = (userId = ALICE) =>
    handle(fakeButton({ customId: `party:${made.party.id}:manage`, ...who(userId) }));
  /** The Submit of the dialog with these typed and chosen. */
  const submit = (
    dialog: ReturnType<typeof shownDialog>,
    asked: { hatch?: string; end?: string; boss?: string; quick?: string; charge?: string },
    userId = ALICE,
  ) => {
    const ids = new Set(dialogFields(dialog).map((field) => field.id));
    const chosen = (id: string, value: string | undefined) =>
      ids.has(id) ? { [id]: value === undefined ? [] : [value] } : {};
    return handle(
      fakeModal({
        customId: dialog.custom_id,
        form: dialog,
        fields: { [RAID_HATCH_INPUT]: asked.hatch ?? '', [RAID_END_INPUT]: asked.end ?? '' },
        selected: {
          ...chosen(RAID_BOSS_INPUT, asked.boss),
          ...chosen(RAID_QUICK_INPUT, asked.quick),
          ...chosen(RAID_CHARGE_INPUT, asked.charge),
        },
        ...who(userId),
      }),
    );
  };
  const answerOf = (submitted: FakeInteraction) => sent(submitted.editReply).content;
  return { ...made, ctx, open, submit, answerOf };
}

describe('Manage… of a raid’s post (plan 8M-21: the map’s Manage the raid as a dialog)', () => {
  it('asks what the map’s form asks: the times, the boss with its egg first, nothing picked', async () => {
    const made = await setup();
    const dialog = shownDialog(await made.open());
    expect(dialog.title).toBe('Manage the raid');
    expect(withoutToken(dialog.custom_id)).toBe(`rmanage:${made.party.id}:form`);
    // An egg has no boss whose moves are known: no moves to ask.
    expect(dialogFields(dialog).map((field) => field.label)).toEqual([
      'Hatches in',
      'Ends in',
      'Boss',
    ]);
    expect(dialogField(dialog, 'Hatches in')).toMatchObject({ kind: 'text' });
    expect(dialogField(dialog, 'Hatches in').value).toBeUndefined();
    const boss = dialogField(dialog, 'Boss');
    expect(boss.kind).toBe('select');
    const options = boss.options ?? [];
    // Discord's most in a menu, the raid's own egg and tier first, nothing chosen to start with.
    expect(options.length).toBeLessThanOrEqual(25);
    expect(options[0]).toMatchObject({ value: 'e:T5:0', label: 'Level 5 raid egg' });
    expect(options[1]).toMatchObject({ value: 'b:yveltal:T5:0', label: 'Yveltal' });
    expect(options[1]?.description).toBe('Level 5 raid');
    expect(options.some((option) => option.ticked)).toBe(false);
  });

  it('asks the moves of a raid whose boss is known, as the map does', async () => {
    const made = await setup({ boss: { key: 'yveltal' } });
    const dialog = shownDialog(await made.open());
    expect(dialogFields(dialog).map((field) => field.label)).toEqual([
      'Hatches in',
      'Ends in',
      'Boss',
      'Fast move of Yveltal',
      'Charged move of Yveltal',
    ]);
    expect(dialogField(dialog, 'Fast move of Yveltal').options).toContainEqual(
      expect.objectContaining({ value: 'SNARL_FAST', label: 'Snarl' }),
    );
  });

  it('sets what was filled in as the map’s Submit does, in its order, in the commands’ words', async () => {
    const made = await setup();
    const dialog = shownDialog(await made.open());
    const done = await made.submit(dialog, { hatch: '30', boss: 'b:yveltal:T5:0' });
    expect(made.answerOf(done)).toBe(
      `The boss is now Yveltal (T5). Done. It hatches at ${stamp(HATCH)} and ends at ${stamp(END)}.`,
    );
    expect(made.current()).toMatchObject({ hatchTime: HATCH, endTime: END });
    expect(made.current().raid.boss).toMatchObject({ key: 'yveltal' });
  });

  it('says nothing changed for a Submit with nothing filled in', async () => {
    const made = await setup();
    const done = await made.submit(shownDialog(await made.open()), {});
    expect(made.answerOf(done)).toBe(NOTHING_CHANGED);
  });

  it('sets the moves, and leaves them for later beside a new boss, saying so', async () => {
    const made = await setup({ boss: { key: 'yveltal' } });
    const moved = await made.submit(shownDialog(await made.open()), {
      quick: 'SNARL_FAST',
      charge: 'DARK_PULSE',
    });
    expect(made.answerOf(moved)).toBe('The moves are now Snarl / Dark Pulse.');
    const both = await made.submit(shownDialog(await made.open()), {
      boss: 'e:T5:0',
      quick: 'SNARL_FAST',
    });
    expect(made.answerOf(both)).toBe(`This is now: T5 egg. ${MOVES_LATER}`);
  });

  it('stops at a refusal, saying what went through before it', async () => {
    const made = await setup();
    const refused = await made.submit(shownDialog(await made.open()), {
      boss: 'b:yveltal:T5:0',
      hatch: 'whenever',
    });
    const answer = made.answerOf(refused);
    expect(answer).toMatch(/^The boss is now Yveltal \(T5\)\. I could not read "whenever"/u);
    expect(made.current().hatchTime).toBeNull();
  });

  it('is anybody’s who sees the post, as on the map', async () => {
    const made = await setup();
    const done = await made.submit(shownDialog(await made.open(BOB)), { end: '45' }, BOB);
    expect(made.answerOf(done)).toMatch(/^Done\. It hatched at /u);
  });

  it('is refused privately once the raid is over, as the map refuses it', async () => {
    const made = await setup();
    const dialog = shownDialog(await made.open());
    await made.service.end(made.party.id);
    const late = await made.submit(dialog, { hatch: '30' });
    expect(made.answerOf(late)).toBe('This raid is over.');
    // The post's button no longer knows its kind: the words of any control.
    const pressed = await made.open();
    expect(sent(pressed.reply).content).toBe('This has ended.');
  });
});

describe('the windows a raid’s Manage… counts in (review M1: as the map’s routes count)', () => {
  it('counts each change in its command’s window, and refuses one whose window is full in its words', async () => {
    const made = await setup();
    const { throttles } = made.ctx;
    for (let use = 0; use < CHANGE_THROTTLE.uses; use++) {
      expect(throttles.use('hatch', ALICE, CHANGE_THROTTLE, PARTY_NOW)).toBeUndefined();
    }
    const done = await made.submit(shownDialog(await made.open()), {
      boss: 'b:yveltal:T5:0',
      hatch: '30',
    });
    expect(made.answerOf(done)).toMatch(
      /^The boss is now Yveltal \(T5\)\. You can use \/hatch again in 1 minute\.$/u,
    );
    expect(made.current().hatchTime).toBeNull();
    // The boss counted once in /boss's window (the press that opened the dialog counted as a
    // press of the post's controls, as on the map's post).
    for (let use = 1; use < CHANGE_THROTTLE.uses; use++) {
      expect(throttles.use('boss', ALICE, CHANGE_THROTTLE, PARTY_NOW)).toBeUndefined();
    }
    expect(throttles.use('boss', ALICE, CHANGE_THROTTLE, PARTY_NOW)).toBeDefined();
  });

  it('gives back the use of a change that failed for no fault of the member', async () => {
    const made = await setup();
    const failing = vi
      .spyOn(made.raids, 'setHatchTime')
      .mockRejectedValue(new Error('the database is gone'));
    await made.submit(shownDialog(await made.open()), { hatch: '30' });
    failing.mockRestore();
    for (let use = 0; use < CHANGE_THROTTLE.uses; use++) {
      expect(made.ctx.throttles.use('hatch', ALICE, CHANGE_THROTTLE, PARTY_NOW)).toBeUndefined();
    }
  });
});

describe('who may use a raid’s Manage… (review M10: the map’s access rule)', () => {
  it('refuses a member kept out of the raid’s forum, in the map’s words, before and after it opens', async () => {
    const made = await setup();
    const dialog = shownDialog(await made.open());
    made.gateway.barred.set(WEST_FORUM, new Set([ALICE]));
    const pressed = await made.open();
    expect(dialogOf(pressed)).toBeUndefined();
    expect(sent(pressed.reply).content).toBe(NOT_ALLOWED);
    const late = await made.submit(dialog, { hatch: '30' });
    expect(made.answerOf(late)).toBe(NOT_ALLOWED);
    expect(made.current().hatchTime).toBeNull();
  });
});

describe('an optional menu left untouched (review M8)', () => {
  it('is no change, also where discord.js gives no values for it', async () => {
    const made = await setup();
    const dialog = shownDialog(await made.open());
    const submitted = fakeModal({
      customId: dialog.custom_id,
      form: dialog,
      fields: { [RAID_HATCH_INPUT]: '30', [RAID_END_INPUT]: '' },
      userId: ALICE,
      displayName: 'Alice',
      channelId: made.postId,
    });
    (
      submitted.fields as unknown as { getStringSelectValues: () => undefined }
    ).getStringSelectValues = () => undefined;
    const router = new InteractionRouter(made.ctx, [], [raidManageControls]);
    await router.handle(submitted as never);
    expect(made.answerOf(submitted)).toMatch(/^Done\. It hatches at /u);
  });
});
