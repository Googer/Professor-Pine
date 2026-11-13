import { MessageFlags } from 'discord.js';
import { describe, expect, it, onTestFinished, vi } from 'vitest';
import { watchImmediates } from '../../../test/support/timers.js';
import { STAFF_PLACE, UPDATES_CHANNEL, withOtherServer } from '../../../test/support/gym-admin.js';
import {
  answerOf,
  gymCommandsWith,
  MEMBER,
  MODERATOR,
} from '../../../test/support/gym-commands.js';
import { TEST_GUILD_ROW, WEST_CHANNEL } from '../../../test/support/gyms.js';
import { REPORTER } from '../../../test/support/parties.js';
import type { Gym } from '../../db/repositories/gym-repository.js';
import type { LatLon } from '@pine/wayspot-core/lat-lon';
import { PartyStatus } from '../../domain/party/status.js';
import type { WayspotKind } from '@pine/wayspot-core/export-file';
import type { ReviewCandidate, ReviewItem } from '../../domain/wayspots/review.js';
import type { V2Message } from '../../discord/party-gateway.js';
import { addressLine } from '../../domain/geo/google.js';
import { gymMapsUrl } from '../../render/raid-post.js';
import { buttonsOf, textOf } from '../../../test/support/messages.js';

type Made = Awaited<ReturnType<typeof gymCommandsWith>>;

const METRES_PER_DEGREE = (6_371_000 * Math.PI) / 180;

/** A point `north` metres from `from`. */
const at = (from: LatLon, north: number): LatLon => ({
  lat: from.lat + north / METRES_PER_DEGREE,
  lon: from.lon,
});

const idOf = (n: number): string => `${n.toString(16).padStart(32, '0')}.16`;

function gymOf(made: Made, id: number): Gym {
  const gym = made.directory.stored(id);
  if (!gym) throw new Error(`no gym ${id}`);
  return gym;
}

/** A Wayspot `north` metres from a gym, as the queue keeps it. */
function candidate(
  made: Made,
  n: number,
  title: string,
  gymId: number,
  north: number,
  kind: WayspotKind = 'gym',
): ReviewCandidate {
  const place = at(gymOf(made, gymId), north);
  return { id: idOf(n), kind, title, ...place, metres: Math.abs(north) };
}

/** When the items of a test were queued: a minute before the fakes' clock. */
const queuedAt = (made: Made): number => made.clock.now - 60_000;

/** Queues these items for the fakes' server (row 1), as an import would: with the gym's pogoId. */
async function queue(made: Made, items: ReviewItem[]): Promise<void> {
  const queued = items.map((item) => ({ ...item, gymPogoId: gymOf(made, item.gymId).pogoId }));
  await made.wayfarerStore.saveReviews(1, null, queued, queuedAt(made));
}

/**
 * The usual queue: the mosaic (6) to match, with a Wayfarer gym 40 m north of it and a stop 60
 * m south; the fountain (2) missing, its Wayspot a stop now; the post office (12) never found.
 */
async function usualQueue(made: Made): Promise<void> {
  await made.gymStore.update(2, { pogoId: idOf(20) });
  await made.directory.refreshGym(2);
  await queue(made, [
    {
      gymId: 6,
      kind: 'match',
      candidates: [
        candidate(made, 4, 'Mosaic of Maple Leaves', 6, 40),
        candidate(made, 5, 'Bench', 6, -60, 'stop'),
      ],
    },
    { gymId: 2, kind: 'missing', candidates: [candidate(made, 20, 'Old Fountain', 2, 2, 'stop')] },
    { gymId: 12, kind: 'unknown', candidates: [] },
  ]);
}

/** The id of the item of a gym. */
function reviewOf(made: Made, gymId: number): number {
  const row = made.wayfarerStore.reviews.find((one) => one.gymId === gymId);
  if (!row) throw new Error(`no item of gym ${gymId}`);
  return row.id;
}

/** The message an interaction was last answered with: components v2, with the flag. */
function shownOf(interaction: Awaited<ReturnType<Made['use']>>): V2Message {
  const payload = answerOf(interaction);
  expect(payload.flags).toBe(MessageFlags.IsComponentsV2);
  expect(payload).not.toHaveProperty('content');
  expect(payload).not.toHaveProperty('embeds');
  return { v2: true, components: payload.components } as V2Message;
}

/** The text of that message, line by line (its text displays one after the other). */
const lines = (_made: Made, interaction: Awaited<ReturnType<Made['use']>>): string[] =>
  textOf(shownOf(interaction)).split('\n');

const buttons = (interaction: Awaited<ReturnType<Made['use']>>): [string, string][] =>
  buttonsOf(shownOf(interaction)).map((button) => [button.label ?? '', button.customId ?? '']);

const labels = (interaction: Awaited<ReturnType<Made['use']>>): string[] =>
  buttons(interaction).map(([label]) => label);

async function raidAt(made: Made, gymId: number) {
  const raid = await made.service.reportRaid({
    gym: gymOf(made, gymId),
    guildRow: TEST_GUILD_ROW,
    reporterId: REPORTER,
    anonymous: false,
    autoStatus: PartyStatus.Interested,
    tier: { level: 'T5', shadow: false },
    boss: null,
  });
  if (raid.kind !== 'created') throw new Error('no raid');
  return raid.party;
}

const MOSAIC_LINES = (made: Made, left: string): string[] => [
  'Which Wayspot is **Maple Leaf Mosaic** (#6)? None within 100 m is certainly it.',
  'Only a Wayfarer gym can be a gym or become one: a PokéStop or a Power Spot is listed for ' +
    'what is there.',
  `It lies in <#${WEST_CHANNEL}>. Its place: [40.03, -80.03](<${gymMapsUrl(gymOf(made, 6))}>).`,
  'Wayspots within 100 m:',
  `1. **Mosaic of Maple Leaves**, a gym, 40 m away: [map](<${gymMapsUrl(at(gymOf(made, 6), 40))}>)`,
  `2. **Bench**, a PokéStop, 60 m away: [map](<${gymMapsUrl(at(gymOf(made, 6), -60))}>)`,
  left,
];

