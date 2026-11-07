import { describe, expect, it } from 'vitest';
import { ALICE, at, BOB, MINUTE, REPORTER } from '../../test/support/parties.js';
import { reportedRaid } from '../../test/support/party-service.js';
import { gymsFixture } from '../../test/support/providers.js';
import { createTestContext } from '../../test/support/test-context.js';
import { closePartyAs } from '../commands/parties/delete.js';
import { PartyStatus } from '../domain/party/status.js';
import { AUDIT_KEEP_MS } from './party-audit.js';

const HATCH = at('2026-10-13T14:30');
const MOD = { id: '200000000000000009', name: 'Misty' };

type Made = Awaited<ReturnType<typeof reportedRaid>>;

/** The log of the raid's post as `/audit` reads it: who did what, oldest first. */
async function logOf(made: Made, postId = made.postId) {
  await made.service.flush();
  await made.audit.flush();
  const rows = await made.auditStore.ofPost(made.gateway.guildId, postId);
  return rows.map((row) => ({ actor: row.actor?.id ?? 'Pine', action: row.entry.action }));
}

describe('PartyAudit', () => {
  it('logs a reported raid by its reporter, in its post, anonymous or not', async () => {
    const made = await reportedRaid({ anonymous: true, reporter: { name: 'Ash' } });
    expect(await logOf(made)).toEqual([{ actor: REPORTER, action: 'created' }]);
    const [created] = await made.auditStore.ofPost(made.gateway.guildId, made.postId);
    expect(created).toMatchObject({
      partyId: made.party.id,
      postId: made.postId,
      actor: { id: REPORTER },
      entry: { action: 'created', kind: 'raid', anonymous: true, place: 'The Stacks' },
    });
  });

  it("logs a member's change of the boss and of the gym with who made it", async () => {
    const made = await reportedRaid();
    await made.raids.setBoss(
      made.party.id,
      { id: ALICE, name: 'Alice' },
      {
        tier: { level: 'T5', shadow: false },
        boss: { key: 'yveltal' },
        label: 'Yveltal',
      },
    );
    const gym2 = gymsFixture().get(2);
    if (!gym2) throw new Error('no gym 2');
    await made.raids.setGym(made.party.id, { id: BOB }, gym2.id);
    expect(await logOf(made)).toEqual([
      { actor: REPORTER, action: 'created' },
      { actor: ALICE, action: 'boss' },
      { actor: BOB, action: 'place' },
    ]);
    const rows = await made.auditStore.ofPost(made.gateway.guildId, made.postId);
    expect(rows[1]?.actor).toEqual({ id: ALICE, name: 'Alice' });
    expect(rows[2]?.entry).toEqual({
      action: 'place',
      from: 'The Stacks',
      to: 'Old Stone Fountain',
    });
  });

  it('logs nothing for what it does not keep: attendance', async () => {
    const made = await reportedRaid();
    await made.attendance.signUp(made.party.id, { id: ALICE }, PartyStatus.Interested);
    expect(await logOf(made)).toEqual([{ actor: REPORTER, action: 'created' }]);
  });

  it('logs a raid closed by staff with their choice for the post, and one ended by the clock as Pine', async () => {
    const closed = await reportedRaid();
    const { ctx } = createTestContext({
      partyService: closed.service,
      attendance: closed.attendance,
      parties: closed.store,
      regions: closed.regions,
    });
    await closePartyAs(ctx, closed.party, MOD, 'archive');
    expect(await logOf(closed)).toEqual([
      { actor: REPORTER, action: 'created' },
      { actor: MOD.id, action: 'ended' },
    ]);
    const rows = await closed.auditStore.ofPost(closed.gateway.guildId, closed.postId);
    expect(rows[1]?.entry).toEqual({
      action: 'ended',
      how: 'closed',
      by: 'staff',
      removal: 'archive',
    });

    const timed = await reportedRaid({ time: { hatch: HATCH } });
    timed.clock.now = at('2026-10-13T23:00');
    await timed.scheduler.tick();
    await timed.scheduler.whenIdle();
    await timed.service.flush();
    timed.clock.now += 60 * MINUTE;
    await timed.scheduler.tick();
    await timed.scheduler.whenIdle();
    const log = await logOf(timed);
    expect(log.at(-1)).toEqual({ actor: 'Pine', action: 'ended' });
    const last = (await timed.auditStore.ofPost(timed.gateway.guildId, timed.postId)).at(-1);
    expect(last?.entry).toEqual({ action: 'ended', how: 'clock' });
  });

  it('follows a raid moved to another region from its new post back to the old one', async () => {
    const made = await reportedRaid();
    const east = gymsFixture().get(8);
    if (!east) throw new Error('no gym 8');
    const outcome = await made.raids.setGym(made.party.id, { id: BOB, name: 'Bob' }, east.id);
    if (outcome.kind !== 'ok' || outcome.party.forumPostId === null) {
      throw new Error(`the raid did not move: ${outcome.kind}`);
    }
    const newPost = outcome.party.forumPostId;
    // The new party is added before the old one ends.
    expect(await logOf(made, newPost)).toEqual([
      { actor: REPORTER, action: 'created' },
      { actor: BOB, action: 'moved' },
      { actor: BOB, action: 'ended' },
    ]);
    expect(await logOf(made)).toEqual([
      { actor: REPORTER, action: 'created' },
      { actor: BOB, action: 'ended' },
    ]);
  });

  it('warns of an entry it could not write, and the change goes on', async () => {
    const made = await reportedRaid();
    made.auditStore.failing.set('insert', new Error('database down'));
    const outcome = await made.service.keep(made.party.id, true, { id: ALICE });
    expect(outcome).toBe('kept');
    await made.audit.flush();
    expect(
      made.entries.find((entry) => entry.msg === 'could not write to the audit log'),
    ).toMatchObject({
      level: 40,
      msg: 'could not write to the audit log',
    });
  });

  it('keeps entries 30 days, deleting older ones with the upkeep', async () => {
    const made = await reportedRaid();
    await made.service.keep(made.party.id, true, { id: ALICE, name: 'Alice' });
    await made.audit.flush();
    made.clock.now += AUDIT_KEEP_MS;
    expect(await made.audit.sweep()).toBe(0);
    made.clock.now += 1;
    expect(await made.audit.sweep()).toBe(2);
    expect(await logOf(made)).toEqual([]);
  });
});
