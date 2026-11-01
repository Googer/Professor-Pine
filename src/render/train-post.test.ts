import { describe, expect, it } from 'vitest';
import { expectSendable } from '../../test/support/post-limits.js';
import { catalogueFixture } from '../../test/support/game-data.js';
import { testGyms } from '../../test/support/gyms.js';
import {
  accentOf,
  buttonLabels,
  buttonNames,
  buttonsOf,
  componentCount,
  customIdsOf,
  partTexts,
  sectionsOf,
  textDisplays,
  textOf,
  thumbnailBeside,
  thumbnailOf,
  thumbnailsOf,
} from '../../test/support/messages.js';
import {
  ALICE,
  at,
  BOB,
  CAROL,
  MINUTE,
  PARTY_NOW,
  PARTY_ZONE,
  REPORTER,
  testTrain,
  withAttendees,
  stops,
} from '../../test/support/parties.js';
import { raidBossesFixture } from '../../test/support/raid-bosses.js';
import { roleLines, withoutRoles } from '../../test/support/post-roles.js';
import { decodeCustomId } from '../discord/custom-id.js';
import {
  endParty,
  MAX_ROUTE_STOPS,
  MAX_SPLITS_KEPT,
  TRAIN_AT_END,
  type Attendee,
  type TrainAtEnd,
  type TrainDetails,
  type TrainParty,
} from '../domain/party/party.js';
import { PartyStatus } from '../domain/party/status.js';
import {
  KEPT_OPEN,
  layoutTextLength,
  LEAD_ROOM,
  LOBBY_OVER,
  MAX_COMPONENTS,
  postMessage,
  TEXT_BUDGET,
  type RenderedPost,
} from './party-post.js';
import { renderMirror } from './mirrors.js';
import { shownBoss, type PostGym } from './raid-post.js';
import { LIMITS } from './text.js';
import { stopLink, stopsFrom } from './train-stops.js';
import { gymStop } from '../domain/party/stops.js';
import { movementText, whereText } from './train-words.js';
import {
  renderTrainPost,
  routeLines,
  trainTags,
  trainTitle,
  type TrainPostView,
} from './train-post.js';

const teams = { instinct: '⚡', mystic: '❄️', valor: '🔥' };
const emoji = { shiny: '✨', remote: '🛰️', teams };
const stamp = (time: number, style = 't') => `<t:${time / 1000}:${style}>`;
const ARCHIVING = { graceMinutes: 5, warningMinutes: 60 };
const START = at('2026-10-13T16:00');
const END = at('2026-10-13T18:00');
const catalogue = catalogueFixture();
/** The start of the heading of where the train is. */
const LOCATION = '**Where';
/** The address line of gyms 4 and 11 as a post shows it. */
const RIVER_ROAD = '12 River Road, Pinewood, Pennsylvania 15999';

const gyms = new Map<number, PostGym>(testGyms().map((gym) => [gym.id, gym]));
const gym = (id: number): PostGym | undefined => gyms.get(id);
const maps = (id: number): string => {
  const found = gyms.get(id);
  return `https://www.google.com/maps/search/?api=1&query=${found?.lat}%2C${found?.lon}`;
};

/** The stops of trains as these gyms show them. */
const lookup = (find: (id: number) => PostGym | undefined) => stopsFrom({ get: find });

/** A gym as a stop shows it, for a movement. */
const shown = (id: number) => ({ kind: 'gym' as const, gym: gym(id) });

/** The test train on this route of gyms, at the stop with this index. */
function onRoute(
  route: readonly number[],
  stop = 0,
  more: Partial<Omit<TrainDetails, 'finishedFrom'>> & { finishedFrom?: number } = {},
): TrainParty {
  const train = testTrain();
  const { finishedFrom, ...rest } = more;
  return {
    ...train,
    train: {
      ...train.train,
      route: stops(...route),
      stop,
      ...rest,
      ...(finishedFrom === undefined ? {} : { finishedFrom: gymStop(finishedFrom) }),
    },
  };
}

function view(party: TrainParty, extra: Partial<TrainPostView> = {}): TrainPostView {
  return {
    party,
    now: PARTY_NOW,
    zone: PARTY_ZONE,
    archiving: ARCHIVING,
    emoji,
    stop: lookup(gym),
    boss: shownBoss(party, catalogue, raidBossesFixture().bosses()),
    catalogue,
    ...extra,
  };
}

/** The lines of the first block of a post: its name, its boss, its times, its conductor. */
const lines = (party: TrainParty, extra: Partial<TrainPostView> = {}): string[] =>
  textDisplays(renderTrainPost(view(party, extra)).message)[0]?.split('\n') ?? [];

/** The part of a post that starts so (a heading; `partTexts`), or undefined. */
function block(post: RenderedPost, start: string): string | undefined {
  return partTexts(post.message).find((text) => text.startsWith(start));
}

/** Where the train is: the text of the post under "**Where…**". */
const where = (party: TrainParty, extra: Partial<TrainPostView> = {}): string | undefined =>
  textDisplays(renderTrainPost(view(party, extra)).message).find((text) =>
    text.startsWith('**Where'),
  );

/** What lies ahead, in small print under where the train is. */
const ahead = (party: TrainParty, extra: Partial<TrainPostView> = {}): string | undefined =>
  textDisplays(renderTrainPost(view(party, extra)).message).find((text) =>
    /^-# (?:Next|Route|This)/.test(text),
  );

/** A route of seven gyms, 1 to 7. */
const SEVEN = [1, 2, 3, 4, 5, 6, 7];

/**
 * A train split off another, with as many groups split off it as it keeps, each with a label
 * of 100 of this character: the longest small print of splits.
 */
function everySplit(character: string): Pick<TrainDetails, 'splitFrom' | 'splitOff'> {
  return {
    splitFrom: { partyId: '00000000-0000-4000-8000-0000000000aa', postId: '910000000000000001' },
    splitOff: Array.from({ length: MAX_SPLITS_KEPT }, (_, n) => ({
      partyId: `00000000-0000-4000-8000-0000000001${String(n).padStart(2, '0')}`,
      postId: `9200000000000000${String(n).padStart(2, '0')}`,
      group: 'B' as const,
      label: character.repeat(100),
    })),
  };
}

