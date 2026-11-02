import { expect, it } from 'vitest';
import type { DroppedPin, KnownPlace } from '../../src/domain/geo/place.js';
import type {
  Decider,
  MeetupSafetyStore,
  NewMeetupAppeal,
  NewMeetupRequest,
  NewPlaceAsk,
  PlaceAskRecord,
} from '../../src/domain/meetups/records.js';

export const SAFETY_SERVER = '412345678901234567';
export const OTHER_SERVER = '412345678901234599';
export const MAKER = '200000000000000002';
export const MODERATOR = '200000000000000009';
export const SAFETY_NOW = 1_792_000_000_000;
const HOUR = 3_600_000;

export const LIBRARY: KnownPlace = {
  kind: 'stop',
  id: 'a1b2c3d4e5f60718293a4b5c6d7e8f90.16',
  title: 'Little Free Library',
  lat: 40.0601,
  lon: -80.0601,
  address: '12 Market Street',
  image: 'https://lh3.googleusercontent.com/abc=s400',
};

export const SAFETY_PIN: DroppedPin = {
  kind: 'pin',
  lat: 40.02,
  lon: -80.02,
  near: { kind: 'stop', title: 'Fountain Square' },
  linkName: 'Blue Tent',
};

/** A request id: a UUID with `n` at its end. */
export function requestId(n: number): string {
  return `00000000-0000-4000-8000-${n.toString().padStart(12, '0')}`;
}

/** A request of `MAKER` in `SAFETY_SERVER`, made at `SAFETY_NOW`, for a start a day later. */
export function newRequest(n: number, overrides: Partial<NewMeetupRequest> = {}): NewMeetupRequest {
  return {
    id: requestId(n),
    serverId: SAFETY_SERVER,
    regionChannelId: '100000000000000001',
    makerId: MAKER,
    makerName: 'Alice',
    makerTeam: 'mystic',
    place: LIBRARY,
    name: 'Book swap',
    startTime: SAFETY_NOW + 24 * HOUR,
    description: 'Bring a book.\n\nTake a book.',
    createdAt: SAFETY_NOW,
    expiresAt: SAFETY_NOW + 23 * HOUR,
    channelId: '600000000000000001',
    messageId: `6000000000000${String(10_000 + n)}`,
    source: null,
    ...overrides,
  };
}

export function newAppeal(n: number, overrides: Partial<NewMeetupAppeal> = {}): NewMeetupAppeal {
  return {
    id: requestId(100 + n),
    serverId: SAFETY_SERVER,
    memberId: MAKER,
    memberName: 'Alice',
    text: 'It was a public library box.',
    createdAt: SAFETY_NOW,
    ...overrides,
  };
}

export const MOD: Decider = { id: MODERATOR, name: 'Mod', at: SAFETY_NOW + HOUR };

/** Alice's ask to allow meetups at the Little Free Library again, made at `SAFETY_NOW`. */
export function newAsk(n: number, overrides: Partial<NewPlaceAsk> = {}): NewPlaceAsk {
  return {
    id: requestId(300 + n),
    serverId: SAFETY_SERVER,
    key: { kind: 'stop', id: LIBRARY.id },
    place: LIBRARY,
    memberId: MAKER,
    memberName: 'Alice',
    text: 'It is a public park now.',
    createdAt: SAFETY_NOW,
    ...overrides,
  };
}

/** That ask as it is kept while open, without its post. */
export function newAskRecord(n: number, overrides: Partial<NewPlaceAsk> = {}): PlaceAskRecord {
  return {
    ...newAsk(n, overrides),
    status: 'open',
    channelId: null,
    messageId: null,
    decidedBy: null,
    decidedByName: null,
    decidedAt: null,
  };
}

/**
 * What meetup safety keeps, run against the repository and its twin in memory alike. `made`
 * gives a fresh, empty store.
 */
