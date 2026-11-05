import { MessageFlags, OverwriteType, PermissionFlagsBits } from 'discord.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { boardAttendee, boardRecord, keptReport } from '../../../test/support/board-cases.js';
import { boardsWith } from '../../../test/support/boards.js';
import {
  answered,
  asV2,
  fakeAutocomplete,
  fakeButton,
  fakeChatInput,
  FAKE_GUILD_ID,
  sent,
} from '../../../test/support/fake-interactions.js';
import { EAST_FORUM, WEST_CHANNEL } from '../../../test/support/gyms.js';
import { buttonsOf, textDisplays, v2 } from '../../../test/support/messages.js';
import { createTestContext } from '../../../test/support/test-context.js';
import { zonedAt } from '../../../test/support/time.js';
import type { HistoryRecord } from '../../domain/history/party-history.js';
import { InteractionRouter, STALE_COMPONENT } from '../../discord/router.js';
import { stats, statsControls } from './stats.js';

const ASH = '700000000000000001';
const MISTY = '700000000000000002';
const ZONE = 'America/New_York';
const at = (local: string) => zonedAt(local, ZONE);
const NOW = at('2026-11-05T12:00');
const DIALGA = { key: 'DIALGA', dex: 483, species: 'DIALGA', form: null };

const record = (local: string, overrides: Partial<HistoryRecord> = {}) =>
  boardRecord({ serverId: FAKE_GUILD_ID, createdAt: at(local), ...overrides });

/**
 * Ash, opted in: this year she reported two raids others completed (one anonymous, sent to 10
 * and 20 members), completed them and a Dialga raid of Misty's in East, rode a train in West, and
 * a report of hers stood twice confirmed (sent to 5); in 2024 she was interested in a raid.
 */
