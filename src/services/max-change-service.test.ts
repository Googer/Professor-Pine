import { describe, expect, it, vi } from 'vitest';
import {
  ALICE,
  asMax,
  at,
  BOB,
  PARTY_NOW,
  REPORTER,
  TEST_SPOT,
  testMax,
  withAttendees,
} from '../../test/support/parties.js';
import { partyServiceWith } from '../../test/support/party-service.js';
import { blocksNewMax, sameSpot } from '../domain/party/max.js';
import { isMax } from '../domain/party/party.js';
import { PartyStatus } from '../domain/party/status.js';

const ID = (n: number): string => `00000000-0000-4000-8000-00000000020${String(n)}`;

describe('MaxChangeService (plan 8X-3)', () => {
  it('refuses an end moved later on an ended battle whose spot has another by now', async () => {
    const over = testMax({
      id: ID(1),
      endTime: at('2026-10-13T13:30'),
      now: at('2026-10-13T13:00'),
    });
    const fresh = testMax({ id: ID(2), endTime: at('2026-10-13T15:00') });
    const made = await partyServiceWith([over, fresh]);
    const outcome = await made.maxes.setEnd(ID(1), { id: REPORTER }, at('2026-10-13T16:00'));
    expect(outcome).toMatchObject({ kind: 'refused', reason: 'spot-taken', other: { id: ID(2) } });
    expect(made.store.get(ID(1))?.endTime).toBe(at('2026-10-13T13:30'));
  });

  // Review A, X3-B-7: an end moved later and a new report at the spot, at once.
  it('lets an end moved later and a report at the same spot never both hold it', async () => {
    const over = testMax({
      id: ID(1),
      endTime: at('2026-10-13T13:30'),
      now: at('2026-10-13T13:00'),
    });
    const made = await partyServiceWith([over]);
    const [moved, added] = await Promise.all([
      made.maxes.setEnd(ID(1), { id: REPORTER }, at('2026-10-13T16:00')),
      made.store.addMaxUnlessTaken(testMax({ id: ID(2) }), PARTY_NOW),
    ]);
    // Every active battle at the spot that blocks it: exactly one (fix review F3).
    const holding = made.store
      .active()
      .filter(isMax)
      .filter((party) => sameSpot(party.max.spot, TEST_SPOT) && blocksNewMax(party, PARTY_NOW));
    expect(holding.map((party) => party.id)).toEqual([ID(1)]);
    // The end moved first (it was asked first): the report found the spot taken.
    expect(moved).toMatchObject({ kind: 'ok', changed: true });
    expect(added).toMatchObject({ added: false, existing: { id: ID(1) } });
  });

  // Review A, X3-B-6: a battle at the spot in another server stands in nobody's way.
  it('moves the end of a battle whose spot has a battle of another server', async () => {
    const over = testMax({
      id: ID(1),
      endTime: at('2026-10-13T13:30'),
      now: at('2026-10-13T13:00'),
    });
    const elsewhere = testMax({ id: ID(2), guildId: 2, endTime: at('2026-10-13T15:00') });
    const made = await partyServiceWith([over, elsewhere]);
    const outcome = await made.maxes.setEnd(ID(1), { id: REPORTER }, at('2026-10-13T16:00'));
    expect(outcome).toMatchObject({ kind: 'ok', changed: true });
  });

  it('moves the end of a battle that blocks its spot, and says so in its post', async () => {
    const made = await partyServiceWith([
      { ...testMax({ id: ID(1) }), forumPostId: '300000000000000201' },
    ]);
    const outcome = await made.maxes.setEnd(
      ID(1),
      { id: REPORTER, name: 'Rita' },
      at('2026-10-13T15:00'),
    );
    expect(outcome).toMatchObject({ kind: 'ok', changed: true });
    await made.attendance.flush();
    expect(made.gateway.messagesIn('300000000000000201').map((m) => m.message.content)).toEqual([
      `**Rita** (<@${REPORTER}>) set the end time: <t:${at('2026-10-13T15:00') / 1000}:t>.`,
    ]);
  });

  it('takes an end as confirming a screenshot’s guessed time, also the end it already has', async () => {
    const battle = testMax({ id: ID(1), screenshot: { id: 'abcdefghijkl', timeUncertain: true } });
    const made = await partyServiceWith([battle]);
    const outcome = await made.maxes.setEnd(ID(1), { id: REPORTER }, battle.endTime ?? 0);
    expect(outcome).toMatchObject({ kind: 'ok', changed: true });
    expect(asMax(made.store.get(ID(1))).max.screenshot).toEqual({
      id: 'abcdefghijkl',
      timeUncertain: false,
    });
  });

  it('says an end that stays was confirmed, not set, by name or for an anonymous reporter', async () => {
    const end = at('2026-10-13T21:00');
    const lines = async (anonymous: boolean) => {
      const battle = testMax({
        id: ID(1),
        anonymous,
        screenshot: { id: 'abcdefghijkl', timeUncertain: true },
      });
      const made = await partyServiceWith([{ ...battle, forumPostId: '300000000000000201' }]);
      await made.maxes.setEnd(ID(1), { id: REPORTER, name: 'Rita' }, end);
      await made.attendance.flush();
      return made.gateway.messagesIn('300000000000000201').map((m) => m.message.content);
    };
    expect(await lines(false)).toEqual([
      `**Rita** (<@${REPORTER}>) confirmed the end time: <t:${end / 1000}:t>.`,
    ]);
    expect(await lines(true)).toEqual([`The end time was confirmed: <t:${end / 1000}:t>.`]);
  });

  it('notes since when the battle has the boss /boss gave it', async () => {
    const made = await partyServiceWith(
      [testMax({ id: ID(1) })],
      {},
      { clock: { now: PARTY_NOW + 20 * 60_000 } },
    );
    const outcome = await made.maxes.setBoss(
      ID(1),
      { id: REPORTER },
      { boss: { key: 'sneasel' }, tier: 'D1', label: 'Dynamax Sneasel (1★)' },
    );
    expect(outcome).toMatchObject({ kind: 'ok', changed: true });
    expect(asMax(made.store.get(ID(1))).max.bossSince).toBe(PARTY_NOW + 20 * 60_000);
  });
});

