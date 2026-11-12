import { metresBetween } from '@pine/wayspot-core/distance';
import { distanceWords } from '../../render/distance-words.js';
import { gymStop, spotStop, type StopRef } from '../../domain/party/stops.js';
import type { WayspotRow } from '../../domain/wayspots/kept.js';
import type { TrainKind } from '../../domain/party/party.js';
import type { WayspotDirectory } from '../../services/wayspot-directory.js';
import { keptRow } from '../../../test/support/wayspot-cases.js';
import { wayspotsWith } from '../../../test/support/wayspots.js';
import { ComponentType, MessageFlags } from 'discord.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fakeAutocomplete,
  fakeButton,
  fakeChatInput,
  sent,
  type FakeInteraction,
} from '../../../test/support/fake-interactions.js';
import { testGyms, WEST_CHANNEL, WEST_FORUM } from '../../../test/support/gyms.js';
import {
  ALICE,
  BOB,
  CAROL,
  PARTY_NOW,
  REPORTER,
  stops,
  gym,
  inGyms,
} from '../../../test/support/parties.js';
import { createdMeetup, createdTrain } from '../../../test/support/party-service.js';
import { createTestContext } from '../../../test/support/test-context.js';
import { MAX_SAVED_ROUTES } from '../../db/repositories/saved-route-repository.js';
import { partyButtons } from '../../components/party.js';
import { InteractionRouter, STALE_COMPONENT } from '../../discord/router.js';
import { MAX_ROUTE_STOPS } from '../../domain/party/party.js';
import { PartyStatus } from '../../domain/party/status.js';
import { currentStop } from '../../domain/party/train.js';
import type { PostGym } from '../../render/raid-post.js';
import { LIMITS } from '../../render/text.js';
import { TrainService } from '../../services/train-service.js';
import { route } from './route.js';
import { textOf } from '../../../test/support/messages.js';
import { changeServers } from '../../../test/support/server-values.js';

const maps = (id: number): string => {
  const gym = testGyms().find((found) => found.id === id);
  return `https://www.google.com/maps/search/?api=1&query=${gym?.lat}%2C${gym?.lon}`;
};
const WEST = 1;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: PARTY_NOW });
});
afterEach(() => {
  vi.useRealTimers();
});

type Options = Record<string, string | number | boolean>;

/**
 * A train on a route of three gyms unless `stops` says otherwise, with Alice coming; of the kind
 * `more` says, over the kept Wayspots it gives (none without).
 */
async function setup(
  stops: readonly (number | StopRef)[] = [4, 1, 7],
  more: { kind?: TrainKind; wayspots?: WayspotDirectory } = {},
) {
  const { wayspots } = more;
  const made = await createdTrain(
    { route: stops, ...(more.kind === undefined ? {} : { kind: more.kind }) },
    wayspots === undefined ? {} : { wayspots },
  );
  await made.attendance.signUp(made.party.id, { id: ALICE, name: 'Alice' }, PartyStatus.Coming);
  await made.attendance.flush();
  for (const message of made.gateway.messagesIn(made.postId)) {
    await made.gateway.deleteMessage(made.postId, message.id);
  }
  const { ctx } = createTestContext({
    partyService: made.service,
    attendance: made.attendance,
    timedParties: made.timed,
    trains: made.trains,
    parties: made.store,
    regions: made.regions,
    ...(wayspots === undefined ? {} : { wayspots }),
  });
  await ctx.placeFinder.built();
  const router = new InteractionRouter(ctx, [route], [partyButtons]);
  const inPost = { channelId: made.postId, thread: { parentId: WEST_FORUM } };
  /** `/route <subcommand>` in the post of the train, by Alice unless `extra` says otherwise. */
  const run = async (subcommand: string, options: Options = {}, extra: object = {}) => {
    const used = fakeChatInput({
      commandName: 'route',
      subcommand,
      ...inPost,
      userId: ALICE,
      displayName: 'Alice',
      options,
      ...extra,
    });
    await router.handle(used as never);
    return used;
  };
  /**
   * What the member was told: the answer itself, or for a subcommand that was acknowledged
   * first (save, load, forget) what took the place of the acknowledgement, or the refusal that
   * followed it.
   */
  const answer = async (subcommand: string, options?: Options, extra?: object) => {
    const used = await run(subcommand, options, extra);
    const told = [used.reply, used.editReply, used.followUp].find(
      (mock) => mock.mock.calls.length > 0,
    );
    if (!told) throw new Error(`/route ${subcommand} was not answered`);
    return sent(told).content;
  };
  /** The choices a list offers for what was typed into an option. */
  const choices = async (
    subcommand: string,
    focusedName: string,
    focused = '',
    extra: object = {},
  ): Promise<{ name: string; value: string | number }[]> => {
    const typing: FakeInteraction = fakeAutocomplete({
      commandName: 'route',
      subcommand,
      ...inPost,
      userId: ALICE,
      focused,
      focusedName,
      ...extra,
    });
    await router.handle(typing as never);
    return (typing.respond.mock.calls[0]?.[0] ?? []) as { name: string; value: string | number }[];
  };
  /** Everything said in the post, line by line, once all of it has gone out. */
  const lines = async (): Promise<string[]> => {
    await made.attendance.flush();
    await made.service.flush();
    return made.said().join('\n').split('\n').filter(Boolean);
  };
  const routeNow = () => made.current().train.route;
  /** A press on "Whole route" of the train's post, by Alice unless `extra` says otherwise. */
  const wholeRoute = async (extra: object = {}) => {
    const pressed = fakeButton({
      customId: `party:${made.party.id}:route`,
      ...inPost,
      userId: ALICE,
      displayName: 'Alice',
      messageRows: [{ type: ComponentType.Container, components: [] }],
      ...extra,
    });
    await router.handle(pressed as never);
    return pressed;
  };
  return {
    ...made,
    partyLines: made.lines,
    ctx,
    run,
    answer,
    choices,
    lines,
    routeNow,
    inPost,
    wholeRoute,
  };
}

describe('/route show', () => {
  it('shows the whole route privately, each stop a link, without remembering anything', async () => {
    const made = await setup();
    await made.trains.move(made.party.id, { id: ALICE }, 'next', false);
    const used = await made.run('show');
    expect(used.reply).toHaveBeenCalledWith({
      content: [
        '**The route of Saturday legendaries**',
        `~~1\\. [Veterans Memorial Bridge](<${maps(4)}>)~~`,
        `**2\\. [The Stacks](<${maps(1)}>)** (the train is here)`,
        `3\\. [Harbor Lighthouse Mural](<${maps(7)}>)`,
        'At the end it finishes the route.',
      ].join('\n'),
      flags: MessageFlags.Ephemeral,
    });
    expect(used.followUp).not.toHaveBeenCalled();
    // Nothing is put into the post, and the train is as it was.
    await made.trains.flush();
    expect((await made.lines()).filter((line) => /route/i.test(line))).toEqual([]);
    // (The route has a stop in East, whose channel has a copy of the train: nothing else.)
    expect(made.current().mirrorMessages.map((mirror) => mirror.kind)).toEqual(['region']);
  });

  it('says nothing of the mode for a route of one stop: it finishes there in every mode', async () => {
    const made = await setup([4]);
    await made.setAtEnd({ id: ALICE }, false, 'loop');
    expect(await made.answer('show')).toBe(
      [
        '**The route of Saturday legendaries**',
        `**1\\. [Veterans Memorial Bridge](<${maps(4)}>)** (the train is here)`,
      ].join('\n'),
    );
  });

  it('is for anybody in the post, and says so when there is no route', async () => {
    const made = await setup();
    expect(await made.answer('show', {}, { userId: CAROL })).toMatch(/^\*\*The route of/);
    const empty = await setup([]);
    expect(await empty.answer('show')).toBe(
      'This train has no route yet. Add its stops with `/route add`.',
    );
  });

  it('shows the longest route whole, in as many messages as it takes', async () => {
    // Twelve gyms exist: the same links again and again are as long as fifty stops would be.
    const made = await setup();
    const { train } = made.current();
    const long = Array.from({ length: MAX_ROUTE_STOPS }, (_, index) => gymStop(1000 + index));
    await made.store.update(made.party.id, (party) => ({
      party: party.type === 'train' ? { ...party, train: { ...train, route: long } } : party,
    }));
    const gyms = {
      ...made.ctx.gyms,
      get: (id: number) => ({
        ...testGyms()[0],
        id,
        name: `Gym with a long name ${id}`,
        nickname: null,
      }),
    };
    const { ctx } = createTestContext({
      trains: made.trains,
      attendance: made.attendance,
      parties: made.store,
      regions: made.regions,
      gyms: gyms as never,
    });
    const used = fakeChatInput({ commandName: 'route', subcommand: 'show', ...made.inPost });
    await new InteractionRouter(ctx, [route], []).handle(used as never);
    const texts = [
      sent(used.reply).content ?? '',
      ...used.followUp.mock.calls.map(([payload]) => payload.content ?? ''),
    ];
    expect(texts.length).toBeGreaterThan(1);
    for (const text of texts) expect(text.length).toBeLessThanOrEqual(LIMITS.content);
    for (const [payload] of used.followUp.mock.calls) {
      expect(payload.flags).toBe(MessageFlags.Ephemeral);
    }
    const stops = texts.join('\n').split('\n').slice(1, -1);
    expect(stops).toHaveLength(MAX_ROUTE_STOPS);
    expect(texts.at(-1)?.split('\n').at(-1)).toBe('At the end it finishes the route.');
    expect(stops[0]).toMatch(/^\*\*1\\\. \[Gym with a long name 1000\]/);
    expect(stops.at(-1)).toMatch(/^50\\\. \[Gym with a long name 1049\]/);
  });
});

