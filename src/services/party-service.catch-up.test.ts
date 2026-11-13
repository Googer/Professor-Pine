import { RateLimitError } from 'discord.js';
import { describe, expect, it } from 'vitest';
import { missingPermissions, networkAway } from '../../test/support/fake-gateway.js';
import { TEST_GUILD_ROW, WEST_FORUM } from '../../test/support/gyms.js';
import { buttonsOf, textOf } from '../../test/support/messages.js';
import { BOB, PARTY_NOW, REPORTER } from '../../test/support/parties.js';
import { reportedRaid } from '../../test/support/party-service.js';
import { gymsFixture } from '../../test/support/providers.js';
import { PartyStatus } from '../domain/party/status.js';

/** Discord's rate limit on an archiving, as @discordjs/rest throws it with `rejectOnRateLimit`. */
function limited(): RateLimitError {
  return new RateLimitError({
    global: false,
    hash: 'h',
    limit: 2,
    majorParameter: 'x',
    method: 'PATCH',
    retryAfter: 5_000,
    route: '/channels/:id',
    scope: 'user',
    sublimitTimeout: 0,
    timeToReset: 5_000,
    url: 'https://discord.com/api/v10/channels/1',
  });
}

describe('PartyService on a catch-up (plan 8X-H)', () => {
  it('shows anew a post whose edit failed while the network was away, and leaves a current one alone', async () => {
    const made = await reportedRaid();
    const edits = () => made.gateway.posts.get(made.postId)?.edits ?? 0;
    made.service.changed(made.party.id);
    await made.service.flush();
    const before = edits();
    // A current post: nothing to send.
    made.service.redrawPosts();
    await made.service.flush();
    expect(edits()).toBe(before);
    made.gateway.failing.set('editPost', networkAway());
    await made.attendance.signUp(made.party.id, { id: BOB, name: 'Bob' }, PartyStatus.Coming);
    await made.service.flush();
    // The post stays as it was until something shows it anew: nothing tries it again by itself.
    made.gateway.failing.clear();
    expect(textOf(made.gateway.posts.get(made.postId)?.message)).not.toContain('Bob');
    made.service.redrawPosts();
    await made.service.flush();
    expect(edits()).toBe(before + 1);
    expect(textOf(made.gateway.posts.get(made.postId)?.message)).toContain('Bob');
  });

  it('redoes the closing of a party that ended while the network was away, once', async () => {
    const made = await reportedRaid();
    made.gateway.failing.set('editPost', networkAway());
    made.gateway.failing.set('archivePost', networkAway());
    await made.service.end(made.party.id, undefined, { lastWords: 'Closed by the moderators.' });
    const post = () => made.gateway.posts.get(made.postId);
    // Its last showing and its archiving failed: the controls are still live.
    expect(post()?.archived).toBe(false);
    expect(buttonsOf(post()?.message).length).toBeGreaterThan(0);
    // Still away: tried, kept for the next catch-up.
    expect(await made.service.redoClosings()).toEqual({ redone: 0, failed: 1 });
    made.gateway.failing.clear();
    expect(await made.service.redoClosings()).toEqual({ redone: 1, failed: 0 });
    expect(post()?.archived).toBe(true);
    expect(buttonsOf(post()?.message)).toEqual([]);
    // Its last words were said once, when it ended.
    const said = made.gateway
      .messagesIn(made.postId)
      .filter((message) => JSON.stringify(message.message).includes('Closed by the moderators.'));
    expect(said).toHaveLength(1);
    // Nothing is owed any more.
    expect(await made.service.redoClosings()).toEqual({ redone: 0, failed: 0 });
  });

  it('tags as ended on the redo a raid the clock ended, whose last showing and archiving failed (review F2)', async () => {
    const made = await reportedRaid({ time: { end: PARTY_NOW + 30 * 60_000 } });
    const { endTime } = made.current();
    if (endTime === null) throw new Error('the raid has no end time');
    // Its time ran out while the network was away: the clock's showing with Ended failed too.
    made.clock.now = endTime + 60_000;
    made.gateway.failing.set('editPost', networkAway());
    made.gateway.failing.set('archivePost', networkAway());
    await made.service.end(made.party.id, undefined, { ended: { how: 'clock' } });
    const post = () => made.gateway.posts.get(made.postId);
    const ended = made.tags[WEST_FORUM]?.['Ended'];
    expect(ended).toBeDefined();
    expect(post()?.tagIds).not.toContain(ended);
    made.gateway.failing.clear();
    expect(await made.service.redoClosings()).toEqual({ redone: 1, failed: 0 });
    expect(post()?.tagIds).toContain(ended);
    expect(post()?.archived).toBe(true);
  });

  it('opens an archived post before it deletes what is left in it on the redo (review F4)', async () => {
    const made = await reportedRaid();
    const warning = await made.gateway.sendMessage(made.postId, {
      content: 'This post will be archived.',
    });
    if (warning === undefined) throw new Error('no warning');
    await made.store.update(made.party.id, (party) => ({
      party: { ...party, prompts: { ...party.prompts, warning } },
    }));
    made.gateway.failing.set('deleteMessage', networkAway());
    await made.service.end(made.party.id);
    // Archived, the warning still in it: Discord refuses a deletion in an archived post (50083).
    expect(made.gateway.posts.get(made.postId)?.archived).toBe(true);
    made.gateway.failing.clear();
    expect(await made.service.redoClosings()).toEqual({ redone: 1, failed: 0 });
    expect(made.gateway.deleted.map(({ messageId }) => messageId)).toContain(warning);
    expect(made.gateway.posts.get(made.postId)).toMatchObject({ archived: true, locked: true });
    expect(
      made.entries.filter((entry) => entry.msg === 'could not delete a message of an ended party'),
    ).toHaveLength(1);
  });

  it('redoes the link line and a copy whose deletion failed while the network was away (review r0 B2)', async () => {
    const made = await reportedRaid();
    expect(await made.service.showStatus(made.party.id)).toBe(true);
    await made.service.flush();
    const { regionLinkMessageId: link, mirrorMessages } = made.current();
    const [copy] = mirrorMessages;
    if (link === null || !copy) throw new Error('no link line or copy');
    const deleted = () => made.gateway.deleted.map(({ messageId }) => messageId);
    made.gateway.failing.set('deleteMessage', networkAway());
    await made.service.end(made.party.id);
    // The post itself was closed; the link line and the copy stand.
    expect(made.gateway.posts.get(made.postId)?.archived).toBe(true);
    expect(deleted()).not.toContain(link);
    expect(deleted()).not.toContain(copy.messageId);
    made.gateway.failing.clear();
    expect(await made.service.redoClosings()).toEqual({ redone: 1, failed: 0 });
    expect(deleted()).toEqual(expect.arrayContaining([link, copy.messageId]));
  });

  it('deletes on the redo a post a moderator chose to delete, when the network failed it (review r0 B3)', async () => {
    const made = await reportedRaid();
    made.gateway.failing.set('deletePost', networkAway());
    // Archived for now, the deletion still owed (review r1 C1): not a refusal.
    expect(
      await made.service.endAs(made.party.id, undefined, {
        lastWords: 'This raid was closed by the moderators.',
        removal: 'delete',
      }),
    ).toBe('deleting');
    expect(made.gateway.posts.get(made.postId)?.archived).toBe(true);
    expect(made.gateway.deletedPosts).toEqual([]);
    made.gateway.failing.clear();
    expect(await made.service.redoClosings()).toEqual({ redone: 1, failed: 0 });
    expect(made.gateway.deletedPosts).toEqual([made.postId]);
    // Discord refusing the deletion archives it, and nothing is owed.
    const refused = await reportedRaid();
    refused.gateway.failing.set('deletePost', missingPermissions('DELETE'));
    expect(await refused.service.endAs(refused.party.id, undefined, { removal: 'delete' })).toBe(
      'archived',
    );
    expect(refused.gateway.posts.get(refused.postId)?.archived).toBe(true);
    expect(await refused.service.redoClosings()).toEqual({ redone: 0, failed: 0 });
  });

  it('keeps only what the network failed: not a refusal of Discord’s, not a post that is gone (review r0 B5)', async () => {
    const refused = await reportedRaid();
    refused.gateway.failing.set('archivePost', missingPermissions('PATCH'));
    await refused.service.end(refused.party.id);
    expect(await refused.service.redoClosings()).toEqual({ redone: 0, failed: 0 });
    // A post deleted by hand: its link line failed for the network, but there is nothing to close.
    const gone = await reportedRaid();
    gone.gateway.gone.add(gone.postId);
    gone.gateway.failing.set('deleteMessage', networkAway());
    await gone.service.end(gone.party.id);
    expect(await gone.service.redoClosings()).toEqual({ redone: 0, failed: 0 });
  });

  it('keeps and redoes what a rate limit failed (review r1 C6)', async () => {
    const made = await reportedRaid();
    made.gateway.failing.set('archivePost', limited());
    await made.service.end(made.party.id);
    expect(made.gateway.posts.get(made.postId)?.archived).toBe(false);
    made.gateway.failing.clear();
    expect(await made.service.redoClosings()).toEqual({ redone: 1, failed: 0 });
    expect(made.gateway.posts.get(made.postId)?.archived).toBe(true);
  });

  it('tries one closing a run while the network is away, the rest kept (review r1 C2)', async () => {
    const made = await reportedRaid();
    const gym = gymsFixture().get(2);
    if (!gym) throw new Error('the invented gyms have no gym 2');
    const other = await made.service.reportRaid({
      gym,
      guildRow: TEST_GUILD_ROW,
      reporterId: REPORTER,
      anonymous: false,
      autoStatus: PartyStatus.Interested,
      tier: { level: 'T5', shadow: false },
      boss: null,
    });
    if (other.kind !== 'created') throw new Error(other.kind);
    await made.service.flush();
    made.gateway.failing.set('archivePost', networkAway());
    await made.service.end(made.party.id);
    await made.service.end(other.party.id);
    const archives = () =>
      made.gateway.calls.filter((call) => call.startsWith('archivePost ')).length;
    const before = archives();
    // The first still fails: the second is not tried (a black-holed request takes a minute).
    expect(await made.service.redoClosings()).toEqual({ redone: 0, failed: 1 });
    expect(archives()).toBe(before + 1);
    made.gateway.failing.clear();
    expect(await made.service.redoClosings()).toEqual({ redone: 2, failed: 0 });
  });

  it('forgets a closing still undone after a day (review r0 B4)', async () => {
    const made = await reportedRaid();
    made.gateway.failing.set('archivePost', networkAway());
    await made.service.end(made.party.id);
    made.clock.now += 24 * 60 * 60 * 1000 + 1;
    made.gateway.failing.clear();
    expect(await made.service.redoClosings()).toEqual({ redone: 0, failed: 0 });
    expect(made.gateway.posts.get(made.postId)?.archived).toBe(false);
  });

  it('ends between parties when told the clock stopped (review r0 B6)', async () => {
    const made = await reportedRaid();
    made.gateway.failing.set('archivePost', networkAway());
    await made.service.end(made.party.id);
    made.gateway.failing.clear();
    expect(await made.service.redoClosings({ isStopped: () => true })).toEqual({
      redone: 0,
      failed: 0,
    });
    // Still owed for the next run.
    expect(await made.service.redoClosings()).toEqual({ redone: 1, failed: 0 });
  });

  it('owes nothing for a closing that went through', async () => {
    const made = await reportedRaid();
    await made.service.end(made.party.id);
    expect(await made.service.redoClosings()).toEqual({ redone: 0, failed: 0 });
  });
});
