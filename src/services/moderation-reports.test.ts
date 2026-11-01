import { describe, expect, it } from 'vitest';
import { WEST_CHANNEL } from '../../test/support/gyms.js';
import { MOD_CHANNEL } from '../../test/support/meetup-safety-service.js';
import { buttonsOf, textOf } from '../../test/support/messages.js';
import {
  ALICE,
  at,
  BOB,
  CAROL,
  PARTY_NOW,
  REPORTER,
  TEST_PIN,
  TEST_SPOT,
} from '../../test/support/parties.js';
import { gymsFixture } from '../../test/support/providers.js';
import {
  REPORT_SERVER as SERVER,
  reportedMeetup,
  reportsWith,
} from '../../test/support/reports-service.js';
import { MAX_REPORT_REASON } from '../domain/moderation/reports.js';
import type { MaxSpot } from '../domain/party/party.js';
import { PartyStatus } from '../domain/party/status.js';

describe('ModerationReports: a party reported', () => {
  it('sends it privately to the moderators’ channel, and says nothing in the post', async () => {
    const made = await reportedMeetup();
    const outcome = await made.report();
    expect(outcome.kind).toBe('sent');
    const sent = made.gateway.messagesIn(MOD_CHANNEL)[0];
    const post = sent?.message;
    expect(textOf(post)).toContain('### Reported meetup');
    expect(textOf(post)).toContain('Created by **Alice** (<@200000000000000002>)');
    expect(textOf(post)).toContain(
      `**Bob** (<@${BOB}>) <t:${String(PARTY_NOW / 1000)}:R>: It is somebody’s front yard.`,
    );
    expect(textOf(post)).toContain('**Information**\nBring a book.');
    expect(buttonsOf(post).map((button) => button.label)).toEqual([
      'Close…',
      'Refuse place…',
      'Block maker…',
      'Dismiss',
      'Go to post',
    ]);
    // No public trace: the post of the meetup and the region's channel hear nothing.
    await made.service.flush();
    expect(made.gateway.messagesIn(made.postId)).toEqual([]);
    expect(made.gateway.messagesIn(WEST_CHANNEL).map((one) => one.id)).toEqual([
      made.party.regionLinkMessageId,
    ]);
    expect([...made.reportStore.reports.values()]).toMatchObject([
      {
        status: 'open',
        channelId: MOD_CHANNEL,
        messageId: sent?.id,
        subject: { kind: 'party', partyId: made.party.id, makerId: ALICE },
      },
    ]);
  });

  it('gathers more reporters on the one post, and knows who reported already', async () => {
    const made = await reportedMeetup();
    await made.report();
    made.clock.now += 60_000;
    expect((await made.report(CAROL, 'A private home.', 'Carol')).kind).toBe('sent');
    expect((await made.report(BOB, 'Again.')).kind).toBe('already');
    const posts = made.gateway.messagesIn(MOD_CHANNEL);
    expect(posts).toHaveLength(1);
    expect(textOf(posts[0]?.message)).toContain('**Reasons** (2)');
    expect(textOf(posts[0]?.message)).toContain(`**Carol** (<@${CAROL}>)`);
    expect(textOf(posts[0]?.message)).not.toContain('Again.');
  });

  it('refuses a reason of white space or one too long, and a party that is over', async () => {
    const made = await reportedMeetup();
    expect((await made.report(BOB, ' \n ')).kind).toBe('no-reason');
    expect((await made.report(BOB, 'x'.repeat(MAX_REPORT_REASON + 1))).kind).toBe('no-reason');
    await made.service.end(made.party.id);
    expect((await made.report()).kind).toBe('gone');
    expect(made.gateway.messagesIn(MOD_CHANNEL)).toEqual([]);
  });

  it('keeps nothing when the moderators’ channel is not there', async () => {
    const made = await reportedMeetup({ channel: false });
    expect((await made.report()).kind).toBe('not-sent');
    expect(made.reportStore.reports.size).toBe(0);
  });

  it('puts the report into the post and pings the staff once without a moderators’ channel', async () => {
    const made = await reportedMeetup({ moderation: null });
    expect((await made.report()).kind).toBe('asked');
    expect((await made.report()).kind).toBe('asked-before');
    expect((await made.report(CAROL, 'Private.', 'Carol')).kind).toBe('asked');
    const said = made.gateway.messagesIn(made.postId).map((one) => one.message.content);
    expect(said).toEqual([
      `<@&300000000000000001>: **Bob** (<@${BOB}>) asks for this meetup to be deleted.\n> It is somebody’s front yard.`,
      `**Carol** (<@${CAROL}>) asks for this meetup to be deleted.\n> Private.`,
    ]);
    expect(made.reportStore.reports.size).toBe(0);
  });

  it('ends the report with its party when the party ends by itself', async () => {
    const made = await reportedMeetup();
    await made.report();
    await made.service.end(made.party.id);
    await made.reports.flush();
    const [report] = made.reportStore.reports.values();
    expect(report?.status).toBe('ended');
    const post = made.reportPostOf(report ?? { messageId: null });
    expect(textOf(post)).toContain('**Ended**: the meetup was over before a moderator decided.');
    expect(buttonsOf(post).map((button) => button.label)).toEqual(['Go to post']);
    // A new reason now opens no report: the party is over.
    expect((await made.report(CAROL)).kind).toBe('gone');
  });

  it('names a raid’s gym by the name its post shows, and its official name beside it', async () => {
    const made = await reportsWith();
    const gym = gymsFixture().get(1);
    if (!gym) throw new Error('no gym 1');
    const raid = await made.service.reportRaid({
      gym,
      reporterId: REPORTER,
      anonymous: false,
      autoStatus: PartyStatus.Interested,
      tier: { level: 'T5', shadow: false },
      boss: null,
    });
    if (raid.kind !== 'created') throw new Error(raid.kind);
    await made.reports.reportParty({
      serverId: SERVER,
      partyId: raid.party.id,
      reporter: { id: BOB, name: 'Bob' },
      reason: 'Duplicate.',
      roleIds: [],
    });
    const post = made.gateway.messagesIn(MOD_CHANNEL)[0]?.message;
    expect(textOf(post)).toContain('### Reported raid');
    expect(textOf(post)).toContain(
      'Near **The Stacks** (gym; officially **Pinewood Public Library**) · ',
    );
    expect(buttonsOf(post).map((button) => button.label)).toEqual([
      'Close…',
      'Dismiss',
      'Go to post',
    ]);
  });

  // Plan 8X-3 (review A, X3-B-1): a max battle is a party a member can report.
  it('takes a max battle at its Power Spot or its pin, reported by its reporter', async () => {
    const made = await reportsWith();
    const report = (spot: MaxSpot) =>
      made.service.reportMax({
        spot,
        reporterId: REPORTER,
        reporter: { name: 'Rita' },
        anonymous: false,
        autoStatus: PartyStatus.Interested,
        tier: 'D2',
        boss: { key: 'machamp' },
        endTime: at('2026-10-13T21:00'),
        regionChannelId: WEST_CHANNEL,
      });
    for (const [n, spot] of [TEST_SPOT, TEST_PIN].entries()) {
      const battle = await report(spot);
      if (battle.kind !== 'created') throw new Error(battle.kind);
      const outcome = await made.reports.reportParty({
        serverId: SERVER,
        partyId: battle.party.id,
        reporter: { id: BOB, name: 'Bob' },
        reason: 'Nobody is there.',
        roleIds: [],
      });
      expect(outcome.kind).toBe('sent');
      const post = made.gateway.messagesIn(MOD_CHANNEL)[n]?.message;
      expect(textOf(post)).toContain('### Reported max battle');
      expect(textOf(post)).toContain(`Reported by **Rita** (<@${REPORTER}>)`);
      expect(buttonsOf(post).map((button) => button.label)).toEqual([
        'Close…',
        'Dismiss',
        'Go to post',
      ]);
      expect([...made.reportStore.reports.values()][n]?.subject).toMatchObject({
        partyType: 'max',
        place: spot.kind === 'pin' ? { kind: 'pin' } : { kind: 'powerspot', id: spot.id },
      });
    }
  });

  it('opens anew a report whose post was never made', async () => {
    const made = await reportedMeetup();
    made.gateway.failing.set('sendMessage', new Error('Discord is away'));
    // The post fails: the report is forgotten.
    expect((await made.report()).kind).toBe('not-sent');
    expect(made.reportStore.reports.size).toBe(0);
    made.gateway.failing.delete('sendMessage');
    // A report left without its post (the bot stopped in between) is opened anew.
    await made.reportStore.addReport(
      {
        id: '00000000-0000-4000-8000-000000000099',
        serverId: SERVER,
        subject: made.reports.subjectOf(made.party),
        createdAt: PARTY_NOW - 10 * 60_000,
      },
      { reporterId: CAROL, reporterName: 'Carol', text: 'Old.', at: PARTY_NOW - 10 * 60_000 },
    );
    expect((await made.report()).kind).toBe('sent');
    expect(await made.reportStore.openReports(SERVER)).toMatchObject([
      // Carol was told it was sent: her reason is carried over.
      {
        status: 'open',
        channelId: MOD_CHANNEL,
        reasons: [{ reporterId: CAROL }, { reporterId: BOB }],
      },
    ]);
    expect(
      made.entries.some((entry) => String(entry.msg).startsWith('a report never got its post')),
    ).toBe(true);
  });
});