describe('the button "Whole route" of a train post', () => {
  it('answers privately with what /route show answers, and changes nothing', async () => {
    const made = await setup([4, 1, 7, 2]);
    await made.trains.move(made.party.id, { id: ALICE }, 'next', false);
    const shown = sent((await made.run('show')).reply);
    const pressed = await made.wholeRoute();
    expect(pressed.reply).toHaveBeenCalledWith(shown);
    expect(shown).toEqual({
      content: [
        '**The route of Saturday legendaries**',
        `~~1\\. [Veterans Memorial Bridge](<${maps(4)}>)~~`,
        `**2\\. [The Stacks](<${maps(1)}>)** (the train is here)`,
        `3\\. [Harbor Lighthouse Mural](<${maps(7)}>)`,
        `4\\. [Old Stone Fountain](<${maps(2)}>)`,
        'At the end it finishes the route.',
      ].join('\n'),
      flags: MessageFlags.Ephemeral,
    });
    await made.trains.flush();
    expect((await made.lines()).filter((line) => /route/i.test(line))).toEqual([]);
    expect(made.current().train).toMatchObject({ route: stops(4, 1, 7, 2), stop: 1 });
  });

  it('answers anybody, signed up or not, also on a copy in another channel', async () => {
    const made = await setup([4, 1, 7, 2]);
    const stranger = await made.wholeRoute({ userId: CAROL, channelId: '600000000000000099' });
    expect(sent(stranger.reply).content).toMatch(/^\*\*The route of Saturday legendaries\*\*\n/);
    expect(sent(stranger.reply).flags).toBe(MessageFlags.Ephemeral);
  });

  it('says when the route was emptied since, when the train is over, and refuses another party', async () => {
    const made = await setup([4, 1, 7, 2]);
    await made.trains.clearRoute(made.party.id, { id: ALICE }, true);
    expect(sent((await made.wholeRoute()).reply).content).toBe(
      'This train has no route yet. Add its stops with `/route add`.',
    );
    await made.service.end(made.party.id);
    expect(sent((await made.wholeRoute()).reply).content).toBe('This train is over.');
    const meetup = await createdMeetup();
    const { ctx } = createTestContext({
      partyService: meetup.service,
      attendance: meetup.attendance,
      parties: meetup.store,
      regions: meetup.regions,
    });
    const pressed = fakeButton({
      customId: `party:${meetup.party.id}:route`,
      channelId: meetup.postId,
      userId: REPORTER,
      messageRows: [{ type: ComponentType.Container, components: [] }],
    });
    await new InteractionRouter(ctx, [route], [partyButtons]).handle(pressed as never);
    expect(sent(pressed.reply).content).toBe(STALE_COMPONENT);
  });
});

describe('/route add', () => {
  it('adds a gym the member picked or named, and says which stop it is', async () => {
    const made = await setup();
    expect(await made.answer('add', { stop: 'gym:2' })).toBe(
      '**Old Stone Fountain** is stop 4 of the route.',
    );
    expect(await made.answer('add', { stop: 'gazebo' })).toBe(
      '**Riverside Park Gazebo** is stop 5 of the route.',
    );
    expect(inGyms(made.routeNow())).toEqual(inGyms([4, 1, 7, 2, 11]));
    expect(inGyms(currentStop(made.current()))).toBe(4);
    expect(await made.lines()).toEqual([
      `**Alice** (<@${ALICE}>) added stop 4 to the route: **Old Stone Fountain**.`,
      `**Alice** (<@${ALICE}>) added stop 5 to the route: **Riverside Park Gazebo**.`,
    ]);
    const message = made.gateway.posts.get(made.postId)?.message;
    expect(textOf(message)).toContain('**Where · stop 1 of 5**');
  });

  it('takes a gym of another region without asking, and the post stays where it is', async () => {
    const made = await setup();
    // Gym 8 lies in East.
    expect(await made.answer('add', { stop: 'gym:8' })).toBe(
      '**Café Élan Fresco** is stop 4 of the route.',
    );
    expect(made.current()).toMatchObject({ regionId: WEST, forumChannelId: WEST_FORUM });
    // The search goes on to the other regions when the train's own has nothing.
    expect(await made.answer('add', { stop: 'starbucks harbor' })).toBe(
      '**Starbucks** is stop 5 of the route.',
    );
    expect(inGyms(made.routeNow().slice(-2))).toEqual(inGyms([8, 9]));
  });

  it('says that the train is there when the stop is the first, or follows a finished route', async () => {
    const empty = await setup([]);
    expect(await empty.answer('add', { stop: 'gym:4' })).toBe(
      '**Veterans Memorial Bridge** is stop 1 of the route. The train is there now.',
    );
    const made = await setup([4]);
    await made.trains.move(made.party.id, { id: ALICE }, 'finish', false);
    expect(await made.answer('add', { stop: 'gym:1' })).toBe(
      '**The Stacks** is stop 2 of the route. The train is there now.',
    );
  });

  it('refuses a gym that is on the route, a member who is not signed up, and a full route', async () => {
    const made = await setup();
    expect(await made.answer('add', { stop: 'gym:1' })).toBe('That stop is on the route already.');
    expect(await made.answer('add', { stop: 'gym:2' }, { userId: CAROL })).toBe(
      'You are not signed up for this train.',
    );
    expect(inGyms(made.routeNow())).toEqual(inGyms([4, 1, 7]));
    const full = Array.from({ length: MAX_ROUTE_STOPS }, (_, index) => gymStop(1000 + index));
    await made.store.update(made.party.id, (party) => ({
      party: party.type === 'train' ? { ...party, train: { ...party.train, route: full } } : party,
    }));
    expect(await made.answer('add', { stop: 'gym:2' })).toBe('A route has at most 50 stops.');
  });

  it('acts only on a clear hit, and says what it found otherwise', async () => {
    const made = await setup();
    expect(await made.answer('add', { stop: 'zzzz' })).toBe(
      'I found no gym or Power Spot for "zzzz". Type part of its name and pick it from the list.',
    );
    expect(await made.answer('add', { stop: 'gym:999' })).toMatch(
      /^I found no gym or Power Spot for/,
    );
    expect(await made.answer('add', { stop: 'pinewood' })).toMatch(
      /^Several places fit "pinewood" /,
    );
    expect(inGyms(made.routeNow())).toEqual(inGyms([4, 1, 7]));
  });

  it('offers the gyms nearest the last stop first, without those on the route (Matt, 2026-10-27)', async () => {
    const made = await setup();
    const offered = await made.choices('add', 'stop');
    // From gym 7, the last stop, of every region of the server; gym 10 lies in none.
    expect(offered.map((choice) => choice.value)).toEqual(
      [6, 12, 9, 8, 2, 3, 5, 11].map((id) => `gym:${id}`),
    );
    const mosaic = testGyms().find((one) => one.id === 6)!;
    const lighthouse = testGyms().find((one) => one.id === 7)!;
    expect(offered[0]?.name).toBe(
      `Maple Leaf Mosaic (gym) · Birch Street · ${distanceWords(metresBetween(mosaic, lighthouse), 'metric')}`,
    );
    // In the settings' units: feet or miles where they are imperial.
    changeServers(made.ctx, { distanceUnits: 'imperial' });
    const imperial = await made.choices('add', 'stop');
    expect(imperial[0]?.name).toBe(
      `Maple Leaf Mosaic (gym) · Birch Street · ${distanceWords(metresBetween(mosaic, lighthouse), 'imperial')}`,
    );
    expect(imperial[0]?.name).toMatch(/ (ft|mi)$/u);
    // An empty route: the region's gyms by name, as before.
    const empty = await setup([]);
    expect((await empty.choices('add', 'stop')).map((choice) => choice.value)).toContain('gym:1');
    // What is typed finds the gyms and power spots of every region of the server, each by its
    // kind and where it is (plan 8X-4: as a `near` option offers them).
    const far = await made.choices('add', 'stop', 'fresco');
    expect(far).toEqual([{ name: 'Café Élan Fresco (gym) · Harbor Street', value: 'gym:8' }]);
  });
});