export function meetupSafetyCases(made: () => Promise<MeetupSafetyStore>): void {
  it('keeps a ruling per server and place, the later one in place of the earlier', async () => {
    const store = await made();
    const key = { kind: 'stop' as const, id: LIBRARY.id };
    expect(await store.ruling(SAFETY_SERVER, key)).toBeUndefined();
    await store.rule(SAFETY_SERVER, key, 'allow', MOD);
    expect(await store.ruling(SAFETY_SERVER, key)).toBe('allow');
    await store.rule(SAFETY_SERVER, key, 'refuse', { ...MOD, at: MOD.at + 1 });
    expect(await store.ruling(SAFETY_SERVER, key)).toBe('refuse');
    expect(await store.ruling(OTHER_SERVER, key)).toBeUndefined();
    expect(
      await store.ruling(SAFETY_SERVER, { kind: 'powerspot', id: LIBRARY.id }),
    ).toBeUndefined();
    await store.rule(SAFETY_SERVER, { kind: 'gym', id: '7' }, 'allow', MOD);
    expect(await store.ruling(SAFETY_SERVER, { kind: 'gym', id: '7' })).toBe('allow');
  });

  it('keeps who ruled a place, the place and the post the ruling came from', async () => {
    const store = await made();
    const key = { kind: 'stop' as const, id: LIBRARY.id };
    expect(await store.rulingRecord(SAFETY_SERVER, key)).toBeUndefined();
    // A ruling without more, as 8S-1 made them.
    await store.rule(SAFETY_SERVER, key, 'allow', MOD);
    expect(await store.rulingRecord(SAFETY_SERVER, key)).toEqual({
      serverId: SAFETY_SERVER,
      key,
      ruling: 'allow',
      ruledBy: MODERATOR,
      ruledByName: 'Mod',
      ruledAt: MOD.at,
      place: null,
      source: null,
      keptAt: null,
    });
    const source = {
      kind: 'report' as const,
      id: requestId(201),
      channelId: '600000000000000001',
      messageId: '600000000000000005',
    };
    const later = { ...MOD, name: null, at: MOD.at + HOUR };
    await store.rule(SAFETY_SERVER, key, 'refuse', later, { place: LIBRARY, source });
    expect(await store.rulingRecord(SAFETY_SERVER, key)).toEqual({
      serverId: SAFETY_SERVER,
      key,
      ruling: 'refuse',
      ruledBy: MODERATOR,
      ruledByName: null,
      ruledAt: later.at,
      place: LIBRARY,
      source,
      keptAt: null,
    });
    expect(await store.rulingRecord(OTHER_SERVER, key)).toBeUndefined();
    expect(await store.undoRuling(SAFETY_SERVER, key)).toMatchObject({
      ruling: { ruling: 'refuse', source },
      ask: undefined,
    });
    expect(await store.undoRuling(SAFETY_SERVER, key)).toBeUndefined();
    expect(await store.ruling(SAFETY_SERVER, key)).toBeUndefined();
  });

  it('keeps one open ask per place and server, and decides it once', async () => {
    const store = await made();
    const key = { kind: 'stop' as const, id: LIBRARY.id };
    await store.rule(SAFETY_SERVER, key, 'refuse', MOD, { place: LIBRARY });
    expect(await store.addAsk(newAsk(1))).toBe('added');
    expect(await store.addAsk(newAsk(2, { memberId: MODERATOR }))).toBe('open');
    expect(await store.addAsk(newAsk(3, { serverId: OTHER_SERVER }))).toBe('added');
    expect(await store.addAsk(newAsk(4, { key: { kind: 'gym', id: '7' } }))).toBe('added');
    expect(await store.openAsk(SAFETY_SERVER, key)).toMatchObject({
      id: requestId(301),
      key,
      place: LIBRARY,
      memberId: MAKER,
      memberName: 'Alice',
      text: 'It is a public park now.',
      status: 'open',
      channelId: null,
    });
    await store.setAskPost(requestId(301), '600000000000000001', '600000000000000006');
    expect(await store.ask(requestId(301))).toMatchObject({ messageId: '600000000000000006' });
    const kept = { ...MOD, at: MOD.at + HOUR };
    expect(await store.keepOnAsk(newAskRecord(1), kept)).toBe('kept');
    expect(await store.allowOnAsk(newAskRecord(1), kept)).toBe(false);
    expect(await store.ask(requestId(301))).toMatchObject({
      status: 'kept',
      decidedBy: MODERATOR,
      decidedAt: kept.at,
    });
    expect(await store.rulingRecord(SAFETY_SERVER, key)).toMatchObject({
      ruling: 'refuse',
      ruledAt: MOD.at,
      keptAt: kept.at,
    });
    expect(await store.openAsk(SAFETY_SERVER, key)).toBeUndefined();
    // Asked again, and allowed: the ruling is the ask's, the kept refusal gone with it.
    expect(await store.addAsk(newAsk(5))).toBe('added');
    await store.setAskPost(requestId(305), '600000000000000001', '600000000000000007');
    const allowed = { ...MOD, at: MOD.at + 2 * HOUR };
    const asked = {
      ...newAskRecord(5),
      channelId: '600000000000000001',
      messageId: '600000000000000007',
    };
    expect(await store.allowOnAsk(asked, allowed)).toBe(true);
    expect(await store.keepOnAsk(asked, allowed)).toBe('not-open');
    expect(await store.rulingRecord(SAFETY_SERVER, key)).toEqual({
      serverId: SAFETY_SERVER,
      key,
      ruling: 'allow',
      ruledBy: MODERATOR,
      ruledByName: 'Mod',
      ruledAt: allowed.at,
      place: LIBRARY,
      source: {
        kind: 'ask',
        id: requestId(305),
        channelId: '600000000000000001',
        messageId: '600000000000000007',
      },
      keptAt: null,
    });
    await store.discardAsk(requestId(303));
    expect(await store.ask(requestId(303))).toBeUndefined();
    expect(await store.addAsk(newAsk(6, { serverId: OTHER_SERVER }))).toBe('added');
  });

  it('closes the open ask of a place whose ruling is undone, and keeps only a refusal', async () => {
    const store = await made();
    const key = { kind: 'stop' as const, id: LIBRARY.id };
    await store.rule(SAFETY_SERVER, key, 'refuse', MOD, { place: LIBRARY });
    await store.addAsk(newAsk(1));
    const undone = await store.undoRuling(SAFETY_SERVER, key);
    expect(undone?.ask).toMatchObject({ id: requestId(301), status: 'undone', decidedBy: null });
    expect(await store.ask(requestId(301))).toMatchObject({ status: 'undone' });
    expect(await store.openAsk(SAFETY_SERVER, key)).toBeUndefined();
    // Keep refused without a refusal standing (undone, or allowed meanwhile) keeps nothing.
    expect(await store.addAsk(newAsk(2))).toBe('added');
    expect(await store.keepOnAsk(newAskRecord(2), MOD)).toBe('not-refused');
    expect(await store.ask(requestId(302))).toMatchObject({ status: 'open' });
    await store.rule(SAFETY_SERVER, key, 'allow', MOD);
    expect(await store.keepOnAsk(newAskRecord(2), MOD)).toBe('not-refused');
    expect(await store.rulingRecord(SAFETY_SERVER, key)).toMatchObject({ keptAt: null });
  });

  it('expires an open ask without a decider, and lists those that are stale', async () => {
    const store = await made();
    await store.addAsk(newAsk(1, { createdAt: SAFETY_NOW - 10 * HOUR }));
    await store.addAsk(
      newAsk(2, { key: { kind: 'gym', id: '7' }, createdAt: SAFETY_NOW - 9 * 24 * HOUR }),
    );
    await store.setAskPost(requestId(302), '600000000000000001', '600000000000000003');
    await store.addAsk(newAsk(3, { serverId: OTHER_SERVER }));
    await store.setAskPost(requestId(303), '600000000000000001', '600000000000000004');
    const stale = { unpostedBefore: SAFETY_NOW - HOUR, openedBefore: SAFETY_NOW - 7 * 24 * HOUR };
    expect((await store.staleAsks(stale)).map((one) => one.id)).toEqual([
      requestId(302),
      requestId(301),
    ]);
    expect(await store.expireAsk(requestId(301))).toBe(true);
    expect(await store.expireAsk(requestId(301))).toBe(false);
    expect(await store.ask(requestId(301))).toMatchObject({
      status: 'expired',
      decidedBy: null,
      decidedAt: null,
    });
    expect(await store.addAsk(newAsk(4))).toBe('added');
    expect((await store.staleAsks(stale)).map((one) => one.id)).toEqual([requestId(302)]);
  });

  it('blocks a member per server until the block is lifted, and blocks again afterwards', async () => {
    const store = await made();
    expect(await store.block(SAFETY_SERVER, MAKER)).toBeUndefined();
    expect(await store.addBlock(SAFETY_SERVER, MAKER, MOD, 'Alice')).toBe(true);
    expect(await store.addBlock(SAFETY_SERVER, MAKER, { ...MOD, id: MAKER, at: 1 })).toBe(false);
    expect(await store.block(SAFETY_SERVER, MAKER)).toEqual({
      serverId: SAFETY_SERVER,
      memberId: MAKER,
      memberName: 'Alice',
      blockedBy: MODERATOR,
      blockedByName: 'Mod',
      blockedAt: MOD.at,
    });
    expect(await store.block(OTHER_SERVER, MAKER)).toBeUndefined();
    expect(await store.liftBlock(SAFETY_SERVER, MAKER, MOD)).toBe(true);
    expect(await store.liftBlock(SAFETY_SERVER, MAKER, MOD)).toBe(false);
    expect(await store.block(SAFETY_SERVER, MAKER)).toBeUndefined();
    const later = { ...MOD, at: MOD.at + HOUR, name: null };
    expect(await store.addBlock(SAFETY_SERVER, MAKER, later)).toBe(true);
    expect(await store.block(SAFETY_SERVER, MAKER)).toMatchObject({
      blockedAt: later.at,
      blockedByName: null,
      memberName: null,
    });
  });

  it('keeps a request with its place, text and maker as they were given', async () => {
    const store = await made();
    const request = newRequest(1, { description: 'Zoë 🌲 <b>\nline two', place: SAFETY_PIN });
    await store.addRequest(request);
    expect(await store.request(requestId(1))).toEqual({
      ...request,
      status: 'pending',
      decision: null,
      decidedBy: null,
      decidedByName: null,
      decidedAt: null,
      partyId: null,
      failure: null,
    });
    await store.addRequest(newRequest(2, { makerTeam: null, makerName: null, source: 'map' }));
    expect(await store.request(requestId(2))).toMatchObject({
      makerTeam: null,
      makerName: null,
      place: LIBRARY,
      source: 'map',
    });
    expect(await store.request(requestId(3))).toBeUndefined();
    expect(await store.request(requestId(1))).toMatchObject({
      channelId: '600000000000000001',
      messageId: '600000000000010001',
    });
  });

  it('decides a pending request once: the first decision wins', async () => {
    const store = await made();
    await store.addRequest(newRequest(1));
    expect(await store.decideRequest(requestId(1), 'approved', 'approve', MOD)).toBe(true);
    expect(
      await store.decideRequest(requestId(1), 'refused', 'refuse', { ...MOD, id: MAKER }),
    ).toBe(false);
    expect(await store.request(requestId(1))).toMatchObject({
      status: 'approved',
      decision: 'approve',
      decidedBy: MODERATOR,
      decidedByName: 'Mod',
      decidedAt: MOD.at,
    });
    expect(await store.approvedRequestOf(SAFETY_SERVER, MAKER, PARTY)).toBeUndefined();
    expect(await store.settleApproval(requestId(1), { partyId: PARTY })).toBe(true);
    expect(await store.request(requestId(1))).toMatchObject({
      status: 'approved',
      partyId: PARTY,
    });
    // Found by the meetup it made, in its server, of its maker (plan 8Z).
    expect((await store.approvedRequestOf(SAFETY_SERVER, MAKER, PARTY))?.id).toBe(requestId(1));
    expect(await store.approvedRequestOf(OTHER_SERVER, MAKER, PARTY)).toBeUndefined();
    expect(await store.approvedRequestOf(SAFETY_SERVER, MODERATOR, PARTY)).toBeUndefined();
    expect(await store.approvedRequestOf(SAFETY_SERVER, MAKER, 'another')).toBeUndefined();
    await store.addRequest(newRequest(2));
    await store.decideRequest(requestId(2), 'approved', 'approve-once', MOD);
    const refused = {
      kind: 'posts-refused',
      forumId: '300000000000000001',
      missing: ['Manage Posts'],
    } as const;
    expect(await store.settleApproval(requestId(2), { failed: refused })).toBe(true);
    expect(await store.request(requestId(2))).toMatchObject({
      status: 'failed',
      partyId: null,
      failure: { kind: 'posts-refused', forumId: '300000000000000001', missing: ['Manage Posts'] },
    });
    // Kept as the kind alone where nothing more is to be said.
    await store.addRequest(newRequest(3));
    await store.decideRequest(requestId(3), 'approved', 'approve', MOD);
    await store.settleApproval(requestId(3), { failed: { kind: 'no-forum' } });
    expect((await store.request(requestId(3)))?.failure).toEqual({ kind: 'no-forum' });
    expect((await store.request(requestId(1)))?.failure).toBeNull();
    expect(await store.decideRequest(requestId(9), 'refused', 'refuse', MOD)).toBe(false);
  });

  it('expires and withdraws without a decider', async () => {
    const store = await made();
    await store.addRequest(newRequest(1));
    expect(await store.decideRequest(requestId(1), 'expired', null, null)).toBe(true);
    expect(await store.request(requestId(1))).toMatchObject({
      status: 'expired',
      decision: null,
      decidedBy: null,
      decidedAt: null,
    });
  });

  it('lists a member’s pending requests per server, and those whose time is up', async () => {
    const store = await made();
    await store.addRequest(newRequest(1, { expiresAt: SAFETY_NOW + 2 * HOUR }));
    await store.addRequest(
      newRequest(2, { createdAt: SAFETY_NOW + 1, expiresAt: SAFETY_NOW + HOUR }),
    );
    await store.addRequest(newRequest(3, { serverId: OTHER_SERVER, expiresAt: SAFETY_NOW }));
    await store.addRequest(newRequest(4, { makerId: MODERATOR }));
    await store.addRequest(newRequest(5));
    await store.decideRequest(requestId(5), 'refused', 'refuse', MOD);
    expect((await store.pendingOf(SAFETY_SERVER, MAKER)).map((one) => one.id)).toEqual([
      requestId(1),
      requestId(2),
    ]);
    expect((await store.duePending(SAFETY_NOW + HOUR)).map((one) => one.id)).toEqual([
      requestId(3),
      requestId(2),
    ]);
    expect(await store.duePending(SAFETY_NOW - 1)).toEqual([]);
  });

  it('keeps one open appeal per member and server, and when a block was last kept', async () => {
    const store = await made();
    expect(await store.addAppeal(newAppeal(1))).toBe('added');
    expect(await store.addAppeal(newAppeal(2))).toBe('open');
    expect(await store.addAppeal(newAppeal(3, { serverId: OTHER_SERVER }))).toBe('added');
    expect(await store.openAppeal(SAFETY_SERVER, MAKER)).toMatchObject({
      id: requestId(101),
      status: 'open',
      text: 'It was a public library box.',
      memberName: 'Alice',
      channelId: null,
    });
    await store.setAppealPost(requestId(101), '600000000000000001', '600000000000000003');
    expect(await store.appeal(requestId(101))).toMatchObject({ messageId: '600000000000000003' });
    expect(await store.lastKept(SAFETY_SERVER, MAKER)).toBeUndefined();
    expect(await store.decideAppeal(requestId(101), 'kept', MOD)).toBe(true);
    expect(await store.decideAppeal(requestId(101), 'lifted', MOD)).toBe(false);
    expect(await store.appeal(requestId(101))).toMatchObject({
      status: 'kept',
      decidedBy: MODERATOR,
      decidedByName: 'Mod',
      decidedAt: MOD.at,
    });
    expect(await store.openAppeal(SAFETY_SERVER, MAKER)).toBeUndefined();
    expect(await store.lastKept(SAFETY_SERVER, MAKER)).toBe(MOD.at);
    expect(await store.addAppeal(newAppeal(4))).toBe('added');
    await store.discardAppeal(requestId(104));
    expect(await store.appeal(requestId(104))).toBeUndefined();
    expect(await store.openAppeal(SAFETY_SERVER, MAKER)).toBeUndefined();
    expect(await store.addAppeal(newAppeal(5))).toBe('added');
  });

  it('expires an open appeal without a decider, and lists those that are stale', async () => {
    const store = await made();
    // Never posted, made long enough ago; posted, made long ago; posted and recent; another's.
    await store.addAppeal(newAppeal(1, { createdAt: SAFETY_NOW - 10 * HOUR }));
    await store.addAppeal(
      newAppeal(2, { memberId: MODERATOR, createdAt: SAFETY_NOW - 9 * 24 * HOUR }),
    );
    await store.setAppealPost(requestId(102), '600000000000000001', '600000000000000003');
    await store.addAppeal(newAppeal(3, { serverId: OTHER_SERVER }));
    await store.setAppealPost(requestId(103), '600000000000000001', '600000000000000004');
    const stale = { unpostedBefore: SAFETY_NOW - HOUR, openedBefore: SAFETY_NOW - 7 * 24 * HOUR };
    expect((await store.staleAppeals(stale)).map((one) => one.id)).toEqual([
      requestId(102),
      requestId(101),
    ]);
    expect(await store.decideAppeal(requestId(101), 'expired', null)).toBe(true);
    expect(await store.decideAppeal(requestId(101), 'kept', MOD)).toBe(false);
    expect(await store.appeal(requestId(101))).toMatchObject({
      status: 'expired',
      decidedBy: null,
      decidedAt: null,
    });
    expect(await store.openAppeal(SAFETY_SERVER, MAKER)).toBeUndefined();
    expect(await store.lastKept(SAFETY_SERVER, MAKER)).toBeUndefined();
    expect(await store.addAppeal(newAppeal(4))).toBe('added');
    expect((await store.staleAppeals(stale)).map((one) => one.id)).toEqual([requestId(102)]);
  });

  it('lifts a block and closes the member’s open appeal in one step', async () => {
    const store = await made();
    expect(await store.liftWithAppeal(SAFETY_SERVER, MAKER, MOD)).toEqual({
      lifted: false,
      appeal: undefined,
    });
    await store.addBlock(SAFETY_SERVER, MAKER, MOD);
    await store.addAppeal(newAppeal(1));
    const later = { ...MOD, at: MOD.at + HOUR };
    expect(await store.liftWithAppeal(SAFETY_SERVER, MAKER, later)).toMatchObject({
      lifted: true,
      appeal: { id: requestId(101), status: 'lifted', decidedAt: later.at },
    });
    expect(await store.block(SAFETY_SERVER, MAKER)).toBeUndefined();
    expect(await store.openAppeal(SAFETY_SERVER, MAKER)).toBeUndefined();
    await store.addBlock(SAFETY_SERVER, MAKER, MOD);
    expect(await store.liftWithAppeal(SAFETY_SERVER, MAKER, later)).toEqual({
      lifted: true,
      appeal: undefined,
    });
  });

  it('lifts a block on an open appeal in one step, once', async () => {
    const store = await made();
    await store.addBlock(SAFETY_SERVER, MAKER, MOD);
    await store.addAppeal(newAppeal(1));
    const appeal = { id: requestId(101), serverId: SAFETY_SERVER, memberId: MAKER };
    const later = { ...MOD, at: MOD.at + HOUR };
    expect(await store.liftOnAppeal(appeal, later)).toBe(true);
    expect(await store.block(SAFETY_SERVER, MAKER)).toBeUndefined();
    expect(await store.appeal(requestId(101))).toMatchObject({
      status: 'lifted',
      decidedBy: MODERATOR,
      decidedAt: later.at,
    });
    // Decided already: a block made since stands.
    await store.addBlock(SAFETY_SERVER, MAKER, { ...MOD, at: MOD.at + 2 * HOUR });
    expect(await store.liftOnAppeal(appeal, { ...MOD, at: MOD.at + 3 * HOUR })).toBe(false);
    expect(await store.block(SAFETY_SERVER, MAKER)).toBeDefined();
    // Kept before it was lifted: nothing lifted.
    await store.addAppeal(newAppeal(2));
    await store.decideAppeal(requestId(102), 'kept', MOD);
    expect(
      await store.liftOnAppeal(
        { ...appeal, id: requestId(102) },
        { ...MOD, at: MOD.at + 4 * HOUR },
      ),
    ).toBe(false);
    expect(await store.block(SAFETY_SERVER, MAKER)).toBeDefined();
  });

  it('blocks the maker of a pending request and refuses it in one step, once', async () => {
    const store = await made();
    await store.addRequest(newRequest(1));
    await store.addRequest(newRequest(2));
    expect(await store.blockMaker(newRequest(1), MOD)).toEqual({ decided: true, newBlock: true });
    // The maker's name as they asked, for the lists of `/places`.
    expect(await store.block(SAFETY_SERVER, MAKER)).toMatchObject({ memberName: 'Alice' });
    expect(await store.request(requestId(1))).toMatchObject({
      status: 'refused',
      decision: 'block',
      decidedBy: MODERATOR,
    });
    expect(await store.block(SAFETY_SERVER, MAKER)).toMatchObject({ blockedAt: MOD.at });
    // A second press on the same request: decided before, nobody blocked by it.
    expect(await store.blockMaker(newRequest(1), { ...MOD, at: MOD.at + 1 })).toEqual({
      decided: false,
      newBlock: false,
    });
    // Another request of the blocked maker: refused, the block stands as it was.
    expect(await store.blockMaker(newRequest(2), { ...MOD, at: MOD.at + 2 })).toEqual({
      decided: true,
      newBlock: false,
    });
    expect(await store.block(SAFETY_SERVER, MAKER)).toMatchObject({ blockedAt: MOD.at });
    // Lifted, the maker is blocked anew by a later request.
    await store.liftBlock(SAFETY_SERVER, MAKER, MOD);
    await store.addRequest(newRequest(3));
    expect(await store.blockMaker(newRequest(3), { ...MOD, at: MOD.at + 3 })).toEqual({
      decided: true,
      newBlock: true,
    });
    expect(await store.block(SAFETY_SERVER, MAKER)).toMatchObject({ blockedAt: MOD.at + 3 });
    // A request that is gone blocks nobody.
    expect(
      await store.blockMaker(newRequest(9, { makerId: MODERATOR }), { ...MOD, at: MOD.at + 4 }),
    ).toEqual({ decided: false, newBlock: false });
    expect(await store.block(SAFETY_SERVER, MODERATOR)).toBeUndefined();
  });

  it('settles an approval once, and lists the approvals that never got their meetup', async () => {
    const store = await made();
    for (const n of [1, 2, 3, 4]) {
      await store.addRequest(newRequest(n));
      await store.decideRequest(requestId(n), 'approved', 'approve-once', {
        ...MOD,
        at: MOD.at + n,
      });
    }
    await store.addRequest(newRequest(5));
    expect(await store.strandedApprovals(MOD.at + 3)).toEqual([
      expect.objectContaining({ id: requestId(1), status: 'approved', partyId: null }),
      expect.objectContaining({ id: requestId(2) }),
      expect.objectContaining({ id: requestId(3) }),
    ]);
    expect(await store.settleApproval(requestId(1), 'withdrawn')).toBe(true);
    expect(await store.settleApproval(requestId(1), { failed: { kind: 'error' } })).toBe(false);
    expect(await store.request(requestId(1))).toMatchObject({
      status: 'withdrawn',
      decision: 'approve-once',
    });
    expect(await store.settleApproval(requestId(2), { partyId: PARTY })).toBe(true);
    expect(await store.settleApproval(requestId(2), { failed: { kind: 'error' } })).toBe(false);
    expect(await store.request(requestId(2))).toMatchObject({ status: 'approved', partyId: PARTY });
    expect(await store.settleApproval(requestId(5), { failed: { kind: 'error' } })).toBe(false);
    expect((await store.strandedApprovals(MOD.at + 4)).map((one) => one.id)).toEqual([
      requestId(3),
      requestId(4),
    ]);
  });

  it('lists what a server has: rulings, pending requests, open asks, blocks, open appeals', async () => {
    const store = await made();
    await store.rule(SAFETY_SERVER, { kind: 'stop', id: LIBRARY.id }, 'refuse', MOD, {
      place: LIBRARY,
    });
    await store.rule(SAFETY_SERVER, { kind: 'gym', id: '7' }, 'allow', { ...MOD, at: MOD.at + 1 });
    await store.rule(OTHER_SERVER, { kind: 'gym', id: '8' }, 'allow', MOD);
    await store.addRequest(newRequest(1));
    await store.addRequest(newRequest(2, { serverId: OTHER_SERVER }));
    await store.addRequest(newRequest(3));
    await store.decideRequest(requestId(3), 'refused', 'refuse', MOD);
    await store.addAsk(newAsk(1));
    await store.addAsk(newAsk(2, { key: { kind: 'gym', id: '7' } }));
    await store.expireAsk(requestId(302));
    await store.addBlock(SAFETY_SERVER, MAKER, MOD);
    await store.addBlock(SAFETY_SERVER, MODERATOR, MOD);
    await store.liftBlock(SAFETY_SERVER, MODERATOR, MOD);
    await store.addAppeal(newAppeal(1));
    expect((await store.rulings(SAFETY_SERVER)).map((one) => [one.key.id, one.ruling])).toEqual([
      [LIBRARY.id, 'refuse'],
      ['7', 'allow'],
    ]);
    expect((await store.pendingIn(SAFETY_SERVER)).map((one) => one.id)).toEqual([requestId(1)]);
    expect((await store.openAsks(SAFETY_SERVER)).map((one) => one.id)).toEqual([requestId(301)]);
    expect((await store.blocks(SAFETY_SERVER)).map((one) => one.memberId)).toEqual([MAKER]);
    expect((await store.openAppeals(SAFETY_SERVER)).map((one) => one.id)).toEqual([requestId(101)]);
    expect(await store.openAppeals(OTHER_SERVER)).toEqual([]);
  });
}

const PARTY = '00000000-0000-4000-8000-00000000aaaa';
