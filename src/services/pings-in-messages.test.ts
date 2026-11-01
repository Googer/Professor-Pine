import { describe, expect, it } from 'vitest';
import { ALICE, MINUTE, PARTY_NOW, REPORTER } from '../../test/support/parties.js';
import { createdTrain, reportedRaid } from '../../test/support/party-service.js';
import type { Party } from '../domain/party/party.js';
import { PartyStatus } from '../domain/party/status.js';
import type { Member } from './attendance-service.js';

const alice: Member = { id: ALICE, name: 'Alice' };

/** A crowd of this many members, by snowflakes of their own. */
const crowd = (count: number): string[] =>
  Array.from({ length: count }, (_, n) => `9${String(n).padStart(17, '0')}`);

/** Everybody in a crowd signed up as coming, in group A, unless `group` says otherwise. */
function withCrowd<P extends Party>(party: P, members: readonly string[], group = 'A'): P {
  const attendees = { ...party.attendees };
  for (const id of members) {
    attendees[id] = { number: 1, status: PartyStatus.Coming, group: group as 'A', remote: false };
  }
  return { ...party, attendees };
}

type Gateway = Awaited<ReturnType<typeof createdTrain>>['gateway'];

/** Who the messages of a post pinged since `from` messages, and how many messages it took. */
function pingedIn(gateway: Gateway, postId: string, from: number) {
  const sent = gateway.messagesIn(postId).slice(from);
  return {
    messages: sent.filter((message) => (message.message.mention?.users ?? []).length > 0).length,
    users: sent.flatMap((message) => message.message.mention?.users ?? []),
  };
}

/**
 * Plan 8X-4 (follow-ups of 8X-1): a Gigantamax train holds a hundred, so the pings of a group or a
 * party go in as many messages as it takes (`pingInMessages`), every member pinged once.
 */
describe('pings of a group or a party in as many messages as it takes (plan 8X-4)', () => {
  const many = crowd(150);

  it('pings everybody of a train that moves', async () => {
    const made = await createdTrain({ route: [4, 1, 7], kind: 'gigantamax' });
    await made.store.update(made.party.id, (party) => ({ party: withCrowd(party, many) }));
    await made.attendance.signUp(made.party.id, alice, PartyStatus.Coming);
    const before = made.gateway.messagesIn(made.postId).length;
    await made.trains.move(made.party.id, alice, 'next', false);
    await made.trains.flush();
    const pinged = pingedIn(made.gateway, made.postId, before);
    expect(new Set(pinged.users)).toEqual(new Set([REPORTER, ...many]));
    expect(pinged.users).toHaveLength(many.length + 1);
    expect(pinged.messages).toBeGreaterThan(1);
  });

  it('pings everybody of a train whose start is set', async () => {
    const made = await createdTrain({ kind: 'gigantamax' });
    await made.store.update(made.party.id, (party) => ({ party: withCrowd(party, many) }));
    const before = made.gateway.messagesIn(made.postId).length;
    await made.timed.setStartTime(made.party.id, { id: REPORTER }, PARTY_NOW + 60 * MINUTE);
    await made.timed.flush();
    const pinged = pingedIn(made.gateway, made.postId, before);
    expect(new Set(pinged.users)).toEqual(new Set(many));
    expect(pinged.users).toHaveLength(many.length);
  });

  it('pings everybody of a group whose meeting time is set, and of a group that is opened', async () => {
    const made = await reportedRaid();
    await made.store.update(made.party.id, (party) => ({ party: withCrowd(party, many) }));
    const before = made.gateway.messagesIn(made.postId).length;
    await made.attendance.setMeetingTime(made.party.id, { id: REPORTER }, PARTY_NOW + 30 * MINUTE);
    await made.attendance.flush();
    const met = pingedIn(made.gateway, made.postId, before);
    expect(new Set(met.users)).toEqual(new Set(many));
    expect(met.users).toHaveLength(many.length);
    const opened = made.gateway.messagesIn(made.postId).length;
    await made.attendance.newGroup(made.party.id, { id: REPORTER, name: 'Rae' });
    await made.attendance.flush();
    const grouped = pingedIn(made.gateway, made.postId, opened);
    expect(new Set(grouped.users)).toEqual(new Set(many));
  });

  it('pings everybody of a raid that moves to another region', async () => {
    const made = await reportedRaid();
    await made.store.update(made.party.id, (party) => ({ party: withCrowd(party, many) }));
    const before = made.gateway.messagesIn(made.postId).length;
    // Gym 8 lies in East.
    expect(await made.raids.setGym(made.party.id, { id: REPORTER }, 8)).toMatchObject({
      kind: 'ok',
    });
    const pinged = pingedIn(made.gateway, made.postId, before);
    expect(new Set(pinged.users)).toEqual(new Set(many));
    expect(pinged.users).toHaveLength(many.length);
  });

  it('says once that a raid moved when Discord fails after its first message', async () => {
    const made = await reportedRaid();
    await made.store.update(made.party.id, (party) => ({ party: withCrowd(party, many) }));
    const send = made.gateway.sendMessage.bind(made.gateway);
    let sent = 0;
    made.gateway.sendMessage = (channelId, message) => {
      if (channelId === made.postId && ++sent === 2) {
        return Promise.reject(new Error('Discord is down'));
      }
      return send(channelId, message);
    };
    // Gym 8 lies in East.
    expect(await made.raids.setGym(made.party.id, { id: REPORTER }, 8)).toMatchObject({
      kind: 'ok',
    });
    const said = made.gateway
      .messagesIn(made.postId)
      .filter((message) => message.message.content?.startsWith('This raid has moved to'));
    expect(said).toHaveLength(1);
  });

  it('pings everybody who went with a group split off a train', async () => {
    const made = await createdTrain({ route: [4, 1], kind: 'gigantamax' });
    await made.store.update(made.party.id, (party) => ({
      party: { ...withCrowd(party, many, 'B'), groups: [{ id: 'A' }, { id: 'B' }] },
    }));
    const split = await made.trains.split(made.party.id, { id: REPORTER }, true, 'B');
    expect(split.kind).toBe('split');
    if (split.kind !== 'split') return;
    const postId = split.party.forumPostId ?? '';
    const pinged = pingedIn(made.gateway, postId, 0);
    expect(new Set(pinged.users)).toEqual(new Set(many));
    expect(pinged.users).toHaveLength(many.length);
  });
});
