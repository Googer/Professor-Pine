import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FAKE_GUILD_ID } from '../../../test/support/fake-interactions.js';
import { WEST_CHANNEL } from '../../../test/support/gyms.js';
import { maxReportingWith, MAX_THURSDAY } from '../../../test/support/max-reporting.js';
import { ALICE, asMax, at, BOB, TEST_SPOT } from '../../../test/support/parties.js';
import { PartyStatus } from '../../domain/party/status.js';
import { reportMaxAs } from './max-report.js';
import { reportMaxShotAs, type MaxShotRequest } from './max-shot.js';

const MINUTE = 60_000;
const MACHAMP = { boss: { key: 'machamp' }, tier: 'D2' as const, label: 'Dynamax Machamp (2★)' };
const MACHOP = { boss: { key: 'machop' }, tier: 'D1' as const, label: 'Dynamax Machop (1★)' };
const THREE = at('2026-10-22T15:00');
const NINE = at('2026-10-22T21:00');
const SHOT = { id: 'Ab3_-xY9zQ12', timeUncertain: false };
const ALLOWED = { mayJoin: () => Promise.resolve(true), staff: false };

/** A sure screenshot of Machamp (2★) at the test spot, taken two minutes ago, until 15:00. */
function request(overrides: Partial<MaxShotRequest> = {}): MaxShotRequest {
  return {
    boss: MACHAMP,
    spot: TEST_SPOT,
    end: THREE,
    regionChannelId: WEST_CHANNEL,
    takenAt: Date.now() - 2 * MINUTE,
    sureMoment: true,
    rotationEnd: true,
    capped: false,
    screenshot: SHOT,
    ...overrides,
  };
}

