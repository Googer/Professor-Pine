import { describe, expect, it } from 'vitest';
import { EAST_CHANNEL } from '../../test/support/gyms.js';
import { customIdsOf, textOf } from '../../test/support/messages.js';
import { ALICE, gym } from '../../test/support/parties.js';
import { createdTrain } from '../../test/support/party-service.js';
import { gymsFixture } from '../../test/support/providers.js';
import { keptRow } from '../../test/support/wayspot-cases.js';
import { wayspotsWith } from '../../test/support/wayspots.js';
import { spotStop } from '../domain/party/stops.js';
import { manageDialog, moveDialog } from '../render/train-dialogs.js';
import { dialogChoices } from '../../test/support/dialogs.js';
import { stopsFrom } from '../render/train-stops.js';
import type { Member } from './attendance-service.js';
import type { GymProvider } from './gym-directory.js';

const alice: Member = { id: ALICE, name: 'Alice' };

/** A power spot in West, one in East, one in the region of the second server (North). */
const WEST_SPOT = keptRow(901, {
  kind: 'powerspot',
  title: 'Gazebo of the Lake',
  lat: 40.05,
  lon: -80.05,
});
const EAST_SPOT = keptRow(902, {
  kind: 'powerspot',
  title: 'Harbor Anchor',
  lat: 40.05,
  lon: -79.95,
});
const NORTH_SPOT = keptRow(903, {
  kind: 'powerspot',
  title: 'Hill Gazebo',
  lat: 40.25,
  lon: -80.05,
});
const STOP = keptRow(904, { kind: 'stop', title: 'Bench', lat: 40.05, lon: -80.04 });

async function spotted(route: readonly (number | ReturnType<typeof spotStop>)[] = [4, 1]) {
  const kept = await wayspotsWith([WEST_SPOT, EAST_SPOT, NORTH_SPOT, STOP]);
  const made = await createdTrain(
    { route },
    { wayspots: kept.wayspots, renderDelayMs: 0, sharedDelayMs: 0 },
  );
  return { ...made, ...kept };
}

describe('Power Spots as stops of a train (plan 8X-4; design 6.2)', () => {
  it('reaches a Power Spot of a region of its server, and no other place', async () => {
    const made = await spotted();
    const party = made.current();
    expect(made.trains.reaches(party, spotStop(WEST_SPOT.id))).toBe(true);
    expect(made.trains.reaches(party, spotStop(EAST_SPOT.id))).toBe(true);
    // Of another server's region, a PokéStop, and one Pine does not keep: none.
    expect(made.trains.reaches(party, spotStop(NORTH_SPOT.id))).toBe(false);
    expect(made.trains.reaches(party, spotStop(STOP.id))).toBe(false);
    expect(made.trains.reaches(party, spotStop(keptRow(999).id))).toBe(false);
    expect(made.trains.reaches(party, gym(4))).toBe(true);
  });

  it('refuses a Power Spot that is gone by the time the stop is added', async () => {
    const made = await spotted();
    expect(await made.trains.addStop(made.party.id, alice, spotStop(keptRow(999).id))).toEqual({
      kind: 'refused',
      reason: 'spot-gone',
    });
  });

  it('copies the post into the channel of the region a Power Spot of its route lies in', async () => {
    const made = await spotted([4, spotStop(EAST_SPOT.id)]);
    await made.service.flush();
    const copies = made.gateway.messagesIn(EAST_CHANNEL).filter((sent) => sent.message.v2 === true);
    expect(copies).toHaveLength(1);
    expect(textOf(copies[0]?.message)).toContain('Harbor Anchor');
  });

  it('takes off a Power Spot that an import found gone or made a PokéStop, as an unknown gym', async () => {
    const made = await spotted([4, spotStop(WEST_SPOT.id), spotStop(EAST_SPOT.id)]);
    await made.storage.saveFromImport(
      { upsert: [{ ...EAST_SPOT, kind: 'stop' }], remove: [], gone: [WEST_SPOT.id] },
      5_000,
    );
    await made.wayspots.load();
    expect(await made.trains.removeUnknownStops()).toBe(1);
    expect(made.current().train.route).toEqual([gym(4)]);
    await made.attendance.flush();
    expect(made.said().at(-1)).toBe(
      "2 stops were removed: their Power Spots are no longer in Pine's list of Power Spots.",
    );
  });

  it('takes off a Power Spot that is gone while the gym list is empty, and no gym', async () => {
    // A gym list that knows no gym at all (it could not be read), though it still names them.
    const empty = Object.defineProperty(Object.create(gymsFixture()) as GymProvider, 'size', {
      value: 0,
    });
    const kept = await wayspotsWith([WEST_SPOT, EAST_SPOT]);
    const made = await createdTrain(
      { route: [4, spotStop(WEST_SPOT.id), 1] },
      { wayspots: kept.wayspots, gyms: empty },
    );
    await kept.storage.saveFromImport({ upsert: [], remove: [], gone: [WEST_SPOT.id] }, 5_000);
    await kept.wayspots.load();
    expect(await made.trains.removeUnknownStops()).toBe(1);
    expect(made.current().train.route).toEqual([gym(4), gym(1)]);
  });

  it('takes off no Power Spot while no Wayspot is kept at all', async () => {
    const made = await spotted([4, spotStop(WEST_SPOT.id)]);
    for (const id of [WEST_SPOT.id, EAST_SPOT.id, NORTH_SPOT.id, STOP.id]) {
      made.wayspots.forget([id]);
    }
    expect(made.wayspots.size).toBe(0);
    expect(await made.trains.removeUnknownStops()).toBe(0);
    expect(made.current().train.route).toHaveLength(2);
  });

  it('keeps every id of the panel within what Discord takes with the longest Wayfarer ids', async () => {
    // The longest Wayfarer id: 32 hexadecimal digits and three more.
    const longest = (n: number) => `${'f'.repeat(31)}${n.toString(16)}.999`;
    const ids = [1, 2, 3].map(longest);
    const kept = await wayspotsWith(
      ids.map((id, n) =>
        keptRow(800 + n, {
          id,
          kind: 'powerspot',
          title: `Spot ${n}`,
          lat: 40.05,
          lon: -80.05 + n / 1000,
        }),
      ),
    );
    const made = await createdTrain({ route: ids.map(spotStop) }, { wayspots: kept.wayspots });
    const party = made.current();
    const view = {
      party,
      stop: stopsFrom(made.gyms ?? { get: () => undefined }, kept.wayspots),
      now: Date.now(),
    };
    // Move… and Manage… (plan 8X-G): their dialogs' ids, and the values of Move…'s choices.
    const move = moveDialog(view);
    const all = [
      move.custom_id,
      manageDialog(view).custom_id,
      ...dialogChoices(move).map((choice) => choice.value),
      ...customIdsOf(made.gateway.posts.get(made.postId)?.message),
    ];
    expect(all.length).toBeGreaterThan(5);
    for (const id of all) expect(id.length).toBeLessThanOrEqual(100);
  });
});
