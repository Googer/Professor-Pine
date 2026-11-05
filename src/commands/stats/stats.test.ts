import { ButtonStyle, MessageFlags } from 'discord.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { activityBucket } from '../../../test/support/activity-cases.js';
import {
  answered,
  asV2,
  fakeButton,
  fakeChatInput,
  FAKE_GUILD_ID,
  sent,
} from '../../../test/support/fake-interactions.js';
import { EAST_CHANNEL, EAST_FORUM, WEST_CHANNEL } from '../../../test/support/gyms.js';
import { buttonsOf, textDisplays } from '../../../test/support/messages.js';
import { regionBoardsWith } from '../../../test/support/region-boards.js';
import { createTestContext } from '../../../test/support/test-context.js';
import { Tally } from '../../../test/support/tally.js';
import { zonedAt } from '../../../test/support/time.js';
import type { V2Message } from '../../discord/party-gateway.js';
import { InteractionRouter, STALE_COMPONENT } from '../../discord/router.js';
import { LATE_DEFER_MS } from '../../discord/late-reply.js';
import { stats, statsControls } from './stats.js';

const ASH = '700000000000000001';
const MISTY = '700000000000000002';
const ZONE = 'America/New_York';
/** A Thursday of November 2026. */
const NOW = zonedAt('2026-11-05T12:00', ZONE);

/**
 * The board of the fakes' server: this month West has 4 raids and a max battle, East 6 raids,
 * region 3 nothing, a deleted region 99 two raids and a record without a region a max battle;
 * West had 10 more raids in March, East 20 in 2019.
 */
async function setup() {
  const made = regionBoardsWith(ZONE);
  await made.activity.add(FAKE_GUILD_ID, [
    activityBucket(1, '2026-11', 2, 18, { regionId: 1, raids: 4, maxes: 1 }),
    activityBucket(7, '2026-11', 3, 18, { regionId: 2, raids: 6 }),
    activityBucket(9, '2026-11', 3, 18, { regionId: 99, raids: 2 }),
    activityBucket(0, '2026-11', 3, 18, {
      regionId: 0,
      placeKind: 'none',
      placeId: '0',
      raids: 0,
      maxes: 1,
    }),
    activityBucket(1, '2026-03', 6, 13, { regionId: 1, raids: 10 }),
    activityBucket(7, '2019-06', 6, 13, { regionId: 2, raids: 20 }),
  ]);
  const { ctx } = createTestContext({ regionBoards: made.boards });
  const router = new InteractionRouter(ctx, [stats], [statsControls]);
  const ask = async (options: Record<string, string> = {}, userId = ASH) => {
    const interaction = fakeChatInput({
      commandName: 'stats',
      subcommand: 'regions',
      userId,
      channelId: WEST_CHANNEL,
      options,
    });
    await router.handle(interaction as never);
    return interaction;
  };
  const press = async (customId: string, userId = ASH) => {
    const interaction = fakeButton({
      customId,
      userId,
      askedBy: userId,
      ephemeralMessage: true,
      v2Message: true,
    });
    await router.handle(interaction as never);
    return interaction;
  };
  return { ...made, ctx, router, ask, press };
}

/** The styles of the three period buttons. */
const periodStyles = (message: V2Message) =>
  buttonsOf(message)
    .slice(0, 3)
    .map((button) => button.style);

const MONTH_BOARD = [
  '### Raids and max battles by region, this month\n' +
    `1. <#${EAST_CHANNEL}>: 6 raids\n` +
    `2. <#${WEST_CHANNEL}>: 4 raids, 1 max battle\n` +
    '3. Region 3: none',
  'No longer a region: 2 raids, 1 max battle\n**Total:** 12 raids, 2 max battles',
];