/** The labels of a message's buttons, of those that have one (Group…, Move…, …). */
const labelled = (message: Parameters<typeof buttonLabels>[0]): (string | undefined)[] =>
  buttonLabels(message).filter((label) => label !== undefined);

const NO_TIME =
  'No time has been set yet: Manage… or `/meet` sets the start. Without one this post is archived ' +
  `${stamp(PARTY_NOW + (24 * 60 + 65) * MINUTE, 'R')}.`;

describe('trainTitle and trainTags', () => {
  it('titles the post with what it is and its name, within what a title takes', () => {
    expect(trainTitle(testTrain())).toBe('Train · Saturday legendaries');
    const long = trainTitle(testTrain({ name: 'x'.repeat(80) }));
    expect(long.length).toBeLessThanOrEqual(LIMITS.title);
  });

  it('tags it as a train, and as ended once its end time has passed or the party has ended', () => {
    const train = { ...testTrain(), endTime: END };
    expect(trainTags(train, PARTY_NOW)).toEqual(['Train']);
    expect(trainTags(train, END)).toEqual(['Train', 'Ended']);
    expect(trainTags(endParty(testTrain()), PARTY_NOW)).toEqual(['Train', 'Ended']);
    // Not because its route is finished.
    expect(trainTags(onRoute([4, 1], 2), PARTY_NOW)).toEqual(['Train']);
  });
});

