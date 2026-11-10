import { describe, expect, it } from 'vitest';
import { WEST_CHANNEL } from '../../test/support/gyms.js';
import { MODERATOR } from '../../test/support/meetup-safety-cases.js';
import { MOD_CHANNEL } from '../../test/support/meetup-safety-service.js';
import { buttonsOf, textOf } from '../../test/support/messages.js';
import { BOB, CAROL, PARTY_NOW } from '../../test/support/parties.js';
import { REPORT_SERVER, reportsWith } from '../../test/support/reports-service.js';
import type { SafetyOptions } from '../../test/support/meetup-safety-service.js';
import { MESSAGE_COPY_ROOM } from '../domain/moderation/reports.js';
import { EDITED_SINCE } from '../render/moderation.js';

const DAVE = '200000000000000005';
const MESSAGE = '800000000000000001';
const mod = { id: MODERATOR, name: 'Mod' };

async function setup(options: SafetyOptions = {}) {
  const made = await reportsWith(options);
  const report = (reporterId = BOB, text = 'You are all idiots.', reason = 'Hurtful.') =>
    made.reports.reportMessage({
      serverId: REPORT_SERVER,
      message: {
        channelId: WEST_CHANNEL,
        messageId: MESSAGE,
        authorId: DAVE,
        authorName: 'Dave',
        sentAt: PARTY_NOW - 60_000,
        text,
        attachments: ['meme.png'],
      },
      partyTitle: null,
      nearChannelId: WEST_CHANNEL,
      reporter: { id: reporterId, name: reporterId === BOB ? 'Bob' : 'Carol' },
      reason,
    });
  return { ...made, report };
}

describe('ModerationReports: a message reported', () => {
  it('sends a copy of it to the moderators, and gathers more reporters on the one post', async () => {
    const made = await setup();
    const sent = await made.report();
    expect(sent.kind).toBe('sent');
    expect((await made.report(CAROL, 'You are all idiots.', 'Rude.')).kind).toBe('sent');
    expect((await made.report()).kind).toBe('already');
    const posts = made.gateway.messagesIn(MOD_CHANNEL);
    expect(posts).toHaveLength(1);
    const text = textOf(posts[0]?.message);
    expect(text).toContain(`Written by **Dave** (<@${DAVE}>) in <#${WEST_CHANNEL}>`);
    expect(text).toContain('**What it said**\nYou are all idiots.');
    expect(text).toContain('**Attachments**: meme.png');
    expect(text).toContain('**Reasons** (2)');
    expect(text).not.toContain(EDITED_SINCE);
    expect(buttonsOf(posts[0]?.message).map((button) => button.label)).toEqual([
      'Delete message',
      'Dismiss',
      'Go to message',
    ]);
  });

  it('keeps the first copy of a message, and says so when a later report finds it edited', async () => {
    const made = await setup();
    const sent = await made.report();
    if (sent.kind !== 'sent') throw new Error(sent.kind);
    // The author edited the message before Carol reported it.
    expect((await made.report(CAROL, 'Have a nice day.', 'It said worse before.')).kind).toBe(
      'sent',
    );
    const text = textOf(made.reportPostOf(sent.report));
    expect(text).toContain('**What it said**\nYou are all idiots.');
    expect(text).not.toContain('Have a nice day.');
    expect(text).toContain(EDITED_SINCE);
    expect(text).toContain('**Reasons** (2)');
  });

  it('keeps as much of a long message as it shows', async () => {
    const made = await setup();
    await made.report(BOB, 'x'.repeat(4000));
    const [report] = made.reportStore.reports.values();
    expect(report?.subject.kind === 'message' && report.subject.text.length).toBe(
      MESSAGE_COPY_ROOM,
    );
  });

  it('is refused without a moderators’ channel', async () => {
    const made = await setup({ moderation: null });
    expect((await made.report()).kind).toBe('no-channel');
    expect(made.gateway.messagesIn(WEST_CHANNEL)).toEqual([]);
  });

  it('deletes the message on Delete message, and says so in the report’s post', async () => {
    const made = await setup();
    const sent = await made.report();
    if (sent.kind !== 'sent') throw new Error(sent.kind);
    const outcome = await made.reports.decide(sent.report.id, 'delete', null, mod, REPORT_SERVER);
    expect(outcome).toMatchObject({ kind: 'done', report: { status: 'deleted' } });
    expect(made.gateway.deleted).toContainEqual({ channelId: WEST_CHANNEL, messageId: MESSAGE });
    const post = made.reportPostOf(sent.report);
    expect(textOf(post)).toContain('**Message deleted** by **Mod**');
    expect(buttonsOf(post)).toEqual([]);
  });

  it('settles the report as gone when the message was deleted before', async () => {
    const made = await setup();
    const sent = await made.report();
    if (sent.kind !== 'sent') throw new Error(sent.kind);
    made.gateway.gone.add(MESSAGE);
    const outcome = await made.reports.decide(sent.report.id, 'delete', null, mod, REPORT_SERVER);
    expect(outcome).toMatchObject({ kind: 'done', report: { status: 'gone' } });
    expect(textOf(made.reportPostOf(sent.report))).toContain(
      '**Gone**: the message was deleted before a moderator did',
    );
  });

  it('keeps the report open where the bot may not delete messages', async () => {
    const made = await setup();
    const sent = await made.report();
    if (sent.kind !== 'sent') throw new Error(sent.kind);
    made.gateway.noManaging.add(WEST_CHANNEL);
    expect(await made.reports.decide(sent.report.id, 'delete', null, mod, REPORT_SERVER)).toEqual({
      kind: 'may-not-delete-message',
      channelId: WEST_CHANNEL,
    });
    expect((await made.reportStore.report(sent.report.id))?.status).toBe('open');
  });

  it('deletes nothing where a Dismiss at the same moment wins', async () => {
    const made = await setup();
    const sent = await made.report();
    if (sent.kind !== 'sent') throw new Error(sent.kind);
    const decide = (action: 'delete' | 'dismiss') =>
      made.reports.decide(sent.report.id, action, null, mod, REPORT_SERVER);
    const [deleting, dismissing] = await Promise.all([decide('delete'), decide('dismiss')]);
    const status = (await made.reportStore.report(sent.report.id))?.status;
    if (dismissing.kind === 'done') {
      expect(deleting.kind).toBe('decided-before');
      expect(status).toBe('dismissed');
      expect(made.gateway.deleted).toEqual([]);
    } else {
      expect(deleting).toMatchObject({ kind: 'done' });
      expect(status).toBe('deleted');
    }
  });

  it('opens the report again, and says so, where deleting the message fails', async () => {
    const made = await setup();
    const sent = await made.report();
    if (sent.kind !== 'sent') throw new Error(sent.kind);
    made.gateway.failing.set('deleteReported', new Error('Discord is away'));
    expect(await made.reports.decide(sent.report.id, 'delete', null, mod, REPORT_SERVER)).toEqual({
      kind: 'failed',
      word: 'message',
      placeRefused: false,
      blocked: false,
      reopened: true,
    });
    expect((await made.reportStore.report(sent.report.id))?.status).toBe('open');
    expect(buttonsOf(made.reportPostOf(sent.report)).map((button) => button.label)).toContain(
      'Delete message',
    );
  });
});
