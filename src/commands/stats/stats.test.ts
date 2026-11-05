import { ButtonStyle, MessageFlags, OverwriteType, PermissionFlagsBits } from 'discord.js';
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
import {
  archivedThread,
  FakePartyGateway,
  missingPermissions,
} from '../../../test/support/fake-gateway.js';
import {
  EAST_CHANNEL,
  EAST_FORUM,
  UNBOUNDED_CHANNEL,
  WEST_CHANNEL,
} from '../../../test/support/gyms.js';
import { buttonsOf, textDisplays, v2 } from '../../../test/support/messages.js';
import { regionBoardsWith } from '../../../test/support/region-boards.js';
import { createTestContext } from '../../../test/support/test-context.js';
import { Tally } from '../../../test/support/tally.js';
import { zonedAt } from '../../../test/support/time.js';
import type { V2Message } from '../../discord/party-gateway.js';
import { InteractionRouter, STALE_COMPONENT } from '../../discord/router.js';
import { LATE_DEFER_MS } from '../../discord/late-reply.js';
import { SHARE_REFUSED, SHARE_UNKNOWN, stats, statsControls } from './stats.js';

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
      displayName: userId === ASH ? 'Ash' : 'Misty',
      channelId: WEST_CHANNEL,
      askedBy: userId,
      ephemeralMessage: true,
      v2Message: true,
    });
    await router.handle(interaction as never);
    return interaction;
  };
  return { ...made, ctx, router, ask, press };
}

/** A role of the fakes' server: the members' role, a moderators' role, a muted role. */
const MEMBER_ROLE = '800000000000000001';
const MOD_ROLE = '800000000000000002';
const view = String(PermissionFlagsBits.ViewChannel);

/** An overwrite of a role. */
const roleOverwrite = (id: string, allow: string, deny: string) => ({
  id,
  type: OverwriteType.Role,
  allow,
  deny,
});

/**
 * East's forum as a moderators' region: the members' role kept out, the moderators' role let in;
 * Ash holds both (so he sees East), Misty the members' role.
 */