describe('/route add stop: a gym or a Power Spot (plan 8X-4; design 6.2)', () => {
  /** A power spot in West, one titled as gym 2 is (Old Stone Fountain), one in the north. */
  const GAZEBO = keptRow(901, {
    kind: 'powerspot',
    title: 'Gazebo of the Lake',
    lat: 40.05,
    lon: -80.05,
    address: '1 Lake Road, Pittsburgh, PA 15213, USA',
  });
  const FOUNTAIN = keptRow(902, {
    kind: 'powerspot',
    title: 'Old Stone Fountain',
    lat: 40.06,
    lon: -80.06,
  });
  const NORTH = keptRow(903, {
    kind: 'powerspot',
    title: 'Gazebo of the Hill',
    lat: 40.25,
    lon: -80.05,
  });

  async function withSpots(
    kind?: TrainKind,
    more: readonly WayspotRow[] = [],
    stops: readonly (number | StopRef)[] = [4, 1, 7],
  ) {
    const { wayspots } = await wayspotsWith([GAZEBO, FOUNTAIN, NORTH, ...more]);
    const made = await setup(stops, { wayspots, ...(kind === undefined ? {} : { kind }) });
    return { ...made, directory: wayspots };
  }

  it('adds a Power Spot picked from the list or named, named so in the answer and the post', async () => {
    const made = await withSpots();
    expect(await made.answer('add', { stop: `powerspot:${GAZEBO.id}` })).toBe(
      '**Gazebo of the Lake** (Power Spot) is stop 4 of the route.',
    );
    expect(made.routeNow().at(-1)).toEqual(spotStop(GAZEBO.id));
    expect(await made.lines()).toEqual([
      `**Alice** (<@${ALICE}>) added stop 4 to the route: **Gazebo of the Lake** (Power Spot).`,
    ]);
    // One typed beyond doubt is taken as it is.
    await made.trains.removeStop(made.party.id, { id: ALICE }, 4);
    expect(await made.answer('add', { stop: 'gazebo of the lake' })).toBe(
      '**Gazebo of the Lake** (Power Spot) is stop 4 of the route.',
    );
    expect(await made.answer('add', { stop: `powerspot:${GAZEBO.id}` })).toBe(
      'That stop is on the route already.',
    );
  });

  it("takes the train's kind of stop when a gym and a Power Spot are both typed beyond doubt", async () => {
    const raid = await withSpots();
    expect(await raid.answer('add', { stop: 'old stone fountain' })).toBe(
      '**Old Stone Fountain** is stop 4 of the route.',
    );
    expect(raid.routeNow().at(-1)).toEqual(gymStop(2));
    const max = await withSpots('dynamax');
    expect(await max.answer('add', { stop: 'old stone fountain' })).toBe(
      '**Old Stone Fountain** (Power Spot) is stop 4 of the route.',
    );
    expect(max.routeNow().at(-1)).toEqual(spotStop(FOUNTAIN.id));
  });

  it("lets the train's own kind decide first: its stop beyond doubt is taken, its several are several", async () => {
    // A second power spot with "fountain" in West; one with "pinewood", as two gyms are called.
    const steps = keptRow(905, {
      kind: 'powerspot',
      title: 'Fountain Steps',
      lat: 40.055,
      lon: -80.055,
    });
    const pavilion = keptRow(906, {
      kind: 'powerspot',
      title: 'Pinewood Pavilion',
      lat: 40.04,
      lon: -80.07,
    });
    const raid = await withSpots('raid', [steps, pavilion]);
    // The gym is clear, the power spots are not: a raid train takes the gym, as before 8X-4.
    expect(await raid.answer('add', { stop: 'fountain' })).toBe(
      '**Old Stone Fountain** is stop 4 of the route.',
    );
    // The gyms are several: a raid train asks, whatever power spot is clear.
    expect(await raid.answer('add', { stop: 'pinewood' })).toMatch(
      /^Several places fit "pinewood" \(/,
    );
    expect(raid.routeNow().at(-1)).toEqual(gymStop(2));
    const max = await withSpots('gigantamax', [steps, pavilion]);
    // The power spots are several: a max train asks, though the gym is clear.
    expect(await max.answer('add', { stop: 'fountain' })).toMatch(
      /^Several places fit "fountain" \(/,
    );
    // The power spot is clear: a max train takes it, though the gyms are several.
    expect(await max.answer('add', { stop: 'pinewood' })).toBe(
      '**Pinewood Pavilion** (Power Spot) is stop 4 of the route.',
    );
    expect(max.routeNow().at(-1)).toEqual(spotStop(pavilion.id));
  });

  it('takes the gym of a raid train though two Power Spots fit every word typed', async () => {
    // As at Riverview Park: the gym's name typed, and two power spots of the park.
    const gates = [907, 908].map((n, index) =>
      keptRow(n, {
        kind: 'powerspot',
        title: `Riverside Park ${index === 0 ? 'North' : 'South'} Gate`,
        lat: 40.09,
        lon: -80.09 + index / 1000,
      }),
    );
    const raid = await withSpots('raid', gates);
    expect(await raid.answer('add', { stop: 'riverside park' })).toBe(
      '**Riverside Park Gazebo** is stop 4 of the route.',
    );
    const max = await withSpots('dynamax', gates);
    expect(await max.answer('add', { stop: 'riverside park' })).toMatch(
      /^Several places fit "riverside park" \(/,
    );
  });

  it("takes the better fit of a gym and a Power Spot both beyond doubt, the train's kind on a tie", async () => {
    // Gym 7 is Harbor Lighthouse Mural, on the route already. The gym's whole name typed, a
    // power spot with more words: the gym, also on a max train.
    const steps = keptRow(909, {
      kind: 'powerspot',
      title: 'Harbor Lighthouse Mural Steps',
      lat: 40.05,
      lon: -79.995,
    });
    const max = await withSpots('dynamax', [steps]);
    expect(await max.answer('add', { stop: 'harbor lighthouse mural' })).toBe(
      'That stop is on the route already.',
    );
    // A power spot's whole name typed, the gym with more words: the spot, also on a raid train.
    const lighthouse = keptRow(910, {
      kind: 'powerspot',
      title: 'Harbor Lighthouse',
      lat: 40.05,
      lon: -79.995,
    });
    const raid = await withSpots('raid', [lighthouse]);
    expect(await raid.answer('add', { stop: 'harbor lighthouse' })).toBe(
      '**Harbor Lighthouse** (Power Spot) is stop 4 of the route.',
    );
  });

  it("takes the other kind's stop that fits better than several of the train's own (staging of 8X)", async () => {
    // As at "Allegheny Station" (2026-10-22): the gym's whole name typed on a max train, two
    // power spots with every word and more. The gym fits better: it is taken.
    const county = keptRow(912, {
      kind: 'powerspot',
      title: 'Maple Leaf County Mosaic Hall',
      lat: 40.031,
      lon: -80.031,
    });
    const company = keptRow(913, {
      kind: 'powerspot',
      title: 'West Maple #3 Leaf Company - Mosaic Station 295',
      lat: 40.032,
      lon: -80.032,
    });
    const max = await withSpots('dynamax', [county, company]);
    expect(await max.answer('add', { stop: 'Maple Leaf Mosaic' })).toBe(
      '**Maple Leaf Mosaic** is stop 4 of the route.',
    );
    expect(max.routeNow().at(-1)).toEqual(gymStop(6));
    // A part of the name, which fits the gym no better than the spots: several, as before.
    expect(await max.answer('add', { stop: 'leaf mosaic' })).toMatch(
      /^Several places fit "leaf mosaic" \(/,
    );
  });

  it('takes a Power Spot that fits better than several gyms of a raid train', async () => {
    // Two gyms have "pinewood" among more words; a power spot is called just that.
    const pinewood = keptRow(914, {
      kind: 'powerspot',
      title: 'Pinewood',
      lat: 40.045,
      lon: -80.045,
    });
    const raid = await withSpots('raid', [pinewood]);
    expect(await raid.answer('add', { stop: 'pinewood' })).toBe(
      '**Pinewood** (Power Spot) is stop 4 of the route.',
    );
    expect(raid.routeNow().at(-1)).toEqual(spotStop(pinewood.id));
  });

  // Review r0, F-A2: several gyms that have every word as typed fit as well as a word's fit,
  // as one gym beyond doubt does: a power spot of a word's fit is no better.
  it('counts several gyms with every word as fitting a word, not worse than a Power Spot', async () => {
    const steps = keptRow(915, {
      kind: 'powerspot',
      title: 'Pine Steps',
      lat: 40.045,
      lon: -80.045,
    });
    const raid = await withSpots('raid', [steps]);
    // "pine" begins the first word of both Pinewood gyms.
    expect(await raid.answer('add', { stop: 'pine' })).toMatch(/^Several places fit "pine" \(/);
    expect(inGyms(raid.routeNow())).toEqual([4, 1, 7]);
  });

  it('counts a gym beyond doubt as fitting every word, not worse than a Power Spot beyond doubt', async () => {
    // Gym 7 is Harbor Lighthouse Mural, on the route already: beyond doubt for "harbor light",
    // which begins its words; the spot has the typed words whole. A tie: the raid train's gym.
    const lights = keptRow(911, {
      kind: 'powerspot',
      title: 'Harbor Light Steps',
      lat: 40.05,
      lon: -79.995,
    });
    const raid = await withSpots('raid', [lights]);
    expect(await raid.answer('add', { stop: 'harbor light' })).toBe(
      'That stop is on the route already.',
    );
  });

  it('answers a gym typed beyond doubt that lies in no region of the server as no stop found', async () => {
    const made = await withSpots();
    // Gym 10 lies in no region.
    expect(await made.answer('add', { stop: 'lakeview trailhead' })).toBe(
      'I found no gym or Power Spot for "lakeview trailhead". Type part of its name and pick ' +
        'it from the list.',
    );
  });

  it("offers a max train the region's Power Spots ahead of its gyms before anything is typed", async () => {
    // On an empty route (a route with a stop lists the places nearest its last stop).
    const raid = await (await withSpots(undefined, [], [])).choices('add', 'stop');
    expect(
      raid.map((choice) => choice.value).every((value) => String(value).startsWith('gym:')),
    ).toBe(true);
    const max = await (await withSpots('dynamax', [], [])).choices('add', 'stop');
    // West's power spots by name (not the north's, of another server), then its gyms.
    expect(max.slice(0, 2)).toEqual([
      { name: 'Gazebo of the Lake (Power Spot)', value: `powerspot:${GAZEBO.id}` },
      { name: 'Old Stone Fountain (Power Spot)', value: `powerspot:${FOUNTAIN.id}` },
    ]);
    expect(String(max[2]?.value)).toMatch(/^gym:/);
    expect(max[2]?.name).toMatch(/ \(gym\)$/);
  });

  it('offers gyms and Power Spots nearest the last stop by distance alone, whatever the train (Matt, 2026-10-27)', async () => {
    const raid = await (await withSpots()).choices('add', 'stop');
    const max = await (await withSpots('dynamax')).choices('add', 'stop');
    // From gym 7: the Gazebo between gyms 9 and 8; not the north's Power Spot, of another server.
    expect(raid.slice(0, 5).map((choice) => choice.value)).toEqual([
      'gym:6',
      'gym:12',
      'gym:9',
      `powerspot:${GAZEBO.id}`,
      'gym:8',
    ]);
    expect(raid.map((choice) => choice.value)).not.toContain(`powerspot:${NORTH.id}`);
    expect(max).toEqual(raid);
    // A Power Spot on the route is left out too.
    const onRoute = await (
      await withSpots('dynamax', [], [4, 1, 7, spotStop(GAZEBO.id)])
    ).choices('add', 'stop');
    expect(onRoute.map((choice) => choice.value)).not.toContain(`powerspot:${GAZEBO.id}`);
  });

  it('measures from the stop before a last stop gone from the server’s places (Matt, 2026-10-27)', async () => {
    const values = async (made: Awaited<ReturnType<typeof withSpots>>) =>
      (await made.choices('add', 'stop')).map((choice) => choice.value);
    const fromSeven = await values(await withSpots(undefined, [], [4, 1, 7]));
    // The Fountain, the last stop, is forgotten (it became a gym, say): gym 7 is the anchor.
    const gone = await withSpots(undefined, [], [4, 1, 7, spotStop(FOUNTAIN.id)]);
    gone.directory.forget([FOUNTAIN.id]);
    expect(await values(gone)).toEqual(
      fromSeven.filter((value) => value !== `powerspot:${FOUNTAIN.id}`),
    );
    expect((await gone.choices('add', 'stop'))[0]?.name).toMatch(/^Maple Leaf Mosaic \(gym\) · /u);
    // While it is kept, the list is measured from it.
    const kept = await values(await withSpots(undefined, [], [4, 1, 7, spotStop(FOUNTAIN.id)]));
    expect(kept).not.toEqual(await values(gone));
  });

  it('offers the nearer of places that fit alike first, near the last stop (Matt, 2026-10-27)', async () => {
    const MILL_POND = keptRow(904, {
      kind: 'powerspot',
      title: 'Mill Pond',
      lat: 40.051,
      lon: -80.011,
    });
    const MILL_CREEK = keptRow(905, {
      kind: 'powerspot',
      title: 'Mill Creek',
      lat: 40.09,
      lon: -80.08,
    });
    const titles = async (stops: readonly number[]) =>
      (
        await (
          await withSpots(undefined, [MILL_POND, MILL_CREEK], stops)
        ).choices('add', 'stop', 'mill')
      ).map((choice) => choice.name.split(' (')[0]);
    expect(await titles([4, 1, 7])).toEqual(['Mill Pond', 'Mill Creek']);
    expect(await titles([11])).toEqual(['Mill Creek', 'Mill Pond']);
  });

  it('offers gyms and Power Spots, each by its kind, ordered as the train goes (Matt, 2026-10-20)', async () => {
    const names = async (kind?: TrainKind) =>
      (await (await withSpots(kind)).choices('add', 'stop', 'old stone fountain')).map(
        (choice) => choice.name,
      );
    // As good a match either way: a raid train offers the gym first, a max train the spot.
    const raid = await names();
    expect(raid[0]).toMatch(/^Old Stone Fountain \(gym\)/);
    expect(raid[1]).toMatch(/^Old Stone Fountain \(Power Spot\)/);
    const max = await names('dynamax');
    expect(max[0]).toMatch(/^Old Stone Fountain \(Power Spot\)/);
    expect(max[1]).toMatch(/^Old Stone Fountain \(gym\)/);
    // A better match comes first whatever its kind: a gym's whole name on a max train.
    const better = await (
      await withSpots('gigantamax')
    ).choices('add', 'stop', 'riverside park gazebo');
    expect(better[0]?.name).toMatch(/^Riverside Park Gazebo \(gym\)/);
  });

  it('refuses a Power Spot of no region of this server, as a name that finds nothing', async () => {
    const made = await withSpots();
    expect(await made.answer('add', { stop: `powerspot:${NORTH.id}` })).toBe(
      `I found no gym or Power Spot for "powerspot:${NORTH.id}". Type part of its name and ` +
        'pick it from the list.',
    );
    expect(inGyms(made.routeNow())).toEqual([4, 1, 7]);
  });

  it('saves a route with its Power Spots, and loads it back without one that is gone', async () => {
    const made = await withSpots();
    await made.answer('add', { stop: `powerspot:${GAZEBO.id}` });
    await made.answer('add', { stop: `powerspot:${FOUNTAIN.id}` });
    expect(await made.answer('save', { name: 'Lake loop' })).toMatch(
      /^I saved this route as \*\*Lake loop\*\*: 5 stops\./,
    );
    expect(made.routes.rows[0]?.stops).toEqual([
      ...stops(4, 1, 7),
      spotStop(GAZEBO.id),
      spotStop(FOUNTAIN.id),
    ]);
    // The fountain is no power spot any more (an import made it a PokéStop): it is left out.
    made.directory.forget([FOUNTAIN.id]);
    await made.trains.clearRoute(made.party.id, { id: ALICE }, true);
    const id = made.routes.rows[0]?.id ?? 0;
    expect(await made.answer('load', { route: `id:${id}` })).toMatch(
      /4 stops\. It is at the first\..*One stop of it no longer exists and was left out\.$/,
    );
    expect(made.routeNow()).toEqual([...stops(4, 1, 7), spotStop(GAZEBO.id)]);
  });

  it('shows a train at a Power Spot as at a gym: its Where, its picture, the route', async () => {
    const made = await withSpots();
    await made.answer('add', { stop: `powerspot:${GAZEBO.id}` });
    await made.trains.move(made.party.id, { id: ALICE }, 'skip', false);
    await made.trains.move(made.party.id, { id: ALICE }, 'next', false);
    await made.service.flush();
    const message = made.gateway.posts.get(made.postId)?.message;
    expect(textOf(message)).toContain(
      '**Where · stop 4 of 4**\n**Gazebo of the Lake** (Power Spot) · 1 Lake Road',
    );
    const shown = await made.run('show');
    expect(sent(shown.reply).content).toContain(
      '**4\\. [Gazebo of the Lake](<https://www.google.com/maps/search/?api=1&query=40.05%2C-80.05>) (Power Spot)** (the train is here)',
    );
  });
});

describe('how fast a route can be changed', () => {
  // Matt, 2026-10-30: on the map stops go on as fast as they are tapped, and ten a minute ran out.
  it('lets a member change the stops once a second, and holds back one who goes on', async () => {
    const made = await setup();
    let answer: string | undefined;
    for (let use = 0; use < 60; use++) answer = await made.answer('remove', { stop: 99 });
    expect(answer).toBe('The route has no stop with that number.');
    expect(await made.answer('remove', { stop: 99 })).toBe(
      'You can use /route remove again in 1 minute.',
    );
  });
});

describe('/route remove and /route move', () => {
  it('remove takes a stop off by its number, and the train stays at its gym', async () => {
    const made = await setup();
    await made.trains.move(made.party.id, { id: ALICE }, 'next', false);
    expect(await made.answer('remove', { stop: 1 })).toBe(
      '**Veterans Memorial Bridge** is off the route, which has 2 stops now.',
    );
    expect(made.current().train).toMatchObject({ route: stops(1, 7), stop: 0 });
    expect(inGyms(currentStop(made.current()))).toBe(1);
    expect(await made.answer('remove', { stop: 3 })).toBe(
      'The route has no stop with that number.',
    );
    expect(await made.answer('remove', { stop: 1 }, { userId: CAROL })).toBe(
      'You are not signed up for this train.',
    );
    expect(await made.answer('remove', { stop: 2 })).toBe(
      '**Harbor Lighthouse Mural** is off the route, which has 1 stop now.',
    );
  });

  it('move puts a stop at the number it is to have, also at the end', async () => {
    const made = await setup();
    expect(await made.answer('move', { from: 1, to: 3 })).toBe(
      '**Veterans Memorial Bridge** is stop 3 of the route now, the last. ' +
        'The train is still at it, now stop 3.',
    );
    // The train was at the bridge, and still is.
    expect(made.current().train).toMatchObject({ route: stops(1, 7, 4), stop: 2 });
    expect(await made.answer('move', { from: 3, to: 3 })).toBe(
      '**Veterans Memorial Bridge** is stop 3 of the route already.',
    );
    expect(await made.answer('move', { from: 2, to: 4 })).toBe(
      'The route has no stop with that number.',
    );
    expect(await made.lines()).toEqual([
      `**Alice** (<@${ALICE}>) moved **Veterans Memorial Bridge** to stop 3 of the route.`,
    ]);
  });

  // Matt, 2026-10-24: at stop 2 he moved stop 4 to 2 and thought the train would go to it; it
  // stays where it is, and the answer says so, and where the moved stop now stands.
  it('says where a moved stop stands and that the train stays where it is', async () => {
    const made = await setup();
    await made.trains.move(made.party.id, { id: ALICE }, 'next', false);
    expect(await made.answer('move', { from: 3, to: 2 })).toBe(
      '**Harbor Lighthouse Mural** is stop 2 of the route now, before **The Stacks**. ' +
        'The train is still at **The Stacks**, now stop 3.',
    );
    expect(made.current().train).toMatchObject({ route: stops(4, 7, 1), stop: 2 });
  });

  it('says in the choices of to where the stop of from would stand, before or after', async () => {
    const made = await setup();
    expect(await made.choices('move', 'to', '', { options: { from: 3 } })).toEqual([
      { name: '1. before Veterans Memorial Bridge', value: 1 },
      { name: '2. before The Stacks', value: 2 },
      { name: '3. Harbor Lighthouse Mural (where it is)', value: 3 },
    ]);
    expect(await made.choices('move', 'to', '', { options: { from: 1 } })).toEqual([
      { name: '1. Veterans Memorial Bridge (where it is)', value: 1 },
      { name: '2. after The Stacks', value: 2 },
      { name: '3. after Harbor Lighthouse Mural', value: 3 },
    ]);
  });

  it('lists the route for both, as numbers with names, narrowed by a number or by words', async () => {
    const made = await setup();
    const all = [
      { name: '1. Veterans Memorial Bridge', value: 1 },
      { name: '2. The Stacks', value: 2 },
      { name: '3. Harbor Lighthouse Mural', value: 3 },
    ];
    expect(await made.choices('remove', 'stop')).toEqual(all);
    expect(await made.choices('move', 'from')).toEqual(all);
    expect(await made.choices('move', 'to')).toEqual(all);
    expect(await made.choices('remove', 'stop', '2')).toEqual([all[1]]);
    expect(await made.choices('remove', 'stop', 'light mural')).toEqual([all[2]]);
    expect(await made.choices('remove', 'stop', 'zzz')).toEqual([]);
    expect(await made.choices('remove', 'stop', '9')).toEqual([]);
  });

  it('lists at most twenty-five stops, and finds those further on by their number', async () => {
    const made = await setup();
    const long = Array.from({ length: 30 }, (_, index) => gymStop((index % 12) + 1 + index * 100));
    await made.store.update(made.party.id, (party) => ({
      party: party.type === 'train' ? { ...party, train: { ...party.train, route: long } } : party,
    }));
    expect(await made.choices('remove', 'stop')).toHaveLength(25);
    const twos = await made.choices('remove', 'stop', '2');
    // The stop with that very number first, then those that begin with it.
    expect(twos.map((choice) => choice.value)).toEqual([2, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29]);
    expect((await made.choices('remove', 'stop', '30')).map((choice) => choice.value)).toEqual([
      30,
    ]);
  });
});

describe('/route clear', () => {
  it('is for the conductor, and for admins, moderators and bot developers', async () => {
    const made = await setup();
    expect(await made.answer('clear')).toBe(
      'Only the conductor of this train and the moderators can do that.',
    );
    expect(inGyms(made.routeNow())).toEqual(inGyms([4, 1, 7]));
    expect(await made.answer('clear', {}, { roleNames: ['Bot Developer'] })).toBe(
      'The route of this train is cleared.',
    );
    expect(made.current().train).toMatchObject({ route: [], stop: 0 });
    expect(await made.answer('clear', {}, { roleNames: ['Moderator'] })).toBe(
      'This train had no route.',
    );
    const led = await setup();
    await led.trains.move(led.party.id, { id: ALICE }, 'next', false);
    await led.trains.setConductor(led.party.id, { id: ALICE });
    expect(await led.answer('clear')).toBe('The route of this train is cleared.');
    // The train is at the start again: the first stop that is added is where it is.
    expect(await led.answer('add', { stop: 'gym:2' })).toBe(
      '**Old Stone Fountain** is stop 1 of the route. The train is there now.',
    );
    expect((await led.lines()).filter((line) => /cleared/.test(line))).toEqual([
      `**Alice** (<@${ALICE}>) cleared the route.`,
    ]);
  });
});

describe('/route save, load and forget', () => {
  it('save keeps the route for the member and the region, and says how to use it', async () => {
    const made = await setup();
    expect(await made.answer('save', { name: '  Downtown   loop ' })).toBe(
      'I saved this route as **Downtown loop**: 3 stops. At the end it finishes the route. `/route load` puts it into a train of ' +
        'this region.',
    );
    expect(made.routes.rows).toMatchObject([
      { memberId: ALICE, regionId: WEST, name: 'Downtown loop', stops: stops(4, 1, 7) },
    ]);
    await made.trains.addStop(made.party.id, { id: ALICE }, gym(2));
    expect(await made.answer('save', { name: 'downtown loop' })).toBe(
      'I replaced your saved route **downtown loop** with this one: 4 stops. At the end it finishes the route.',
    );
    expect(made.routes.rows).toHaveLength(1);
    // Saving says nothing in the post.
    expect((await made.lines()).filter((line) => /saved/i.test(line))).toEqual([]);
  });

  it('save refuses a train without a route, a text that is no name, and a twenty-sixth route', async () => {
    const empty = await setup([]);
    expect(await empty.answer('save', { name: 'Loop' })).toBe(
      'This train has no route to save yet.',
    );
    const made = await setup();
    expect(await made.answer('save', { name: '   ' })).toBe('Give a name of 1 to 80 characters.');
    for (let n = 0; n < MAX_SAVED_ROUTES; n++) made.routes.add(ALICE, WEST, `Route ${n}`, [1]);
    expect(await made.answer('save', { name: 'One more' })).toBe(
      'You have 25 saved routes for this region, which is as many as you can keep. Remove one ' +
        'with `/route forget` first, or save under the name of one to replace it.',
    );
    expect(await made.answer('save', { name: 'Route 3' })).toMatch(/^I replaced your saved route/);
  });

  it('load lists the member’s routes of this region, and puts one into the train', async () => {
    const made = await setup();
    await made.trains.move(made.party.id, { id: ALICE }, 'next', false);
    const river = made.routes.add(ALICE, WEST, 'River walk', [2, 3, 11]);
    const downtown = made.routes.add(ALICE, WEST, 'Downtown loop', [4]);
    made.routes.add(ALICE, 2, 'Of East', [8]);
    made.routes.add(BOB, WEST, 'Bob’s', [5]);
    expect(await made.choices('load', 'route')).toEqual([
      { name: 'Downtown loop (1 stop)', value: `id:${downtown.id}` },
      { name: 'River walk (3 stops)', value: `id:${river.id}` },
    ]);
    expect(await made.choices('load', 'route', 'riv')).toEqual([
      { name: 'River walk (3 stops)', value: `id:${river.id}` },
    ]);
    expect(await made.answer('load', { route: `id:${river.id}` })).toBe(
      'This train has the route **River walk** now: 3 stops. It is at the first. At the end it finishes the route.',
    );
    expect(made.current().train).toMatchObject({ route: stops(2, 3, 11), stop: 0 });
    // Typed by its name works too; the same route again changes nothing.
    expect(await made.answer('load', { route: 'river WALK' })).toBe(
      'This train has that route already, and is at its first stop. At the end it finishes the route.',
    );
    expect((await made.lines()).at(-1)).toBe(
      `**Alice** (<@${ALICE}>) loaded the route **River walk**: 3 stops. The train is at the first.`,
    );
  });

  it('save keeps the mode of the train, load sets it, and the list says it', async () => {
    const made = await setup();
    await made.setAtEnd({ id: ALICE }, false, 'turn-back');
    expect(await made.answer('save', { name: 'Both ways' })).toBe(
      'I saved this route as **Both ways**: 3 stops. At the end it turns back and runs the ' +
        'route backwards. `/route load` puts it into a train of this region.',
    );
    expect(made.routes.rows).toMatchObject([{ name: 'Both ways', atEnd: 'turn-back' }]);
    const loop = made.routes.add(ALICE, WEST, 'Round', [2, 3], 'loop');
    expect(await made.choices('load', 'route')).toEqual([
      { name: 'Both ways (3 stops, turns back)', value: `id:${made.routes.rows[0]?.id}` },
      { name: 'Round (2 stops, loops)', value: `id:${loop.id}` },
    ]);
    expect(await made.answer('load', { route: `id:${loop.id}` })).toBe(
      'This train has the route **Round** now: 2 stops. It is at the first. At the end it ' +
        'loops back to the first stop.',
    );
    expect(made.current().train).toMatchObject({ route: stops(2, 3), stop: 0, atEnd: 'loop' });
    expect((await made.answer('show')) ?? '').toMatch(
      /\nAt the end it loops back to the first stop\.$/,
    );
  });

  it('load leaves out gyms that no longer exist and says how many', async () => {
    const made = await setup();
    const one = made.routes.add(ALICE, WEST, 'Old round', [2, 998, 3]);
    const two = made.routes.add(ALICE, WEST, 'Older round', [998, 2, 999]);
    const none = made.routes.add(ALICE, WEST, 'All gone', [998, 999]);
    expect(await made.answer('load', { route: `id:${one.id}` })).toBe(
      'This train has the route **Old round** now: 2 stops. It is at the first. At the end it finishes the route. ' +
        'One stop of it no longer exists and was left out.',
    );
    expect(await made.answer('load', { route: `id:${two.id}` })).toBe(
      'This train has the route **Older round** now: 1 stop. It is at the first. At the end it finishes the route. ' +
        '2 stops of it no longer exist and were left out.',
    );
    expect(await made.answer('load', { route: `id:${none.id}` })).toBe(
      'None of the stops of that route exists any more.',
    );
    expect(inGyms(made.routeNow())).toEqual(inGyms([2]));
  });

  it('load takes only a route of the member’s own for this region, and a member who is signed up', async () => {
    const made = await setup();
    const none = 'You have no such saved route for this region. Pick one from the list.';
    const east = made.routes.add(ALICE, 2, 'Of East', [8]);
    const bobs = made.routes.add(BOB, WEST, 'Bob’s', [5]);
    const carols = made.routes.add(CAROL, WEST, 'Hers', [5]);
    expect(await made.answer('load', { route: `id:${east.id}` })).toBe(none);
    expect(await made.answer('load', { route: `id:${bobs.id}` })).toBe(none);
    expect(await made.answer('load', { route: 'Bob’s' })).toBe(none);
    expect(await made.answer('load', { route: 'id:99999' })).toBe(none);
    expect(await made.answer('load', { route: `id:${carols.id}` }, { userId: CAROL })).toBe(
      'You are not signed up for this train.',
    );
    expect(inGyms(made.routeNow())).toEqual(inGyms([4, 1, 7]));
  });

  it('forget deletes one of the member’s saved routes, and no train is changed', async () => {
    const made = await setup();
    const river = made.routes.add(ALICE, WEST, 'River *walk*', [2, 3]);
    const bobs = made.routes.add(BOB, WEST, 'Bob’s', [5]);
    expect(await made.choices('forget', 'route')).toEqual([
      { name: 'River *walk* (2 stops)', value: `id:${river.id}` },
    ]);
    expect(await made.answer('forget', { route: `id:${bobs.id}` })).toBe(
      'You have no such saved route for this region. Pick one from the list.',
    );
    expect(await made.answer('forget', { route: `id:${river.id}` })).toBe(
      'I forgot your saved route **River \\*walk\\***.',
    );
    expect(inGyms(made.routes.rows.map((row) => row.memberId))).toEqual(inGyms([BOB]));
    expect(inGyms(made.routeNow())).toEqual(inGyms([4, 1, 7]));
    expect(await made.choices('forget', 'route')).toEqual([]);
  });
});

describe('/route anywhere else', () => {
  it('works only in the post of a train', async () => {
    const made = await setup();
    const elsewhere = { channelId: '600000000000000009', thread: undefined };
    expect(await made.answer('show', {}, elsewhere)).toBe(
      'Use this in the post of a train that is still active.',
    );
    expect(await made.choices('remove', 'stop', '', elsewhere)).toEqual([]);
    expect(await made.choices('load', 'route', '', elsewhere)).toEqual([]);
    const meetup = await createdMeetup();
    const { ctx } = createTestContext({
      partyService: meetup.service,
      attendance: meetup.attendance,
      trains: meetup.trains,
      parties: meetup.store,
      regions: meetup.regions,
    });
    const router = new InteractionRouter(ctx, [route], []);
    for (const [subcommand, options] of [
      ['show', {}],
      ['add', { stop: 'gym:1' }],
      ['remove', { stop: 1 }],
      ['move', { from: 1, to: 2 }],
      ['clear', {}],
      ['save', { name: 'Loop' }],
      ['load', { route: 'id:1' }],
      ['forget', { route: 'id:1' }],
    ] as const) {
      const used = fakeChatInput({
        commandName: 'route',
        subcommand,
        options,
        channelId: meetup.postId,
        thread: { parentId: WEST_FORUM },
        userId: REPORTER,
      });
      await router.handle(used as never);
      expect(sent(used.reply).content).toBe(
        'This is the post of a meetup: that only works in the post of a train.',
      );
    }
  });
});

describe('/route: what was found in review', () => {
  it('never takes a name for the id of a row: a choice of the list says that it is one', async () => {
    const made = await setup();
    const downtown = made.routes.add(ALICE, WEST, 'Downtown', [2, 3]);
    const one = made.routes.add(ALICE, WEST, '1', [5]);
    const year = made.routes.add(ALICE, WEST, '2026', [6, 11]);
    expect(downtown.id).toBe(1);
    expect(await made.choices('forget', 'route')).toEqual([
      { name: '1 (1 stop)', value: `id:${one.id}` },
      { name: '2026 (2 stops)', value: `id:${year.id}` },
      { name: 'Downtown (2 stops)', value: `id:${downtown.id}` },
    ]);
    // Typed, `1` is the route of that name, not the row with that id.
    expect(await made.answer('forget', { route: '1' })).toBe('I forgot your saved route **1**.');
    expect(made.routes.rows.map((row) => row.name)).toEqual(['Downtown', '2026']);
    expect(await made.answer('load', { route: '2026' })).toBe(
      'This train has the route **2026** now: 2 stops. It is at the first. At the end it finishes the route.',
    );
    expect(await made.answer('load', { route: String(downtown.id) })).toBe(
      'You have no such saved route for this region. Pick one from the list.',
    );
    expect(await made.answer('load', { route: `id:${downtown.id}` })).toBe(
      'This train has the route **Downtown** now: 2 stops. It is at the first. At the end it finishes the route.',
    );
    expect(await made.answer('load', { route: 'id:x' })).toBe(
      'You have no such saved route for this region. Pick one from the list.',
    );
  });

  it('takes the right to move the train for an edit that changes where it is', async () => {
    const made = await setup();
    await made.attendance.signUp(made.party.id, { id: BOB, name: 'Bob' }, PartyStatus.Coming);
    await made.trains.setConductor(made.party.id, { id: BOB });
    const conductorOnly = 'This train has a conductor: only they and the moderators can move it.';
    // The train is at the first stop: Alice may not remove that one, but any other.
    expect(await made.answer('remove', { stop: 1 })).toBe(conductorOnly);
    expect(await made.answer('remove', { stop: 3 })).toBe(
      '**Harbor Lighthouse Mural** is off the route, which has 2 stops now.',
    );
    expect(await made.answer('add', { stop: 'gym:2' })).toBe(
      '**Old Stone Fountain** is stop 3 of the route.',
    );
    const saved = made.routes.add(ALICE, WEST, 'Mine', [3, 5]);
    expect(await made.answer('load', { route: `id:${saved.id}` })).toBe(conductorOnly);
    expect(made.current().train).toMatchObject({ route: stops(4, 1, 2), stop: 0 });
    // A moderator may, and the conductor.
    expect(await made.answer('remove', { stop: 1 }, { roleNames: ['Moderator'] })).toBe(
      '**Veterans Memorial Bridge** is off the route, which has 2 stops now. ' +
        'The train is at **The Stacks** now.',
    );
    await made.trains.move(made.party.id, { id: BOB }, 'finish', false);
    expect(await made.answer('add', { stop: 'gym:6' })).toBe(conductorOnly);
    expect(await made.answer('add', { stop: 'gym:6' }, { userId: BOB })).toBe(
      '**Maple Leaf Mosaic** is stop 3 of the route. The train is there now.',
    );
    expect(await made.answer('load', { route: `id:${saved.id}` }, { roleNames: ['Admin'] })).toBe(
      'This train has the route **Mine** now: 2 stops. It is at the first. At the end it finishes the route.',
    );
  });

  it('says where the train is when the stop it was at is removed', async () => {
    const made = await setup();
    await made.trains.move(made.party.id, { id: ALICE }, 'skip', false);
    expect(await made.answer('remove', { stop: 3 })).toBe(
      '**Harbor Lighthouse Mural** is off the route, which has 2 stops now. ' +
        'The train has finished its route.',
    );
  });

  it('puts "…" after the gyms that fit only when it left some out', async () => {
    const made = await setup();
    // Three gyms fit "maple", by their name or their street; "pinewood" is in the name of two and the address of all.
    expect(await made.answer('add', { stop: 'maple' })).toBe(
      'Several places fit "maple" (Maple Leaf Mosaic, Pinewood Public Library, Starbucks). Pick one from the list.',
    );
    expect(await made.answer('add', { stop: 'pinewood' })).toMatch(
      /^Several places fit "pinewood" \([^,]+, [^,]+, [^,…]+…\)\. Pick one from the list\.$/,
    );
  });

  it('names a saved route of the legacy bot that has no name in a sentence', async () => {
    const made = await setup();
    const odd = made.routes.add(ALICE, WEST, '', [2]);
    expect(await made.answer('load', { route: `id:${odd.id}` })).toBe(
      'This train has a saved route without a name as its route now: 1 stop. It is at the first. At the end it finishes the route.',
    );
    expect(await made.answer('forget', { route: `id:${odd.id}` })).toBe(
      'I forgot your saved route without a name.',
    );
  });

  it('says how many stops of a saved route did not fit into a route', async () => {
    const made = await setup();
    // Every gym exists for this service: the invented town has twelve.
    const trains = new TrainService({
      store: made.store,
      gateway: made.gateway,
      posts: made.service,
      splits: made.service,
      lines: made.partyLines,
      users: made.users,
      gyms: {
        get: (id) => ({ ...testGyms()[0], id, name: `Gym ${id}` }) as PostGym,
        regionsOf: () => [WEST_CHANNEL],
      },
      regions: made.regions,
      routes: made.routes,
      log: made.log,
      announceDelayMs: 3_600_000,
    });
    const { ctx } = createTestContext({
      trains,
      attendance: made.attendance,
      parties: made.store,
      regions: made.regions,
    });
    const saved = made.routes.add(ALICE, WEST, 'Marathon', [
      ...Array.from({ length: 52 }, (_, index) => 100 + index),
    ]);
    const used = fakeChatInput({
      commandName: 'route',
      subcommand: 'load',
      options: { route: `id:${saved.id}` },
      userId: ALICE,
      ...made.inPost,
    });
    await new InteractionRouter(ctx, [route], []).handle(used as never);
    expect(sent(used.editReply).content).toBe(
      'This train has the route **Marathon** now: 50 stops. It is at the first. At the end it finishes the route. ' +
        '2 more stops did not fit: a route has at most 50.',
    );
  });
});

describe('/route: what the second review found', () => {
  it('lets anybody who is signed up add the first stop, also to a train with a conductor', async () => {
    const made = await setup([]);
    await made.attendance.signUp(made.party.id, { id: BOB, name: 'Bob' }, PartyStatus.Coming);
    await made.trains.setConductor(made.party.id, { id: BOB });
    expect(await made.answer('add', { stop: 'gym:4' })).toBe(
      '**Veterans Memorial Bridge** is stop 1 of the route. The train is there now.',
    );
    await made.trains.flush();
    // A line, and nothing that announces a movement.
    expect((await made.lines()).filter((line) => /moving/.test(line))).toEqual([]);
    for (const message of made.gateway.messagesIn(made.postId)) {
      expect(message.message.mention).toBeUndefined();
    }
  });

  it('lets a moderator who is not signed up add, remove and move stops', async () => {
    const made = await setup();
    const moderator = { userId: CAROL, roleNames: ['Moderator'] };
    expect(await made.answer('add', { stop: 'gym:2' }, { userId: CAROL })).toBe(
      'You are not signed up for this train.',
    );
    expect(await made.answer('add', { stop: 'gym:2' }, moderator)).toBe(
      '**Old Stone Fountain** is stop 4 of the route.',
    );
    expect(await made.answer('move', { from: 4, to: 2 }, moderator)).toBe(
      '**Old Stone Fountain** is stop 2 of the route now, before **The Stacks**.',
    );
    expect(await made.answer('remove', { stop: 2 }, moderator)).toBe(
      '**Old Stone Fountain** is off the route, which has 3 stops now.',
    );
    expect(inGyms(made.routeNow())).toEqual(inGyms([4, 1, 7]));
  });

  it('refuses to save a route under a name that reads like a choice of the list', async () => {
    const made = await setup();
    for (const name of ['id:7', 'ID:12']) {
      expect(await made.answer('save', { name })).toBe(
        'A saved route cannot be called `id:` and a number: that is how the list of saved ' +
          'routes names its choices. Give it another name.',
      );
    }
    expect(made.routes.rows).toEqual([]);
  });
});

describe('/route: what the review of the whole plan found', () => {
  it('add refuses a gym that lies in no region of the server, as a name that finds nothing', async () => {
    const made = await setup();
    // Gym 10 exists and lies in no region: the list never offers it, but its choice can be typed.
    expect(made.ctx.gyms.get(10)?.name).toBe('Lakeview Trailhead');
    expect(await made.answer('add', { stop: 'gym:10' })).toBe(
      'I found no gym or Power Spot for "gym:10". Type part of its name and pick it from the list.',
    );
    expect(inGyms(made.routeNow())).toEqual(inGyms([4, 1, 7]));
    expect(await made.lines()).toEqual([]);
  });

  it('load leaves out a saved gym that lies in no region of the server, as one that is gone', async () => {
    const made = await setup();
    const saved = made.routes.add(ALICE, WEST, 'Up the hill', [2, 10, 3]);
    expect(await made.answer('load', { route: `id:${saved.id}` })).toBe(
      'This train has the route **Up the hill** now: 2 stops. It is at the first. At the end it finishes the route. ' +
        'One stop of it no longer exists and was left out.',
    );
    expect(inGyms(made.routeNow())).toEqual(inGyms([2, 3]));
  });

  it('takes for a choice of the list only what the list gives: `id:north` is a name', async () => {
    const made = await setup();
    // The legacy bot let a route be called so; a new one may be too (only `id:` and digits may not).
    expect(await made.answer('save', { name: 'id:north' })).toBe(
      'I saved this route as **id:north**: 3 stops. At the end it finishes the route. `/route load` puts it into a train of ' +
        'this region.',
    );
    await made.trains.removeStop(made.party.id, { id: ALICE }, 3);
    expect(await made.answer('load', { route: 'ID:North' })).toBe(
      'This train has the route **id:north** now: 3 stops. It is at the first. At the end it finishes the route.',
    );
    expect(await made.answer('forget', { route: 'id:north' })).toBe(
      'I forgot your saved route **id:north**.',
    );
    expect(made.routes.rows).toEqual([]);
    // An id of more digits than a row can have is no route.
    expect(await made.answer('forget', { route: 'id:12345678901' })).toBe(
      'You have no such saved route for this region. Pick one from the list.',
    );
  });

  it('says of a saved route without any gym that it has no stops', async () => {
    const made = await setup();
    // A row of the legacy bot may be so.
    const empty = made.routes.add(ALICE, WEST, 'Nothing yet', []);
    const gone = made.routes.add(ALICE, WEST, 'All gone', [998]);
    expect(await made.answer('load', { route: `id:${empty.id}` })).toBe(
      'That saved route has no stops.',
    );
    expect(await made.answer('load', { route: `id:${gone.id}` })).toBe(
      'None of the stops of that route exists any more.',
    );
    // Who may not load a route is told that, whatever the route holds.
    made.routes.add(CAROL, WEST, 'Hers', []);
    expect(await made.answer('load', { route: 'Hers' }, { userId: CAROL })).toBe(
      'You are not signed up for this train.',
    );
    expect(inGyms(made.routeNow())).toEqual(inGyms([4, 1, 7]));
  });

  it('does not say in the help of remove and move that everybody must be signed up', () => {
    for (const name of ['add', 'remove', 'move']) {
      expect(route.subcommands.get(name)?.help?.details).toContain(
        'You must be signed up (moderators need not be).',
      );
    }
  });

  it('acknowledges save, load and forget before the database is asked, for the member alone', async () => {
    const made = await setup();
    const saved = made.routes.add(ALICE, WEST, 'River walk', [2, 3]);
    for (const [subcommand, options] of [
      ['save', { name: 'Loop' }],
      ['load', { route: `id:${saved.id}` }],
      ['forget', { route: 'River walk' }],
    ] as const) {
      expect(route.subcommands.get(subcommand)?.defer).toBe('ephemeral');
      const used = await made.run(subcommand, options);
      expect(used.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
      expect(used.reply).not.toHaveBeenCalled();
      expect(used.editReply).toHaveBeenCalledTimes(1);
      expect(used.followUp).not.toHaveBeenCalled();
    }
    // A refusal follows the acknowledgement, and is as private.
    const refused = await made.run('forget', { route: 'River walk' });
    expect(refused.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
    expect(refused.editReply).not.toHaveBeenCalled();
    expect(refused.followUp).toHaveBeenCalledWith({
      content: 'You have no such saved route for this region. Pick one from the list.',
      flags: MessageFlags.Ephemeral,
    });
    // The other subcommands answer at once.
    const added = await made.run('add', { stop: 'gym:11' });
    expect(added.deferReply).not.toHaveBeenCalled();
    expect(added.reply).toHaveBeenCalledTimes(1);
  });
});
