import { describe, expect, it } from 'vitest';
import { EAST_CHANNEL, WEST_CHANNEL } from '../../test/support/gyms.js';
import { MOD_CHANNEL } from '../../test/support/meetup-safety-service.js';
import { REPORT_SERVER as SERVER, reportsWith } from '../../test/support/reports-service.js';
import type { ListTierNotice } from '../render/moderation.js';

const DAY = 24 * 3_600_000;

const SNEASEL: ListTierNotice = {
  serverId: SERVER,
  channelId: WEST_CHANNEL,
  family: 'max',
  bossKey: 'sneasel',
  name: 'Sneasel',
  pokemon: 'sneasel',
  listTier: 'D1',
  headsTier: 'D2',
  count: 3,
};

/** The texts the moderators' channel got, in order. */
const notes = (made: Awaited<ReturnType<typeof reportsWith>>) =>
  made.gateway
    .messagesIn(MOD_CHANNEL)
    .map((sent) => (sent.message.v2 ? undefined : sent.message.content));

describe('ModerationReports: screenshots that disagree with the boss list (plan 8X-J)', () => {
  it('tells the moderators once per boss, list tier and heads tier in seven days', async () => {
    const made = await reportsWith();
    expect(made.reports.listTier(SNEASEL)).toBe(true);
    await made.reports.flush();
    expect(notes(made)).toEqual([
      'Screenshots show **Dynamax Sneasel** with 2 heads (2★) 3 times since yesterday, but the ' +
        'boss list has it at 1★. If the game has it at 2★, this would move it there: ' +
        '`/admin boss add pokemon:sneasel tier:Dynamax 2★ days:7`',
    ]);
    // A fourth screenshot, from another channel: the staff know already.
    expect(made.reports.listTier({ ...SNEASEL, channelId: EAST_CHANNEL, count: 4 })).toBe(true);
    await made.reports.flush();
    expect(notes(made)).toHaveLength(1);
    // Other heads are another note.
    made.reports.listTier({ ...SNEASEL, headsTier: 'D3' });
    await made.reports.flush();
    expect(notes(made)).toHaveLength(2);
    made.clock.now += 7 * DAY;
    made.reports.listTier(SNEASEL);
    await made.reports.flush();
    expect(notes(made)).toHaveLength(3);
  });

  it('logs a line without the moderators’ channel, with no member and no boss', async () => {
    const made = await reportsWith({ moderation: null });
    expect(made.reports.listTier(SNEASEL)).toBe(false);
    await made.reports.flush();
    expect(made.gateway.messagesIn(MOD_CHANNEL)).toEqual([]);
    const entry = made.entries.find(
      (logged) => logged.msg === 'screenshots disagree with the boss list',
    );
    expect(entry).toMatchObject({ server: SERVER, channel: WEST_CHANNEL });
  });

  it('forgets a note Discord refused, so that the next screenshot sends it', async () => {
    const made = await reportsWith();
    made.gateway.failing.set('sendMessage', new Error('Missing Permissions'));
    expect(made.reports.listTier(SNEASEL)).toBe(true);
    await made.reports.flush();
    expect(made.gateway.messagesIn(MOD_CHANNEL)).toEqual([]);
    made.gateway.failing.delete('sendMessage');
    made.reports.listTier(SNEASEL);
    await made.reports.flush();
    expect(made.gateway.messagesIn(MOD_CHANNEL)).toHaveLength(1);
  });
});