describe('reporting a max battle from a screenshot (reportMaxShotAs, plan 8X-S)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: MAX_THURSDAY });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  /** Bob's Machamp (2★) at the test spot, reported at 14:00 until 15:00; then five minutes on. */
  async function withBattle() {
    const made = await maxReportingWith();
    await reportMaxAs(
      made.ctx,
      { id: BOB, name: 'Bob' },
      FAKE_GUILD_ID,
      { boss: MACHAMP, spot: TEST_SPOT, end: THREE, regionChannelId: WEST_CHANNEL },
      ALLOWED,
    );
    vi.setSystemTime(MAX_THURSDAY + 5 * MINUTE);
    return { made, battle: asMax(made.store.active()[0]) };
  }

  it('reports a free spot anew, with its screenshot and the boss since the sure moment', async () => {
    const made = await maxReportingWith();
    const result = await reportMaxShotAs(
      made.ctx,
      { id: ALICE, name: 'Alice' },
      FAKE_GUILD_ID,
      request(),
      ALLOWED,
    );
    expect(result).toMatchObject({ kind: 'reported', result: { outcome: { kind: 'created' } } });
    const battle = asMax(made.store.active()[0]);
    expect(battle.endTime).toBe(THREE);
    expect(battle.max).toMatchObject({ screenshot: SHOT, bossSince: MAX_THURSDAY - 2 * MINUTE });
  });

  it('gives a battle reported on a moment not sure the boss since it was made', async () => {
    const made = await maxReportingWith();
    const unsure = { id: 'Ab3_-xY9zQ12', timeUncertain: true };
    await reportMaxShotAs(
      made.ctx,
      { id: ALICE, name: 'Alice' },
      FAKE_GUILD_ID,
      request({ sureMoment: false, screenshot: unsure }),
      ALLOWED,
    );
    expect(asMax(made.store.active()[0]).max).toMatchObject({
      screenshot: unsure,
      bossSince: MAX_THURSDAY,
    });
  });

  it('joins the battle of the same boss there by the automatic status, in one change', async () => {
    const { made, battle } = await withBattle();
    made.userSettings.set(ALICE, { autoStatus: PartyStatus.Coming });
    const result = await reportMaxShotAs(
      made.ctx,
      { id: ALICE, name: 'Alice' },
      FAKE_GUILD_ID,
      request(),
      ALLOWED,
    );
    expect(result).toMatchObject({
      kind: 'at-battle',
      outcome: { kind: 'joined', joined: true, endMoved: false },
      autoStatus: PartyStatus.Coming,
    });
    expect(made.store.active()).toHaveLength(1);
    expect(asMax(made.store.get(battle.id)).attendees[ALICE]?.status).toBe(PartyStatus.Coming);
  });

  // Review r4 A5.
  it('joins the battle there in exactly one change of the store', async () => {
    const { made } = await withBattle();
    const update = vi.spyOn(made.store, 'update');
    await reportMaxShotAs(
      made.ctx,
      { id: ALICE, name: 'Alice' },
      FAKE_GUILD_ID,
      request(),
      ALLOWED,
    );
    expect(update).toHaveBeenCalledOnce();
  });

  // Review r4 A5: the battle looked at ended between the look and the change.
  it('reports anew, once, where the battle looked at has ended meanwhile', async () => {
    const { made, battle } = await withBattle();
    // Bob's battle ends at 15:00; the look still saw it, the change finds its end come.
    vi.setSystemTime(THREE + MINUTE);
    vi.spyOn(made.store, 'maxAt').mockReturnValueOnce(battle);
    const later = request({ end: at('2026-10-22T16:00'), takenAt: THREE });
    const result = await reportMaxShotAs(
      made.ctx,
      { id: ALICE, name: 'Alice' },
      FAKE_GUILD_ID,
      later,
      ALLOWED,
    );
    expect(result).toMatchObject({ kind: 'reported', result: { outcome: { kind: 'created' } } });
    expect(made.store.active().filter((party) => party.id !== battle.id)).toHaveLength(1);
  });

  // Review r4 A1: a battle whose post is still being made is joined as `/max` joins it.
  it('reports through /max’s way a battle there whose post is not made yet', async () => {
    const { made, battle } = await withBattle();
    vi.spyOn(made.store, 'maxAt').mockReturnValueOnce({ ...battle, forumPostId: null });
    const fromScreenshot = vi.spyOn(made.maxes, 'fromScreenshot');
    const result = await reportMaxShotAs(
      made.ctx,
      { id: ALICE, name: 'Alice' },
      FAKE_GUILD_ID,
      request(),
      ALLOWED,
    );
    expect(fromScreenshot).not.toHaveBeenCalled();
    expect(result).toMatchObject({ kind: 'reported', result: { outcome: { kind: 'exists' } } });
    expect(made.store.active()).toHaveLength(1);
  });

  it('changes the boss there on a newer sure screenshot', async () => {
    const { made, battle } = await withBattle();
    const result = await reportMaxShotAs(
      made.ctx,
      { id: ALICE, name: 'Alice' },
      FAKE_GUILD_ID,
      request({ boss: MACHOP }),
      ALLOWED,
    );
    expect(result).toMatchObject({ kind: 'at-battle', outcome: { kind: 'changed' } });
    expect(asMax(made.store.get(battle.id)).max).toMatchObject({ boss: { key: 'machop' } });
  });

  it('refuses a member kept out of the forum of the battle there, and changes nothing', async () => {
    const { made, battle } = await withBattle();
    const result = await reportMaxShotAs(
      made.ctx,
      { id: ALICE, name: 'Alice' },
      FAKE_GUILD_ID,
      request({ boss: MACHOP }),
      { mayJoin: () => Promise.resolve(false), staff: false },
    );
    expect(result).toEqual({ kind: 'barred' });
    expect(asMax(made.store.get(battle.id)).max.boss).toEqual({ key: 'machamp' });
  });

  it('refuses an end that has passed by the time of reporting, in the words of its kind (R11)', async () => {
    const made = await maxReportingWith();
    const member = { id: ALICE, name: 'Alice' };
    const passed = MAX_THURSDAY - MINUTE;
    expect(
      await reportMaxShotAs(made.ctx, member, FAKE_GUILD_ID, request({ end: passed }), ALLOWED),
    ).toEqual({ kind: 'over', reason: 'battle-over' });
    // The countdown runs on, but the day's battles ended at the cap (Matt's M2).
    vi.setSystemTime(NINE + MINUTE);
    expect(
      await reportMaxShotAs(
        made.ctx,
        member,
        FAKE_GUILD_ID,
        request({ end: NINE, capped: true, rotationEnd: false }),
        ALLOWED,
      ),
    ).toEqual({ kind: 'over', reason: 'over-for-today' });
    expect(made.store.active()).toEqual([]);
  });
});
