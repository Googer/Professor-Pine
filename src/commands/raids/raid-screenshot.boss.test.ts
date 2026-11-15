import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fakeButton,
  fakeChatInput,
  fakeSelect,
  sent,
  type FakeInteraction,
} from '../../../test/support/fake-interactions.js';
import { testGym, WEST_CHANNEL } from '../../../test/support/gyms.js';
import { PARTY_NOW } from '../../../test/support/parties.js';
import { partyServiceWith } from '../../../test/support/party-service.js';
import { gymsFixture } from '../../../test/support/providers.js';
import { kyuremBossesFixture } from '../../../test/support/raid-bosses.js';
import { screenshotsWith } from '../../../test/support/screenshot-service.js';
import { kyuremReading } from '../../../test/support/screenshots.js';
import { createTestContext } from '../../../test/support/test-context.js';
import type { Gym } from '../../db/repositories/gym-repository.js';
import { InteractionRouter } from '../../discord/router.js';
import { isRaid, type RaidParty } from '../../domain/party/party.js';
import { screenshotControls } from '../screenshots/feedback.js';
import { raid, raidControls } from './raid.js';

/*
 * `/raid` with a screenshot whose CP and name fit more than one boss (Black and White Kyurem,
 * 2026-11-15): the raid is reported without its boss, and the private answer asks which.
 */

const CLOCK = { hour: 13, minute: 59 };

async function setup(extraGyms: Gym[] = []) {
  const gyms = gymsFixture(extraGyms);
  const raidBosses = kyuremBossesFixture();
  const made = await partyServiceWith([], { gyms });
  const shots = screenshotsWith(createTestContext({ gyms, raidBosses }).ctx);
  const { ctx } = createTestContext({
    gyms,
    raidBosses,
    partyService: made.service,
    parties: made.store,
    regions: made.regions,
    raids: made.raids,
    attendance: made.attendance,
    screenshots: shots.screenshots,
  });
  const router = new InteractionRouter(ctx, [raid], [raidControls, screenshotControls]);
  const handle = async (interaction: FakeInteraction) => {
    await router.handle(interaction as never);
    return interaction;
  };
  const report = (options: Record<string, string> = {}, gym = 'Old Stone Fountain') =>
    handle(
      fakeChatInput({
        commandName: 'raid',
        channelId: WEST_CHANNEL,
        options,
        resolved: { screenshot: shots.screenshot('shot.png', kyuremReading(gym, CLOCK)) },
      }),
    );
  /** The one raid made, as it is stored now. */
  const stored = (): RaidParty => {
    const [party] = made.store.active();
    if (!party || !isRaid(party)) throw new Error('no raid');
    return party;
  };
  return { ...shots, ...made, ctx, handle, report, stored };
}

/** The buttons of an answer, every row's. */
const buttonsOf = (payload: { components?: readonly unknown[] }) =>
  (payload.components ?? []).flatMap(
    (row) =>
      (
        ((row as { toJSON?: () => unknown }).toJSON?.() ?? row) as {
          components: { custom_id: string; label?: string }[];
        }
      ).components,
  );
const pressOn = (payload: { components?: readonly unknown[] }, label: string) =>
  fakeButton({
    customId: buttonsOf(payload).find((button) => button.label === label)?.custom_id ?? 'missing',
    ephemeralMessage: true,
  });

