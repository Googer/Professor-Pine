import { describe, expect, it } from 'vitest';
import { TEST_GUILD_ROW } from '../../test/support/gyms.js';
import { gymsFixture } from '../../test/support/providers.js';
import { ALICE, BOB, CAROL, REPORTER } from '../../test/support/parties.js';
import { reportedRaid } from '../../test/support/party-service.js';
import { attendeeOf } from '../domain/party/party.js';
import { PartyStatus } from '../domain/party/status.js';
import type { Member } from './attendance-service.js';

const alice: Member = { id: ALICE, name: 'Alice' };
const bob: Member = { id: BOB, name: 'Bob' };
const carol: Member = { id: CAROL, name: 'Carol' };

/** A raid whose groups hold four trainers, as a Dynamax battle's will (plan 8X-3). */
const inLobbiesOf4 = { lobbySize: () => 4 };

describe('AttendanceService: Join where the party has a lobby size', () => {
  it('opens a group for whoever does not fit, silently: the line says only how they stand', async () => {
    const made = await reportedRaid({}, inLobbiesOf4);
    await made.attendance.signUp(made.party.id, alice, PartyStatus.Coming, { number: 4 });
    const outcome = await made.attendance.signUp(made.party.id, bob, PartyStatus.Coming);
    expect(outcome).toMatchObject({ kind: 'ok', acted: true, attendee: { group: 'B' } });
    expect(made.current().groups.map((group) => group.id)).toEqual(['A', 'B']);
    expect(made.current().defaultGroupId).toBe('B');
    await made.attendance.signUp(made.party.id, carol, PartyStatus.Interested, { number: 4 });
    expect(attendeeOf(made.current(), CAROL)?.group).toBe('C');
    await made.attendance.flush();
    await made.service.flush();
    expect(made.said()).toEqual([
      `**Alice** (<@${ALICE}>) is coming with 3 more.`,
      `**Bob** (<@${BOB}>) is coming, in group B.\n` +
        `**Carol** (<@${CAROL}>) is interested with 3 more, in group C.`,
    ]);
    // Nobody pinged, no message but the lines.
    expect(made.gateway.messagesIn(made.postId).every((m) => !m.message.mention)).toBe(true);
  });

  it('puts a member who names a group there, over its size', async () => {
    const made = await reportedRaid({}, inLobbiesOf4);
    await made.attendance.signUp(made.party.id, alice, PartyStatus.Coming, { number: 4 });
    await made.attendance.signUp(made.party.id, bob, PartyStatus.Coming);
    const back = await made.attendance.joinGroup(made.party.id, bob, 'A');
    expect(back).toMatchObject({ kind: 'ok', attendee: { group: 'A' } });
  });

  it('places a reporter whom a second report signs up', async () => {
    const made = await reportedRaid({ autoStatus: PartyStatus.Coming }, inLobbiesOf4);
    await made.attendance.signUp(made.party.id, alice, PartyStatus.Coming, { number: 3 });
    const gym = gymsFixture().stored(1);
    if (!gym) throw new Error('no gym 1');
    const again = await made.service.reportRaid({
      gym,
      guildRow: TEST_GUILD_ROW,
      reporterId: BOB,
      anonymous: false,
      autoStatus: PartyStatus.Coming,
      tier: { level: 'T5', shadow: false },
      boss: null,
    });
    expect(again).toMatchObject({ kind: 'exists', joined: true });
    expect(attendeeOf(made.current(), REPORTER)?.group).toBe('A');
    expect(attendeeOf(made.current(), BOB)?.group).toBe('B');
  });

  it('keeps the default group for every party there is today', async () => {
    const made = await reportedRaid();
    await made.attendance.signUp(made.party.id, alice, PartyStatus.Coming, { number: 20 });
    await made.attendance.signUp(made.party.id, bob, PartyStatus.Coming);
    expect(attendeeOf(made.current(), BOB)?.group).toBe('A');
    expect(made.current().groups).toHaveLength(1);
  });
});
