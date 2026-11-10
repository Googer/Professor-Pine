import { describe, expect, it } from 'vitest';
import { MemoryPartyAudit } from '../../test/support/party-audit.js';
import { ALICE, at, BOB, CAROL, MINUTE, REPORTER, testRaid } from '../../test/support/parties.js';
import {
  createdMeetup,
  createdTrain,
  reportedMax,
  reportedRaid,
} from '../../test/support/party-service.js';
import { reportedMeetup } from '../../test/support/reports-service.js';
import { MODERATOR } from '../../test/support/meetup-safety-cases.js';
import { createTestLogger } from '../../test/support/test-logger.js';
import { gymStop } from '../domain/party/stops.js';
import { setSaved, type Party } from '../domain/party/party.js';
import type { AuditNames } from '../domain/party/audit.js';
import type { PartyListener } from './party-store.js';
import { gymsFixture } from '../../test/support/providers.js';
import { createTestContext } from '../../test/support/test-context.js';
import { closePartyAs } from '../commands/parties/delete.js';
import { PartyStatus } from '../domain/party/status.js';
import { AUDIT_KEEP_MS, AUDIT_QUEUE_CAP, PartyAudit } from './party-audit.js';

const HATCH = at('2026-10-13T14:30');
const MOD = { id: '200000000000000009', name: 'Misty' };

type Made = Pick<
  Awaited<ReturnType<typeof reportedRaid>>,
  'service' | 'audit' | 'auditStore' | 'gateway' | 'postId'
>;

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

  it("deletes entries older than 30 days with the scheduler's hourly upkeep", async () => {
    const made = await reportedRaid();
    await made.audit.flush();
    made.clock.now += AUDIT_KEEP_MS + 2 * 60 * MINUTE;
    await made.scheduler.tick();
    await made.scheduler.whenIdle();
    expect(made.auditStore.rows.filter((row) => row.entry.action === 'created')).toEqual([]);
  });
});

describe('PartyAudit: the services that change parties', () => {
  it("logs a meetup's name and information by who changed them (TimedPartyService)", async () => {
    const made = await createdMeetup();
    await made.timed.setName(made.party.id, { id: REPORTER, name: 'Rep' }, 'Picnic');
    await made.timed.setDescription(made.party.id, { id: REPORTER }, 'Bring snacks');
    expect(await logOf(made)).toEqual([
      { actor: REPORTER, action: 'created' },
      { actor: REPORTER, action: 'name' },
      { actor: REPORTER, action: 'info' },
    ]);
  });

  it("logs a train's route and conductor by who changed them (TrainService), and a conductor who leaves", async () => {
    const made = await createdTrain();
    await made.trains.addStop(made.party.id, { id: REPORTER }, gymStop(1));
    await made.attendance.signUp(made.party.id, { id: BOB }, PartyStatus.Interested);
    await made.trains.setConductor(made.party.id, { id: BOB, name: 'Bob' });
    await made.attendance.leave(made.party.id, { id: BOB });
    expect(await logOf(made)).toEqual([
      { actor: REPORTER, action: 'created' },
      { actor: REPORTER, action: 'route' },
      { actor: BOB, action: 'conductor' },
      { actor: BOB, action: 'conductor' },
    ]);
  });

  it("logs a max battle's boss by who set it (MaxChangeService)", async () => {
    const made = await reportedMax();
    await made.maxes.setBoss(
      made.party.id,
      { id: ALICE },
      {
        boss: { key: 'machamp' },
        tier: 'D3',
        label: 'Machamp',
      },
    );
    expect((await logOf(made)).at(-1)).toEqual({ actor: ALICE, action: 'boss' });
  });

  it('logs a meetup closed on a report by the moderator who decided (ModerationReports.decide)', async () => {
    const made = await reportedMeetup();
    const outcome = await made.report();
    if (outcome.kind !== 'sent') throw new Error(outcome.kind);
    await made.reports.decide(
      outcome.report.id,
      'close',
      'delete',
      { id: MODERATOR, name: 'Mod' },
      outcome.report.serverId,
      'Pine Town',
    );
    await made.audit.flush();
    const ended = made.auditStore.rows.find((row) => row.entry.action === 'ended');
    expect(ended).toMatchObject({
      actor: { id: MODERATOR, name: 'Mod' },
      entry: { how: 'closed', by: 'moderators', removal: 'delete' },
    });
  });

  it("logs a train's split apart: the new train made, the old one's conductor gone with the group", async () => {
    const made = await createdTrain({ route: [4, 1] });
    await made.attendance.signUp(made.party.id, { id: CAROL }, PartyStatus.Interested);
    // Carol alone in group B.
    await made.store.update(made.party.id, (party) => {
      const carol = party.attendees[CAROL];
      if (!carol) return {};
      return {
        party: {
          ...party,
          groups: [{ id: 'A' }, { id: 'B' }],
          attendees: { ...party.attendees, [CAROL]: { ...carol, group: 'B' } },
        },
      };
    });
    await made.trains.setConductor(made.party.id, { id: CAROL, name: 'Carol' });
    const split = await made.trains.split(made.party.id, { id: CAROL, name: 'Carol' }, false, 'B');
    if (split.kind !== 'split') throw new Error(JSON.stringify(split));
    await made.audit.flush();
    const of = (partyId: string) =>
      made.auditStore.rows
        .filter((row) => row.partyId === partyId)
        .map((row) => ({ actor: row.actor?.id ?? 'Pine', action: row.entry.action }));
    expect(of(made.party.id).at(-1)).toEqual({ actor: CAROL, action: 'conductor' });
    expect(of(split.party.id)[0]).toEqual({ actor: CAROL, action: 'created' });
  });
});

describe('PartyAudit: its queue', () => {
  const NAMES: AuditNames = {
    gym: () => undefined,
    spot: () => undefined,
    boss: () => 'Boss',
    move: () => undefined,
    channel: () => undefined,
  };

  /** A log over a store of its own, whose writes wait until `release()`. */
  function heldLog() {
    const listeners: PartyListener[] = [];
    const storage = new MemoryPartyAudit();
    let release = (): void => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const insert = storage.insert.bind(storage);
    storage.insert = async (rows) => {
      await gate;
      await insert(rows);
    };
    const { log, entries } = createTestLogger();
    const audit = new PartyAudit({
      store: { onChange: (listener) => listeners.push(listener), get: () => undefined },
      storage,
      guilds: { snowflakeOf: () => Promise.resolve('1') },
      names: NAMES,
      log,
    });
    let raid: Party = testRaid();
    /** A change the log keeps: the raid kept or let go again. */
    const change = () => {
      const before = raid;
      raid = setSaved(raid, !raid.saved);
      for (const listener of listeners) listener(before, raid);
    };
    return { audit, storage, entries, change, release: () => release() };
  }

  it('keeps at most AUDIT_QUEUE_CAP writes waiting, and warns once per burst of what it drops', async () => {
    const held = heldLog();
    for (let n = 0; n < AUDIT_QUEUE_CAP + 10; n++) held.change();
    const drops = () => held.entries.filter((entry) => entry.msg === 'the audit log drops entries');
    expect(drops()).toHaveLength(1);
    held.release();
    await held.audit.flush();
    expect(held.storage.rows).toHaveLength(AUDIT_QUEUE_CAP);
    // After the queue drained, a new burst would be told of again; a small one drops nothing.
    for (let n = 0; n < 3; n++) held.change();
    await held.audit.flush();
    expect(drops()).toHaveLength(1);
    expect(held.storage.rows).toHaveLength(AUDIT_QUEUE_CAP + 3);
  });
});
