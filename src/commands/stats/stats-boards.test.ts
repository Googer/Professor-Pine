import { ButtonStyle, MessageFlags } from 'discord.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { boardAttendee, boardRecord, keptReport } from '../../../test/support/board-cases.js';
import { boardsWith } from '../../../test/support/boards.js';
import {
  answered,
  asV2,
  fakeButton,
  fakeChatInput,
  FAKE_GUILD_ID,
  sent,
} from '../../../test/support/fake-interactions.js';
import { WEST_CHANNEL } from '../../../test/support/gyms.js';
import { buttonsOf, textDisplays, v2 } from '../../../test/support/messages.js';
import { createTestContext } from '../../../test/support/test-context.js';
import { zonedAt } from '../../../test/support/time.js';
import type { HistoryRecord } from '../../domain/history/party-history.js';
import { InteractionRouter, STALE_COMPONENT } from '../../discord/router.js';
import { BOARD_SHARE_REFUSED, BOARDS_UNNAMED, stats, statsControls } from './stats.js';

const ASH = '700000000000000001';
const MISTY = '700000000000000002';
const BROCK = '700000000000000003';
const GARY = '700000000000000004';
const ZONE = 'America/New_York';
const at = (local: string) => zonedAt(local, ZONE);
const NOW = at('2026-11-05T12:00');

/** A raid of this month by `maker` that another member completed. */
const raid = (maker: string, local: string, overrides: Partial<HistoryRecord> = {}) =>
  boardRecord({
    serverId: FAKE_GUILD_ID,
    createdById: maker,
    createdAt: at(local),
    attendees: [boardAttendee(maker, 'done'), boardAttendee(null, 'done')],
    ...overrides,
  });

/**
 * This month Ash reported 3 raids, Misty 2 (by the 3rd), Brock 2 (by the 4th) and Gary 1, who
 * left the server; Ash, Brock and Gary are on the boards, Misty is not. In March Brock reported 4.
 */
async function setup() {
  const made = boardsWith(ZONE);
  made.reader.records.push(
    raid(ASH, '2026-11-01T10:00'),
    raid(ASH, '2026-11-02T10:00'),
    raid(ASH, '2026-11-04T18:00'),
    raid(MISTY, '2026-11-02T11:00'),
    raid(MISTY, '2026-11-03T11:00'),
    raid(BROCK, '2026-11-02T12:00'),
    raid(BROCK, '2026-11-04T12:00'),
    raid(GARY, '2026-11-01T09:00'),
    ...Array.from({ length: 4 }, (_, n) => raid(BROCK, `2026-03-0${String(n + 1)}T10:00`)),
  );
  for (const id of [ASH, BROCK, GARY]) await made.optIns.joinBoards(id, FAKE_GUILD_ID, 1);
  made.members.add(ASH, 'Ash').add(MISTY, 'Misty').add(BROCK, 'Brock');
  const { ctx } = createTestContext(made.context);
  const router = new InteractionRouter(ctx, [stats], [statsControls]);
  const ask = async (options: Record<string, string> = {}, userId = ASH) => {
    const interaction = fakeChatInput({
      commandName: 'stats',
      subcommand: 'boards',
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
      displayName: userId === ASH ? 'Ash' : 'Misty',
      channelId: WEST_CHANNEL,
      askedBy: userId,
      ephemeralMessage: true,
      v2Message: true,
    });
    await router.handle(interaction as never);
    return interaction;
  };
  return { ...made, ctx, ask, press };
}