describe('/raid with a screenshot whose CP and name fit more than one boss', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: PARTY_NOW });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('reports the raid without its boss, names the bosses and asks which, and sets the one chosen', async () => {
    const { report, stored, handle, screenshots } = await setup();
    const used = await report();
    expect(stored()).toMatchObject({ gymId: 2, raid: { boss: null, tier: { level: 'T5' } } });
    const answer = sent(used.editReply);
    const lines = answer.content?.split('\n') ?? [];
    expect(lines).toContain(
      '- The CP and name fit more than one boss: Black Kyurem or White Kyurem.',
    );
    expect(lines.at(-1)).toBe('Which boss is the raid at Old Stone Fountain?');
    expect(buttonsOf(answer).map((button) => button.label)).toEqual([
      'Black Kyurem',
      'White Kyurem',
      'Cancel',
      'Screenshot feedback',
    ]);
    expect(buttonsOf(answer)[0]?.custom_id).toMatch(/^raid:[^:]+:boss:0$/);

    const white = await handle(pressOn(answer, 'White Kyurem'));
    expect(stored().raid.boss).toEqual({ key: 'kyurem_white' });
    const changed = sent(white.editReply);
    // The answer keeps what was reported; the question gives way to what came of it.
    expect(changed.content).toBe(
      [
        ...lines.slice(0, -1),
        'Set the boss of the raid at Old Stone Fountain to White Kyurem.',
      ].join('\n'),
    );
    expect(buttonsOf(changed).map((button) => button.label)).toEqual(['Screenshot feedback']);
    const id = stored().raid.screenshot?.id ?? '';
    expect(await screenshots.get(id)).toMatchObject({ record: { pickedBossKey: 'kyurem_white' } });
    // A second press is only acknowledged.
    const again = await handle(pressOn(answer, 'Black Kyurem'));
    expect(again.deferUpdate).toHaveBeenCalled();
    expect(stored().raid.boss).toEqual({ key: 'kyurem_white' });
  });

  it('says so when the boss was set meanwhile', async () => {
    const { report, stored, handle, raids } = await setup();
    const answer = sent((await report()).editReply);
    await raids.setBoss(
      stored().id,
      { id: '700000000000000009', name: 'Ash' },
      { tier: { level: 'T5', shadow: false }, boss: { key: 'kyurem_black' }, label: 'x' },
    );
    const white = await handle(pressOn(answer, 'White Kyurem'));
    expect(sent(white.editReply).content).toMatch(
      /\nThe boss of this raid was set meanwhile, so I left it as it is\.$/,
    );
    expect(stored().raid.boss).toEqual({ key: 'kyurem_black' });
  });

  it('leaves the raid without its boss on Cancel, the question gone from the answer', async () => {
    const { report, stored, handle } = await setup();
    const answer = sent((await report()).editReply);
    const cancel = await handle(pressOn(answer, 'Cancel'));
    const after = sent(cancel.editReply);
    expect(after.content).not.toMatch(/Which boss/);
    expect(after.content).toMatch(/^Reported/);
    expect(buttonsOf(after).map((button) => button.label)).toEqual(['Screenshot feedback']);
    expect(stored().raid.boss).toBeNull();
  });

  it('asks nothing when the member typed the boss', async () => {
    const { report, stored } = await setup();
    const answer = sent((await report({ boss: 'b:kyurem_black:T5:0' })).editReply);
    expect(stored().raid.boss).toEqual({ key: 'kyurem_black' });
    expect(answer.content).not.toMatch(/Which boss/);
    expect(buttonsOf(answer).map((button) => button.label)).toEqual(['Screenshot feedback']);
  });

  it('asks once the gym chosen in the menu has made the raid', async () => {
    const twin = testGym(13, 'Old Stone Fountain', 40.061, -80.061, { nickname: 'Bank fountain' });
    const { report, stored, handle } = await setup([twin]);
    const asked = sent((await report()).editReply);
    const menu = buttonsOf(asked)[0]?.custom_id ?? '';
    const picked = await handle(fakeSelect({ customId: menu, values: ['13'] }));
    expect(stored()).toMatchObject({ gymId: 13 });
    const answer = sent(picked.editReply);
    expect(answer.content?.split('\n').at(-1)).toBe('Which boss is the raid at Bank fountain?');
    const black = await handle(pressOn(answer, 'Black Kyurem'));
    expect(sent(black.editReply).content).toMatch(/to Black Kyurem\.$/);
    expect(stored().raid.boss).toEqual({ key: 'kyurem_black' });
  });
});
