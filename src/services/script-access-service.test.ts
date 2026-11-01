import { describe, expect, it } from 'vitest';
import {
  ACCESS_KEY,
  COMMUNITY_MAX,
  OPEN_REQUESTS_NOTIFIED,
  REASK_MS,
} from '../domain/script-access/access.js';
import { RecordingDms } from '../../test/support/dms.js';
import { buttonsOf, textOf } from '../../test/support/messages.js';
import { ACCESS_NOW, ADMIN, OWNER } from '../../test/support/script-access-cases.js';
import { MemoryScriptAccess } from '../../test/support/script-access.js';
import { createTestLogger } from '../../test/support/test-logger.js';
import { DM_PRIORITY, type DmSender } from './dm-sender.js';
import { ScriptAccessService } from './script-access-service.js';

function serviceWith(options: { dms?: DmSender } = {}) {
  const store = new MemoryScriptAccess();
  const clock = { now: ACCESS_NOW };
  const { log, entries } = createTestLogger();
  const service = new ScriptAccessService({
    store,
    ownerId: OWNER,
    now: () => clock.now,
    log,
    ...options,
  });
  return { store, clock, entries, service };
}

const ASH = { id: ADMIN, name: 'Ash' };

describe('ScriptAccessService', () => {
  it('asks with the community line cut and on one line, and refuses an empty one', async () => {
    const { service, store } = serviceWith();
    expect(await service.ask(ASH, ' \n ')).toEqual({ kind: 'no-community' });
    expect(await store.all()).toEqual([]);
    const asked = await service.ask(
      { id: ADMIN, name: 'Zoë'.repeat(40) },
      `Pinewood\nraiders ${'x'.repeat(COMMUNITY_MAX)}`,
    );
    expect(asked.kind).toBe('asked');
    const row = await store.byUser(ADMIN);
    expect([...(row?.community ?? '')]).toHaveLength(COMMUNITY_MAX);
    expect(row?.community.startsWith('Pinewood raiders x')).toBe(true);
    expect([...(row?.name ?? '')]).toHaveLength(100);
    expect(row?.askedAt).toBe(ACCESS_NOW);
  });

  it('approves with a new random key each time, and clears it when refused or revoked', async () => {
    const { service, store, clock } = serviceWith();
    await service.ask(ASH, 'Pinewood');
    const id = (await store.byUser(ADMIN))?.id ?? 0;
    clock.now += 1_000;
    const approved = await service.decide(id, 'approve', 'asked');
    expect(approved).toMatchObject({ kind: 'decided', access: { state: 'approved' } });
    const first = approved.kind === 'decided' ? approved.access.key : null;
    expect(first).toMatch(ACCESS_KEY);
    expect((await store.byUser(ADMIN))?.decidedAt).toBe(ACCESS_NOW + 1_000);
    await service.decide(id, 'revoke', 'approved');
    expect((await store.byUser(ADMIN))?.key).toBeNull();
    const again = await service.decide(id, 'approve', 'revoked');
    const second = again.kind === 'decided' ? again.access.key : null;
    expect(second).toMatch(ACCESS_KEY);
    expect(second).not.toBe(first);
  });

  it('logs a decision by the row, never the key', async () => {
    const { service, store, entries } = serviceWith();
    await service.ask(ASH, 'Pinewood');
    const id = (await store.byUser(ADMIN))?.id ?? 0;
    const approved = await service.decide(id, 'approve', 'asked');
    expect(entries).toContainEqual(
      expect.objectContaining({
        access: id,
        decision: 'approve',
        outcome: 'decided',
        msg: 'a request for the Wayspot export tool was decided',
      }),
    );
    const key = approved.kind === 'decided' ? (approved.access.key ?? 'none') : 'none';
    expect(JSON.stringify(entries)).not.toContain(key);
  });

  it('makes a new link for an approved member only', async () => {
    const { service, store } = serviceWith();
    expect(await service.newLink(ADMIN)).toBeUndefined();
    await service.ask(ASH, 'Pinewood');
    const id = (await store.byUser(ADMIN))?.id ?? 0;
    const approved = await service.decide(id, 'approve', 'asked');
    const old = approved.kind === 'decided' ? approved.access.key : null;
    const renewed = await service.newLink(ADMIN);
    expect(renewed?.key).toMatch(ACCESS_KEY);
    expect(renewed?.key).not.toBe(old);
  });

  it('puts a DM of a new request in line for the owner, and of a request asked again', async () => {
    const dms = new RecordingDms();
    const { service, store, clock } = serviceWith({ dms });
    await service.ask(ASH, 'Pinewood');
    const [job] = dms.jobs;
    expect(dms.recipients).toEqual([OWNER]);
    expect(job).toMatchObject({
      priority: DM_PRIORITY.normal,
      eventAt: ACCESS_NOW,
      expiresAt: ACCESS_NOW + 7 * 86_400_000,
    });
    const id = (await store.byUser(ADMIN))?.id ?? 0;
    expect(buttonsOf(job?.message).map((button) => button.customId)).toEqual([
      `scriptaccess:${id}:approve:${ACCESS_NOW.toString(36)}`,
      `scriptaccess:${id}:refuse:${ACCESS_NOW.toString(36)}`,
    ]);
    // Asking again while the request is open changes nothing and tells nobody.
    await service.ask(ASH, 'Pinewood');
    expect(dms.jobs).toHaveLength(1);
    await service.decide(id, 'refuse', 'asked');
    clock.now += REASK_MS;
    await service.ask(ASH, 'Pinewood again');
    expect(dms.jobs).toHaveLength(2);
    expect(textOf(dms.jobs[1]?.message)).toContain('Pinewood again');
    expect(buttonsOf(dms.jobs[1]?.message)[0]?.customId).toBe(
      `scriptaccess:${id}:approve:${clock.now.toString(36)}`,
    );
  });

  it('tells the owner of at most 20 open requests: the rest wait on the page', async () => {
    const dms = new RecordingDms();
    const { service, store } = serviceWith({ dms });
    for (let n = 0; n < OPEN_REQUESTS_NOTIFIED + 2; n++) {
      await service.ask({ id: `3000000000000000${String(n).padStart(2, '0')}`, name: 'Bot' }, 'x');
    }
    expect(await store.openCount()).toBe(OPEN_REQUESTS_NOTIFIED + 2);
    expect(dms.jobs).toHaveLength(OPEN_REQUESTS_NOTIFIED);
  });

  it("makes the owner's link, and nobody else's that way", async () => {
    const { service } = serviceWith();
    expect(service.isOwner(OWNER)).toBe(true);
    expect(service.isOwner(ADMIN)).toBe(false);
    expect(await service.ownerLink(ASH)).toBeUndefined();
    const made = await service.ownerLink({ id: OWNER, name: 'Matt' });
    expect(made).toMatchObject({ userId: OWNER, state: 'approved' });
    expect(made?.key).toMatch(ACCESS_KEY);
  });
});
