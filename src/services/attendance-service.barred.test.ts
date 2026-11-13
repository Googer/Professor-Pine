import { describe, expect, it, vi } from 'vitest';
import { EAST_CHANNEL, EAST_FORUM, WEST_FORUM } from '../../test/support/gyms.js';
import { ALICE, BOB, CAROL } from '../../test/support/parties.js';
import { createdMeetup, createdTrain, reportedRaid } from '../../test/support/party-service.js';
import { attendeeOf, groupStamp } from '../domain/party/party.js';
import { PartyStatus } from '../domain/party/status.js';
import type { Member } from './attendance-service.js';

const alice: Member = { id: ALICE, name: 'Alice', team: 'mystic' };
const bob: Member = { id: BOB, name: 'Bob' };
const KEPT_OUT = { kind: 'refused', reason: 'kept-out' };

// The audit of 2026-11-10 (L-D2, D15): a member somebody keeps out of a forum could still sign
// up for a party there, through a copy of its post in another channel or by its id on the map,
// and so ping and DM its members. `AccessService` only logged it.
describe('AttendanceService: a newcomer somebody keeps out of the forum (plan 8Z-2)', () => {
  it('refuses every way of signing up, and changes and says nothing', async () => {
    const made = await reportedRaid();
    made.gateway.barred.set(WEST_FORUM, new Set([ALICE]));
    const id = made.party.id;
    const stamp = groupStamp(made.current(), made.current().groups[0] ?? {});
    const tries = [
      made.attendance.signUp(id, alice, PartyStatus.Interested),
      made.attendance.signUp(id, alice, PartyStatus.Coming),
      made.attendance.signUp(id, alice, PartyStatus.Present),
      made.attendance.joinChosen(id, alice, PartyStatus.Coming, { any: true }),
      made.attendance.joinInto(id, alice, 'A'),
      made.attendance.joinGroup(id, alice, 'A'),
      made.attendance.joinStamped(id, alice, 'A', stamp),
      made.attendance.newGroup(id, alice),
      made.attendance.setRemote(id, alice, true),
      made.attendance.changeNumber(id, alice, 1),
    ];
    for (const outcome of await Promise.all(tries)) expect(outcome).toEqual(KEPT_OUT);
    await made.attendance.flush();
    await made.access.flush();
    expect(attendeeOf(made.current(), ALICE)).toBeUndefined();
    expect(made.current().groups).toHaveLength(1);
    expect(made.said()).toEqual([]);
    expect(made.gateway.admitted.get(WEST_FORUM)?.has(ALICE) ?? false).toBe(false);
    // Nobody else is held up by it.
    expect(await made.attendance.signUp(id, bob, PartyStatus.Coming)).toMatchObject({
      kind: 'ok',
    });
  });

  it('refuses a member who is not in the party’s server as kept out (plan 19B-4)', async () => {
    const made = await reportedRaid();
    made.gateway.leftServer.add(ALICE);
    expect(await made.attendance.signUp(made.party.id, alice, PartyStatus.Coming)).toEqual(
      KEPT_OUT,
    );
    await made.attendance.flush();
    expect(attendeeOf(made.current(), ALICE)).toBeUndefined();
    expect(made.said()).toEqual([]);
    // A member of the server is let in as before.
    expect(await made.attendance.signUp(made.party.id, bob, PartyStatus.Coming)).toMatchObject({
      kind: 'ok',
    });
  });

  it('refuses a newcomer to a train and to a meetup the same way', async () => {
    const train = await createdTrain();
    train.gateway.barred.set(WEST_FORUM, new Set([ALICE]));
    expect(await train.attendance.signUp(train.party.id, alice, PartyStatus.Coming)).toEqual(
      KEPT_OUT,
    );
    const meetup = await createdMeetup();
    meetup.gateway.barred.set(WEST_FORUM, new Set([ALICE]));
    expect(await meetup.attendance.signUp(meetup.party.id, alice, PartyStatus.Coming)).toEqual(
      KEPT_OUT,
    );
  });

  it('lets a member who is signed up already change their own line and leave', async () => {
    const made = await reportedRaid();
    const id = made.party.id;
    await made.attendance.signUp(id, alice, PartyStatus.Interested);
    // Kept out since.
    made.gateway.barred.set(WEST_FORUM, new Set([ALICE]));
    expect(await made.attendance.signUp(id, alice, PartyStatus.Coming)).toMatchObject({
      kind: 'ok',
      attendee: { status: PartyStatus.Coming },
    });
    expect(await made.attendance.changeNumber(id, alice, 1)).toMatchObject({
      kind: 'ok',
      attendee: { number: 2 },
    });
    expect(await made.attendance.leave(id, alice)).toMatchObject({ kind: 'ok', acted: true });
    expect(attendeeOf(made.current(), ALICE)).toBeUndefined();
    // Having left, they are a newcomer again.
    expect(await made.attendance.signUp(id, alice, PartyStatus.Coming)).toEqual(KEPT_OUT);
  });

  it('lets a newcomer in whom the forum is only hidden from until they join', async () => {
    const made = await reportedRaid();
    made.gateway.shutOut(WEST_FORUM, ALICE);
    expect(await made.gateway.memberAccess(WEST_FORUM, ALICE)).toBe('hidden');
    expect(await made.attendance.signUp(made.party.id, alice, PartyStatus.Coming)).toMatchObject({
      kind: 'ok',
      acted: true,
    });
    await made.access.flush();
    expect(made.gateway.canSee(WEST_FORUM, ALICE)).toBe(true);
  });

  it('refuses a newcomer while Discord cannot say, in words of its own; who is signed up goes on', async () => {
    const made = await reportedRaid();
    const id = made.party.id;
    await made.attendance.signUp(id, bob, PartyStatus.Coming);
    made.gateway.failing.set('memberAccess', new Error('Discord is away'));
    expect(await made.attendance.signUp(id, alice, PartyStatus.Coming)).toEqual({
      kind: 'refused',
      reason: 'forum-unknown',
    });
    expect(attendeeOf(made.current(), ALICE)).toBeUndefined();
    expect(made.entries).toContainEqual(
      expect.objectContaining({
        level: 40,
        party: id,
        member: ALICE,
        msg: 'could not ask Discord whether a newcomer is kept out of the forum of a party; refused',
      }),
    );
    // Bob is asked nothing of: Discord is not needed for him.
    expect(await made.attendance.signUp(id, bob, PartyStatus.Present)).toMatchObject({
      kind: 'ok',
    });
    expect(await made.attendance.leave(id, bob)).toMatchObject({ kind: 'ok' });
  });

  it('asks nothing of a party that is over for a newcomer, nor of one that is gone', async () => {
    const made = await reportedRaid();
    made.gateway.failing.set('memberAccess', new Error('Discord is away'));
    const gone = '00000000-0000-4000-8000-00000000ffff';
    expect(await made.attendance.signUp(gone, alice, PartyStatus.Coming)).toEqual({
      kind: 'gone',
    });
    made.clock.now = (made.current().lastPossibleTime ?? 0) + 60_000;
    expect(await made.attendance.signUp(made.party.id, alice, PartyStatus.Coming)).toEqual({
      kind: 'gone',
    });
  });

  // Fix round F-A2: a newcomer goes on only as they were asked about, decided inside the store.
  it('refuses a newcomer whose party stands in another forum by the write, as changed meanwhile', async () => {
    const made = await reportedRaid();
    const id = made.party.id;
    const look = made.gateway.memberAccess.bind(made.gateway);
    vi.spyOn(made.gateway, 'memberAccess').mockImplementationOnce(async (forumId, memberId) => {
      // While Alice is asked about West's forum, the party comes to stand in East's (a raid
      // moved to another region is a party of its own: the store's own change stands for it).
      await made.store.update(id, (party) => ({ party: { ...party, forumChannelId: EAST_FORUM } }));
      return look(forumId, memberId);
    });
    expect(await made.attendance.signUp(id, alice, PartyStatus.Coming)).toEqual({
      kind: 'refused',
      reason: 'changed-meanwhile',
    });
    expect(made.current().forumChannelId).toBe(EAST_FORUM);
    expect(attendeeOf(made.current(), ALICE)).toBeUndefined();
    // Asked again, about East's forum now, they are let in.
    expect(await made.attendance.signUp(id, alice, PartyStatus.Coming)).toMatchObject({
      kind: 'ok',
      acted: true,
    });
  });

  it('refuses a member who left while their change waited, as changed meanwhile, never asking Discord', async () => {
    const made = await reportedRaid();
    const id = made.party.id;
    await made.attendance.signUp(id, alice, PartyStatus.Coming);
    const asked = vi.spyOn(made.gateway, 'memberAccess');
    const update = made.store.update.bind(made.store);
    let left = false;
    vi.spyOn(made.store, 'update').mockImplementation(async (partyId, change, cause) => {
      if (!left) {
        // Alice's +1 was decided on as hers: she leaves before it is written.
        left = true;
        expect(await made.attendance.leave(id, alice)).toMatchObject({ kind: 'ok', acted: true });
      }
      return update(partyId, change, cause);
    });
    expect(await made.attendance.changeNumber(id, alice, 1)).toEqual({
      kind: 'refused',
      reason: 'changed-meanwhile',
    });
    expect(attendeeOf(made.current(), ALICE)).toBeUndefined();
    expect(asked).not.toHaveBeenCalled();
  });

  it('holds a copy of a train in another region to it: the party is the same', async () => {
    const made = await createdTrain({ route: [4, 7] });
    expect(made.gateway.messagesIn(EAST_CHANNEL).length).toBeGreaterThan(0);
    made.gateway.barred.set(WEST_FORUM, new Set([CAROL]));
    const carol: Member = { id: CAROL, name: 'Carol' };
    expect(await made.attendance.signUp(made.party.id, carol, PartyStatus.Coming)).toEqual(
      KEPT_OUT,
    );
  });
});