const FOUNTAIN_LINE =
  '**Old Stone Fountain** (#2) is no gym in Wayfarer any more: its Wayspot is a PokéStop now.';

const WAITS_LINE =
  'Nothing was done: the gym became another Wayspot since that was queued. It waits for the ' +
  'next import of this server.';

const BACK_WAITS_LINE =
  'That question waits now: the gym became another Wayspot since it was queued, so it waits ' +
  'for the next import of this server.';

describe('/gym review: the message', () => {
  it('says when nothing is left', async () => {
    const made = await gymCommandsWith();
    const used = await made.use('review');
    expect(used.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
    expect(lines(made, used)).toEqual(['Nothing left to review.']);
    expect(labels(used)).toEqual([]);
  });

  it('shows the oldest item to match: the gym, its candidates, the buttons, what is left', async () => {
    const made = await gymCommandsWith();
    await usualQueue(made);
    const used = await made.use('review');
    const review = reviewOf(made, 6);

    expect(lines(made, used)).toEqual(
      MOSAIC_LINES(
        made,
        '3 in the queue, this one included: 1 to match, 1 missing from Wayfarer, 1 never ' +
          'found in Wayfarer.',
      ),
    );
    // A stop can neither be the gym nor become one: only the Wayfarer gym has buttons.
    expect(buttons(used)).toEqual([
      ['Same as Mosaic of Maple Leaves (40 m)', `gymreview:${review}:same:${idOf(4)}`],
      ['New gym: Mosaic of Maple Leaves (40 m)', `gymreview:${review}:new:${idOf(4)}`],
      ['None of these', `gymreview:${review}:none`],
      ['Delete', `gymreview:${review}:delete`],
      ['Skip for now', `gymreview:${review}:skip`],
    ]);
  });

  it('says what a gym matched by a far Wayfarer id is asked about', async () => {
    const made = await gymCommandsWith();
    await made.gymStore.update(6, { pogoId: idOf(4) });
    await made.directory.refreshGym(6);
    await queue(made, [
      {
        gymId: 6,
        kind: 'match',
        candidates: [
          candidate(made, 5, 'Bench', 6, -60, 'stop'),
          { ...candidate(made, 4, 'Mosaic of Maple Leaves', 6, 3_000), own: true },
        ],
      },
    ]);
    const used = await made.use('review');
    const mosaic = gymOf(made, 6);
    expect(lines(made, used).slice(0, -1)).toEqual([
      'Which Wayspot is **Maple Leaf Mosaic** (#6)? The Wayspot its Wayfarer id names lies ' +
        '3.0 km away: it was not moved there without asking.',
      'Only a Wayfarer gym can be a gym or become one: a PokéStop or a Power Spot is listed for ' +
        'what is there.',
      `It lies in <#${WEST_CHANNEL}>. Its place: [40.03, -80.03](<${gymMapsUrl(mosaic)}>).`,
      'Wayspots within 100 m:',
      `1. **Bench**, a PokéStop, 60 m away: [map](<${gymMapsUrl(at(mosaic, -60))}>)`,
      'The Wayspot its Wayfarer id names:',
      `**Mosaic of Maple Leaves**, a gym, 3.0 km away: [map](<${gymMapsUrl(at(mosaic, 3_000))}>)`,
    ]);
  });

  it("offers no New gym for the gym's own Wayspot, and refuses one pressed", async () => {
    const made = await gymCommandsWith();
    await made.gymStore.update(6, { pogoId: idOf(4) });
    await made.directory.refreshGym(6);
    await queue(made, [
      {
        gymId: 6,
        kind: 'match',
        candidates: [
          candidate(made, 7, 'Leaf Mural', 6, -30),
          { ...candidate(made, 4, 'Mosaic of Maple Leaves', 6, 3_000), own: true },
        ],
      },
    ]);
    const review = reviewOf(made, 6);
    const used = await made.use('review');
    expect(labels(used)).toEqual([
      'Same as Leaf Mural (30 m)',
      'Same as Mosaic of Maple Leaves (3.0 km)',
      'New gym: Leaf Mural (30 m)',
      'None of these',
      'Delete',
      'Skip for now',
    ]);
    const pressed = await made.press(`gymreview:${review}:new:${idOf(4)}`);
    expect(lines(made, pressed)[0]).toBe(
      'That one changed since it was shown (a newer import), so nothing was done.',
    );
    expect(made.directory.all().filter((gym) => gym.pogoId === idOf(4))).toHaveLength(1);
    expect(made.wayfarerStore.reviews.find((row) => row.id === review)?.openGymId).toBe(6);
  });

  it('offers Same as for a missing gym with a Wayfarer gym near', async () => {
    const made = await gymCommandsWith();
    await made.gymStore.update(2, { pogoId: idOf(20) });
    await made.directory.refreshGym(2);
    await queue(made, [
      {
        gymId: 2,
        kind: 'missing',
        candidates: [candidate(made, 21, 'Stone Fountain', 2, 30)],
      },
    ]);
    const used = await made.use('review');
    const review = reviewOf(made, 2);
    expect(lines(made, used).slice(0, 3)).toEqual([
      '**Old Stone Fountain** (#2) is missing from Wayfarer: its Wayspot was not found where the ' +
        'scan covered its place.',
      'Delete it if it is gone from the game; keep it if it is still there.',
      'If a Wayfarer gym below is it (under a new id), press Same as.',
    ]);
    expect(labels(used)).toEqual([
      'Same as Stone Fountain (30 m)',
      'Delete',
      'Keep',
      'Skip for now',
    ]);
    const pressed = await made.press(`gymreview:${review}:same:${idOf(21)}`);
    expect(lines(made, pressed)[0]).toBe(
      '**Old Stone Fountain** (#2) is that Wayspot now: renamed **Stone Fountain**, moved 30 m.',
    );
  });

  it('says a never found gym whose name looks sponsored is likely not in Wayfarer', async () => {
    const made = await gymCommandsWith();
    await made.gymStore.update(12, { sponsor: 3 });
    await made.directory.refreshGym(12);
    await queue(made, [
      { gymId: 5, kind: 'unknown', candidates: [] },
      { gymId: 12, kind: 'unknown', candidates: [] },
      { gymId: 3, kind: 'unknown', candidates: [] },
    ]);
    const hint = 'Its name looks like a sponsored location: those are not in Wayfarer.';
    const starbucks = await made.use('review');
    expect(lines(made, starbucks)).toContain(hint);
    await made.wayfarerStore.skip(1, reviewOf(made, 5), made.clock.now);
    const flagged = await made.use('review');
    expect(lines(made, flagged)).toContain(hint);
    await made.wayfarerStore.skip(1, reviewOf(made, 12), made.clock.now + 1);
    const church = await made.use('review');
    expect(lines(made, church)).not.toContain(hint);
  });

  it('asks about a gym missing from Wayfarer, and one never found there', async () => {
    const made = await gymCommandsWith();
    await usualQueue(made);
    await made.wayfarerStore.skip(1, reviewOf(made, 6), made.clock.now);
    const missing = await made.use('review');
    expect(lines(made, missing)).toEqual([
      '**Old Stone Fountain** (#2) is no gym in Wayfarer any more: its Wayspot is a PokéStop now.',
      'Delete it if it is gone from the game; keep it if it is still there.',
      `It lies in <#${WEST_CHANNEL}>. Its place: [40.06, -80.06](<${gymMapsUrl(gymOf(made, 2))}>).`,
      'Wayspots within 100 m:',
      `1. **Old Fountain**, a PokéStop, 2 m away: [map](<${gymMapsUrl(at(gymOf(made, 2), 2))}>)`,
      '3 in the queue, this one included: 1 to match, 1 missing from Wayfarer, 1 never found ' +
        'in Wayfarer.',
    ]);
    expect(labels(missing)).toEqual(['Delete', 'Keep', 'Skip for now']);

    await made.wayfarerStore.skip(1, reviewOf(made, 2), made.clock.now + 1);
    const unknown = await made.use('review');
    expect(lines(made, unknown)).toEqual([
      '**Pinewood Post Office Gym** (#12) was never found in Wayfarer, and the scan found no ' +
        'Wayspot within 100 m of it.',
      'Delete it if it is gone from the game. If it is still there, Wayfarer does not have it ' +
        '(a sponsored gym): mark it so, and imports leave it alone.',
      `It lies in <#${WEST_CHANNEL}>. Its place: [40.04, -80.04](<${gymMapsUrl(gymOf(made, 12))}>).`,
      '3 in the queue, this one included: 1 to match, 1 missing from Wayfarer, 1 never found ' +
        'in Wayfarer.',
    ]);
    expect(labels(unknown)).toEqual(['Not in Wayfarer', 'Delete', 'Skip for now']);
  });

  it('says of a gym that shares its Wayspot with a nearer gym what happened, and offers no Same as for it', async () => {
    const made = await gymCommandsWith();
    await made.gymStore.update(2, { pogoId: idOf(4) });
    await made.gymStore.update(6, { pogoId: idOf(4) });
    await made.directory.refreshGym(2);
    await made.directory.refreshGym(6);
    const held = { ...candidate(made, 4, 'Leaf Fountain', 2, 60), own: true as const, heldBy: 6 };
    await queue(made, [{ gymId: 2, kind: 'missing', candidates: [held] }]);
    const used = await made.use('review');
    expect(lines(made, used).slice(0, 2)).toEqual([
      '**Old Stone Fountain** (#2) shares its Wayspot **Leaf Fountain** with **Maple Leaf ' +
        'Mosaic** (#6), which lies nearer to it: that gym is the Wayspot now.',
      'Delete this one if it is a duplicate of that gym; keep it if it is another gym that is ' +
        'still in the game.',
    ]);
    expect(labels(used)).toEqual(['Delete', 'Keep', 'Skip for now']);
    // Asked to match, the line says the same, and the held Wayspot has no button.
    await queue(made, [
      { gymId: 2, kind: 'match', candidates: [candidate(made, 7, 'Leaf Mural', 2, -30), held] },
    ]);
    const match = await made.use('review');
    expect(lines(made, match).slice(0, 2)).toEqual([
      'Which Wayspot is **Old Stone Fountain** (#2)? None within 100 m is certainly it.',
      'It shares its Wayspot **Leaf Fountain** with **Maple Leaf Mosaic** (#6), which lies ' +
        'nearer to it: that gym is the Wayspot now.',
    ]);
    expect(labels(match)).toEqual([
      'Same as Leaf Mural (30 m)',
      'New gym: Leaf Mural (30 m)',
      'None of these',
      'Delete',
      'Skip for now',
    ]);
  });

  it('says a gym shares its Wayspot though the Wayspot lies far, and when it is a PokéStop now', async () => {
    const made = await gymCommandsWith();
    for (const id of [2, 6]) {
      await made.gymStore.update(id, { pogoId: idOf(4) });
      await made.directory.refreshGym(id);
    }
    const far = { ...candidate(made, 4, 'Leaf Fountain', 2, 3_000), own: true as const, heldBy: 6 };
    await queue(made, [
      { gymId: 2, kind: 'match', candidates: [candidate(made, 7, 'Leaf Mural', 2, -30), far] },
    ]);
    const match = await made.use('review');
    expect(lines(made, match).slice(0, 2)).toEqual([
      'Which Wayspot is **Old Stone Fountain** (#2)? None within 100 m is certainly it.',
      'It shares its Wayspot **Leaf Fountain** with **Maple Leaf Mosaic** (#6), which lies ' +
        'nearer to it: that gym is the Wayspot now.',
    ]);
    const stop = {
      ...candidate(made, 4, 'Leaf Fountain', 2, 60, 'stop'),
      own: true as const,
      heldBy: 6,
    };
    await queue(made, [{ gymId: 2, kind: 'missing', candidates: [stop] }]);
    const missing = await made.use('review');
    expect(lines(made, missing)[0]).toBe(
      '**Old Stone Fountain** (#2) shares its Wayspot **Leaf Fountain**, a PokéStop now, with ' +
        '**Maple Leaf Mosaic** (#6), which lies nearer to it and holds it too.',
    );
  });

  it('says of a missing gym whose Wayspot is gone that it was not found', async () => {
    const made = await gymCommandsWith();
    await queue(made, [{ gymId: 3, kind: 'missing', candidates: [] }]);
    const used = await made.use('review');
    expect(lines(made, used)[0]).toBe(
      "**St. Mary's Church** (#3) is missing from Wayfarer: its Wayspot was not found where the " +
        'scan covered its place.',
    );
  });

  it('cuts long titles to fit a button, and offers every Wayfarer gym', async () => {
    const made = await gymCommandsWith();
    const long = 'A very long title of a mural that goes on and on beside the old mill race';
    await queue(made, [
      {
        gymId: 6,
        kind: 'match',
        candidates: [
          candidate(made, 4, long, 6, 30),
          candidate(made, 7, long, 6, 50),
          candidate(made, 8, '', 6, 70),
        ],
      },
    ]);
    const used = await made.use('review');
    const shown = labels(used);
    expect(shown.every((label) => label.length <= 80)).toBe(true);
    expect(shown.slice(0, 3)).toEqual([
      'Same as A very long title of a mural that goes on and on beside the old… (30 m)',
      'Same as A very long title of a mural that goes on and on beside the old… (50 m)',
      'Same as (no title) (70 m)',
    ]);
    expect(shown.slice(3, 6)).toEqual([
      'New gym: A very long title of a mural that goes on and on beside the old… (30 m)',
      'New gym: A very long title of a mural that goes on and on beside the old… (50 m)',
      'New gym: (no title) (70 m)',
    ]);
    expect(lines(made, used)).toContain(
      `3. **(no title)**, a gym, 70 m away: [map](<${gymMapsUrl(at(gymOf(made, 6), 70))}>)`,
    );
  });

  it('closes the item of a gym that no longer exists on the way to the next', async () => {
    const made = await gymCommandsWith();
    await usualQueue(made);
    made.directory.forget(6);
    const used = await made.use('review');
    expect(lines(made, used)[0]).toMatch(/^\*\*Old Stone Fountain\*\* \(#2\)/);
    expect(made.wayfarerStore.reviews.find((row) => row.gymId === 6)).toMatchObject({
      openGymId: null,
      decision: 'resolved',
      decidedBy: null,
    });
  });

  it('refuses a member who is not staff', async () => {
    const made = await gymCommandsWith();
    await usualQueue(made);
    const used = await made.use('review', {}, { userId: MEMBER, roleNames: [] });
    expect(used.reply).toHaveBeenCalledWith({
      content: 'Only admins, moderators and bot developers can do that.',
      flags: MessageFlags.Ephemeral,
    });
  });
});

describe('/gym review: the answers to an item to match', () => {
  it('Same as makes the gym the Wayspot, closes the item and shows the next', async () => {
    const made = await gymCommandsWith();
    await usualQueue(made);
    const review = reviewOf(made, 6);
    const pressed = await made.press(`gymreview:${review}:same:${idOf(4)}`);
    await made.settle();

    expect(pressed.deferUpdate).toHaveBeenCalled();
    expect(lines(made, pressed).slice(0, 2)).toEqual([
      '**Maple Leaf Mosaic** (#6) is that Wayspot now: renamed **Mosaic of Maple Leaves**, ' +
        'moved 40 m.',
      '**Old Stone Fountain** (#2) is no gym in Wayfarer any more: its Wayspot is a PokéStop now.',
    ]);
    expect(lines(made, pressed)).toContain(
      '2 in the queue, this one included: 1 missing from Wayfarer, 1 never found in Wayfarer.',
    );
    expect(gymOf(made, 6)).toMatchObject({ name: 'Mosaic of Maple Leaves', pogoId: idOf(4) });
    expect(gymOf(made, 6).lat).toBeCloseTo(at({ lat: 40.03, lon: -80.03 }, 40).lat, 9);
    expect(made.wayfarerStore.reviews.find((row) => row.id === review)).toMatchObject({
      openGymId: null,
      decision: 'same-as',
      decidedBy: MODERATOR,
    });
    expect(made.entries).toContainEqual(
      expect.objectContaining({
        msg: 'a gym review was answered',
        staff: MODERATOR,
        review,
        gym: 6,
        action: 'same',
        outcome: 'matched',
      }),
    );
  });

  it('Same as is refused while another gym is that Wayspot, and the item stays', async () => {
    const made = await gymCommandsWith();
    await usualQueue(made);
    await made.gymStore.update(1, { pogoId: idOf(4) });
    await made.directory.refreshGym(1);
    const review = reviewOf(made, 6);
    const pressed = await made.press(`gymreview:${review}:same:${idOf(4)}`);

    expect(lines(made, pressed).slice(0, 2)).toEqual([
      'Nothing was changed: that Wayspot is **Pinewood Public Library** (The Stacks, #1) ' +
        'already. Is one of the two a duplicate?',
      'Which Wayspot is **Maple Leaf Mosaic** (#6)? None within 100 m is certainly it.',
    ]);
    expect(gymOf(made, 6).pogoId).toBeNull();
    expect(made.wayfarerStore.reviews.find((row) => row.id === review)?.openGymId).toBe(6);
  });

  it('Same as does nothing when the gym became another Wayspot since it was queued', async () => {
    const made = await gymCommandsWith();
    await usualQueue(made);
    // Another server whose regions overlap matched the mosaic meanwhile.
    await made.gymStore.update(6, { pogoId: idOf(8) });
    await made.directory.refreshGym(6);
    const review = reviewOf(made, 6);
    const pressed = await made.press(`gymreview:${review}:same:${idOf(4)}`);

    // The item waits for the next import of this server, and the queue goes on past it.
    expect(lines(made, pressed).slice(0, 2)).toEqual([
      WAITS_LINE,
      '**Old Stone Fountain** (#2) is no gym in Wayfarer any more: its Wayspot is a PokéStop now.',
    ]);
    expect(gymOf(made, 6).pogoId).toBe(idOf(8));
    expect(made.wayfarerStore.reviews.find((row) => row.id === review)?.openGymId).toBe(6);
  });

  it('passes over an item whose gym became another Wayspot, which Skip still puts at the end', async () => {
    const made = await gymCommandsWith();
    await usualQueue(made);
    await made.gymStore.update(6, { pogoId: idOf(8) });
    await made.directory.refreshGym(6);
    const used = await made.use('review');
    expect(lines(made, used)[0]).toBe(
      '**Old Stone Fountain** (#2) is no gym in Wayfarer any more: its Wayspot is a PokéStop now.',
    );
    // The count of what is left says what waits.
    expect(lines(made, used).at(-1)).toBe(
      '3 in the queue, this one included: 1 to match, 1 missing from Wayfarer, 1 never found ' +
        'in Wayfarer. 1 of them waits for the next import of this server.',
    );
    for (const action of ['none', 'delete', 'back']) {
      const pressed = await made.press(`gymreview:${reviewOf(made, 6)}:${action}`);
      expect(lines(made, pressed).slice(0, 2)).toEqual([
        action === 'back' ? BACK_WAITS_LINE : WAITS_LINE,
        FOUNTAIN_LINE,
      ]);
    }
    const skipped = await made.press(`gymreview:${reviewOf(made, 6)}:skip`);
    expect(lines(made, skipped).slice(0, 2)).toEqual([
      'Skipped **Maple Leaf Mosaic** (#6): it comes again after the others.',
      FOUNTAIN_LINE,
    ]);
    expect((await made.wayfarerStore.openReviews(1)).map((item) => item.gymId)).toEqual([2, 12, 6]);
  });

  it("Same as and New gym take the Wayspot's address from Wayfarer, not from Google", async () => {
    const ADDRESS = '20 Market Street, Pinewood, PA 15999, USA';
    for (const action of ['same', 'new']) {
      const made = await gymCommandsWith();
      await queue(made, [
        {
          gymId: 6,
          kind: 'match',
          candidates: [
            { ...candidate(made, 4, 'Mosaic of Maple Leaves', 6, 40), address: ADDRESS },
          ],
        },
      ]);
      made.geo.asked.length = 0;
      await made.press(`gymreview:${reviewOf(made, 6)}:${action}:${idOf(4)}`);
      await made.settle();
      const gym = made.directory.all().find((one) => one.pogoId === idOf(4));
      expect(addressLine(gym?.geodata ?? null), action).toBe(ADDRESS);
      expect(made.geo.questions('geocode'), action).toEqual([]);
    }
  });

  it('New gym adds the Wayspot as a gym, announced, and the gym stays as it is', async () => {
    const made = await gymCommandsWith();
    await usualQueue(made);
    const review = reviewOf(made, 6);
    const pressed = await made.press(`gymreview:${review}:new:${idOf(4)}`);
    await made.settle();

    const added = made.directory.all().find((gym) => gym.pogoId === idOf(4));
    expect(added).toMatchObject({ name: 'Mosaic of Maple Leaves' });
    expect(lines(made, pressed)[0]).toBe(
      `Added **Mosaic of Maple Leaves** (#${added?.id}) as a new gym; **Maple Leaf Mosaic** ` +
        '(#6) stays as it is.',
    );
    expect(gymOf(made, 6)).toMatchObject({ name: 'Maple Leaf Mosaic', pogoId: null });
    expect(made.gateway.messagesIn(UPDATES_CHANNEL)).toHaveLength(1);
    expect(made.wayfarerStore.reviews.find((row) => row.id === review)).toMatchObject({
      decision: 'new-gym',
      decidedBy: MODERATOR,
    });
    expect((await made.wayfarerStore.records([added?.id ?? 0])).get(added?.id ?? 0)).toMatchObject({
      lastSeen: made.clock.now,
    });
  });

  it('New gym takes a Wayspot that a gym of another server is too (plan 19B-2)', async () => {
    const made = await gymCommandsWith();
    await usualQueue(made);
    const theirs = await withOtherServer(made);
    await made.gymStore.update(theirs.id, { pogoId: idOf(4) });
    await made.directory.refreshGym(theirs.id);
    const review = reviewOf(made, 6);
    const pressed = await made.press(`gymreview:${review}:new:${idOf(4)}`);
    await made.settle();

    const added = made.directory
      .of(TEST_GUILD_ROW)
      .all()
      .find((gym) => gym.pogoId === idOf(4));
    expect(added).toMatchObject({ name: 'Mosaic of Maple Leaves' });
    expect(lines(made, pressed)[0]).not.toContain('Northgate');
    // The other server's gym is as it was, and still that Wayspot.
    expect(made.directory.stored(theirs.id)?.pogoId).toBe(idOf(4));
  });

  it('New gym that could not be saved keeps the question open and says to try again', async () => {
    const made = await gymCommandsWith();
    await usualQueue(made);
    const review = reviewOf(made, 6);
    vi.spyOn(made.wayspots, 'of').mockImplementation(() => {
      throw new Error('the kept Wayspots cannot be read');
    });
    const pressed = await made.press(`gymreview:${review}:new:${idOf(4)}`);
    await made.settle();
    expect(lines(made, pressed)[0]).toBe(
      'I could not save all of that, and the question stays open. Try again in a moment.',
    );
    expect(made.directory.all().find((gym) => gym.pogoId === idOf(4))).toBeUndefined();
  });

  it('New gym of a PokéStop promoted to a gym says so in the summary, and drops its kept row', async () => {
    const made = await gymCommandsWith();
    await usualQueue(made);
    const promoted = candidate(made, 4, 'Mosaic of Maple Leaves', 6, 40);
    await made.wayspotStore.saveFromImport(
      TEST_GUILD_ROW,
      {
        upsert: [
          {
            id: promoted.id,
            kind: 'gym',
            formerKind: 'stop',
            lat: promoted.lat,
            lon: promoted.lon,
            title: promoted.title,
            address: null,
            image: null,
          },
        ],
        remove: [],
      },
      1,
    );
    await made.wayspots.load();

    await made.press(`gymreview:${reviewOf(made, 6)}:new:${idOf(4)}`);
    await made.settle();
    await made.admin.flush();

    expect(made.gateway.messagesIn(UPDATES_CHANNEL).map((sent) => textOf(sent.message))).toEqual([
      '### The gym list changed\nProfessor Pine has added 1 gym (it was a PokéStop).',
    ]);
    expect(await made.wayspotStore.all(TEST_GUILD_ROW)).toEqual([]);
    expect(made.wayspots.of(TEST_GUILD_ROW).byId(idOf(4))).toBeUndefined();
  });

  it('New gym gives the gym the picture of the Wayspot it was kept with', async () => {
    const made = await gymCommandsWith();
    await usualQueue(made);
    const wall = candidate(made, 4, 'Mosaic of Maple Leaves', 6, 40);
    const picture = 'https://lh3.googleusercontent.com/mosaic';
    await made.wayspotStore.saveFromImport(
      TEST_GUILD_ROW,
      {
        upsert: [
          {
            id: wall.id,
            kind: 'gym',
            formerKind: null,
            lat: wall.lat,
            lon: wall.lon,
            title: wall.title,
            address: null,
            image: picture,
          },
        ],
        remove: [],
      },
      1,
    );
    await made.wayspots.load();

    await made.press(`gymreview:${reviewOf(made, 6)}:new:${idOf(4)}`);
    await made.settle();

    expect(made.directory.all().find((gym) => gym.pogoId === idOf(4))?.imageUrl).toBe(picture);
  });

  it('New gym is refused where another gym lies within ten metres of the Wayspot', async () => {
    const made = await gymCommandsWith();
    await made.gymStore.create({ name: 'Leaf Bench', ...at(gymOf(made, 6), 45) }, 1);
    await made.directory.load();
    await queue(made, [
      {
        gymId: 6,
        kind: 'match',
        candidates: [candidate(made, 4, 'Mosaic of Maple Leaves', 6, 40)],
      },
    ]);
    const review = reviewOf(made, 6);
    const pressed = await made.press(`gymreview:${review}:new:${idOf(4)}`);
    expect(lines(made, pressed).slice(0, 3)).toEqual([
      'Nothing was added.',
      'Another gym lies within 10 m of that place:',
      '- **Leaf Bench** (#13), 5 m away',
    ]);
    expect(made.directory.all().some((gym) => gym.pogoId === idOf(4))).toBe(false);
    expect(made.wayfarerStore.reviews.find((row) => row.id === review)?.openGymId).toBe(6);
  });

  it('says in its help what None of these does, and what Skip is for', async () => {
    const { gym } = await import('./index.js');
    const details = gym.subcommands.get('review')?.help?.details;
    expect(typeof details === 'string' && details).toContain(
      '"None of these" says the Wayfarer gyms listed are other gyms: the next import adds them. ' +
        '"Keep" and "None of these" stand until the Wayspots near the gym change.\n\nSkip for now ' +
        '(to the end of the queue) is for when you are not sure.',
    );
  });

  it('None of these closes the item and leaves the gym alone', async () => {
    const made = await gymCommandsWith();
    await usualQueue(made);
    const review = reviewOf(made, 6);
    const pressed = await made.press(`gymreview:${review}:none`);
    // The next import adds the Wayfarer gym it listed (wayfarer-import-service.test.ts).
    expect(lines(made, pressed)[0]).toBe(
      '**Maple Leaf Mosaic** (#6) stays as it is, and the next import adds each Wayfarer gym ' +
        'listed for it as a gym of its own. Imports ask about it again only when the Wayspots ' +
        'near it change. (Skip for now is for when you are not sure.)',
    );
    expect(made.wayfarerStore.reviews.find((row) => row.id === review)).toMatchObject({
      openGymId: null,
      decision: 'none-of-these',
      decidedBy: MODERATOR,
    });
    expect(gymOf(made, 6)).toMatchObject({ name: 'Maple Leaf Mosaic', pogoId: null });
  });

  it('refuses an answer the item no longer asks: a candidate it lacks, a kind it changed to', async () => {
    const made = await gymCommandsWith();
    await usualQueue(made);
    const review = reviewOf(made, 6);
    // A stop is never offered as the gym, and an id the item lacks names nothing.
    for (const id of [
      `gymreview:${review}:same:${idOf(5)}`,
      `gymreview:${review}:new:${idOf(9)}`,
      `gymreview:${review}:keep`,
    ]) {
      const pressed = await made.press(id);
      expect(lines(made, pressed)[0]).toBe(
        'That one changed since it was shown (a newer import), so nothing was done.',
      );
    }
    expect(made.wayfarerStore.reviews.find((row) => row.id === review)?.openGymId).toBe(6);
    expect(gymOf(made, 6).pogoId).toBeNull();
  });
});

describe('/gym review: the answers to a missing gym', () => {
  it('Keep closes the item', async () => {
    const made = await gymCommandsWith();
    await usualQueue(made);
    const review = reviewOf(made, 2);
    const pressed = await made.press(`gymreview:${review}:keep`);
    expect(lines(made, pressed)[0]).toBe(
      'Kept **Old Stone Fountain** (#2). Imports ask about it again only when the Wayspots near ' +
        'it change.',
    );
    expect(made.wayfarerStore.reviews.find((row) => row.id === review)).toMatchObject({
      decision: 'keep',
      decidedBy: MODERATOR,
    });
    expect(gymOf(made, 2).pogoId).toBe(idOf(20));
  });

  it('Delete asks first, saying what goes with the gym, and Back shows the item again', async () => {
    const made = await gymCommandsWith();
    await usualQueue(made);
    await made.gymTargets.add('300000000000000001', made.gateway.guildId, 2);
    const review = reviewOf(made, 2);
    const asked = await made.press(`gymreview:${review}:delete`);
    expect(lines(made, asked)).toEqual([
      'Delete **Old Stone Fountain** (#2)? This cannot be undone.',
      'With it go:',
      '- the gym target of 1 member',
    ]);
    expect(buttons(asked)).toEqual([
      ['Delete', `gymreview:${review}:confirm`],
      ['Back', `gymreview:${review}:back`],
    ]);
    expect(made.directory.of(TEST_GUILD_ROW).get(2)).toBeDefined();
    const back = await made.press(`gymreview:${review}:back`);
    expect(lines(made, back)[0]).toBe(
      '**Old Stone Fountain** (#2) is no gym in Wayfarer any more: its Wayspot is a PokéStop now.',
    );
  });

  it('Delete deletes the gym once confirmed, and its item goes with it', async () => {
    const made = await gymCommandsWith();
    await usualQueue(made);
    const review = reviewOf(made, 2);
    const pressed = await made.press(`gymreview:${review}:confirm`);
    await made.settle();
    expect(lines(made, pressed)[0]).toBe('Deleted **Old Stone Fountain** (#2).');
    expect(made.directory.stored(2)).toBeUndefined();
    expect(made.wayfarerStore.reviews.some((row) => row.id === review)).toBe(false);
    expect(made.gateway.messagesIn(UPDATES_CHANNEL)).toHaveLength(1);
    expect(lines(made, pressed)).toContain(
      '2 in the queue, this one included: 1 to match, 1 never found in Wayfarer.',
    );
  });

  it('Delete is refused while a raid is at the gym, with its post, and the item stays', async () => {
    const made = await gymCommandsWith();
    await usualQueue(made);
    const raid = await raidAt(made, 2);
    const review = reviewOf(made, 2);
    const pressed = await made.press(`gymreview:${review}:delete`);
    expect(lines(made, pressed)[0]).toBe(
      `A raid is at **Old Stone Fountain** (#2): <#${raid.forumPostId ?? ''}>. A gym cannot be ` +
        'deleted while a raid is there: wait until the raid is over, or close it with ' +
        '`/delete` in its post.',
    );
    expect(made.directory.of(TEST_GUILD_ROW).get(2)).toBeDefined();
    expect(made.wayfarerStore.reviews.find((row) => row.id === review)?.openGymId).toBe(2);
  });
});

describe('/gym review: the answers to a gym never found', () => {
  it('Not in Wayfarer marks the gym and closes the item', async () => {
    const made = await gymCommandsWith();
    await usualQueue(made);
    const review = reviewOf(made, 12);
    const pressed = await made.press(`gymreview:${review}:unlisted`);
    expect(lines(made, pressed)[0]).toBe(
      'Marked **Pinewood Post Office Gym** (#12) as not in Wayfarer: imports leave it alone ' +
        'from now on.',
    );
    expect((await made.wayfarerStore.records([12])).get(12)).toMatchObject({
      notInWayfarer: true,
      notInWayfarerBy: MODERATOR,
      notInWayfarerAt: made.clock.now,
    });
    expect(made.wayfarerStore.reviews.find((row) => row.id === review)).toMatchObject({
      decision: 'not-in-wayfarer',
    });
  });

  it('Delete deletes it', async () => {
    const made = await gymCommandsWith();
    await usualQueue(made);
    const pressed = await made.press(`gymreview:${reviewOf(made, 12)}:confirm`);
    await made.settle();
    expect(lines(made, pressed)[0]).toBe('Deleted **Pinewood Post Office Gym** (#12).');
    expect(made.directory.stored(12)).toBeUndefined();
  });
});

describe('/gym review: an import meanwhile', () => {
  /**
   * Holds the admin lock until `release` is called, then changes the fountain's question: the
   * same kind, another Wayspot near it (what the answer read before the lock still fits).
   */
  function importMeanwhile(made: Made) {
    let release = (): void => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const running = made.admin.batch(STAFF_PLACE, 'import', async () => {
      await gate;
      await made.wayfarerStore.saveReviews(
        1,
        null,
        [
          {
            gymId: 2,
            kind: 'missing',
            candidates: [candidate(made, 22, 'Kiosk', 2, 50, 'stop')],
            gymPogoId: idOf(20),
          },
        ],
        made.clock.now,
      );
    });
    return { release, running };
  }

  it('does nothing with an answer to a question an import changed while it waited', async () => {
    const made = await gymCommandsWith();
    await usualQueue(made);
    const review = reviewOf(made, 2);
    const immediates = watchImmediates();
    onTestFinished(() => {
      immediates.restore();
    });
    for (const action of ['keep', 'confirm']) {
      const meanwhile = importMeanwhile(made);
      const pressing = made.press(`gymreview:${review}:${action}`);
      // The press has read the item and waits for the lock the import holds.
      await immediates.settle();
      expect(made.lock.waiting()).toBe(1);
      meanwhile.release();
      await meanwhile.running;
      const pressed = await pressing;
      expect(lines(made, pressed)[0]).toBe(
        'That one changed since it was shown (a newer import), so nothing was done.',
      );
      expect(made.directory.of(TEST_GUILD_ROW).get(2)).toBeDefined();
      expect(made.wayfarerStore.reviews.find((row) => row.id === review)).toMatchObject({
        openGymId: 2,
        decision: null,
      });
      // Back to what the next press reads before the lock.
      await made.wayfarerStore.saveReviews(
        1,
        null,
        [
          {
            gymId: 2,
            kind: 'missing',
            candidates: [candidate(made, 20, 'Old Fountain', 2, 2, 'stop')],
            gymPogoId: idOf(20),
          },
        ],
        made.clock.now,
      );
    }
  });
});

describe('/gym review: the queue', () => {
  it('Skip for now puts the item at the end', async () => {
    const made = await gymCommandsWith();
    await usualQueue(made);
    const review = reviewOf(made, 6);
    const pressed = await made.press(`gymreview:${review}:skip`);
    expect(lines(made, pressed).slice(0, 2)).toEqual([
      'Skipped **Maple Leaf Mosaic** (#6): it comes again after the others.',
      '**Old Stone Fountain** (#2) is no gym in Wayfarer any more: its Wayspot is a PokéStop now.',
    ]);
    expect(
      (await made.wayfarerStore.openReviews(1)).map((item) => [item.gymId, item.queuedAt]),
    ).toEqual([
      [2, queuedAt(made)],
      [12, queuedAt(made)],
      [6, made.clock.now],
    ]);
  });

  it('shows the next item with a line when the item was decided already', async () => {
    const made = await gymCommandsWith();
    await usualQueue(made);
    const review = reviewOf(made, 6);
    await made.press(`gymreview:${review}:none`);
    const late = await made.press(`gymreview:${review}:same:${idOf(4)}`, {
      userId: '200000000000000006',
    });
    expect(lines(made, late).slice(0, 2)).toEqual([
      'That one was already decided.',
      '**Old Stone Fountain** (#2) is no gym in Wayfarer any more: its Wayspot is a PokéStop now.',
    ]);
    expect(gymOf(made, 6).pogoId).toBeNull();
  });

  it('answers one of two presses at once, and tells the other it was decided', async () => {
    const made = await gymCommandsWith();
    await usualQueue(made);
    const review = reviewOf(made, 6);
    const [first, second] = await Promise.all([
      made.press(`gymreview:${review}:new:${idOf(4)}`),
      made.press(`gymreview:${review}:new:${idOf(4)}`, { userId: '200000000000000006' }),
    ]);
    await made.settle();
    expect(lines(made, first)[0]).toMatch(/^Added \*\*Mosaic of Maple Leaves\*\*/);
    expect(lines(made, second)[0]).toBe('That one was already decided.');
    expect(made.directory.all().filter((gym) => gym.pogoId === idOf(4))).toHaveLength(1);
  });

  it('says how many questions wait, and for what, when none can be answered now', async () => {
    const made = await gymCommandsWith();
    await queue(made, [
      { gymId: 6, kind: 'match', candidates: [] },
      { gymId: 12, kind: 'unknown', candidates: [] },
    ]);
    await made.gymStore.update(6, { pogoId: idOf(8) });
    await made.directory.refreshGym(6);
    const pressed = await made.press(`gymreview:${reviewOf(made, 12)}:unlisted`);
    expect(lines(made, pressed).slice(1)).toEqual([
      'Nothing to review now: 1 question waits for the next import of this server (its gym ' +
        'became another Wayspot since it was queued).',
    ]);
    await made.gymStore.update(12, { pogoId: idOf(9) });
    await made.directory.refreshGym(12);
    await queue(made, [{ gymId: 2, kind: 'unknown', candidates: [] }]);
    await made.gymStore.update(2, { pogoId: idOf(10) });
    await made.directory.refreshGym(2);
    const used = await made.use('review');
    expect(lines(made, used)).toEqual([
      'Nothing to review now: 2 questions wait for the next import of this server (their gyms ' +
        'became other Wayspots since they were queued).',
    ]);
  });

  it('says so when the last item is answered', async () => {
    const made = await gymCommandsWith();
    await queue(made, [{ gymId: 12, kind: 'unknown', candidates: [] }]);
    const pressed = await made.press(`gymreview:${reviewOf(made, 12)}:unlisted`);
    expect(lines(made, pressed)).toEqual([
      'Marked **Pinewood Post Office Gym** (#12) as not in Wayfarer: imports leave it alone ' +
        'from now on.',
      'Nothing left to review.',
    ]);
    expect(labels(pressed)).toEqual([]);
  });

  it("never answers another server's item", async () => {
    const made = await gymCommandsWith();
    await made.wayfarerStore.saveReviews(2, null, [{ gymId: 6, kind: 'match', candidates: [] }], 1);
    const theirs = reviewOf(made, 6);
    const pressed = await made.press(`gymreview:${theirs}:none`);
    expect(lines(made, pressed)).toEqual([
      'That one was already decided.',
      'Nothing left to review.',
    ]);
    expect(made.wayfarerStore.reviews[0]?.openGymId).toBe(6);
  });

  it('refuses a member who is not staff, and a button that is no review button', async () => {
    const made = await gymCommandsWith();
    await usualQueue(made);
    const review = reviewOf(made, 12);
    const member = await made.press(`gymreview:${review}:unlisted`, {
      userId: MEMBER,
      roleNames: [],
    });
    expect(member.reply).toHaveBeenCalledWith({
      content: 'Only admins, moderators and bot developers can do that.',
      flags: MessageFlags.Ephemeral,
    });
    expect(made.wayfarerStore.reviews.find((row) => row.id === review)?.openGymId).toBe(12);
    const odd = await made.press(`gymreview:${review}:explode`);
    expect(odd.deferUpdate).not.toHaveBeenCalled();
    expect(odd.reply).toHaveBeenCalledWith(
      expect.objectContaining({ flags: MessageFlags.Ephemeral }),
    );
  });
});