function moderatorsEast(gateway: FakePartyGateway): void {
  gateway.serverRoles.set(MEMBER_ROLE, { name: 'Member', permissions: 0n });
  gateway.serverRoles.set(MOD_ROLE, { name: 'Moderator', permissions: 0n });
  gateway.memberRoles.set(ASH, [MEMBER_ROLE, MOD_ROLE]);
  gateway.memberRoles.set(MISTY, [MEMBER_ROLE]);
  gateway.forumOverwrites.set(EAST_FORUM, [
    roleOverwrite(gateway.guildId, '0', view),
    roleOverwrite(MOD_ROLE, view, '0'),
  ]);
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
      ['This month', 'stats:regions:show:month:none'],
      ['This year', 'stats:regions:show:year:none'],
      ['All time', 'stats:regions:show:all:none'],
      ['Share in this channel', 'stats:regions:share:month'],
    ]);
    // Every region is public: nothing is said of what a share leaves out.
    expect(textDisplays(message)).toHaveLength(2);
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

  it('judges a region without a forum by its text channel (8H5-2)', async () => {
    const made = await setup();
    made.gateway.shutOut(UNBOUNDED_CHANNEL, MISTY);
    const misty = asV2(answered(await made.ask({}, MISTY)));
    expect(textDisplays(misty)[0]).not.toContain('Region 3');
    expect(textDisplays(asV2(answered(await made.ask()))).slice(0, 2)).toEqual(MONTH_BOARD);
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
    const pressing = made.press('stats:regions:show:all:none');
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
    const pressed = await made.press('stats:regions:show:year:none');
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
    for (const customId of [
      'stats:regions:show:decade:none',
      'stats:regions:show:year',
      'stats:regions:show:year:maybe',
    ]) {
      const pressed = await made.press(customId);
      expect(sent(pressed.reply).content, customId).toBe(STALE_COMPONENT);
    }
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

describe('Share of the region board', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('posts the board as it is at the press in the channel, the member named, and says so privately', async () => {
    const made = await setup();
    // A raid recorded since the answer was drawn: the share counts it, and West ties East (by id).
    await made.activity.add(FAKE_GUILD_ID, [
      activityBucket(1, '2026-11', 4, 9, { regionId: 1, raids: 1, maxes: 0 }),
    ]);
    const pressed = await made.press('stats:regions:share:month');
    const [posted, ...more] = made.gateway.messagesIn(WEST_CHANNEL);
    expect(more).toEqual([]);
    const message = v2(posted?.message);
    expect(textDisplays(message)).toEqual([
      '### Raids and max battles by region, this month\n' +
        `1. <#${WEST_CHANNEL}>: 5 raids, 1 max battle\n` +
        `2. <#${EAST_CHANNEL}>: 6 raids\n` +
        '3. Region 3: none',
      'No longer a region: 2 raids, 1 max battle\n**Total:** 13 raids, 2 max battles',
      '-# Shared by **Ash**',
    ]);
    // Nothing on it to press, and nobody pinged.
    expect(buttonsOf(message)).toEqual([]);
    expect(message.mention).toBeUndefined();
    expect(sent(pressed.followUp).content).toBe('Shared in this channel.');
    expect((sent(pressed.followUp).flags ?? 0) & MessageFlags.Ephemeral).toBe(
      MessageFlags.Ephemeral,
    );
  });

  it('shares this year’s or all time’s board, as the answer showed', async () => {
    const made = await setup();
    await made.press('stats:regions:share:all');
    const [posted] = made.gateway.messagesIn(WEST_CHANNEL);
    expect(textDisplays(v2(posted?.message))[0]).toMatch(
      /^### Raids and max battles by region, all time\n1\. <#\d+>: 26 raids\n/u,
    );
  });

  it('leaves out of a share a region somebody who sees the channel may not see, and the private answer says so (R-A)', async () => {
    const made = await setup();
    moderatorsEast(made.gateway);
    const answer = asV2(answered(await made.ask()));
    // Ash sees East: it is on his own board.
    expect(textDisplays(answer).slice(0, 2)).toEqual(MONTH_BOARD);
    expect(textDisplays(answer)[2]).toBe(
      '-# Shared here, the board leaves out the regions not everyone who sees this channel can see.',
    );
    await made.press('stats:regions:share:month');
    const [posted] = made.gateway.messagesIn(WEST_CHANNEL);
    expect(textDisplays(v2(posted?.message)).slice(0, 2)).toEqual([
      '### Raids and max battles by region, this month\n' +
        `1. <#${WEST_CHANNEL}>: 4 raids, 1 max battle\n` +
        '2. Region 3: none',
      'No longer a region: 2 raids, 1 max battle\n**Total:** 6 raids, 2 max battles',
    ]);
  });

  it('carries the note under Share in the period buttons, asking nothing of the channel at a press (8H5-4)', async () => {
    const made = await setup();
    moderatorsEast(made.gateway);
    const keeps = vi.spyOn(made.gateway, 'shareKeeps');
    const answer = asV2(answered(await made.ask()));
    expect(buttonsOf(answer).map((button) => button.customId)).toEqual([
      'stats:regions:show:month:note',
      'stats:regions:show:year:note',
      'stats:regions:show:all:note',
      'stats:regions:share:month',
    ]);
    expect(keeps).toHaveBeenCalledTimes(1);
    const year = asV2(sent((await made.press('stats:regions:show:year:note')).update));
    expect(textDisplays(year)[2]).toBe(
      '-# Shared here, the board leaves out the regions not everyone who sees this channel can see.',
    );
    expect(buttonsOf(year)[0]?.customId).toBe('stats:regions:show:month:note');
    const plain = asV2(sent((await made.press('stats:regions:show:year:none')).update));
    expect(textDisplays(plain)).toHaveLength(2);
    expect(keeps).toHaveBeenCalledTimes(1);
  });

  it('says nothing under Share where it would drop only a region the member does not see (R-B)', async () => {
    const made = await setup();
    moderatorsEast(made.gateway);
    const misty = asV2(answered(await made.ask({}, MISTY)));
    expect(textDisplays(misty)[0]).not.toContain(EAST_CHANNEL);
    expect(textDisplays(misty)).toHaveLength(2);
  });

  it('keeps a region shared among those who all see it: a moderators’ channel on a gated server', async () => {
    const made = await setup();
    moderatorsEast(made.gateway);
    // A gated server: everyone sees nothing, the members' role every channel.
    made.gateway.serverRoles.set(made.gateway.guildId, { name: '@everyone', permissions: 0n });
    made.gateway.serverRoles.set(MEMBER_ROLE, {
      name: 'Member',
      permissions: PermissionFlagsBits.ViewChannel,
    });
    await made.press('stats:regions:share:month');
    const [general] = made.gateway.messagesIn(WEST_CHANNEL);
    expect(textDisplays(v2(general?.message))[0]).not.toContain(EAST_CHANNEL);
    // Shared in a channel only the moderators see, East stays.
    made.gateway.forumOverwrites.set(EAST_CHANNEL, [
      roleOverwrite(MEMBER_ROLE, '0', view),
      roleOverwrite(MOD_ROLE, view, '0'),
    ]);
    const pressed = fakeButton({
      customId: 'stats:regions:share:month',
      userId: ASH,
      displayName: 'Ash',
      channelId: EAST_CHANNEL,
      askedBy: ASH,
      ephemeralMessage: true,
      v2Message: true,
    });
    await made.router.handle(pressed as never);
    const [mods] = made.gateway.messagesIn(EAST_CHANNEL);
    expect(textDisplays(v2(mods?.message))[0]).toContain(`<#${EAST_CHANNEL}>: 6 raids`);
  });

  it('judges a share in a post by the forum it is in', async () => {
    const made = await setup();
    moderatorsEast(made.gateway);
    const post =
      (await made.gateway.createPost(EAST_FORUM, {
        title: 'Raids',
        message: { content: 'x' },
        tagIds: [],
      })) ?? '';
    const pressed = fakeButton({
      customId: 'stats:regions:share:month',
      userId: ASH,
      displayName: 'Ash',
      channelId: post,
      askedBy: ASH,
      ephemeralMessage: true,
      v2Message: true,
    });
    await made.router.handle(pressed as never);
    // Only the moderators see East's forum: its board keeps East.
    const shared = made.gateway.messagesIn(post).at(-1);
    expect(textDisplays(v2(shared?.message))[0]).toContain(`<#${EAST_CHANNEL}>: 6 raids`);
  });

  it('shares a public region its sharer is kept out of, as everyone sees it', async () => {
    const made = await setup();
    made.gateway.barred.set(EAST_FORUM, new Set([MISTY]));
    await made.press('stats:regions:share:month', MISTY);
    const [posted] = made.gateway.messagesIn(WEST_CHANNEL);
    expect(textDisplays(v2(posted?.message))[0]).toContain(`1. <#${EAST_CHANNEL}>: 6 raids`);
    expect(textDisplays(v2(posted?.message))[2]).toBe('-# Shared by **Misty**');
  });

  it('says so where the bot may not post, posting nothing and counting no use', async () => {
    const made = await setup();
    made.gateway.noSharing.add(WEST_CHANNEL);
    const first = await made.press('stats:regions:share:month');
    expect(sent(first.reply).content).toBe(SHARE_REFUSED);
    made.gateway.noSharing.delete(WEST_CHANNEL);
    made.gateway.failing.set('sendMessage', missingPermissions('POST'));
    const refused = await made.press('stats:regions:share:month');
    expect(sent(refused.followUp).content).toBe(SHARE_REFUSED);
    expect(made.gateway.messagesIn(WEST_CHANNEL)).toEqual([]);
    // None of the refusals counted: three shares are still to be had.
    made.gateway.failing.delete('sendMessage');
    for (let n = 0; n < 3; n++) {
      const pressed = await made.press('stats:regions:share:month');
      expect(sent(pressed.followUp).content).toBe('Shared in this channel.');
    }
    expect(made.gateway.messagesIn(WEST_CHANNEL)).toHaveLength(3);
  });

  it('refuses in words in an ended post (archived and locked), never opening it, counting no use', async () => {
    const made = await setup();
    const post =
      (await made.gateway.createPost(EAST_FORUM, {
        title: 'Raids',
        message: { content: 'x' },
        tagIds: [],
      })) ?? '';
    await made.gateway.archivePost(post);
    const before = made.gateway.messagesIn(post).length;
    const pressIn = async () => {
      const pressed = fakeButton({
        customId: 'stats:regions:share:month',
        userId: ASH,
        displayName: 'Ash',
        channelId: post,
        askedBy: ASH,
        ephemeralMessage: true,
        v2Message: true,
      });
      await made.router.handle(pressed as never);
      return pressed;
    };
    for (let n = 0; n < 4; n++) {
      const pressed = await pressIn();
      expect(sent(pressed.reply).content).toBe(SHARE_REFUSED);
    }
    expect(made.gateway.messagesIn(post)).toHaveLength(before);
    expect(made.gateway.posts.get(post)).toMatchObject({ archived: true, locked: true });
  });

  it('refuses in words where Discord says the post is archived (50083), counting no use', async () => {
    const made = await setup();
    made.gateway.failing.set('sendMessage', archivedThread('POST'));
    for (let n = 0; n < 4; n++) {
      const pressed = await made.press('stats:regions:share:month');
      expect(sent(pressed.followUp).content).toBe(SHARE_REFUSED);
    }
    made.gateway.failing.delete('sendMessage');
    const shared = await made.press('stats:regions:share:month');
    expect(sent(shared.followUp).content).toBe('Shared in this channel.');
  });

  it('refuses in words where it cannot tell who sees the channel, posting nothing (R3)', async () => {
    const made = await setup();
    const UNKNOWN = '600000000000000999';
    const pressed = fakeButton({
      customId: 'stats:regions:share:month',
      userId: ASH,
      displayName: 'Ash',
      channelId: UNKNOWN,
      askedBy: ASH,
      ephemeralMessage: true,
      v2Message: true,
    });
    await made.router.handle(pressed as never);
    expect(sent(pressed.followUp).content).toBe(SHARE_UNKNOWN);
    expect(made.gateway.messagesIn(UNKNOWN)).toEqual([]);
    // The use was given back: three shares are still to be had where it can.
    for (let n = 0; n < 3; n++) {
      const share = await made.press('stats:regions:share:month');
      expect(sent(share.followUp).content).toBe('Shared in this channel.');
    }
  });

  it('shares three times in ten minutes at most, apart from switching the period', async () => {
    const made = await setup();
    for (let n = 0; n < 3; n++) await made.press('stats:regions:share:month');
    const fourth = await made.press('stats:regions:share:month');
    expect(sent(fourth.reply).content).toBe('That was a lot of clicks. Try again in 10 minutes.');
    expect(made.gateway.messagesIn(WEST_CHANNEL)).toHaveLength(3);
    const switched = await made.press('stats:regions:show:year:none');
    expect(textDisplays(asV2(sent(switched.update)))[0]).toMatch(/this year/u);
  });
});
