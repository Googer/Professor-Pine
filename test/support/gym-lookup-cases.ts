import { expect, it } from 'vitest';
import { OUT_OF_SHARE_RANK } from '../../src/domain/geo/google-line.js';
import type { GymLookups } from '../../src/services/gym-lookups.js';

/** The two servers of the cases, by their `Guild` rows. */
export const LINE_HOME = 1;
export const LINE_AWAY = 2;

/**
 * What the line of gyms that wait for Google does, run against the repository and its twin in
 * memory alike. `made` gives a fresh, empty line whose gyms 1 to 4 exist, each of both servers
 * (`LINE_HOME`, `LINE_AWAY`). A gym waits once per server that has it (plan 19B-3).
 */
export function gymLookupCases(made: () => Promise<GymLookups>): void {
  const home = (gymId: number, address = false, rank = 0) => ({
    guildId: LINE_HOME,
    gymId,
    address,
    rank,
  });

  it('gives the gym that waited longest, the lower id first among those queued at once', async () => {
    const lookups = await made();
    expect(await lookups.next()).toBeUndefined();
    await lookups.add([home(3, true), home(2)], 1_000);
    await lookups.add([home(1)], 2_000);
    expect(await lookups.next()).toEqual({ guildId: LINE_HOME, gymId: 2, address: false });
    expect(await lookups.count()).toBe(3);
    await lookups.remove(2);
    expect(await lookups.next()).toEqual({ guildId: LINE_HOME, gymId: 3, address: true });
    await lookups.remove(3);
    expect(await lookups.next()).toEqual({ guildId: LINE_HOME, gymId: 1, address: false });
  });

  it('says whether any gym waits', async () => {
    const lookups = await made();
    expect(await lookups.any()).toBe(false);
    await lookups.add([home(3, true)], 1_000);
    expect(await lookups.any()).toBe(true);
    await lookups.remove(3);
    expect(await lookups.any()).toBe(false);
  });

  it('keeps a gym of two servers once per server, each with its rank, and takes both out at once', async () => {
    const lookups = await made();
    await lookups.add([home(1, false, 0.5)], 1_000);
    await lookups.add([{ guildId: LINE_AWAY, gymId: 1, address: true, rank: 1 }], 2_000);
    await lookups.add([home(2)], 1_500);
    expect(await lookups.list()).toEqual([
      { guildId: LINE_AWAY, gymId: 1, address: true, rank: 1, queuedAt: 2_000 },
      { guildId: LINE_HOME, gymId: 1, address: false, rank: 0.5, queuedAt: 1_000 },
      { guildId: LINE_HOME, gymId: 2, address: false, rank: 0, queuedAt: 1_500 },
    ]);
    expect(await lookups.count()).toBe(3);
    // Its address is the gym's: every server's row waits for it, or none does.
    await lookups.setAddress(1, false);
    expect((await lookups.list()).map((row) => row.address)).toEqual([false, false, false]);
    // Asked once, for every server.
    await lookups.remove(1);
    expect(await lookups.list()).toEqual([
      { guildId: LINE_HOME, gymId: 2, address: false, rank: 0, queuedAt: 1_500 },
    ]);
  });

  it('gives the gym of the best-ranked region first, whenever it was queued', async () => {
    const lookups = await made();
    await lookups.add([home(1, false, -1)], 1_000);
    await lookups.add([home(2, false, 0.25)], 2_000);
    await lookups.add([home(3, false, 1)], 3_000);
    await lookups.add([home(4, false, 0.25)], 1_500);
    await lookups.add([{ guildId: LINE_AWAY, gymId: 1, address: false, rank: -1 }], 1_000);
    expect((await lookups.list()).map((gym) => gym.gymId)).toEqual([3, 4, 2, 1, 1]);
    expect(await lookups.next()).toEqual({ guildId: LINE_HOME, gymId: 3, address: false });
    // The ranks are worked out anew, per server: the gym in no region of Away's has a busy
    // one of Home's now; a gym not in the line is left alone.
    await lookups.setRanks([
      { guildId: LINE_HOME, gymId: 1, rank: 2 },
      { guildId: LINE_HOME, gymId: 9, rank: 5 },
    ]);
    expect(await lookups.next()).toEqual({ guildId: LINE_HOME, gymId: 1, address: false });
    expect((await lookups.list())[0]).toEqual({
      guildId: LINE_HOME,
      gymId: 1,
      address: false,
      rank: 2,
      queuedAt: 1_000,
    });
    expect((await lookups.list())[4]).toEqual({
      guildId: LINE_AWAY,
      gymId: 1,
      address: false,
      rank: -1,
      queuedAt: 1_000,
    });
    expect(await lookups.count()).toBe(5);
  });

  it('gives the gym that waited longest of those that wait for their places alone, when asked', async () => {
    const lookups = await made();
    await lookups.add([home(1, true)], 1_000);
    expect(await lookups.next({ placesOnly: true })).toBeUndefined();
    await lookups.add([home(3)], 2_000);
    await lookups.add([home(2)], 3_000);
    expect(await lookups.next({ placesOnly: true })).toEqual({
      guildId: LINE_HOME,
      gymId: 3,
      address: false,
    });
    expect(await lookups.next()).toEqual({ guildId: LINE_HOME, gymId: 1, address: true });
  });

  it('passes over the gyms set aside, of every server', async () => {
    const lookups = await made();
    await lookups.add([home(1, false, 1)], 1_000);
    await lookups.add([{ guildId: LINE_AWAY, gymId: 1, address: false, rank: 1 }], 1_000);
    await lookups.add([home(2, true)], 2_000);
    await lookups.add([home(3)], 3_000);
    expect(await lookups.next({ except: new Set([1]) })).toEqual({
      guildId: LINE_HOME,
      gymId: 2,
      address: true,
    });
    expect(await lookups.next({ placesOnly: true, except: new Set([1]) })).toEqual({
      guildId: LINE_HOME,
      gymId: 3,
      address: false,
    });
    expect(await lookups.next({ except: new Set([1, 2, 3]) })).toBeUndefined();
    expect(await lookups.next({ except: new Set() })).toEqual({
      guildId: LINE_HOME,
      gymId: 1,
      address: false,
    });
    expect(await lookups.count()).toBe(4);
  });

  it('counts each server’s rows, those that wait for an address apart, and gives one server’s rows alone (plan 19B-5)', async () => {
    const lookups = await made();
    expect(await lookups.needs()).toEqual(new Map());
    await lookups.add([home(1, true), home(2), home(3, true)], 1_000);
    await lookups.add([{ guildId: LINE_AWAY, gymId: 1, address: true, rank: 1 }], 2_000);
    expect(await lookups.needs()).toEqual(
      new Map([
        [LINE_HOME, { places: 3, geocodes: 2 }],
        [LINE_AWAY, { places: 1, geocodes: 1 }],
      ]),
    );
    expect(await lookups.ofServer(LINE_AWAY)).toEqual([
      { guildId: LINE_AWAY, gymId: 1, address: true, rank: 1, queuedAt: 2_000 },
    ]);
    expect((await lookups.ofServer(LINE_HOME)).map((row) => row.gymId).toSorted()).toEqual([
      1, 2, 3,
    ]);
  });

  it('passes over the rows of a server out of its share, and those that wait for an address of a server out of addresses (plan 19B-5)', async () => {
    const lookups = await made();
    const away = (gymId: number, address = false, rank = 0) => ({
      guildId: LINE_AWAY,
      gymId,
      address,
      rank,
    });
    await lookups.add([home(1, true, 1), home(2, false, 0.5), away(3, true, 0.7)], 1_000);
    await lookups.add([away(4, false, 0.2)], 1_000);
    const out = (places: number[], geocodes: number[]) => ({
      outOfShare: { places: new Set(places), geocodes: new Set(geocodes) },
    });
    expect(await lookups.next(out([LINE_AWAY], []))).toMatchObject({ gymId: 1 });
    expect(await lookups.next(out([], [LINE_HOME]))).toMatchObject({ gymId: 3 });
    expect(await lookups.next(out([LINE_HOME], [LINE_AWAY]))).toMatchObject({ gymId: 4 });
    expect(await lookups.next(out([LINE_HOME, LINE_AWAY], []))).toBeUndefined();
    // A row ranked out of its share (`OUT_OF_SHARE_RANK`) waits after every other, and is never
    // given while shares are asked of, whatever the sets say.
    await lookups.setRanks([
      { guildId: LINE_HOME, gymId: 1, rank: OUT_OF_SHARE_RANK },
      { guildId: LINE_HOME, gymId: 2, rank: OUT_OF_SHARE_RANK },
    ]);
    expect(await lookups.next(out([], []))).toMatchObject({ gymId: 3 });
    expect((await lookups.list()).map((row) => row.gymId)).toEqual([3, 4, 1, 2]);
    await lookups.remove(3);
    await lookups.remove(4);
    expect(await lookups.next(out([], []))).toBeUndefined();
    expect(await lookups.next()).toMatchObject({ gymId: 1 });
  });

  it('keeps the place of a gym queued again, and its address when either asks for it', async () => {
    const lookups = await made();
    await lookups.add([home(4)], 1_000);
    await lookups.add([home(1)], 2_000);
    await lookups.add([home(4, true)], 3_000);
    expect(await lookups.next()).toEqual({ guildId: LINE_HOME, gymId: 4, address: true });
    await lookups.add([home(4)], 4_000);
    expect(await lookups.next()).toEqual({ guildId: LINE_HOME, gymId: 4, address: true });
    await lookups.setAddress(4, false);
    expect(await lookups.next()).toEqual({ guildId: LINE_HOME, gymId: 4, address: false });
    expect(await lookups.count()).toBe(2);
  });
}