describe('/stats regions', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('answers privately with this month’s raids and max battles by region, the busiest first', async () => {
    const made = await setup();
    const payload = answered(await made.ask());
    expect((payload.flags ?? 0) & MessageFlags.Ephemeral).toBe(MessageFlags.Ephemeral);
    const message = asV2(payload);
    expect(textDisplays(message).slice(0, 2)).toEqual(MONTH_BOARD);
    expect(buttonsOf(message).map((button) => [button.label, button.customId])).toEqual([
      ['This month', 'stats:regions:show:month'],
      ['This year', 'stats:regions:show:year'],
      ['All time', 'stats:regions:show:all'],
    ]);
    // The period shown is pressed already (blue, and disabled).
    expect(periodStyles(message)).toEqual([
      ButtonStyle.Primary,
      ButtonStyle.Secondary,
      ButtonStyle.Secondary,
    ]);
  });

  it('gives this year and all time where asked', async () => {
    const made = await setup();
    const year = asV2(answered(await made.ask({ period: 'year' })));
    expect(textDisplays(year).slice(0, 2)).toEqual([
      '### Raids and max battles by region, this year\n' +
        `1. <#${WEST_CHANNEL}>: 14 raids, 1 max battle\n` +
        `2. <#${EAST_CHANNEL}>: 6 raids\n` +
        '3. Region 3: none',
      'No longer a region: 2 raids, 1 max battle\n**Total:** 22 raids, 2 max battles',
    ]);
    const all = asV2(answered(await made.ask({ period: 'all' })));
    expect(textDisplays(all)[0]).toBe(
      '### Raids and max battles by region, all time\n' +
        `1. <#${EAST_CHANNEL}>: 26 raids\n` +
        `2. <#${WEST_CHANNEL}>: 14 raids, 1 max battle\n` +
        '3. Region 3: none',
    );
    expect(periodStyles(all)).toEqual([
      ButtonStyle.Secondary,
      ButtonStyle.Secondary,
      ButtonStyle.Primary,
    ]);
  });

  it('leaves out a region whose forum keeps the member out, from its line and the total', async () => {
    const made = await setup();
    made.gateway.barred.set(EAST_FORUM, new Set([MISTY]));
    const misty = asV2(answered(await made.ask({}, MISTY)));
    expect(textDisplays(misty).slice(0, 2)).toEqual([
      '### Raids and max battles by region, this month\n' +
        `1. <#${WEST_CHANNEL}>: 4 raids, 1 max battle\n` +
        '2. Region 3: none',
      'No longer a region: 2 raids, 1 max battle\n**Total:** 6 raids, 2 max battles',
    ]);
    // Ash is not barred: he sees East.
    expect(textDisplays(asV2(answered(await made.ask()))).slice(0, 2)).toEqual(MONTH_BOARD);
  });

  it('leaves out a region whose forum the member cannot see by their roles, as one kept out (R-B)', async () => {
    const made = await setup();
    made.gateway.shutOut(EAST_FORUM, MISTY);
    const misty = asV2(answered(await made.ask({}, MISTY)));
    expect(textDisplays(misty)[0]).not.toContain(EAST_CHANNEL);
    expect(textDisplays(misty)[1]).toBe(
      'No longer a region: 2 raids, 1 max battle\n**Total:** 6 raids, 2 max battles',
    );
  });

  it('switches the period at once, or deferred when the read takes longer than a second (P5)', async () => {
    const made = await setup();
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const read = made.activity.regionSums.bind(made.activity);
    const asked = new Tally();
    vi.spyOn(made.activity, 'regionSums').mockImplementation(async (...args) => {
      asked.add();
      await held;
      return read(...args);
    });
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    vi.setSystemTime(NOW);
    const pressing = made.press('stats:regions:show:all');
    await asked.reached(1);
    await vi.advanceTimersByTimeAsync(LATE_DEFER_MS);
    release();
    const pressed = await pressing;
    expect(pressed.deferUpdate).toHaveBeenCalledTimes(1);
    expect(pressed.update).not.toHaveBeenCalled();
    expect(textDisplays(asV2(sent(pressed.editReply)))[0]).toMatch(/all time/u);
  });

  it('switches the period in the private answer itself', async () => {
    const made = await setup();
    const pressed = await made.press('stats:regions:show:year');
    const shown = asV2(sent(pressed.update));
    expect(textDisplays(shown)[0]).toMatch(/^### Raids and max battles by region, this year\n/u);
    expect(periodStyles(shown)).toEqual([
      ButtonStyle.Secondary,
      ButtonStyle.Primary,
      ButtonStyle.Secondary,
    ]);
    expect(pressed.reply).not.toHaveBeenCalled();
  });

  it('refuses a control of a period it does not know as no longer active', async () => {
    const made = await setup();
    const pressed = await made.press('stats:regions:show:decade');
    expect(sent(pressed.reply).content).toBe(STALE_COMPONENT);
  });

  it('is filed under Utility in /help and says what it counts (P9)', () => {
    expect(stats.help.category).toBe('util');
    const json = stats.data.toJSON();
    expect(json.options?.map((option) => option.name)).toEqual(['regions']);
    const details = String(stats.subcommands.get('regions')?.help?.details);
    expect(details.split('\n\n')[0]).toBe(
      'How many raids and max battles took place in each region of this server, the busiest ' +
        'first: this month, this year or all time. Only you see the answer.',
    );
    expect(details).toContain(
      'A raid or max battle counts whether or not anybody marked it done, unless it was deleted.',
    );
    // Nothing promised of the legacy bot's years, which only an imported history has (P6).
    expect(details).not.toMatch(/old bot/u);
  });
});