async function setup() {
  const made = boardsWith(ZONE);
  const others = [boardAttendee(ASH, 'done'), boardAttendee(null, 'done')];
  made.reader.records.push(
    record('2026-03-01T10:00', { createdById: ASH, attendees: others, reached: 10 }),
    record('2026-04-01T10:00', {
      createdById: ASH,
      attendees: others,
      reached: 20,
      anonymous: true,
      regionId: 2,
    }),
    record('2026-05-01T10:00', {
      createdById: MISTY,
      boss: DIALGA,
      regionId: 2,
      attendees: [boardAttendee(MISTY, 'done'), boardAttendee(ASH, 'done')],
    }),
    record('2026-06-01T10:00', {
      kind: 'train',
      boss: null,
      createdById: MISTY,
      regionId: 2,
      attendees: [boardAttendee(MISTY, 'here'), boardAttendee(ASH, 'here')],
    }),
    record('2024-02-01T10:00', {
      createdById: MISTY,
      attendees: [boardAttendee(ASH, 'interested')],
    }),
  );
  made.reader.reports.push(
    keptReport({
      serverId: FAKE_GUILD_ID,
      reporterId: ASH,
      endedAt: at('2026-07-01T10:00'),
      confirmations: 2,
      reach: 5,
    }),
  );
  await made.optIns.optIn(ASH, FAKE_GUILD_ID, 1);
  const { ctx } = createTestContext(made.context);
  const router = new InteractionRouter(ctx, [stats], [statsControls]);
  const ask = async (options: Record<string, number> = {}, userId = ASH) => {
    const interaction = fakeChatInput({
      commandName: 'stats',
      subcommand: 'me',
      userId,
      displayName: userId === ASH ? 'Ash' : 'Misty',
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
      displayName: 'Ash',
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

const ALL_TIME = [
  '### Your Pine, all time\n' +
    'Raids and max battles reported that others completed: **2** (1 anonymous, on no board)\n' +
    'Trains conducted that others came to: **0**\n' +
    'Meetups hosted that others came to: **0**\n' +
    'Reports at stops that counted: **1** (2 confirmations)',
  'Raids and max battles completed: **3**\n' +
    'Trains ridden: **1** · Meetups attended: **0**\n' +
    `Busiest region: <#${'%EAST%'}>\n` +
    'Bosses done most: Mewtwo (2), Dialga (1)\n' +
    'Raids, max battles, trains and reports sent to **35** members',
];

describe('/stats me', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('answers privately with the member’s own numbers of all time', async () => {
    const made = await setup();
    const payload = answered(await made.ask());
    expect((payload.flags ?? 0) & MessageFlags.Ephemeral).toBe(MessageFlags.Ephemeral);
    const message = asV2(payload);
    const east = made.ctx.regions.byId(2)?.channelId ?? '';
    expect(textDisplays(message)).toEqual(ALL_TIME.map((text) => text.replace('%EAST%', east)));
    expect(buttonsOf(message).map((button) => [button.label, button.customId])).toEqual([
      ['Share in this channel', 'stats:me:share:all'],
    ]);
  });

  it('keeps to a year where asked, and says where the year has nothing', async () => {
    const made = await setup();
    const year = textDisplays(asV2(answered(await made.ask({ year: 2026 }))));
    expect(year[0]).toMatch(/^### Your Pine in 2026\n/u);
    expect(year[1]).toMatch(/^Raids and max battles completed: \*\*3\*\*/u);
    // 2024 holds only a raid she was interested in: nothing a card counts (A9).
    for (const empty of [2019, 2024]) {
      const none = answered(await made.ask({ year: empty }));
      expect(textDisplays(asV2(none))).toEqual([
        `Nothing of yours is in my history of this server for ${String(empty)}.`,
      ]);
      expect(buttonsOf(asV2(none))).toEqual([]);
    }
  });

  it('offers the member’s own years as they type', async () => {
    const made = await setup();
    const typing = fakeAutocomplete({
      commandName: 'stats',
      subcommand: 'me',
      userId: ASH,
      focused: '',
      focusedName: 'year',
    });
    await made.router.handle(typing as never);
    expect(typing.respond).toHaveBeenCalledWith([{ name: '2026', value: 2026 }]);
  });

  it('tells a member without the history opt-in what would be counted, and how to turn it on', async () => {
    const made = await setup();
    const message = asV2(answered(await made.ask({}, MISTY)));
    expect(textDisplays(message)).toEqual([
      'Your history opt-in is off in this server, so nothing kept here carries your name to ' +
        'count. With `/settings history enabled:True`, from then on I count the raids and max ' +
        'battles you report that others complete, the trains you conduct and the meetups you ' +
        'host that others come to, your reports at stops that count, what you complete and come ' +
        'to, and how many members what you report is sent to.',
    ]);
    expect(buttonsOf(message)).toEqual([]);
  });

  it('shares the card as it is at the press, without anything anonymous, its sharer named', async () => {
    const made = await setup();
    const pressed = await made.press('stats:me:share:all');
    const [posted, ...more] = made.gateway.messagesIn(WEST_CHANNEL);
    expect(more).toEqual([]);
    const message = v2(posted?.message);
    const texts = textDisplays(message);
    expect(texts[0]).toBe(
      '### Pine of **Ash**, all time\n' +
        'Raids and max battles reported that others completed: **1**\n' +
        'Trains conducted that others came to: **0**\n' +
        'Meetups hosted that others came to: **0**\n' +
        'Reports at stops that counted: **1** (2 confirmations)',
    );
    expect(texts[1]).toContain('Raids and max battles completed: **2**');
    expect(texts[1]).toContain('sent to **15** members');
    // Named once, in its title: no "Shared by" under it (B8).
    expect(texts).toHaveLength(2);
    expect(buttonsOf(message)).toEqual([]);
    expect(sent(pressed.followUp).content).toBe('Shared in this channel.');
  });

  it('leaves the busiest region out of a share where not everyone who sees the channel sees it', async () => {
    const made = await setup();
    made.gateway.forumOverwrites.set(EAST_FORUM, [
      {
        id: made.gateway.guildId,
        type: OverwriteType.Role,
        allow: '0',
        deny: String(PermissionFlagsBits.ViewChannel),
      },
    ]);
    await made.press('stats:me:share:all');
    const [posted] = made.gateway.messagesIn(WEST_CHANNEL);
    expect(textDisplays(v2(posted?.message))[1]).not.toContain('Busiest region');
  });

  it('says so where the bot may not post, in words of its own, posting nothing (B8)', async () => {
    const made = await setup();
    made.gateway.noSharing.add(WEST_CHANNEL);
    const pressed = await made.press('stats:me:share:2026');
    expect(sent(pressed.reply).content).toBe(
      'I may not post in this channel, so I cannot share your numbers here. Try it in a ' +
        'channel where I can post.',
    );
    expect(made.gateway.messagesIn(WEST_CHANNEL)).toEqual([]);
  });

  it('shares nothing for a member who opted out since, and gives the use back (B7)', async () => {
    const made = await setup();
    await made.optIns.optOut(ASH, FAKE_GUILD_ID);
    const pressed = await made.press('stats:me:share:all');
    expect(sent(pressed.followUp).content).toBe(
      'Your history is off in this server now, so I did not share your numbers. ' +
        '`/settings history enabled:True` turns it back on.',
    );
    expect(made.gateway.messagesIn(WEST_CHANNEL)).toEqual([]);
    await made.optIns.optIn(ASH, FAKE_GUILD_ID, 1);
    for (let n = 0; n < 3; n++) await made.press('stats:me:share:all');
    expect(made.gateway.messagesIn(WEST_CHANNEL)).toHaveLength(3);
  });

  it('refuses a Share it cannot read as no longer active (B7)', async () => {
    const made = await setup();
    for (const customId of ['stats:me:share:26', 'stats:me:share', 'stats:me:show:all']) {
      const pressed = await made.press(customId);
      expect(sent(pressed.reply).content, customId).toBe(STALE_COMPONENT);
    }
  });

  it('counts its Shares in the window of every /stats Share (B7)', async () => {
    const made = await setup();
    await made.press('stats:regions:share:month');
    await made.press('stats:boards:share:raids:month');
    await made.press('stats:me:share:all');
    const fourth = await made.press('stats:me:share:all');
    expect(sent(fourth.reply).content).toBe('That was a lot of clicks. Try again in 10 minutes.');
  });

  it('keeps the busiest region in a share where everyone who sees the channel sees it (B7)', async () => {
    const made = await setup();
    await made.press('stats:me:share:all');
    const [posted] = made.gateway.messagesIn(WEST_CHANNEL);
    const east = made.ctx.regions.byId(2)?.channelId ?? '';
    expect(textDisplays(v2(posted?.message))[1]).toContain(`Busiest region: <#${east}>`);
  });

  it('reads a member’s years once for the keystrokes of a moment (B10)', async () => {
    const made = await setup();
    const reads = made.reader.reads;
    for (const focused of ['', '2', '20']) {
      const typing = fakeAutocomplete({
        commandName: 'stats',
        subcommand: 'me',
        userId: ASH,
        focused,
        focusedName: 'year',
      });
      await made.router.handle(typing as never);
    }
    // The first keystroke reads; the next two take its answer.
    const perAsk = made.reader.reads - reads;
    const once = boardsWith(ZONE);
    await once.optIns.optIn(ASH, FAKE_GUILD_ID, 1);
    await once.memberStats.years(FAKE_GUILD_ID, ASH);
    expect(perAsk).toBe(once.reader.reads);
  });
});
