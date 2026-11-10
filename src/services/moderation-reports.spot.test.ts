import { describe, expect, it } from 'vitest';
import { EAST_CHANNEL, WEST_CHANNEL } from '../../test/support/gyms.js';
import { MOD_CHANNEL } from '../../test/support/meetup-safety-service.js';
import { REPORT_SERVER as SERVER, reportsWith } from '../../test/support/reports-service.js';

const DAY = 24 * 3_600_000;
const OTHER_SERVER = '412345678901234599';

/** The texts the moderators' channel got, in order. */
const notes = (made: Awaited<ReturnType<typeof reportsWith>>) =>
  made.gateway
    .messagesIn(MOD_CHANNEL)
    .map((sent) => (sent.message.v2 ? undefined : sent.message.content));

describe('ModerationReports: a Power Spot Pine may be missing (plan 8X-S)', () => {
  it('tells the moderators once per name and server in seven days, and says it did', async () => {
    const made = await reportsWith();
    const spot = (name: string, serverId = SERVER, channelId = WEST_CHANNEL) =>
      made.reports.missingSpot({ serverId, channelId, name });
    expect(spot("JUNIPER'S SWING CORNER")).toBe(true);
    await made.reports.flush();
    expect(notes(made)).toEqual([
      `A screenshot in <#${WEST_CHANNEL}> showed the Power Spot "JUNIPER'S SWING CORNER", which ` +
        'Pine does not know. A new Wayspot export may be due (`/gym import`).',
    ]);
    // The same name read without its space, from another channel: the staff know already.
    expect(spot("JUNIPER'SSWING CORNER", SERVER, EAST_CHANNEL)).toBe(true);
    await made.reports.flush();
    expect(notes(made)).toHaveLength(1);
    // Another server's moderators are told of it on their own.
    expect(spot("JUNIPER'S SWING CORNER", OTHER_SERVER)).toBe(true);
    await made.reports.flush();
    expect(notes(made)).toHaveLength(2);
    // Seven days on, once more.
    made.clock.now += 7 * DAY;
    expect(spot("JUNIPER'S SWING CORNER")).toBe(true);
    await made.reports.flush();
    expect(notes(made)).toHaveLength(3);
  });

  it('shows the name read as plain text, cut short', async () => {
    const made = await reportsWith();
    made.reports.missingSpot({
      serverId: SERVER,
      channelId: WEST_CHANNEL,
      name: `**BOLD** ${'X'.repeat(100)}`,
    });
    await made.reports.flush();
    const [note] = notes(made);
    expect(note).toContain('"\\*\\*BOLD\\*\\* XXXX');
    expect(note).toContain('…", which Pine');
  });

  it('says nothing was told without the moderators’ channel, and logs where but not the name', async () => {
    for (const safety of [{ moderation: null }, { channel: false }]) {
      const made = await reportsWith(safety);
      expect(
        made.reports.missingSpot({ serverId: SERVER, channelId: WEST_CHANNEL, name: 'NEW SPOT' }),
      ).toBe(false);
      await made.reports.flush();
      expect(made.gateway.messagesIn(MOD_CHANNEL)).toEqual([]);
      // The server and the channel only: what a member's screenshot showed stays out of the log.
      const entry = made.entries.find(
        (logged) => logged.msg === 'a screenshot showed a Power Spot Pine does not know',
      );
      expect(entry).toMatchObject({ server: SERVER, channel: WEST_CHANNEL });
      expect(JSON.stringify(entry)).not.toContain('NEW SPOT');
    }
  });

  // Review r4 B7.
  it('forgets a note Discord refused, so that the next screenshot sends it, and logs no name', async () => {
    const made = await reportsWith();
    const spot = () =>
      made.reports.missingSpot({ serverId: SERVER, channelId: WEST_CHANNEL, name: 'NEW SPOT' });
    made.gateway.failing.set('sendMessage', new Error('Missing Permissions'));
    expect(spot()).toBe(true);
    await made.reports.flush();
    expect(made.gateway.messagesIn(MOD_CHANNEL)).toEqual([]);
    expect(JSON.stringify(made.entries)).not.toContain('NEW SPOT');
    made.gateway.failing.delete('sendMessage');
    expect(spot()).toBe(true);
    await made.reports.flush();
    expect(made.gateway.messagesIn(MOD_CHANNEL)).toHaveLength(1);
  });
});