describe('renderTrainPost', () => {
  it('shows a new train: what it is, that it has no time and no route, and who made it', () => {
    const post = renderTrainPost(view(testTrain()));
    expect(post.title).toBe('Train · Saturday legendaries');
    expect(post.tags).toEqual(['Train']);
    expect(accentOf(post.message)).toBe(0x3498db);
    expect(thumbnailOf(post.message)).toBeUndefined();
    expect(textDisplays(post.message)).toEqual([
      `### Raid Train: Saturday legendaries\n${NO_TIME}`,
      '**Where**\nNo route yet: `/route add` adds a stop.',
      `1 trainer\n🤔 Interested (1): <@${REPORTER}>`,
      `-# Created by <@${REPORTER}>`,
    ]);
    expect(post.message).toEqual(postMessage(post.layout));
    // The brief of a direct message: its name (the sentence of a new train does not say it),
    // where it is, its times, how many come.
    expect(post.brief).toEqual({
      accent: 0x3498db,
      lines: ['**Raid Train: Saturday legendaries**', 'No route yet', NO_TIME, '1 trainer'],
      whereLine: 'No route yet',
    });
  });

  it('names no maker of a train whose maker chose not to be named, and still its conductor', () => {
    const hidden = testTrain({ anonymous: true });
    expect(textOf(renderTrainPost(view(hidden)).message)).not.toContain('Created by');
    const led = { ...hidden, train: { ...hidden.train, conductorId: REPORTER } };
    expect(lines(led)).toContain(`Conductor: <@${REPORTER}>`);
    // A maker who is not signed up either: nobody in the list.
    const empty = testTrain({ anonymous: true, autoStatus: PartyStatus.NotInterested });
    const post = renderTrainPost(view(empty));
    expect(textOf(post.message)).not.toContain(REPORTER);
    expect(JSON.stringify(post.brief)).not.toContain(REPORTER);
  });

  it('says its times as a meetup does, in the second line', () => {
    const train: TrainParty = {
      ...testTrain(),
      endTime: END,
      timed: { name: 'Saturday legendaries', startTime: START },
    };
    expect(lines(train)[1]).toBe(
      `Starts ${stamp(START, 'R')}, at ${stamp(START)}. Ends at ${stamp(END)}.`,
    );
    expect(lines(train, { now: END })[1]).toBe(`Ended at ${stamp(END, 'F')}.`);
    expect(lines(endParty(testTrain()))[1]).toBe('This train is over.');
  });

  it('names the conductor when the train has one', () => {
    expect(lines(onRoute([4], 0, { conductorId: ALICE }))).toContain(`Conductor: <@${ALICE}>`);
    const named = withAttendees(onRoute([4], 0, { conductorId: ALICE }), {
      [ALICE]: { name: 'Alice' },
    });
    expect(lines(named)).toContain('Conductor: Alice');
    expect(lines(onRoute([4])).some((line) => line.startsWith('Conductor'))).toBe(false);
  });

  it('says in its small print where the groups split off it went, newest first, and where it came from', () => {
    const NEW = '910000000000000002';
    const NEWER = '910000000000000003';
    const OLD = '910000000000000001';
    const train = onRoute([4], 0, {
      conductorId: ALICE,
      splitFrom: { partyId: '00000000-0000-4000-8000-0000000000aa', postId: OLD },
      splitOff: [
        { partyId: '00000000-0000-4000-8000-0000000000cc', postId: NEWER, group: 'C' },
        {
          partyId: '00000000-0000-4000-8000-0000000000bb',
          postId: NEW,
          group: 'B',
          label: 'Fast *and* furious',
        },
      ],
    });
    expect(lines(train).slice(-4)).toEqual([
      `Conductor: <@${ALICE}>`,
      `-# Split off from <#${OLD}>`,
      `-# Group C went its own way: <#${NEWER}>`,
      `-# Group B (Fast \\*and\\* furious) went its own way: <#${NEW}>`,
    ]);
    // A train neither split from nor off another says nothing of it.
    expect(lines(onRoute([4])).some((line) => line.startsWith('-#'))).toBe(false);
  });

  it('puts the small print of splits last in the heading, after the boss (mockup 3)', () => {
    const OLD = '910000000000000001';
    const train: TrainParty = {
      ...onRoute([4], 0, {
        boss: { key: 'yveltal' },
        splitFrom: { partyId: '00000000-0000-4000-8000-0000000000aa', postId: OLD },
      }),
      saved: true,
    };
    const heading = lines(train);
    const at = heading.indexOf(`-# Split off from <#${OLD}>`);
    expect(at).toBeGreaterThan(heading.findIndex((line) => line.startsWith('**Catch CP**')));
    expect(at).toBeGreaterThan(heading.indexOf(KEPT_OPEN));
    expect(heading.at(-1)).toBe(`-# Split off from <#${OLD}>`);
  });

  it('says where the train is as a raid says its gym, with the number of the stop', () => {
    const post = renderTrainPost(view(onRoute(SEVEN, 3)));
    expect(where(onRoute(SEVEN, 3))).toBe(
      `**Where · stop 4 of 7**\n**Veterans Memorial Bridge** · ${RIVER_ROAD} · [Map](<${maps(4)}>)`,
    );
    // Under it the next two stops and how many more; Move…, Manage… and Route are in the
    // third row of the controls, after Group… (plan 8X-1B).
    expect(ahead(onRoute(SEVEN, 3))).toBe(
      '-# Next: 5. Starbucks · 6. Maple Leaf Mosaic, and 1 more to the end',
    );
    expect(labelled(post.message)).toEqual(['Group…', 'Move…', 'Manage…', 'Route']);
    const { id } = onRoute(SEVEN);
    expect(customIdsOf(post.message).slice(-4)).toEqual([
      `party:${id}:regroup`,
      `party:${id}:move`,
      `party:${id}:manage`,
      `party:${id}:route`,
    ]);
  });

  it('words what lies ahead by the mode and where the train is', () => {
    const at = (stop: number, atEnd: TrainAtEnd = 'finish') =>
      ahead(onRoute(SEVEN, stop, { atEnd }));
    expect(at(0)).toBe(
      "-# Next: 2. Old Stone Fountain · 3. St. Mary's Church, and 4 more to the end",
    );
    expect(at(4)).toBe('-# Next: 6. Maple Leaf Mosaic · 7. Harbor Lighthouse Mural, the last stop');
    expect(at(5)).toBe('-# Next: 7. Harbor Lighthouse Mural, the last stop');
    expect(at(6)).toBe('-# This is the last stop.');
    // A loop looks past the end.
    expect(at(5, 'loop')).toBe(
      '-# Next: 7. Harbor Lighthouse Mural · 1. The Stacks (round again), and 4 more round the loop',
    );
    expect(at(6, 'loop')).toBe(
      '-# Next: 1. The Stacks (round again) · 2. Old Stone Fountain, and 4 more round the loop',
    );
    // So does a train that turns back.
    expect(at(0, 'turn-back')).toBe(
      "-# Next: 2. Old Stone Fountain · 3. St. Mary's Church, and 4 more to the end, where it turns back",
    );
    expect(at(4, 'turn-back')).toBe(
      '-# Next: 6. Maple Leaf Mosaic · 7. Harbor Lighthouse Mural, where it turns back',
    );
    expect(at(5, 'turn-back')).toBe(
      '-# Next: 7. Harbor Lighthouse Mural, then back here, and 5 more back to the start',
    );
    expect(at(6, 'turn-back')).toBe(
      '-# Next: 6. Maple Leaf Mosaic (turning back) · 5. Starbucks, and 4 more back to the start',
    );
  });

  it('lists a route of three stops or fewer whole, with its mode, and has no Route', () => {
    const looping = onRoute([4, 1, 7], 1, { atEnd: 'loop' });
    expect(ahead(looping)).toBe(
      '-# Route: 1. Veterans Memorial Bridge · **2. The Stacks** · 3. Harbor Lighthouse Mural, loops',
    );
    expect(where(looping)).toMatch(/^\*\*Where · stop 2 of 3\*\*\n\*\*The Stacks\*\* · /);
    expect(buttonLabels(renderTrainPost(view(looping)).message)).not.toContain('Route');
    expect(ahead(onRoute([4, 1], 0, { atEnd: 'turn-back' }))).toBe(
      '-# Route: **1. Veterans Memorial Bridge** · 2. The Stacks, turns back at the end',
    );
    // A route of one stop finishes there in every mode: the line says nothing of a mode.
    expect(ahead(onRoute([4], 0, { atEnd: 'loop' }))).toBe(
      '-# Route: **1. Veterans Memorial Bridge**',
    );
  });

  it('says that the route is complete, and stays blue: only the times end a train', () => {
    const short = renderTrainPost(view(onRoute([4, 1, 7], 3)));
    expect(where(onRoute([4, 1, 7], 3))).toBe('**Where**\nRoute complete');
    // A short route is still listed, nobody in bold, and without its mode: it is done.
    for (const atEnd of TRAIN_AT_END) {
      expect(ahead(onRoute([4, 1, 7], 3, { atEnd }))).toBe(
        '-# Route: 1. Veterans Memorial Bridge · 2. The Stacks · 3. Harbor Lighthouse Mural',
      );
    }
    // Move… and Manage… stay: Previous and Reverse take a Finish back.
    expect(buttonLabels(short.message)).toContain('Move…');
    expect(buttonLabels(short.message)).toContain('Manage…');
    expect(buttonLabels(short.message)).not.toContain('Route');
    expect(accentOf(short.message)).toBe(0x3498db);
    expect(short.tags).toEqual(['Train']);
    expect(thumbnailsOf(short.message)).toEqual([]);
    // A long one is not: Route shows it.
    const long = renderTrainPost(view(onRoute(SEVEN, 7)));
    expect(where(onRoute(SEVEN, 7))).toBe('**Where**\nRoute complete');
    expect(ahead(onRoute(SEVEN, 7))).toBeUndefined();
    expect(labelled(long.message)).toEqual(['Group…', 'Move…', 'Manage…', 'Route']);
  });

  it('says how to add a stop to a train without a route, with Manage… alone (no Move…)', () => {
    const post = renderTrainPost(view(testTrain()));
    expect(where(testTrain())).toBe('**Where**\nNo route yet: `/route add` adds a stop.');
    expect(ahead(testTrain())).toBeUndefined();
    expect(labelled(post.message)).toEqual(['Group…', 'Manage…']);
  });

  it('lists a route that turned back or was reversed in its new order, numbered anew', () => {
    const turned = onRoute([7, 1, 4], 1, { atEnd: 'turn-back' });
    expect(ahead(turned)).toBe(
      '-# Route: 1. Harbor Lighthouse Mural · **2. The Stacks** · 3. Veterans Memorial Bridge, turns back at the end',
    );
  });

  it('names a gym that no longer exists as unknown, without a map', () => {
    expect(where(onRoute([999, 4]))).toBe('**Where · stop 1 of 2**\n**Unknown gym**');
    expect(ahead(onRoute([999, 4]))).toBe(
      '-# Route: **1. Unknown gym** · 2. Veterans Memorial Bridge',
    );
  });

  it('leaves Move… and Manage… out of a copy in another region, and keeps Route', () => {
    const post = renderTrainPost(view(onRoute(SEVEN, 1)));
    const copy = renderMirror('region', post, {
      postId: '900000000000000001',
      regionChannelId: undefined,
    });
    expect(buttonLabels(copy)).toContain('Route');
    expect(buttonLabels(copy)).not.toContain('Move…');
    expect(buttonLabels(copy)).not.toContain('Manage…');
    // Every other button as the post has it, in its three rows; Group… too.
    expect(buttonsOf(copy)).toEqual(
      buttonsOf(post.message).filter(
        (button) => button.label !== 'Move…' && button.label !== 'Manage…',
      ),
    );
    expect(buttonNames(copy)).toEqual([
      '🤔',
      '🏃',
      '✅',
      '👋',
      '⬇️',
      '⬆️',
      '📡',
      'Group…',
      'Route',
    ]);
    // A short route's copy has neither.
    const short = renderMirror('region', renderTrainPost(view(onRoute([4, 1]))), {
      postId: '900000000000000001',
      regionChannelId: undefined,
    });
    expect(buttonNames(short).slice(0, 1)).toEqual(['🤔']);
  });

  it('shows the boss the train is after as a raid shows it: name, picture, weaknesses, catch CP', () => {
    const train = onRoute([4], 0, { boss: { key: 'yveltal' } });
    const post = renderTrainPost(view(train));
    expect(lines(train)[1]).toBe('**After Yveltal** ✨');
    // In the heading block, after the times (Matt, 2026-10-17: no block of its own).
    const boss = lines(train).slice(3).join('\n');
    expect(boss).toMatch(/^\*\*Weaknesses\*\* /);
    expect(boss).toMatch(/\n\*\*Catch CP\*\* \d+–\d+ · \d+–\d+/);
    // No moves: a train goes from raid to raid.
    expect(boss).not.toMatch(/Moveset/);
    const listed = raidBossesFixture()
      .bosses()
      .find((b) => b.entry?.key === 'yveltal');
    expect(thumbnailOf(post.message)).toBe(listed?.image);
    // The brief names it as the post does, with its picture.
    expect(post.brief.lines.slice(0, 2)).toEqual([
      '**Raid Train: Saturday legendaries**',
      '**After Yveltal** ✨',
    ]);
    expect(post.brief.picture).toBe(listed?.image);
  });

  it('shows the catch CP of a mega the game master does not have yet, on a raid train alone', () => {
    const raidTrain = onRoute([4], 0, { boss: { name: 'Mega Chandelure' } });
    const facts = lines(raidTrain).join('\n');
    expect(facts).toMatch(/\*\*Catch CP\*\* \d+–\d+ · \d+–\d+/);
    expect(facts).not.toMatch(/Weaknesses/);
    const maxTrain = onRoute([4], 0, { kind: 'dynamax', boss: { name: 'Mega Chandelure' } });
    expect(lines(maxTrain).join('\n')).not.toMatch(/Catch CP/);
  });

  it('shows a max train’s boss with the catch CP of a max battle, never boosted (review BR-3)', () => {
    for (const kind of ['dynamax', 'gigantamax'] as const) {
      const train = onRoute([4], 0, { kind, boss: { key: 'machamp' } });
      const entry = catalogue.byKey('machamp');
      if (!entry) throw new Error('the catalogue has no Machamp');
      const cp = catalogue.maxCatchCp(entry);
      const heading = lines(train);
      expect(heading).toContain(`**Catch CP** ${cp.min}–${cp.max}`);
      expect(heading.join('\n')).not.toMatch(/Catch CP.* · /);
      expect(heading.some((line) => line.startsWith('**Weaknesses** '))).toBe(true);
    }
  });

  it('names a boss the game master does not know, without a block about it', () => {
    const train = onRoute([4], 0, { boss: { name: 'New*mon' } });
    expect(lines(train)[1]).toBe('**After New\\*mon**');
    expect(block(renderTrainPost(view(train)), '**Weaknesses**')).toBeUndefined();
    expect(renderTrainPost(view(train)).brief.lines[1]).toBe('**After New\\*mon**');
  });

  it('says what there is to say about the gym the train is at', () => {
    const noted = (id: number): PostGym | undefined => {
      const found = gym(id);
      return found && id === 4
        ? { ...found, confirmedEx: true, notice: 'Mind the *traffic*' }
        : found;
    };
    const about = (train: TrainParty, extra: Partial<TrainPostView> = {}) =>
      block(renderTrainPost(view(train, extra)), LOCATION);
    // As a raid's: the gym, its address and its map, then its notice; no elite mark.
    expect(about(onRoute([4, 11]), { stop: lookup(noted) })).toBe(
      `**Where · stop 1 of 2**\n**Veterans Memorial Bridge** · ${RIVER_ROAD} · [Map](<${maps(4)}>)\n` +
        'Mind the \\*traffic\\*',
    );
    // At the next stop it is that gym's address and notice.
    expect(about(onRoute([4, 11], 1), { stop: lookup(noted) })).toBe(
      `**Where · stop 2 of 2**\n**Riverside Park Gazebo** · ${RIVER_ROAD} · [Map](<${maps(11)}>)\n` +
        'Park closes at dusk',
    );
    // And no gym where the train is at none.
    expect(about(onRoute([4, 11], 2))).toBe('**Where**\nRoute complete');
    // A stop without a notice is named all the same.
    expect(about(onRoute([1]))).toBe(
      `**Where · stop 1 of 1**\n**The Stacks** · 12 Maple Avenue, Pinewood, Pennsylvania 15999 · [Map](<${maps(1)}>)`,
    );
  });

  it("shows the current stop's Wayfarer picture beside what there is to say about it", () => {
    const picture = (id: number) => `https://lh3.googleusercontent.com/gym-${id}`;
    const pictured = (id: number): PostGym | undefined => {
      const found = gym(id);
      return found && { ...found, imageUrl: picture(id) };
    };
    const post = (train: TrainParty) => renderTrainPost(view(train, { stop: lookup(pictured) }));
    const first = post(onRoute([4, 11]));
    expect(block(first, LOCATION)).toBe(
      `**Where · stop 1 of 2**\n**Veterans Memorial Bridge** · ${RIVER_ROAD} · [Map](<${maps(4)}>)`,
    );
    expect(thumbnailBeside(first.message, LOCATION)).toBe(`${picture(4)}=s400`);
    // Move… and Manage… are in the third row, after Group… (plans 8X-1B, 8X-G).
    expect(labelled(first.message)).toEqual(['Group…', 'Move…', 'Manage…']);
    const next = post(onRoute([4, 11], 1));
    expect(block(next, LOCATION)).toBe(
      `**Where · stop 2 of 2**\n**Riverside Park Gazebo** · ${RIVER_ROAD} · [Map](<${maps(11)}>)\n` +
        'Park closes at dusk',
    );
    // A stop without an address says so beside its picture.
    const lost = renderTrainPost(
      view(onRoute([4, 11]), {
        stop: lookup((id) => pictured(id) && { ...pictured(id)!, geodata: null }),
      }),
    );
    expect(block(lost, LOCATION)).toBe(
      `**Where · stop 1 of 2**\n**Veterans Memorial Bridge** · (no address available) · [Map](<${maps(4)}>)`,
    );
    expect(thumbnailBeside(next.message, LOCATION)).toBe(`${picture(11)}=s400`);
    // A finished route is at no gym: no picture.
    expect(thumbnailsOf(post(onRoute([4, 11], 2)).message)).toEqual([]);
    expectSendable(next);
  });

  it('lists the trainers by group, as a raid does, with the buttons of one group', () => {
    const train: TrainParty = {
      ...withAttendees(onRoute([4]), {
        [ALICE]: { status: PartyStatus.Present, group: 'B', number: 2 },
        [BOB]: { status: PartyStatus.Coming, group: 'B', remote: true },
      }),
      groups: [{ id: 'A' }, { id: 'B', label: 'by car' }],
      defaultGroupId: 'B',
    };
    const post = renderTrainPost(view(train));
    expect(block(post, '**Group A')).toBe(
      `**Group A** · 1 trainer\n🤔 Interested (1): <@${REPORTER}>`,
    );
    expect(block(post, '**Group B')).toBe(
      `**Group B: by car** · 3 trainers\n🏃 Coming (1): <@${BOB}> 🛰️\n✅ Here (2): <@${ALICE}> +1`,
    );
    expect(buttonNames(post.message)).toEqual([
      '🤔',
      '🏃',
      '✅',
      '👋',
      '⬇️',
      '⬆️',
      '📡',
      'Group…',
      'Move…',
      'Manage…',
      'Split…',
    ]);
  });

  it('shows a train that staff closed, or that was kept, as a meetup is shown', () => {
    const closed = renderTrainPost(
      view(endParty(onRoute([4])), { closed: 'Closed by a moderator.' }),
    );
    expect(textDisplays(closed.message)[0]?.split('\n')[1]).toBe('Closed by a moderator.');
    expect(accentOf(closed.message)).toBe(0xe74c3c);
    expect(closed.tags).toEqual(['Train', 'Ended']);
    const kept = { ...onRoute([4]), saved: true };
    expect(lines(kept)).toContain(KEPT_OPEN);
    expect(lines(kept, { closed: 'Closed.' })).not.toContain(KEPT_OPEN);
  });

  it('makes a name plain in the post and keeps it raw in the title of the post', () => {
    const post = renderTrainPost(view(testTrain({ name: '**Bold** train' })));
    expect(post.title).toBe('Train · **Bold** train');
    expect(textDisplays(post.message)[0]?.split('\n')[0]).toBe(
      '### Raid Train: \\*\\*Bold\\*\\* train',
    );
    expect(post.brief.lines[0]).toBe('**Raid Train: \\*\\*Bold\\*\\* train**');
  });

  it('makes no link of an address in the name in its brief, which other members are sent', () => {
    const post = renderTrainPost(view(testTrain({ name: 'Passes at https://evil.example/login' })));
    expect(post.brief.lines[0]).toContain('Passes at');
    expect(post.brief.lines[0]).not.toContain('https://');
    expect(post.brief.lines[0]).not.toContain('evil.example/');
  });

  it('stays a message Discord takes with the longest route and a crowd in five groups', () => {
    const long = (id: number): PostGym => ({
      name: `${'Long gym name '.repeat(6)}${id}`,
      nickname: null,
      lat: 40,
      lon: -80,
      notice: 'n'.repeat(2000),
      taggedEx: true,
      confirmedEx: false,
      imageUrl: `https://lh3.googleusercontent.com/${'p'.repeat(200)}`,
    });
    const crowd: Record<string, Partial<Attendee>> = {};
    for (let n = 0; n < 400; n++) {
      crowd[`4${String(n).padStart(17, '0')}`] = {
        group: (['A', 'B', 'C', 'D', 'E'] as const)[n % 5] ?? 'A',
        name: `A trainer with a long name ${n}`,
        status: [PartyStatus.Interested, PartyStatus.Coming, PartyStatus.Present][n % 3],
      };
    }
    const train: TrainParty = {
      ...withAttendees(
        onRoute(
          Array.from({ length: MAX_ROUTE_STOPS }, (_, index) => index + 1),
          30,
          { boss: { key: 'yveltal' }, conductorId: CAROL, ...everySplit('l') },
        ),
        crowd,
      ),
      groups: (['A', 'B', 'C', 'D', 'E'] as const).map((id) => ({
        id,
        label: 'l'.repeat(100),
        startTime: START,
      })),
    };
    const post = renderTrainPost(view(train, { stop: lookup(long) }));
    // Each group one text, the buttons in three rows (plan 8X-1B): within Discord's 40 with the
    // picture, Move…, Manage… and Split… (plan 8X-G: one more than Manage train… alone; before
    // 8X-1B, 44 unfolded and four groups folded to 40).
    expect(componentCount(post.message)).toBe(32);
    expect(layoutTextLength(post.layout)).toBeLessThanOrEqual(TEXT_BUDGET - LEAD_ROOM);
    expectSendable(post);
    expect(thumbnailBeside(post.message, '**Where')).toBe(
      `https://lh3.googleusercontent.com/${'p'.repeat(200)}=s400`,
    );
    expect(sectionsOf(post.message).filter(({ button }) => button !== undefined)).toEqual([]);
    // Split… is there too: five groups.
    expect(labelled(post.message)).toEqual(['Group…', 'Move…', 'Manage…', 'Split…', 'Route']);
    // Where it is and the next two stops, however long the route.
    expect(block(post, '**Where')).toMatch(/^\*\*Where · stop 31 of 50\*\*\n\*\*Long gym name /);
    expect(block(post, '-# Next')).toMatch(
      /^-# Next: 32\. Long gym name [^·]+ · 33\. Long gym name [^·]+, and 17 more to the end$/,
    );
    // With a lobby size (plan 8X-1; a Gigantamax train's will be 100) every group counts its
    // lobby and, over its size, says so in the place of the split-up note: it still fits.
    const sized = renderTrainPost(view(train, { stop: lookup(long), lobbySize: 4 }));
    expect(componentCount(sized.message)).toBeLessThanOrEqual(MAX_COMPONENTS);
    expect(layoutTextLength(sized.layout)).toBeLessThanOrEqual(TEXT_BUDGET - LEAD_ROOM);
    expectSendable(sized);
    const headings = textDisplays(sized.message)
      .filter((text) => text.startsWith('**Group'))
      .map((text) => text.split('\n')[0]);
    expect(headings).toHaveLength(5);
    for (const heading of headings) expect(heading).toMatch(/ · \d+\/4 coming · \d+ interested · /);
    expect(textOf(sized.message)).toContain(LOBBY_OVER);
    expect(textOf(sized.message)).not.toContain('so split up');
    expect(buttonLabels(sized.message)).toContain('Split…');
  });
});

