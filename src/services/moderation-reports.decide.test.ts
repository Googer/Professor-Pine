import { describe, expect, it } from 'vitest';
import { networkAway } from '../../test/support/fake-gateway.js';
import { WEST_CHANNEL, WEST_FORUM } from '../../test/support/gyms.js';
import { LIBRARY, MODERATOR, SAFETY_PIN } from '../../test/support/meetup-safety-cases.js';
import { MOD_CHANNEL } from '../../test/support/meetup-safety-service.js';
import { buttonsOf, textOf } from '../../test/support/messages.js';
import { ALICE, PARTY_NOW } from '../../test/support/parties.js';
import { REPORT_SERVER, reportedMeetup } from '../../test/support/reports-service.js';
import type { ModerationReport } from '../domain/moderation/reports.js';
import type { ReportAction } from '../render/moderation.js';
import type { PostRemoval } from '../domain/moderation/reports.js';

const mod = { id: MODERATOR, name: 'Mod' };

/** Alice's meetup, reported by Bob, and a moderator's decision of the report. */
async function reported() {
  const made = await reportedMeetup();
  const outcome = await made.report();
  if (outcome.kind !== 'sent') throw new Error(outcome.kind);
  const decide = (
    action: ReportAction,
    removal: PostRemoval | null = 'archive',
    server = REPORT_SERVER,
  ) => made.reports.decide(outcome.report.id, action, removal, mod, server, 'Pine Town');
  const stored = async (): Promise<ModerationReport | undefined> =>
    made.reportStore.report(outcome.report.id);
  const post = () => made.reportPostOf(outcome.report);
  return { ...made, decide, stored, post };
}