describe('MaxChangeService: a screenshot of the battle at its spot (plan 8X-S)', () => {
  const POST = '300000000000000201';
  const SHOT = { id: 'Ab3_-xY9zQ12', timeUncertain: false };
  const ALICE_M = { id: ALICE, name: 'Alice' };
  /** Of the battle's own boss, taken surely at 14:00, its countdown to 15:00. */
  const shot = (overrides: object = {}) => ({
    boss: { key: 'machamp' },
    tier: 'D2' as const,
    end: at('2026-10-13T15:00'),
    takenAt: PARTY_NOW,
    sureMoment: true,
    rotationEnd: true,
    screenshot: SHOT,
    label: 'Dynamax Machamp (2★)',
    ...overrides,
  });
  /** Machamp (2★) until 14:30, its boss since 13:00, with a post. */
  const battle = (overrides: Parameters<typeof testMax>[0] = {}) => ({
    ...testMax({
      id: ID(1),
      endTime: at('2026-10-13T14:30'),
      bossSince: at('2026-10-13T13:00'),
      ...overrides,
    }),
    forumPostId: POST,
  });
  const said = async (made: Awaited<ReturnType<typeof partyServiceWith>>) => {
    await made.attendance.flush();
    return made.gateway.messagesIn(POST).map((m) => m.message.content);
  };

  it('joins the same boss by the automatic status, its end kept, without a line', async () => {
    const made = await partyServiceWith([battle()]);
    const outcome = await made.maxes.fromScreenshot(
      ID(1),
      ALICE_M,
      shot({ end: at('2026-10-13T14:15') }),
      PartyStatus.Coming,
    );
    expect(outcome).toMatchObject({ kind: 'joined', joined: true, endMoved: false });
    const stored = asMax(made.store.get(ID(1)));
    expect(stored.attendees[ALICE]?.status).toBe(PartyStatus.Coming);
    expect(stored.endTime).toBe(at('2026-10-13T14:30'));
    expect(await said(made)).toEqual([]);
  });

  it('puts the member joining in a group of the lobby size, as Join does', async () => {
    const full = withAttendees(battle(), {
      [BOB]: { number: 4, group: 'A' },
    });
    const made = await partyServiceWith([full]);
    await made.maxes.fromScreenshot(ID(1), ALICE_M, shot(), PartyStatus.Coming);
    // Bob, coming with three more, fills group A's lobby of 4: Alice opens group B.
    expect(asMax(made.store.get(ID(1))).attendees[ALICE]?.group).toBe('B');
  });

  it('moves the end of the same boss later on a clean read, and says so', async () => {
    const made = await partyServiceWith([battle()]);
    const outcome = await made.maxes.fromScreenshot(ID(1), ALICE_M, shot(), PartyStatus.Coming);
    expect(outcome).toMatchObject({ kind: 'joined', endMoved: true });
    expect(asMax(made.store.get(ID(1))).endTime).toBe(at('2026-10-13T15:00'));
    expect(await said(made)).toEqual([
      `**Alice** (<@${ALICE}>) set the end time from a screenshot: <t:${at('2026-10-13T15:00') / 1000}:t>.`,
    ]);
  });

  // Review r4 A3.
  it('confirms the guessed end a clean read of the same end shows, without a line', async () => {
    const guessed = battle();
    const made = await partyServiceWith([
      {
        ...guessed,
        max: { ...guessed.max, screenshot: { id: 'Old_shot_123', timeUncertain: true } },
      },
    ]);
    const outcome = await made.maxes.fromScreenshot(
      ID(1),
      ALICE_M,
      shot({ end: at('2026-10-13T14:30') }),
      PartyStatus.Coming,
    );
    expect(outcome).toMatchObject({ kind: 'joined', endMoved: false, confirmed: true });
    expect(asMax(made.store.get(ID(1))).max.screenshot).toEqual(SHOT);
    expect(await said(made)).toEqual([]);
  });

  it('changes another boss on a newer sure screenshot, says so, and tells the notifier', async () => {
    const made = await partyServiceWith([battle({ endTime: at('2026-10-13T16:00') })]);
    const changed = vi.spyOn(made.notify, 'maxChanged');
    const machop = { boss: { key: 'machop' }, tier: 'D1', label: 'Dynamax Machop (1★)' };
    const outcome = await made.maxes.fromScreenshot(
      ID(1),
      ALICE_M,
      shot(machop),
      PartyStatus.Coming,
    );
    expect(outcome).toMatchObject({ kind: 'changed' });
    const stored = asMax(made.store.get(ID(1)));
    expect(stored.max).toMatchObject({ boss: { key: 'machop' }, tier: 'D1', bossSince: PARTY_NOW });
    expect(stored.endTime).toBe(at('2026-10-13T15:00'));
    expect(changed).toHaveBeenCalledOnce();
    expect(await said(made)).toEqual([
      `Boss changed to **Dynamax Machop (1★)** from a screenshot by **Alice** (<@${ALICE}>), ` +
        `until <t:${at('2026-10-13T15:00') / 1000}:t>.`,
    ]);
  });

  it('says a change by an anonymous reporter without their name, and the meeting time it ends', async () => {
    const made = await partyServiceWith([
      {
        ...battle({ anonymous: true, endTime: at('2026-10-13T16:00') }),
        groups: [{ id: 'A' as const, startTime: at('2026-10-13T15:30') }],
      },
    ]);
    const machop = { boss: { key: 'machop' }, tier: 'D1', label: 'Dynamax Machop (1★)' };
    await made.maxes.fromScreenshot(ID(1), { id: REPORTER }, shot(machop), PartyStatus.Coming);
    expect(await said(made)).toEqual([
      `Boss changed to **Dynamax Machop (1★)** from a screenshot, until <t:${at('2026-10-13T15:00') / 1000}:t>.`,
      'The meeting time no longer fits the battle and is canceled.',
    ]);
  });

  it('refuses another boss no newer than the battle’s, naming the battle, and changes nothing', async () => {
    const made = await partyServiceWith([battle()]);
    const outcome = await made.maxes.fromScreenshot(
      ID(1),
      ALICE_M,
      shot({ boss: { key: 'machop' }, tier: 'D1', takenAt: at('2026-10-13T12:00') }),
      PartyStatus.Coming,
    );
    expect(outcome).toMatchObject({
      kind: 'refused',
      reason: 'max-other-boss',
      party: { id: ID(1) },
    });
    expect(asMax(made.store.get(ID(1))).attendees[ALICE]).toBeUndefined();
  });

  it('refuses the other kind, naming the battle', async () => {
    const made = await partyServiceWith([battle()]);
    const outcome = await made.maxes.fromScreenshot(
      ID(1),
      ALICE_M,
      shot({ tier: 'G' }),
      PartyStatus.Coming,
    );
    expect(outcome).toMatchObject({
      kind: 'refused',
      reason: 'max-kind-change',
      party: { id: ID(1) },
    });
  });

  it('is gone when the battle there ended meanwhile, and changes nothing', async () => {
    const over = battle({ endTime: at('2026-10-13T13:30'), now: at('2026-10-13T13:00') });
    const made = await partyServiceWith([over]);
    const outcome = await made.maxes.fromScreenshot(ID(1), ALICE_M, shot(), PartyStatus.Coming);
    expect(outcome).toEqual({ kind: 'gone' });
    expect(asMax(made.store.get(ID(1))).attendees[ALICE]).toBeUndefined();
  });
});