describe('/stats boards', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('answers privately with this month’s raids reported that others completed', async () => {
    const made = await setup();
    const payload = answered(await made.ask());
    expect((payload.flags ?? 0) & MessageFlags.Ephemeral).toBe(MessageFlags.Ephemeral);
    const message = asV2(payload);
    // Gary left the server: left out, and the ranks close up; Misty's switch is off.
    expect(textDisplays(message)).toEqual([
      '### Raids reported that others completed, this month\n1. Ash: 3 raids\n2. Brock: 2 raids',
    ]);
    expect(buttonsOf(message).map((button) => [button.label, button.customId])).toEqual([
      ['This month', 'stats:boards:show:raids:month'],
      ['This year', 'stats:boards:show:raids:year'],
      ['All time', 'stats:boards:show:raids:all'],
      ['Share in this channel', 'stats:boards:share:raids:month'],
    ]);
    expect(buttonsOf(message)[0]?.style).toBe(ButtonStyle.Primary);
    // Nobody is pinged by a board.
    expect(message.mention).toBeUndefined();
  });

  it('tells a member whose switch is off where they would be, and how to be on it', async () => {
    const made = await setup();
    const message = asV2(answered(await made.ask({}, MISTY)));
    expect(textDisplays(message)).toEqual([
      '### Raids reported that others completed, this month\n1. Ash: 3 raids\n2. Brock: 2 raids',
      '-# You would be #2 with 2 raids. Turn the boards on in `/settings` to be ranked.',
    ]);
  });

  it('counts only the named members above the viewer, as the board’s own ranks do (B2)', async () => {
    const made = await setup();
    // Gary, who left the server, now has the most; he is shown nowhere and counts for nobody.
    made.reader.records.push(
      ...Array.from({ length: 4 }, (_, n) => raid(GARY, `2026-11-0${String(n + 1)}T07:00`)),
    );
    const message = asV2(answered(await made.ask({}, MISTY)));
    expect(textDisplays(message)[1]).toBe(
      '-# You would be #2 with 2 raids. Turn the boards on in `/settings` to be ranked.',
    );
  });

  it('tells a member on the board outside its ten where they are', async () => {
    const made = await setup();
    const others = Array.from({ length: 10 }, (_, n) => `70000000000000010${String(n)}`);
    for (const [n, id] of others.entries()) {
      for (let k = 0; k < 4; k++)
        made.reader.records.push(raid(id, `2026-11-0${String((n % 4) + 1)}T08:0${String(k)}`));
      await made.optIns.joinBoards(id, FAKE_GUILD_ID, 1);
      made.members.add(id, `Trainer ${String(n)}`);
    }
    const message = asV2(answered(await made.ask()));
    const [board, place] = textDisplays(message);
    expect(board?.split('\n')).toHaveLength(11);
    expect(board).not.toContain('Ash');
    expect(place).toBe('-# You are #11 with 3 raids.');
    // At most fifty names are asked, the viewer's own never.
    expect(made.members.namedAsks.flat()).not.toContain(ASH);
  });

  it('counts no anonymous raid, and gives another period where asked', async () => {
    const made = await setup();
    made.reader.records.push(
      raid(BROCK, '2026-11-04T13:00', { anonymous: true }),
      raid(BROCK, '2026-11-04T14:00', { anonymous: true }),
    );
    const month = textDisplays(asV2(answered(await made.ask())))[0];
    expect(month).toContain('2. Brock: 2 raids');
    const year = textDisplays(asV2(answered(await made.ask({ period: 'year' }))))[0];
    expect(year).toBe(
      '### Raids reported that others completed, this year\n1. Brock: 6 raids\n2. Ash: 3 raids',
    );
  });

  it('shows the reports at stops that counted with their confirmations', async () => {
    const made = await setup();
    made.reader.reports.push(
      keptReport({
        serverId: FAKE_GUILD_ID,
        reporterId: BROCK,
        endedAt: NOW - 1,
        confirmations: 2,
      }),
      keptReport({ serverId: FAKE_GUILD_ID, reporterId: BROCK, endedAt: NOW - 2 }),
      keptReport({ serverId: FAKE_GUILD_ID, reporterId: ASH, endedAt: NOW - 3 }),
    );
    const board = textDisplays(asV2(answered(await made.ask({ board: 'reports' }))))[0];
    expect(board).toBe(
      '### Reports at stops that counted, this month\n' +
        '1. Brock: 2 reports (2 confirmations)\n2. Ash: 1 report',
    );
  });

  it('says where nobody is ranked yet', async () => {
    const made = await setup();
    const board = textDisplays(asV2(answered(await made.ask({ board: 'meetups' }))))[0];
    expect(board).toBe(
      '### Meetups hosted that others came to, this month\nNobody is ranked here this month.',
    );
  });

  it('lists the most wanted Pokémon of the latest day, by no period', async () => {
    const made = await setup();
    made.reader.wantDays.push(
      { serverId: FAKE_GUILD_ID, day: '2026-11-04', target: 'species:25', count: 9 },
      { serverId: FAKE_GUILD_ID, day: '2026-11-04', target: 'species:150', count: 12 },
    );
    const message = asV2(answered(await made.ask({ board: 'wanted', period: 'year' })));
    expect(textDisplays(message)).toEqual([
      '### The most wanted Pokémon\n1. Mewtwo: wanted by 12 members\n2. Pikachu: wanted by 9 members',
      '-# Wants on file as of 2026-11-04.',
    ]);
    expect(buttonsOf(message).map((button) => button.customId)).toEqual([
      'stats:boards:share:wanted:month',
    ]);
  });

  it('lists the bosses sent to the most members, by catalogue boss', async () => {
    const made = await setup();
    made.reader.records.push(raid(ASH, '2026-11-03T09:00', { reached: 40 }));
    made.reader.records.push(
      raid(ASH, '2026-11-03T10:00', {
        reached: 30,
        boss: { key: 'DIALGA', dex: 483, species: 'DIALGA', form: null },
      }),
    );
    const board = textDisplays(asV2(answered(await made.ask({ board: 'sent' }))))[0];
    expect(board).toBe(
      '### The bosses whose raids were sent to the most members, this month\n' +
        '1. Mewtwo: sent to 40 members\n2. Dialga: sent to 30 members',
    );
  });

  it('switches the period in the private answer itself', async () => {
    const made = await setup();
    const pressed = await made.press('stats:boards:show:raids:all');
    const message = asV2(sent(pressed.update));
    expect(textDisplays(message)[0]).toMatch(
      /^### Raids reported that others completed, all time\n1\. Brock: 6 raids/u,
    );
  });

  it('says so in words of its own where Discord cannot name the members, for the command, a press and Share (W5)', async () => {
    const made = await setup();
    const named = vi.spyOn(made.members, 'named').mockRejectedValue(new Error('Discord is away'));
    const asked = await made.ask();
    expect(answered(asked).content).toBe(BOARDS_UNNAMED);
    const pressed = await made.press('stats:boards:show:raids:all');
    expect(sent(pressed.reply).content).toBe(BOARDS_UNNAMED);
    const shared = await made.press('stats:boards:share:raids:year');
    expect(sent(shared.followUp).content).toBe(BOARDS_UNNAMED);
    expect(made.gateway.messagesIn(WEST_CHANNEL)).toEqual([]);
    expect(BOARDS_UNNAMED).toBe(
      'Discord is not giving me the names of members just now, so I cannot show the board. ' +
        'Try again in a moment.',
    );
    named.mockRestore();
  });

  it('refuses a control of a board it does not know as no longer active', async () => {
    const made = await setup();
    const pressed = await made.press('stats:boards:show:gyms:month');
    expect(sent(pressed.reply).content).toBe(STALE_COMPONENT);
  });

  it('posts the board as it is at the press, members on the board only, its sharer named', async () => {
    const made = await setup();
    const pressed = await made.press('stats:boards:share:raids:month', MISTY);
    const [posted, ...more] = made.gateway.messagesIn(WEST_CHANNEL);
    expect(more).toEqual([]);
    const message = v2(posted?.message);
    expect(textDisplays(message)).toEqual([
      '### Raids reported that others completed, this month\n1. Ash: 3 raids\n2. Brock: 2 raids',
      '-# Shared by **Misty**',
    ]);
    expect(buttonsOf(message)).toEqual([]);
    expect(sent(pressed.followUp).content).toBe('Shared in this channel.');
  });

  it('says so where the bot may not post, in words of its own, posting nothing (B8)', async () => {
    const made = await setup();
    made.gateway.noSharing.add(WEST_CHANNEL);
    const pressed = await made.press('stats:boards:share:raids:month');
    expect(sent(pressed.reply).content).toBe(BOARD_SHARE_REFUSED);
    expect(BOARD_SHARE_REFUSED).toBe(
      'I may not post in this channel, so I cannot share the board here. Try a channel ' +
        'where I can post.',
    );
    expect(made.gateway.messagesIn(WEST_CHANNEL)).toEqual([]);
  });

  it('shares three times in ten minutes, the region tally’s Shares counted with them (B7)', async () => {
    const made = await setup();
    await made.press('stats:regions:share:month');
    await made.press('stats:boards:share:raids:month');
    await made.press('stats:boards:share:sent:month');
    const fourth = await made.press('stats:boards:share:raids:year');
    expect(sent(fourth.reply).content).toBe('That was a lot of clicks. Try again in 10 minutes.');
    expect(made.gateway.messagesIn(WEST_CHANNEL)).toHaveLength(3);
  });

  it('says in its help what it ranks, and that a shared board is a snapshot', () => {
    const details = stats.subcommands.get('boards')?.help?.details;
    const text = typeof details === 'string' ? details : '';
    expect(text).toContain('turned the boards on in `/settings`');
    expect(text.split('\n\n')).toEqual([
      'The top ten of this month, this year or all time, on one board: raids reported that ' +
        'others completed, trains conducted and meetups hosted that others came to, or reports ' +
        'at stops that counted. Only you see the answer.',
      'Only members who turned the boards on in `/settings` are ranked, and an anonymous raid, ' +
        'max battle or train counts for nobody. If you are not in the top ten, the answer says where you ' +
        'are, or would be.',
      'A report at a stop counts unless another member said it was wrong. If more of your ' +
        'reports were said to be wrong than were confirmed, only the confirmed ones count.',
      'Three boards name nobody: the most wanted Pokémon, the bosses whose raids were sent to ' +
        'the most members, and the field research tasks reported most.',
      '"Share in this channel" posts the board here for everybody, with your name. It is a ' +
        'snapshot: the board as it was when you shared it.',
    ]);
  });
});
