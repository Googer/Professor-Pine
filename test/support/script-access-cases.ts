import { expect, it } from 'vitest';
import {
  FETCH_RECORD_MS,
  REASK_MS,
  type AccessRequest,
  type ScriptAccessStore,
} from '../../src/domain/script-access/access.js';

/** When the requests of these cases are made (2026-10-19 12:00 UTC). */
export const ACCESS_NOW = Date.UTC(2026, 9, 19, 12);
export const ADMIN = '200000000000000021';
export const OTHER_ADMIN = '200000000000000022';
export const OWNER = '200000000000000029';

/** A key as `ScriptAccessService` makes one: 64 hex digits, numbered here. */
export function accessKey(n: number): string {
  return n.toString(16).padStart(64, 'a');
}

/** Ash's request for the Pinewood raiders, at `at`. */
export function accessRequest(overrides: Partial<AccessRequest> = {}): AccessRequest {
  return {
    userId: ADMIN,
    name: 'Ash',
    community: 'Pinewood raiders',
    at: ACCESS_NOW,
    ...overrides,
  };
}

/**
 * What the access rows of the Wayfarer export tool do, run against the repository and its twin
 * in memory alike. `made` gives a fresh, empty store.
 */
export function scriptAccessCases(made: () => Promise<ScriptAccessStore>): void {
  it('makes a request, found by member and by id, and asks nothing new of a request open', async () => {
    const store = await made();
    const first = await store.ask(accessRequest());
    expect(first).toMatchObject({
      kind: 'asked',
      access: {
        userId: ADMIN,
        name: 'Ash',
        community: 'Pinewood raiders',
        state: 'asked',
        key: null,
        askedAt: ACCESS_NOW,
        decidedAt: null,
        lastFetchAt: null,
        lastVersion: null,
      },
    });
    expect(await store.byUser(ADMIN)).toEqual(first.access);
    expect(await store.byId(first.access.id)).toEqual(first.access);
    expect(await store.byUser(OTHER_ADMIN)).toBeUndefined();
    const again = await store.ask(accessRequest({ community: 'Elsewhere', at: ACCESS_NOW + 5 }));
    expect(again).toEqual({ kind: 'standing', access: first.access });
    expect(await store.openCount()).toBe(1);
  });

  it('keeps names and community lines as given, accents and emoji too', async () => {
    const store = await made();
    const { access } = await store.ask(
      accessRequest({ name: 'Zoë 🌲 <b>', community: 'Tōkyō 🌲 & <i>friends</i>' }),
    );
    expect(await store.byId(access.id)).toMatchObject({
      name: 'Zoë 🌲 <b>',
      community: 'Tōkyō 🌲 & <i>friends</i>',
    });
  });

  it('approves with a key, found by the key alone, compared byte for byte', async () => {
    const store = await made();
    const { access } = await store.ask(accessRequest());
    const decided = await store.decide(access.id, {
      decision: 'approve',
      from: 'asked',
      key: accessKey(1),
      at: ACCESS_NOW + 1_000,
    });
    expect(decided).toMatchObject({
      kind: 'decided',
      access: { state: 'approved', key: accessKey(1), decidedAt: ACCESS_NOW + 1_000 },
    });
    expect(await store.byKey(accessKey(1))).toMatchObject({ id: access.id, state: 'approved' });
    expect(await store.byKey(accessKey(1).toUpperCase())).toBeUndefined();
    expect(await store.byKey(accessKey(2))).toBeUndefined();
    expect(await store.openCount()).toBe(0);
  });

  it('decides on the row as it is: a decision from another state changes nothing', async () => {
    const store = await made();
    const { access } = await store.ask(accessRequest());
    await store.decide(access.id, { decision: 'refuse', from: 'asked', key: null, at: 2 });
    const late = await store.decide(access.id, {
      decision: 'approve',
      from: 'asked',
      key: accessKey(1),
      at: 3,
    });
    expect(late).toMatchObject({ kind: 'changed', access: { state: 'refused', key: null } });
    // A decision that does not fit the state it names is no decision either.
    const unfit = await store.decide(access.id, {
      decision: 'revoke',
      from: 'refused',
      key: null,
      at: 4,
    });
    expect(unfit).toMatchObject({ kind: 'changed', access: { state: 'refused', decidedAt: 2 } });
    expect(
      await store.decide(access.id + 1000, { decision: 'refuse', from: 'asked', key: null, at: 5 }),
    ).toEqual({
      kind: 'gone',
    });
  });

  it('takes a decision named for one asking only while the request is that asking', async () => {
    const store = await made();
    const { access } = await store.ask(accessRequest({ at: ACCESS_NOW }));
    await store.decide(access.id, { decision: 'refuse', from: 'asked', key: null, at: ACCESS_NOW });
    const later = ACCESS_NOW + REASK_MS;
    await store.ask(accessRequest({ at: later }));
    // A button drawn for the first asking, pressed once the member asked again.
    const old = await store.decide(access.id, {
      decision: 'approve',
      from: 'asked',
      askedAt: ACCESS_NOW,
      key: accessKey(1),
      at: later + 1,
    });
    expect(old).toMatchObject({ kind: 'changed', access: { state: 'asked', askedAt: later } });
    expect(await store.byKey(accessKey(1))).toBeUndefined();
    const current = await store.decide(access.id, {
      decision: 'approve',
      from: 'asked',
      askedAt: later,
      key: accessKey(1),
      at: later + 2,
    });
    expect(current).toMatchObject({ kind: 'decided', access: { state: 'approved' } });
  });

  it('clears the key at a revocation, and approving again makes a new one', async () => {
    const store = await made();
    const { access } = await store.ask(accessRequest());
    await store.decide(access.id, { decision: 'approve', from: 'asked', key: accessKey(1), at: 2 });
    const revoked = await store.decide(access.id, {
      decision: 'revoke',
      from: 'approved',
      key: null,
      at: 3,
    });
    expect(revoked).toMatchObject({ kind: 'decided', access: { state: 'revoked', key: null } });
    expect(await store.byKey(accessKey(1))).toBeUndefined();
    const again = await store.decide(access.id, {
      decision: 'approve',
      from: 'revoked',
      key: accessKey(2),
      at: 4,
    });
    expect(again).toMatchObject({
      kind: 'decided',
      access: { state: 'approved', key: accessKey(2) },
    });
    expect(await store.byKey(accessKey(2))).toMatchObject({ id: access.id });
  });

  it('lets a refused member ask again 30 days after the refusal, not before', async () => {
    const store = await made();
    const { access } = await store.ask(accessRequest());
    await store.decide(access.id, { decision: 'refuse', from: 'asked', key: null, at: ACCESS_NOW });
    const early = await store.ask(accessRequest({ at: ACCESS_NOW + REASK_MS - 1 }));
    expect(early).toMatchObject({ kind: 'standing', access: { state: 'refused' } });
    const later = ACCESS_NOW + REASK_MS;
    const renewed = await store.ask(
      accessRequest({ name: 'Ash K.', community: 'Pinewood East', at: later }),
    );
    expect(renewed).toEqual({
      kind: 'asked',
      access: {
        ...access,
        name: 'Ash K.',
        community: 'Pinewood East',
        state: 'asked',
        askedAt: later,
        decidedAt: null,
      },
    });
    expect(await store.openCount()).toBe(1);
  });

  it('never asks again for an approved or revoked member', async () => {
    const store = await made();
    const { access } = await store.ask(accessRequest());
    await store.decide(access.id, { decision: 'approve', from: 'asked', key: accessKey(1), at: 2 });
    expect(await store.ask(accessRequest({ at: ACCESS_NOW + 2 * REASK_MS }))).toMatchObject({
      kind: 'standing',
      access: { state: 'approved' },
    });
    await store.decide(access.id, { decision: 'revoke', from: 'approved', key: null, at: 3 });
    expect(await store.ask(accessRequest({ at: ACCESS_NOW + 2 * REASK_MS }))).toMatchObject({
      kind: 'standing',
      access: { state: 'revoked' },
    });
  });

  it('gives an approved member a new key, the old one stopping at once; nobody else', async () => {
    const store = await made();
    const { access } = await store.ask(accessRequest());
    expect(await store.newKey(ADMIN, accessKey(9))).toBeUndefined();
    await store.decide(access.id, { decision: 'approve', from: 'asked', key: accessKey(1), at: 2 });
    expect(await store.newKey(ADMIN, accessKey(2))).toMatchObject({ key: accessKey(2) });
    expect(await store.byKey(accessKey(1))).toBeUndefined();
    expect(await store.byKey(accessKey(2))).toMatchObject({ userId: ADMIN });
    expect(await store.newKey(OTHER_ADMIN, accessKey(3))).toBeUndefined();
  });

  it("makes the owner's row approved with a key, once", async () => {
    const store = await made();
    const made1 = await store.ownerLink({ userId: OWNER, name: 'Matt' }, accessKey(7), 10);
    expect(made1).toMatchObject({
      userId: OWNER,
      name: 'Matt',
      community: '',
      state: 'approved',
      key: accessKey(7),
      askedAt: 10,
      decidedAt: 10,
    });
    const again = await store.ownerLink({ userId: OWNER, name: 'Matt' }, accessKey(8), 20);
    expect(again).toEqual(made1);
    expect(await store.byKey(accessKey(8))).toBeUndefined();
    // A row of the owner's that is not approved (revoked from the list) is approved anew.
    await store.decide(made1.id, { decision: 'revoke', from: 'approved', key: null, at: 30 });
    expect(await store.ownerLink({ userId: OWNER, name: 'Matt' }, accessKey(9), 40)).toMatchObject({
      id: made1.id,
      state: 'approved',
      key: accessKey(9),
      decidedAt: 40,
    });
  });

  it('records a fetch at most once a minute, unless the version changed', async () => {
    const store = await made();
    const { access } = await store.ask(accessRequest());
    expect(await store.recordFetch(access.id, '1.0.0', 100)).toBe(false);
    await store.decide(access.id, { decision: 'approve', from: 'asked', key: accessKey(1), at: 2 });
    expect(await store.recordFetch(access.id, '1.0.0', 100)).toBe(true);
    expect(await store.recordFetch(access.id, '1.0.0', 100 + FETCH_RECORD_MS - 1)).toBe(false);
    expect(await store.byId(access.id)).toMatchObject({ lastFetchAt: 100, lastVersion: '1.0.0' });
    expect(await store.recordFetch(access.id, '1.1.0', 200)).toBe(true);
    expect(await store.recordFetch(access.id, '1.1.0', 200 + FETCH_RECORD_MS)).toBe(true);
    expect(await store.byId(access.id)).toMatchObject({
      lastFetchAt: 200 + FETCH_RECORD_MS,
      lastVersion: '1.1.0',
    });
  });

  it('lists every row, the latest asked first, and counts the open requests', async () => {
    const store = await made();
    const ash = await store.ask(accessRequest({ at: 1 }));
    const misty = await store.ask(accessRequest({ userId: OTHER_ADMIN, name: 'Misty', at: 2 }));
    await store.decide(ash.access.id, { decision: 'refuse', from: 'asked', key: null, at: 3 });
    expect((await store.all()).map((one) => one.name)).toEqual(['Misty', 'Ash']);
    expect(await store.openCount()).toBe(1);
    expect((await store.byId(misty.access.id))?.state).toBe('asked');
  });
}