describe('the longest train that can be', () => {
  it('cuts the line of a short route of the longest names alike, keeping the bold', () => {
    const heavy = (id: number): PostGym => ({
      name: `${'[*]'.repeat(84)}${id}`,
      nickname: null,
      lat: 40,
      lon: -80,
      notice: null,
      taggedEx: false,
      confirmedEx: false,
    });
    const post = renderTrainPost(
      view(onRoute([1, 2, 3], 1, { atEnd: 'loop' }), { stop: lookup(heavy) }),
    );
    expectSendable(post);
    const line = textDisplays(post.message).find((text) => text.startsWith('-# Route: ')) ?? '';
    expect(line.length).toBeLessThanOrEqual(600 + 3);
    expect(line).toMatch(/^-# Route: 1\. \S+… · \*\*2\. \S+…\*\* · 3\. \S+…, loops$/);
    // No backslash is left to escape what follows it.
    expect(line).not.toMatch(/(?<!\\)(?:\\\\)*\\(?:…| |$)/);
  });

  it('keeps within what Discord takes when every text needs escaping', () => {
    const heavy = (id: number): PostGym => ({
      name: `${'[*]'.repeat(84)}${id}`,
      nickname: null,
      lat: 40,
      lon: -80,
      notice: '<'.repeat(500),
      taggedEx: true,
      confirmedEx: false,
      imageUrl: `https://lh3.googleusercontent.com/${'p'.repeat(200)}`,
    });
    const crowd: Record<string, Partial<Attendee>> = {};
    for (let n = 0; n < 400; n++) {
      crowd[`4${String(n).padStart(17, '0')}`] = {
        group: (['A', 'B', 'C', 'D', 'E'] as const)[n % 5] ?? 'A',
        name: `${'_'.repeat(28)}${String(n).padStart(4, '0')}`,
        status: [PartyStatus.Interested, PartyStatus.Coming, PartyStatus.Present][n % 3],
      };
    }
    const train: TrainParty = {
      ...withAttendees(
        onRoute(
          Array.from({ length: MAX_ROUTE_STOPS }, (_, index) => index + 1),
          30,
          { boss: { key: 'yveltal' }, conductorId: CAROL, ...everySplit('*') },
        ),
        { ...crowd, [CAROL]: { name: '*'.repeat(32) } },
      ),
      timed: { name: '<'.repeat(80), startTime: START },
      groups: (['A', 'B', 'C', 'D', 'E'] as const).map((id) => ({
        id,
        label: '*'.repeat(100),
        startTime: START,
      })),
      saved: true,
    };
    const post = renderTrainPost(view(train, { stop: lookup(heavy) }));
    expectSendable(post);
    // The trainers are still named, cut down with a count.
    expect(textOf(post.message)).toMatch(/…and \d+ more/);
    // So are the trains split off it, and the one it was split off from.
    expect(textOf(post.message)).toMatch(/-# Group B \(\\\*.*\) went its own way: <#92/u);
    expect(textOf(post.message)).toContain('-# Split off from <#910000000000000001>');
    // With the longest words of a mode, at the last stop.
    for (const atEnd of ['loop', 'turn-back'] as const) {
      const last: TrainParty = {
        ...train,
        train: { ...train.train, stop: MAX_ROUTE_STOPS - 1, atEnd },
      };
      expectSendable(renderTrainPost(view(last, { stop: lookup(heavy) })));
    }
  });
});

describe('routeLines', () => {
  it('links every stop when asked to: with the address in brackets for a message', () => {
    const train = onRoute([4, 1], 1);
    expect(routeLines({ party: train, stop: lookup(gym) }, { links: true })).toEqual([
      `~~1\\. [Veterans Memorial Bridge](<${maps(4)}>)~~`,
      `**2\\. [The Stacks](<${maps(1)}>)** (the train is here)`,
    ]);
    expect(routeLines({ party: train, stop: lookup(gym) }, { links: true, bare: true })[0]).toBe(
      `~~1\\. [Veterans Memorial Bridge](${maps(4)})~~`,
    );
    expect(routeLines({ party: testTrain(), stop: lookup(gym) })).toEqual([]);
    // An elite raid gym is not marked: members are not told any more (Matt, 2026-10-17).
    const elite = (id: number): PostGym | undefined => {
      const found = gym(id);
      return found && { ...found, confirmedEx: id === 4, taggedEx: id === 4 };
    };
    expect(routeLines({ party: train, stop: lookup(elite) }, { links: true })[0]).toBe(
      `~~1\\. [Veterans Memorial Bridge](<${maps(4)}>)~~`,
    );
    expect(routeLines({ party: train, stop: lookup(elite) })[0]).toBe(
      '~~1\\. Veterans Memorial Bridge~~',
    );
  });

  it('makes a name plain, so that it cannot break the link it stands in', () => {
    const odd: PostGym = { ...(gym(4) as PostGym), name: 'A](http://x) *gym*', nickname: null };
    expect(stopLink({ kind: 'gym', gym: odd }, true)).toBe(
      `[A\\]\\(http://x) \\*gym\\*](${maps(4)})`,
    );
    // A bracket is escaped unless it is already: an even run of backslashes before it escapes
    // only itself.
    const slashed = (name: string) =>
      stopLink({ kind: 'gym', gym: { ...odd, name } }, true).slice(1, -`](${maps(4)})`.length);
    expect(slashed('Mural ] end')).toBe('Mural \\] end');
    expect(slashed('Mural [x] end')).toBe('Mural \\[x\\] end');
    for (const name of ['Mural \\] end', 'Mural \\\\] end', 'a \\\\\\] b']) {
      // Whatever `plain` made of the backslashes, the bracket never ends the text of the link.
      expect(slashed(name)).toMatch(/^(?:[^\\\]]|\\.)*$/);
    }
  });
});

describe('the controls of a train post', () => {
  const controls = (party: TrainParty) =>
    buttonsOf(renderTrainPost(view(party)).message).map((button) => [
      button.label ?? button.emoji,
      decodeCustomId(button.customId ?? '')?.action,
    ]);
  /** A button of the post by its action. */
  const buttonOf = (party: TrainParty, action: string) =>
    buttonsOf(renderTrainPost(view(party)).message).find(
      (button) => decodeCustomId(button.customId ?? '')?.action === action,
    );

  it('are the rows of a raid without Done and Meet…, with a grey "Manage…" after Group…', () => {
    // Plan 8X-1B: the same places in raids and trains (Matt, 2026-10-20).
    const train = testTrain();
    expect(controls(train)).toEqual([
      ['🤔', 'maybe'],
      ['🏃', 'join'],
      ['✅', 'here'],
      ['👋', 'leave'],
      ['⬇️', 'less'],
      ['⬆️', 'more'],
      ['📡', 'remote'],
      ['Group…', 'regroup'],
      // No Move… without a route (plan 8X-G).
      ['Manage…', 'manage'],
    ]);
    const move = buttonOf(train, 'manage');
    // Secondary: grey.
    expect(move?.style).toBe(2);
    expect(decodeCustomId(move?.customId ?? '')).toEqual({
      kind: 'party',
      id: train.id,
      action: 'manage',
      args: [],
    });
  });

  it('are the same with several groups: no group has a Join of its own', () => {
    const train: TrainParty = {
      ...withAttendees(testTrain(), { [ALICE]: { group: 'B' } }),
      groups: [{ id: 'A' }, { id: 'B' }],
    };
    expect(controls(train).map(([, action]) => action)).toEqual([
      'maybe',
      'join',
      'here',
      'leave',
      'less',
      'more',
      'remote',
      'regroup',
      'manage',
      'split',
    ]);
  });

  it('have a grey "Split…" after Manage… only with two groups of somebody', () => {
    const two: TrainParty = {
      ...withAttendees(onRoute(SEVEN, 2), { [ALICE]: { group: 'B' } }),
      groups: [{ id: 'A' }, { id: 'B' }],
    };
    expect(controls(two).slice(-5)).toEqual([
      ['Group…', 'regroup'],
      ['Move…', 'move'],
      ['Manage…', 'manage'],
      ['Split…', 'split'],
      ['Route', 'route'],
    ]);
    const split = buttonOf(two, 'split');
    expect(split?.style).toBe(2);
    // Words only on a train's third row (Matt, 2026-10-22).
    expect(split?.emoji).toBeUndefined();
    expect(decodeCustomId(split?.customId ?? '')).toEqual({
      kind: 'party',
      id: two.id,
      action: 'split',
      args: [],
    });
    expect(controls(onRoute(SEVEN, 2)).map(([, action]) => action)).not.toContain('split');
    // Two groups, but one of them empty: there is nothing to split from (Matt, 2026-10-17).
    const lone: TrainParty = { ...onRoute(SEVEN, 2), groups: [{ id: 'A' }, { id: 'B' }] };
    expect(controls(lone).map(([, action]) => action)).not.toContain('split');
    const whole: TrainParty = {
      ...withAttendees(onRoute(SEVEN, 2), { [ALICE]: { group: 'B' } }),
      attendees: { [ALICE]: { number: 1, status: PartyStatus.Coming, group: 'B', remote: false } },
      groups: [{ id: 'A' }, { id: 'B' }],
    };
    expect(controls(whole).map(([, action]) => action)).not.toContain('split');
    // Not on a copy in another region, as Move… and Manage…; the copy keeps Group… and Route.
    const copy = renderMirror('region', renderTrainPost(view(two)), {
      postId: '900000000000000001',
      regionChannelId: '100000000000000001',
    });
    expect(buttonsOf(copy).map((button) => button.label)).not.toContain('Split…');
    expect(buttonsOf(copy).map((button) => button.label)).toContain('Route');
    expect(buttonsOf(copy).map((button) => button.label)).toContain('Group…');
  });

  it('are the same wherever the train is and whoever leads it, Move… while it has a route', () => {
    const base = controls(onRoute([4, 1]));
    expect(controls(onRoute([4, 1], 2, { conductorId: ALICE }))).toEqual(base);
    // Without a route there is nothing to move along (plan 8X-G).
    expect(controls(testTrain())).toEqual(base.filter(([, action]) => action !== 'move'));
  });
});

describe('whereText', () => {
  it('says the last stop, a finished route and a train without a route, in the answer to a command', () => {
    expect(whereText({ party: onRoute([4, 1], 1), stop: lookup(gym) }, 'command')).toBe(
      `The train is at stop 2 of 2: [The Stacks](<${maps(1)}>). ` +
        'It is the last stop: Next finishes the route.',
    );
    expect(
      whereText({ party: onRoute([4, 1], 1, { atEnd: 'loop' }), stop: lookup(gym) }, 'command'),
    ).toBe(
      `The train is at stop 2 of 2: [The Stacks](<${maps(1)}>). ` +
        `Next goes round to [Veterans Memorial Bridge](<${maps(4)}>).`,
    );
    expect(
      whereText(
        { party: onRoute([4, 1, 7], 2, { atEnd: 'turn-back' }), stop: lookup(gym) },
        'command',
      ),
    ).toBe(
      `The train is at stop 3 of 3: [Harbor Lighthouse Mural](<${maps(7)}>). ` +
        `Next turns back to [The Stacks](<${maps(1)}>).`,
    );
    // A finished route says where Previous leads: to its last stop, or to the stop it was
    // finished from.
    expect(whereText({ party: onRoute([4, 1], 2), stop: lookup(gym) }, 'command')).toBe(
      'The train has finished its route of 2 stops. ' +
        `\`/previous\` takes it back to stop 2: [The Stacks](<${maps(1)}>).`,
    );
    expect(
      whereText(
        { party: onRoute([4, 1, 7], 3, { finishedFrom: 4 }), stop: lookup(gym) },
        'command',
      ),
    ).toBe(
      'The train has finished its route of 3 stops. ' +
        `\`/previous\` takes it back to stop 1: [Veterans Memorial Bridge](<${maps(4)}>).`,
    );
    expect(whereText({ party: testTrain(), stop: lookup(gym) }, 'command')).toBe(
      'This train has no route yet. Add its stops with `/route add`.',
    );
  });

  it('names what takes a finished route back where the member is: Move… on the post and the map', () => {
    const finished = { party: onRoute([4, 1], 2), stop: lookup(gym) };
    expect(whereText(finished, 'post')).toBe(
      'The train has finished its route of 2 stops. ' +
        `Move… takes it back to stop 2: [The Stacks](<${maps(1)}>).`,
    );
  });
});

describe('movementText', () => {
  it('says where the train is going, with the link to the place, and who moved it', () => {
    expect(movementText({ kind: 'to', at: shown(1), by: { id: ALICE } })).toBe(
      `The train is moving to [The Stacks](<${maps(1)}>). Moved by <@${ALICE}>.`,
    );
    expect(movementText({ kind: 'back', at: shown(4), by: { id: ALICE } })).toBe(
      `The train is moving back to [Veterans Memorial Bridge](<${maps(4)}>). Moved by <@${ALICE}>.`,
    );
    expect(movementText({ kind: 'skip', at: shown(7), skipped: shown(1), by: { id: BOB } })).toBe(
      `The train is moving to [Harbor Lighthouse Mural](<${maps(7)}>), skipping **The Stacks**. ` +
        `Moved by <@${BOB}>.`,
    );
    expect(movementText({ kind: 'finished', by: { id: BOB } })).toBe(
      `The train has finished its route. Moved by <@${BOB}>.`,
    );
    expect(movementText({ kind: 'to', at: shown(999), by: { id: BOB } })).toBe(
      `The train is moving to Unknown gym. Moved by <@${BOB}>.`,
    );
  });

  it('ends its sentence once after a place whose name ends in a period (plan 8X-F)', () => {
    const one = gym(1);
    if (!one) throw new Error('no gym 1');
    const inc = {
      kind: 'gym' as const,
      gym: { ...one, nickname: null, name: 'Fire Company Inc.' },
    };
    expect(movementText({ kind: 'back', at: inc, by: { id: ALICE } })).toBe(
      `The train is moving back to [Fire Company Inc.](<${maps(1)}>) Moved by <@${ALICE}>.`,
    );
  });
});

describe('the roles of a train post’s blocks (plan 8M-8A)', () => {
  it('marks its heading, Where with what lies ahead, trainers and small print', () => {
    const party = withAttendees(onRoute([1, 2, 3, 4, 5], 1), { [ALICE]: { name: 'Alice' } });
    const post = renderTrainPost(view(party));
    expect(roleLines(post.layout)).toEqual([
      ['head', expect.stringMatching(/^### Raid Train: /u)],
      ['where', '**Where · stop 2 of 5**'],
      ['where', expect.stringMatching(/^-# Next: 3\. /u)],
      ['trainers', '2 trainers'],
      ['note', expect.stringMatching(/^-# Created by /u)],
    ]);
    expect(postMessage(post.layout)).toEqual(postMessage(withoutRoles(post.layout)));
  });
});