describe('ModerationReports: a moderator decides a report of a party', () => {
  it('closes the meetup and archives its post, saying so in the report’s post', async () => {
    const made = await reported();
    const outcome = await made.decide('close', 'archive');
    expect(outcome).toMatchObject({ kind: 'done' });
    expect(made.store.get(made.party.id)).toBeUndefined();
    expect(made.gateway.posts.get(made.postId)).toMatchObject({ archived: true, locked: true });
    expect(made.gateway.messagesIn(made.postId).at(-1)?.message.content).toBe(
      'This meetup was closed by the moderators.',
    );
    expect(made.history.records).toEqual([
      expect.objectContaining({
        partyId: made.party.id,
        ending: 'cancelled',
        closedBy: 'moderators',
      }),
    ]);
    expect(await made.stored()).toMatchObject({
      status: 'closed',
      removal: 'archive',
      decidedBy: MODERATOR,
      decidedByName: 'Mod',
    });
    expect(textOf(made.post())).toContain('**Closed** by **Mod**');
    expect(buttonsOf(made.post()).map((button) => button.label)).toEqual(['Go to post']);
  });

  it('deletes the post when asked to, with its link line', async () => {
    const made = await reported();
    await made.decide('close', 'delete');
    expect(made.gateway.deletedPosts).toEqual([made.postId]);
    expect(made.gateway.messagesIn(WEST_CHANNEL)).toEqual([]);
    expect(textOf(made.post())).toContain('its post is deleted.');
    expect(buttonsOf(made.post())).toEqual([]);
  });

  it('refuses the place for good, from the report’s post, and closes the meetup', async () => {
    const made = await reported();
    await made.decide('refuse', 'delete');
    const report = await made.stored();
    expect(report).toMatchObject({ status: 'refused', removal: 'delete' });
    expect(
      await made.storage.rulingRecord(REPORT_SERVER, { kind: 'stop', id: LIBRARY.id }),
    ).toMatchObject({
      ruling: 'refuse',
      ruledBy: MODERATOR,
      ruledByName: 'Mod',
      place: LIBRARY,
      source: {
        kind: 'report',
        id: report?.id,
        channelId: MOD_CHANNEL,
        messageId: report?.messageId,
      },
    });
    expect(made.store.get(made.party.id)).toBeUndefined();
    expect(made.gateway.deletedPosts).toEqual([made.postId]);
  });

  it('blocks the maker: this meetup as chosen, their other meetups archived, one DM', async () => {
    const made = await reported();
    const other = await made.service.createMeetup({
      name: 'Second swap',
      creatorId: ALICE,
      creator: { name: 'Alice' },
      regionChannelId: WEST_CHANNEL,
      startTime: PARTY_NOW + 48 * 3_600_000,
    });
    if (other.kind !== 'created') throw new Error(other.kind);
    const outcome = await made.decide('block', 'delete');
    expect(outcome).toMatchObject({ kind: 'done', closed: 1 });
    expect(await made.storage.block(REPORT_SERVER, ALICE)).toMatchObject({ blockedBy: MODERATOR });
    expect(made.gateway.deletedPosts).toEqual([made.postId]);
    expect(made.gateway.posts.get(other.party.forumPostId ?? '')).toMatchObject({ archived: true });
    expect(made.dms.to(ALICE)).toHaveLength(1);
    expect(textOf(made.dms.to(ALICE)[0])).toContain('**Pine Town**');
    expect((await made.stored())?.status).toBe('blocked');
  });

  it('dismisses: nothing else changes', async () => {
    const made = await reported();
    expect(await made.decide('dismiss', null)).toMatchObject({ kind: 'done' });
    expect(made.store.get(made.party.id)).toBeDefined();
    expect((await made.stored())?.status).toBe('dismissed');
    expect(textOf(made.post())).toContain('**Dismissed** by **Mod**');
  });

  it('lets the first decision win, and tells a later one what it was', async () => {
    const made = await reported();
    await made.decide('dismiss', null);
    const later = await made.decide('close', 'archive');
    expect(later).toMatchObject({ kind: 'decided-before', report: { status: 'dismissed' } });
    expect(made.store.get(made.party.id)).toBeDefined();
  });

  it('keeps the report open where the bot may not delete the post', async () => {
    const made = await reported();
    made.gateway.noManaging.add(WEST_FORUM);
    expect(await made.decide('close', 'delete')).toEqual({
      kind: 'may-not-delete',
      forumId: WEST_FORUM,
    });
    expect(made.store.get(made.party.id)).toBeDefined();
    expect((await made.stored())?.status).toBe('open');
    // Archiving works there.
    expect(await made.decide('close', 'archive')).toMatchObject({ kind: 'done' });
  });

  it('says that the party ended first, and takes no report of another server', async () => {
    const made = await reported();
    expect(await made.decide('close', 'archive', '412345678901234599')).toEqual({ kind: 'gone' });
    await made.service.end(made.party.id);
    await made.reports.flush();
    expect(await made.decide('close', 'archive')).toMatchObject({
      kind: 'decided-before',
      report: { status: 'ended' },
    });
  });

  it('lets one of two decisions at the same moment win', async () => {
    const made = await reported();
    const both = await Promise.all([made.decide('close', 'archive'), made.decide('dismiss', null)]);
    expect(both.map((one) => one.kind).sort()).toEqual(['decided-before', 'done']);
  });

  it('keeps the report open, and says so, when refusing the place fails', async () => {
    const made = await reported();
    made.storage.failing.add('rule');
    expect(await made.decide('refuse', 'archive')).toEqual({
      kind: 'failed',
      word: 'meetup',
      placeRefused: false,
      blocked: false,
      reopened: true,
    });
    expect(await made.stored()).toMatchObject({ status: 'open', removal: null, decidedBy: null });
    expect(made.store.get(made.party.id)).toBeDefined();
    expect(buttonsOf(made.post()).map((button) => button.label)).toContain('Refuse place…');
    made.storage.failing.delete('rule');
    expect(await made.decide('refuse', 'archive')).toMatchObject({ kind: 'done' });
  });

  it('keeps the report open when blocking the maker fails, and when closing the party fails', async () => {
    const made = await reported();
    made.storage.failing.add('addBlock');
    expect(await made.decide('block', 'archive')).toEqual({
      kind: 'failed',
      word: 'meetup',
      placeRefused: false,
      blocked: false,
      reopened: true,
    });
    expect((await made.stored())?.status).toBe('open');
    expect(made.store.get(made.party.id)).toBeDefined();
    made.storage.failing.delete('addBlock');
    const endAs = made.service.endAs.bind(made.service);
    made.service.endAs = () => Promise.reject(new Error('the database is away'));
    expect(await made.decide('close', 'archive')).toEqual({
      kind: 'failed',
      word: 'meetup',
      placeRefused: false,
      blocked: false,
      reopened: true,
    });
    expect((await made.stored())?.status).toBe('open');
    made.service.endAs = endAs;
  });

  it('says what was done where a later step failed, the report open again', async () => {
    const made = await reported();
    made.service.endAs = () => Promise.reject(new Error('the database is away'));
    expect(await made.decide('block', 'archive')).toEqual({
      kind: 'failed',
      word: 'meetup',
      placeRefused: false,
      blocked: true,
      reopened: true,
    });
    expect(await made.storage.block(REPORT_SERVER, ALICE)).toBeDefined();
    expect((await made.stored())?.status).toBe('open');
    expect(await made.decide('refuse', 'archive')).toEqual({
      kind: 'failed',
      word: 'meetup',
      placeRefused: true,
      blocked: false,
      reopened: true,
    });
  });

  it('says so where the report could not be opened again', async () => {
    const made = await reported();
    made.service.endAs = () => Promise.reject(new Error('the database is away'));
    made.reportStore.failing.add('reopenReport');
    expect(await made.decide('close', 'archive')).toEqual({
      kind: 'failed',
      word: 'meetup',
      placeRefused: false,
      blocked: false,
      reopened: false,
    });
  });

  it('refuses no place where the meetup’s place is now a pin, and changes nothing', async () => {
    const made = await reported();
    made.service.placeOf = () => SAFETY_PIN;
    expect(await made.decide('refuse', 'archive')).toEqual({ kind: 'no-place' });
    expect((await made.stored())?.status).toBe('open');
    expect(made.store.get(made.party.id)).toBeDefined();
    expect(await made.storage.rulingRecord(REPORT_SERVER, { kind: 'stop', id: LIBRARY.id })).toBe(
      undefined,
    );
  });

  it('deletes the post of a party that ended between the press and the closing', async () => {
    const made = await reported();
    const endAs = made.service.endAs.bind(made.service);
    made.service.endAs = async (...args) => {
      await endAs(made.party.id);
      return endAs(...args);
    };
    expect(await made.decide('close', 'delete')).toMatchObject({
      kind: 'done',
      report: { status: 'closed', removal: 'delete' },
    });
    expect(made.gateway.deletedPosts).toEqual([made.postId]);
  });

  it('keeps that the post was archived where Discord refused to delete it', async () => {
    const made = await reported();
    made.gateway.failing.set('deletePost', new Error('Missing Permissions'));
    expect(await made.decide('close', 'delete')).toMatchObject({
      kind: 'done',
      report: { removal: 'denied' },
      refusedDeletion: true,
    });
    expect((await made.stored())?.removal).toBe('denied');
    expect(textOf(made.post())).toContain('its post is archived: Discord refused to delete it.');
    expect(buttonsOf(made.post()).map((button) => button.label)).toEqual(['Go to post']);
  });

  it('keeps a deletion the network failed as a deletion still to come (review r1 C1)', async () => {
    const made = await reported();
    made.gateway.failing.set('deletePost', networkAway());
    expect(await made.decide('close', 'delete')).toMatchObject({
      kind: 'done',
      report: { removal: 'delete' },
      deletionPending: true,
    });
    expect((await made.stored())?.removal).toBe('delete');
    expect(textOf(made.post())).toContain('its post is deleted.');
    made.gateway.failing.clear();
    await made.service.redoClosings();
    expect(made.gateway.deletedPosts).toEqual([made.postId]);
  });

  it('says whether the block is new, and refuses the place as it is now', async () => {
    const made = await reported();
    await made.storage.addBlock(REPORT_SERVER, ALICE, { id: MODERATOR, name: 'Mod', at: 1 });
    expect(await made.decide('block', 'archive')).toMatchObject({ kind: 'done', newBlock: false });
    expect(made.dms.to(ALICE)).toEqual([]);
  });

  it('refuses what a report does not offer', async () => {
    const made = await reported();
    expect(await made.decide('delete', null)).toEqual({ kind: 'not-offered' });
    expect(await made.decide('close', null)).toEqual({ kind: 'not-offered' });
    expect((await made.stored())?.status).toBe('open');
  });
});
