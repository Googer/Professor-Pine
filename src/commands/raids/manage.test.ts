import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
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
import { partyButtons } from '../../components/party.js';
import { InteractionRouter } from '../../discord/router.js';
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
  const router = new InteractionRouter(ctx, [], [partyButtons]);
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
    expect(withoutToken(dialog.custom_id)).toBe(`party:${made.party.id}:raidform`);
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
