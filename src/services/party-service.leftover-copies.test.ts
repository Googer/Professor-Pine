import { describe, expect, it } from 'vitest';
import { missingPermissions, networkAway } from '../../test/support/fake-gateway.js';
import { REMOTE_CHANNEL, WEST_CHANNEL } from '../../test/support/gyms.js';
import {
  gatewayWithMirrorChannels,
  reportedRaid,
  restarted,
} from '../../test/support/party-service.js';
import { endParty } from '../domain/party/party.js';

/** A raid with a copy in the remote channel and its link line in the region's channel. */
async function copied() {
  const gateway = gatewayWithMirrorChannels();
  const made = await reportedRaid({ boss: { key: 'yveltal' } }, {}, { gateway });
  expect(made.gateway.messagesIn(REMOTE_CHANNEL)).toHaveLength(1);
  expect(made.gateway.messagesIn(WEST_CHANNEL)).toHaveLength(1);
  return made;
}

/** The messages of the raid outside its post that are still there. */
function outside(made: Awaited<ReturnType<typeof copied>>): number {
  return (
    made.gateway.messagesIn(REMOTE_CHANNEL).length + made.gateway.messagesIn(WEST_CHANNEL).length
  );
}

describe('PartyService: the copies ended parties left', () => {
  it('deletes after a restart the copy and the link line of a party whose closing a stop cut off', async () => {
    const made = await copied();
    // The end was written, and the process stopped before anything was deleted.
    await made.store.update(made.party.id, (party) => ({
      party: endParty(party),
      ended: { how: 'clock' },
    }));
    expect(outside(made)).toBe(2);
    const again = await restarted(made);
    expect(await again.service.sweepCopies()).toEqual({ swept: 2, failed: 0 });
    expect(outside(made)).toBe(0);
    // Nothing is left to sweep, and nothing is asked of Discord again.
    const asked = made.gateway.deleted.length;
    expect(await again.service.sweepCopies()).toEqual({ swept: 0, failed: 0 });
    expect(made.gateway.deleted).toHaveLength(asked);
  });

  it('deletes after a restart the copies the network kept the closing from deleting', async () => {
    const made = await copied();
    made.gateway.failing.set('deleteMessage', networkAway());
    expect(await made.service.end(made.party.id)).toBe(true);
    expect(outside(made)).toBe(2);
    // The closing still owed was in memory only: a restart forgets it.
    const again = await restarted(made);
    made.gateway.failing.clear();
    expect(await again.service.redoClosings()).toEqual({ redone: 0, failed: 0 });
    expect(await again.service.sweepCopies()).toEqual({ swept: 2, failed: 0 });
    expect(outside(made)).toBe(0);
  });

  it('leaves nothing to sweep after a closing that deleted everything', async () => {
    const made = await copied();
    expect(await made.service.end(made.party.id)).toBe(true);
    expect(outside(made)).toBe(0);
    const asked = made.gateway.deleted.length;
    expect(await made.service.sweepCopies()).toEqual({ swept: 0, failed: 0 });
    expect(made.gateway.deleted).toHaveLength(asked);
  });

  it('leaves the copies of a closing still owed to its redo, and nothing once it is redone', async () => {
    const made = await copied();
    made.gateway.failing.set('deleteMessage', networkAway());
    await made.service.end(made.party.id);
    made.gateway.failing.clear();
    // The redo in memory is theirs: the sweep does not ask for them beside it.
    const asked = made.gateway.deleted.length;
    expect(await made.service.sweepCopies()).toEqual({ swept: 0, failed: 0 });
    expect(made.gateway.deleted).toHaveLength(asked);
    expect(await made.service.redoClosings()).toEqual({ redone: 1, failed: 0 });
    expect(outside(made)).toBe(0);
    expect(await made.service.sweepCopies()).toEqual({ swept: 0, failed: 0 });
    expect(made.gateway.deleted).toHaveLength(asked + 2);
  });

  it('stops at the first copy the network fails again, and keeps them all for the next run', async () => {
    const made = await copied();
    await made.store.update(made.party.id, (party) => ({ party: endParty(party) }));
    const again = await restarted(made);
    made.gateway.failing.set('deleteMessage', networkAway());
    expect(await again.service.sweepCopies()).toEqual({ swept: 0, failed: 1 });
    made.gateway.failing.clear();
    expect(await again.service.sweepCopies()).toEqual({ swept: 2, failed: 0 });
    expect(outside(made)).toBe(0);
  });

  it('forgets a copy Discord refuses to delete, with a warning', async () => {
    const made = await copied();
    await made.store.update(made.party.id, (party) => ({ party: endParty(party) }));
    const again = await restarted(made);
    made.gateway.failing.set('deleteMessage', missingPermissions('deleteMessage'));
    expect(await again.service.sweepCopies()).toEqual({ swept: 2, failed: 0 });
    expect(
      again.entries.filter(
        (entry) =>
          entry.level === 40 && entry.msg === 'could not delete a copy an ended party left',
      ),
    ).toHaveLength(2);
    made.gateway.failing.clear();
    expect(await again.service.sweepCopies()).toEqual({ swept: 0, failed: 0 });
    expect(outside(made)).toBe(2);
  });

  it('leaves the copies of a closing under way to it', async () => {
    const made = await copied();
    let answer: () => void = () => undefined;
    const answered = new Promise<void>((resolve) => {
      answer = resolve;
    });
    let reached: () => void = () => undefined;
    const answering = new Promise<void>((resolve) => {
      reached = resolve;
    });
    // The end is written; the closing waits for the answer given before it.
    const ending = made.service.end(made.party.id, undefined, {
      left: () => {
        reached();
        return answered;
      },
    });
    await answering;
    const asked = made.gateway.deleted.length;
    expect(await made.service.sweepCopies()).toEqual({ swept: 0, failed: 0 });
    expect(made.gateway.deleted).toHaveLength(asked);
    answer();
    expect(await ending).toBe(true);
    expect(outside(made)).toBe(0);
    expect(await made.service.sweepCopies()).toEqual({ swept: 0, failed: 0 });
  });

  it('deletes a copy left in a post that was archived meanwhile, opening it', async () => {
    const made = await copied();
    expect(await made.service.showStatus(made.party.id)).toBe(true);
    await made.service.flush();
    const inPost = () => made.gateway.messagesIn(made.postId).length;
    const before = inPost();
    await made.store.update(made.party.id, (party) => ({ party: endParty(party) }));
    await made.gateway.archivePost(made.postId);
    const again = await restarted(made);
    expect(await again.service.sweepCopies()).toEqual({ swept: 3, failed: 0 });
    expect(outside(made)).toBe(0);
    expect(inPost()).toBe(before - 1);
  });

  it('ends its run with the clock’s stop', async () => {
    const made = await copied();
    await made.store.update(made.party.id, (party) => ({ party: endParty(party) }));
    const again = await restarted(made);
    expect(await again.service.sweepCopies({ isStopped: () => true })).toEqual({
      swept: 0,
      failed: 0,
    });
    expect(outside(made)).toBe(2);
  });
});
