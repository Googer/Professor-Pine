import { describe, expect, it, vi } from 'vitest';
import { networkAway } from '../../test/support/fake-gateway.js';
import { textOf } from '../../test/support/messages.js';
import { BOB, CAROL } from '../../test/support/parties.js';
import { reportedRaid } from '../../test/support/party-service.js';
import { PartyStatus } from '../domain/party/status.js';
import { postMessage } from '../render/party-post.js';

describe('PartyService.layoutOf: the layout a post was last shown with (plan 8M-8A)', () => {
  it('is what the post shows, from its making and after each edit', async () => {
    const made = await reportedRaid();
    const shown = () => made.gateway.posts.get(made.postId)?.message;
    const message = () => {
      const layout = made.service.layoutOf(made.party.id);
      if (layout === undefined) throw new Error('no layout kept');
      return postMessage(layout);
    };
    expect(message()).toEqual(shown());
    await made.attendance.signUp(made.party.id, { id: BOB, name: 'Bob' }, PartyStatus.Coming);
    await made.service.flush();
    expect(textOf(shown())).toContain('Bob');
    expect(message()).toEqual(shown());
  });

  it('stays what the post shows when an edit fails', async () => {
    const made = await reportedRaid();
    const before = made.service.layoutOf(made.party.id);
    made.gateway.failing.set('editPost', networkAway());
    await made.attendance.signUp(made.party.id, { id: CAROL, name: 'Carol' }, PartyStatus.Coming);
    await made.service.flush();
    expect(textOf(made.gateway.posts.get(made.postId)?.message)).not.toContain('Carol');
    expect(made.service.layoutOf(made.party.id)).toBe(before);
  });

  it('keeps nothing of an edit that finishes after its party ended (review 8A-7, N8)', async () => {
    const made = await reportedRaid();
    const edit = made.gateway.editPost.bind(made.gateway);
    let release: () => void = () => undefined;
    let asked: () => void = () => undefined;
    const editAsked = new Promise<void>((resolve) => {
      asked = resolve;
    });
    let first = true;
    vi.spyOn(made.gateway, 'editPost').mockImplementation(async (...args) => {
      // Only the first edit (Bob's line) is held; the closing's go through.
      if (first) {
        first = false;
        asked();
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      }
      return edit(...args);
    });
    await made.attendance.signUp(made.party.id, { id: BOB, name: 'Bob' }, PartyStatus.Coming);
    const flushed = made.service.flush();
    await editAsked;
    // The party ends while its edit is on its way: its post is forgotten.
    const ending = made.service.end(made.party.id);
    release();
    await Promise.all([ending, flushed]);
    // What the service keeps by post: nothing of the post of a party that is over.
    const kept = (made.service as unknown as { shownLayouts: Map<string, unknown> }).shownLayouts;
    expect(kept.has(made.postId)).toBe(false);
  });

  it('is none once the party has ended, nor for a party it does not know', async () => {
    const made = await reportedRaid();
    await made.service.end(made.party.id);
    expect(made.service.layoutOf(made.party.id)).toBeUndefined();
    expect(made.service.layoutOf('no such party')).toBeUndefined();
  });
});
