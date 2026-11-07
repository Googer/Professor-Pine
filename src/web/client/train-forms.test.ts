import { describe, expect, it } from 'vitest';
import type { MapTrain } from '../../domain/web/party-data.js';
import type { Me } from './notice.js';
import type { PressSteps } from './parties.js';
import type { MapGym, PageNode } from './popup.js';
import {
  conductorBody,
  drawnTrains,
  dropLegs,
  dropNeighbors,
  dropPosition,
  edgeScroll,
  holdMap,
  keepTools,
  newTrainButton,
  routeEditBody,
  routeEditor,
  RouteEdits,
  placedStops,
  routeMarkers,
  routeModeEnds,
  sendTrainForm,
  firstStopAtGym,
  firstStopAtSpot,
  startBody,
  startForm,
  trainHereBox,
  StopDrag,
  stopName,
  trainActions,
  trainAnswerOf,
  type TrainBody,
} from './train-forms.js';

const gymOf = (id: number, name: string, nickname: string | null = null): MapGym => ({
  id,
  name,
  nickname,
  lat: 40.05,
  lon: -80.05,
  regionIds: [1],
  address: null,
  description: null,
  notice: null,
});

const GYMS = new Map([
  [4, gymOf(4, 'Veterans Memorial Bridge')],
  [1, gymOf(1, 'Pinewood Public Library', 'The Stacks')],
  [7, gymOf(7, 'Harbor Lighthouse Mural')],
]);
const gym = (id: number) => GYMS.get(id);

const train = (more: Partial<MapTrain> = {}): MapTrain => ({
  kind: 'train',
  postKey: null,
  trainKind: 'raid',
  trainKindWords: 'Raid Train',
  endTime: null,
  id: 't1',
  name: 'Saturday legendaries',
  startTime: null,
  route: ['4', '1', '7'],
  spots: [],
  stop: 1,
  atEnd: 'finish',
  stopsAhead: [2],
  ahead: null,
  link: 'https://discord.com/channels/1/2',
  attendance: {
    groups: [{ id: 'A', interested: 1, coming: 1, present: 0 }],
    going: 1,
    mine: null,
    actions: [],
    remote: { offered: false, on: false },
    count: false,
  },
  may: { arrange: true, clear: false, load: true },
  moves: {
    title: 'Move the train',
    place: '1',
    text: 'At stop 2 of 3: The Stacks\nNext is Harbor Lighthouse Mural',
    label: 'Where to',
    moves: [
      { move: 'next', target: '7', label: 'Next: Harbor Lighthouse Mural' },
      { move: 'previous', target: '4', label: 'Previous: Veterans Memorial Bridge' },
    ],
  },
  conductor: { who: null, mayTake: true, mayDrop: false },
  moveRefusal: null,
  mayManage: true,
  ...more,
});

/** Every node of a tree, depth first. */
function all(node: PageNode): PageNode[] {
  return [node, ...(node.children ?? []).flatMap(all)];
}
const byName = (node: PageNode, name: string) =>
  all(node).find((one) => one.attributes?.name === name);
const buttons = (nodes: PageNode | PageNode[]) =>
  (Array.isArray(nodes) ? nodes : [nodes])
    .flatMap(all)
    .filter((one) => one.tag === 'button')
    .map((one): [string | undefined, Record<string, string> | undefined] => [
      one.text,
      one.attributes,
    ]);
const texts = (node: PageNode) =>
  all(node)
    .filter((one) => one.text !== undefined && one.tag !== 'button' && one.tag !== 'option')
    .map((one) => one.text);

describe('the zone the start form reads a typed time in (review N4)', () => {
  it('is named for a reader in another zone', () => {
    const zones = { zone: 'America/New_York', reader: 'Asia/Kolkata' };
    expect(JSON.stringify(startForm([{ id: 1, name: 'west' }], {}, zones))).toContain(
      "Clock times are read in the server's zone (Eastern).",
    );
    expect(JSON.stringify(startForm([{ id: 1, name: 'west' }]))).not.toContain('Clock times');
  });
});

describe('a train started at a place ("Start train here")', () => {
  const gym = {
    id: 7,
    name: 'Harbor Lighthouse Mural',
    nickname: null,
    lat: 40,
    lon: -80,
    regionIds: [1],
    address: null,
    description: null,
    notice: null,
  };

  it('names the gym as a stop is named and makes a raid train of it', () => {
    expect(firstStopAtGym(gym)).toEqual({
      name: 'Harbor Lighthouse Mural',
      stop: { gym: 7 },
    });
    expect(firstStopAtGym({ ...gym, nickname: 'The Light' }).name).toBe('The Light');
  });

  it('adds a Power Spot by its key and makes a Dynamax train of it', () => {
    expect(firstStopAtSpot({ id: 'abc', title: 'Old Mill' })).toEqual({
      name: 'Old Mill (Power Spot)',
      stop: { spot: 'wabc' },
      kind: 'dynamax',
    });
  });

  it('says the first stop in the form, and nothing of it without one', () => {
    const regions = [{ id: 1, name: 'west' }];
    expect(JSON.stringify(startForm(regions, {}, undefined, 'Old Mill'))).toContain(
      'First stop: Old Mill',
    );
    expect(JSON.stringify(startForm(regions))).not.toContain('First stop');
  });

  it('sends the kind only when there is one', () => {
    const values = { name: 'Mill run', region: '1', time: '', atEnd: 'finish' };
    expect(startBody(values, 'dynamax')).toEqual({
      body: { name: 'Mill run', region: 1, kind: 'dynamax' },
    });
    expect(startBody(values)).toEqual({ body: { name: 'Mill run', region: 1 } });
  });

  it('offers the button by its place, which is how an open form turns it off', () => {
    expect(JSON.stringify(trainHereBox('7'))).toContain('"data-train-here":"7"');
    expect(JSON.stringify(trainHereBox('abc'))).toContain('Start train here');
  });
});

describe('starting a train (startForm, startBody)', () => {
  it("asks for the name, the region (any of the server's), the start and the mode, as /train and /meet take them", () => {
    const form = startForm([
      { id: 1, name: 'west' },
      { id: 2, name: 'east' },
    ]);
    expect(form.attributes).toEqual({ 'data-form': 'train' });
    expect(byName(form, 'name')?.attributes).toMatchObject({ maxlength: '80' });
    expect(byName(form, 'time')?.attributes).toMatchObject({ maxlength: '40' });
    expect(
      all(byName(form, 'region') ?? { tag: 'none' })
        .filter((one) => one.tag === 'option')
        .map((one) => [one.attributes?.value, one.text]),
    ).toEqual([
      ['', 'Pick the region'],
      ['1', 'west'],
      ['2', 'east'],
    ]);
    expect(
      all(byName(form, 'atEnd') ?? { tag: 'none' })
        .filter((one) => one.attributes?.selected !== undefined)
        .map((one) => one.attributes?.value),
    ).toEqual(['finish']);
    expect(newTrainButton().children?.[0]?.attributes).toMatchObject({ 'data-new-train': '' });
    // "New meetup" beside it (plan 8M-5M).
    expect(newTrainButton().children?.[1]?.attributes).toMatchObject({ 'data-new-meetup': '' });
  });

  it('makes the body of a new train, or says what is missing', () => {
    expect(
      startBody({ name: ' Park loop ', region: '2', time: ' 6:15pm ', atEnd: 'loop' }),
    ).toEqual({
      body: { name: 'Park loop', region: 2, time: '6:15pm', atEnd: 'loop' },
    });
    expect(startBody({ name: 'Park loop', region: '1', time: '', atEnd: 'finish' })).toEqual({
      body: { name: 'Park loop', region: 1 },
    });
    expect(startBody({ name: ' ', region: '1', time: '', atEnd: 'finish' })).toEqual({
      text: 'Give the train a name first.',
    });
    expect(startBody({ name: 'Park loop', region: '', time: '', atEnd: 'finish' })).toEqual({
      text: 'Pick the region first.',
    });
  });
});

describe("a train's actions in its popup (trainActions)", () => {
  it('offers Edit route, Move…, Manage… and the conductor role as the member may, naming nobody', () => {
    expect(buttons(trainActions(train()))).toEqual([
      ['Edit route', { type: 'button', 'data-route-train': 't1' }],
      ['Move…', { type: 'button', 'data-move-train': 't1' }],
      ['Manage…', { type: 'button', 'data-manage-train': 't1' }],
      ['Be the conductor', { type: 'button', 'data-conductor': 'take', 'data-train': 't1' }],
    ]);
    const conducting = train({ conductor: { who: 'you', mayTake: false, mayDrop: true } });
    expect(trainActions(conducting).map((node) => node.text)).toContain('You are its conductor.');
    expect(buttons(trainActions(conducting)).map(([text]) => text)).toContain(
      'Stop being the conductor',
    );
    const staff = train({ conductor: { who: 'other', mayTake: false, mayDrop: true } });
    expect(buttons(trainActions(staff)).map(([text]) => text)).toContain('Take the conductor off');
    // Branch review B2: Manage… as the server says it opens (`mayManage`), not as the page reckons.
    expect(buttons(trainActions(train({ mayManage: false }))).map(([text]) => text)).not.toContain(
      'Manage…',
    );
    const told = train({
      moves: null,
      moveRefusal: { reason: 'not-conductor', text: 'words' },
      mayManage: true,
    });
    expect(buttons(trainActions(told)).map(([text]) => text)).toContain('Manage…');
  });

  it("makes a conductor button's body of whose the role was when the train was drawn", () => {
    expect(conductorBody(train())).toEqual({ who: 'none' });
    expect(
      conductorBody(train({ conductor: { who: 'you', mayTake: false, mayDrop: true } })),
    ).toEqual({ who: 'you' });
    expect(
      conductorBody(train({ conductor: { who: 'other', mayTake: true, mayDrop: false } })),
    ).toEqual({ who: 'other' });
  });

  it('leaves the line of the train being routed off the map: route mode draws it', () => {
    const other = train({ id: 't2' });
    expect(drawnTrains([train(), other], undefined).trains).toEqual([train(), other]);
    expect(drawnTrains([train(), other], 't1').trains).toEqual([other]);
  });

  it('draws the other trains out of the way of clicks while routing, so that every gym under their lines stays a stop to add', () => {
    const other = train({ id: 't2' });
    expect(drawnTrains([train(), other], undefined).clickable).toBe(true);
    expect(drawnTrains([train(), other], 't1').clickable).toBe(false);
  });

  it('offers nothing to who may do nothing of it', () => {
    const watching = train({
      may: { arrange: false, clear: false, load: false },
      moves: null,
      conductor: { who: 'other', mayTake: false, mayDrop: false },
      moveRefusal: {
        reason: 'not-conductor',
        text: 'This train has a conductor: only they and the moderators can move it.',
      },
      mayManage: false,
    });
    expect(trainActions(watching)).toEqual([
      { tag: 'div', className: 'conductor', text: 'It has a conductor.' },
    ]);
  });
});

describe('route mode (routeEditor, routeMarkers, routeEditBody)', () => {
  it('numbers the stops as the route is stored, the one the train is at marked', () => {
    expect(routeMarkers(train())).toEqual([
      { key: '4', gymId: 4, number: 1, here: false },
      { key: '1', gymId: 1, number: 2, here: true },
      { key: '7', gymId: 7, number: 3, here: false },
    ]);
    expect(stopName(gym(1), '1')).toBe('The Stacks');
    expect(stopName(undefined, '99')).toBe('Gym 99');
    // A power spot of the route (plan 8X-4): by the name the train's data gives it.
    const key = 'w0123456789abcdef0123456789abcdef.16';
    expect(stopName(undefined, key)).toBe('A Power Spot');
    const spots = [{ key, name: 'Gazebo of the Lake', lat: 40.05, lon: -80.05 }];
    expect(stopName(undefined, key, spots)).toBe('Gazebo of the Lake (Power Spot)');
  });

  it('numbers a Power Spot the train is at where it is, and leaves out a stop the map cannot place', () => {
    const key = 'w0123456789abcdef0123456789abcdef.16';
    const spots = [{ key, name: 'Gazebo of the Lake', lat: 40.2, lon: -80.2 }];
    const at = train({ route: ['4', key, '99', '7'], spots, stop: 1 });
    expect(placedStops(at, GYMS)).toEqual([
      { key: '4', number: 1, here: false, place: GYMS.get(4) },
      { key, number: 2, here: true, place: spots[0] },
      { key: '7', number: 4, here: false, place: GYMS.get(7) },
    ]);
    // A power spot the train's data does not give (no longer kept) is not placed either.
    expect(placedStops({ ...at, spots: [] }, GYMS).map((stop) => stop.number)).toEqual([1, 4]);
  });

  it("lists the stops with up, down and remove, the member's saved routes, and what they may", () => {
    const editor = routeEditor(train(), gym, [
      { id: 5, name: 'Downtown', stops: 3, atEnd: 'loop' },
      { id: 6, name: '', stops: 1, atEnd: 'finish' },
    ]);
    expect(editor.attributes).toEqual({ 'data-form': 'route', 'data-party': 't1' });
    expect(texts(editor)).toEqual(
      expect.arrayContaining([
        'Route of Saturday legendaries',
        '1. Veterans Memorial Bridge',
        '2. The Stacks (the train is here)',
        '3. Harbor Lighthouse Mural',
      ]),
    );
    const moves = all(editor).filter((one) => one.attributes?.['data-edit'] === 'move');
    expect(
      moves.map((one) => [
        one.attributes?.['data-from'],
        one.attributes?.['data-to'],
        one.attributes?.disabled,
      ]),
    ).toEqual([
      ['1', '0', ''],
      ['1', '2', undefined],
      ['2', '1', undefined],
      ['2', '3', undefined],
      ['3', '2', undefined],
      ['3', '4', ''],
    ]);
    expect(
      all(byName(editor, 'route') ?? { tag: 'none' })
        .filter((one) => one.tag === 'option')
        .map((one) => one.text),
    ).toEqual(['Pick a saved route', 'Downtown (3 stops, loops)', 'Without a name (1 stop)']);
    const edits = all(editor).flatMap((one) => one.attributes?.['data-edit'] ?? []);
    expect(new Set(edits)).toEqual(new Set(['move', 'remove', 'load', 'forget', 'save']));
  });

  // Branch review B3: route mode says what lies ahead as Route does, under the stop list.
  it('says what lies ahead under the stop list as Route does, and nothing where the server says nothing', () => {
    const ahead = 'After the last stop, the train turns back.';
    const children = routeEditor(train({ ahead }), gym, []).children ?? [];
    const list = children.findIndex((one) => one.className === 'route-stops');
    expect(list).toBeGreaterThan(-1);
    expect(children[list + 1]).toEqual({ tag: 'div', className: 'route-ahead', text: ahead });
    expect(
      all(routeEditor(train({ ahead: null }), gym, [])).filter(
        (one) => one.className === 'route-ahead',
      ),
    ).toEqual([]);
  });

  it('draws the editor anew with the name typed to save under and the saved route picked', () => {
    const saved = [
      { id: 5, name: 'Downtown', stops: 3, atEnd: 'loop' as const },
      { id: 6, name: '', stops: 1, atEnd: 'finish' as const },
    ];
    const editor = routeEditor(train(), gym, saved, { name: 'Harbor loop', route: '6' });
    expect(byName(editor, 'name')?.attributes?.value).toBe('Harbor loop');
    const picked = all(byName(editor, 'route') ?? { tag: 'none' })
      .filter((one) => one.tag === 'option' && one.attributes?.selected !== undefined)
      .map((one) => one.attributes?.value);
    expect(picked).toEqual(['6']);
    // A route no longer in the list (forgotten meanwhile) is picked no more.
    const gone = routeEditor(train(), gym, saved, { route: '9' });
    expect(
      all(byName(gone, 'route') ?? { tag: 'none' })
        .filter((one) => one.attributes?.selected !== undefined)
        .map((one) => one.attributes?.value),
    ).toEqual(['']);
  });

  it('offers each stop a move to any position, so that a move is one edit', () => {
    const editor = routeEditor(train(), gym, []);
    const selects = all(editor).filter((one) => one.attributes?.['data-move-from'] !== undefined);
    expect(
      selects.map((one) => [
        one.attributes?.['data-move-from'],
        one.attributes?.['aria-label'],
        (one.children ?? []).map((choice) => [
          choice.attributes?.value,
          choice.text,
          choice.attributes?.selected,
        ]),
      ]),
    ).toEqual([
      [
        '1',
        'Move stop 1 to',
        [
          ['1', '#1', ''],
          ['2', '#2', undefined],
          ['3', '#3', undefined],
        ],
      ],
      [
        '2',
        'Move stop 2 to',
        [
          ['1', '#1', undefined],
          ['2', '#2', ''],
          ['3', '#3', undefined],
        ],
      ],
      [
        '3',
        'Move stop 3 to',
        [
          ['1', '#1', undefined],
          ['2', '#2', undefined],
          ['3', '#3', ''],
        ],
      ],
    ]);
    // Stop 3 picked to be first: one move, as `/route move from:3 to:1`.
    expect(routeEditBody('move', train(), { from: '3', to: '1' })).toEqual({
      body: { drawn: ['4', '1', '7'], from: 3, to: 1 },
    });
  });

  it('leaves the stops without their buttons for who may no longer arrange the route', () => {
    const editor = routeEditor(
      train({ may: { arrange: false, clear: false, load: false } }),
      gym,
      [],
    );
    expect(texts(editor)).toContain('2. The Stacks (the train is here)');
    const edits = all(editor).flatMap((one) => one.attributes?.['data-edit'] ?? []);
    expect(edits).not.toContain('move');
    expect(edits).not.toContain('remove');
    expect(all(editor).some((one) => one.attributes?.['data-move-from'] !== undefined)).toBe(false);
  });

  it('ends route mode on an answer that says the train is gone, and on no other', () => {
    expect(routeModeEnds({ ok: false, status: 409 })).toBe(true);
    // Refused, with the train as it is now: drawn again.
    expect(routeModeEnds({ ok: false, status: 409, train: train() })).toBe(false);
    expect(routeModeEnds({ ok: false, status: 422, train: train() })).toBe(false);
    // Too many clicks, a broken connection: route mode stays.
    expect(routeModeEnds({ ok: false, status: 429 })).toBe(false);
    expect(routeModeEnds({ ok: false })).toBe(false);
    expect(routeModeEnds({ ok: true, status: 200, train: train() })).toBe(false);
  });

  it('offers Clear to who may clear, and Load only to who may load', () => {
    const leading = routeEditor(
      train({ may: { arrange: true, clear: true, load: false } }),
      gym,
      [],
    );
    const edits = all(leading).flatMap((one) => one.attributes?.['data-edit'] ?? []);
    expect(edits).toContain('clear');
    expect(edits).not.toContain('load');
    expect(texts(leading)).toContain('You have no saved routes for this region.');
    const loading = routeEditor(train({ route: [], stop: null }), gym, undefined);
    expect(texts(loading)).toEqual(
      expect.arrayContaining(['No stops yet.', 'Loading your saved routes…']),
    );
    expect(byName(loading, 'name')).toBeUndefined();
  });

  it('makes the body of each edit with the route it was drawn from, or says what is missing', () => {
    const drawn = ['4', '1', '7'];
    // A stop by its key (plan 8X-4): the route editor adds gyms.
    expect(routeEditBody('add', train(), { gym: 2 })).toEqual({ body: { drawn, stop: '2' } });
    expect(routeEditBody('remove', train(), { stop: '3' })).toEqual({ body: { drawn, stop: 3 } });
    expect(routeEditBody('move', train(), { from: '3', to: '2' })).toEqual({
      body: { drawn, from: 3, to: 2 },
    });
    expect(routeEditBody('clear', train(), {})).toEqual({ body: { drawn } });
    expect(routeEditBody('save', train(), { name: ' Downtown ' })).toEqual({
      body: { drawn, name: 'Downtown' },
    });
    expect(routeEditBody('save', train(), { name: '' })).toEqual({
      text: 'Give the route a name first.',
    });
    expect(routeEditBody('load', train(), { route: '5' })).toEqual({ body: { drawn, route: 5 } });
    expect(routeEditBody('forget', train(), { route: '5' })).toEqual({ body: { route: 5 } });
    expect(routeEditBody('load', train(), { route: '' })).toEqual({
      text: 'Pick one of your saved routes first.',
    });
  });

  it('adds a Power Spot tapped on the map by its key, and says one on the route already (plan 8M-8C)', () => {
    const lake = 'w0a1b2c3d4';
    expect(routeEditBody('add', train(), { spot: lake })).toEqual({
      body: { drawn: ['4', '1', '7'], stop: 'w0a1b2c3d4' },
    });
    expect(routeEditBody('add', train({ route: ['4', 'w0a1b2c3d4'] }), { spot: lake })).toEqual({
      text: 'That stop is on the route already.',
    });
  });

  it('says how to add a Power Spot while the map shows none: its layer on, zoomed in (R5)', () => {
    const hint = (spotsShown: boolean) =>
      all(routeEditor(train(), gym, [], {}, spotsShown)).find((one) =>
        (one.className ?? '').split(' ').includes('spots-hint'),
      )?.text;
    expect(hint(true)).toBe('Tap a gym or a Power Spot on the map to add it as the next stop.');
    expect(hint(false)).toBe(
      'Tap a gym on the map to add it as the next stop. Turn on Power Spots and zoom in to add a Power Spot.',
    );
  });

  // Review C7: in the words `/route add` refuses it with (`already-on-route`).
  it('says a gym clicked that is on the route already in the words of /route add, and sends nothing', () => {
    expect(routeEditBody('add', train(), { gym: 1 })).toEqual({
      text: 'That stop is on the route already.',
    });
    expect(routeEditBody('add', train(), { gym: 7 })).toEqual({
      text: 'That stop is on the route already.',
    });
  });
});

describe('dragging a stop in the stop list (plan 8M-8C, R6)', () => {
  /** Three rows of the stop list, 30 pixels high each from 100. */
  const rows = [
    { top: 100, bottom: 130 },
    { top: 130, bottom: 160 },
    { top: 160, bottom: 190 },
  ];

  it('gives every stop a handle to drag for who may arrange the route, and none otherwise', () => {
    const handles = (shown: MapTrain) =>
      all(routeEditor(shown, gym, []))
        .filter((one) => (one.className ?? '').split(' ').includes('drag-handle'))
        .map((one) => one.attributes?.['data-drag']);
    expect(handles(train())).toEqual(['1', '2', '3']);
    expect(handles(train({ may: { arrange: false, clear: false, load: false } }))).toEqual([]);
    expect(handles(train({ route: ['4'], stop: 0 }))).toEqual([]);
  });

  it('lands a stop at the row the pointer is over, above the first at the first, below the last at the last', () => {
    expect(dropPosition(90, rows)).toBe(1);
    expect(dropPosition(110, rows)).toBe(1);
    expect(dropPosition(145, rows)).toBe(2);
    expect(dropPosition(175, rows)).toBe(3);
    expect(dropPosition(400, rows)).toBe(3);
  });

  it('makes one move of a drop, with the route as it was when the drag began; none where it lands where it was', () => {
    const drag = new StopDrag();
    expect(drag.begin(3, ['4', '1', '7'], false)).toBe(true);
    expect(drag.over(110, rows)).toBe(1);
    expect(drag.drop()).toEqual({ from: 3, to: 1, drawn: ['4', '1', '7'] });
    expect(drag.drop()).toBeUndefined();
    drag.begin(2, ['4', '1', '7'], false);
    drag.over(145, rows);
    expect(drag.drop()).toBeUndefined();
    // Off while edits wait or are on their way.
    expect(drag.begin(1, ['4', '1', '7'], true)).toBe(false);
    expect(drag.over(175, rows)).toBeUndefined();
    expect(drag.drop()).toBeUndefined();
    drag.begin(1, ['4', '1', '7'], false);
    drag.over(175, rows);
    drag.cancel();
    expect(drag.drop()).toBeUndefined();
  });

  // Plan 8M-11B (S24): the map shows the dragged stop's two new legs.
  it('names the stops a dragged stop would land between, one at either end', () => {
    const route = ['4', '1', '7', '2'];
    // Stop 3 dropped at 1: before everything, then the Library.
    expect(dropNeighbors(route, 3, 1)).toEqual({ moved: '7', before: undefined, after: '4' });
    expect(dropNeighbors(route, 1, 3)).toEqual({ moved: '4', before: '7', after: '2' });
    expect(dropNeighbors(route, 2, 4)).toEqual({ moved: '1', before: '2', after: undefined });
    // Where it is: its own legs.
    expect(dropNeighbors(route, 2, 2)).toEqual({ moved: '1', before: '4', after: '7' });
    expect(dropNeighbors(route, 9, 1)).toBeUndefined();
  });

  it("draws the dragged stop's new legs between the places the map has, none to a stop it cannot place", () => {
    const places = new Map([
      [4, { lat: 40, lon: -80 }],
      [1, { lat: 40.01, lon: -80 }],
      [7, { lat: 40.02, lon: -80 }],
    ]);
    const shown = train({ route: ['4', '1', '7', '99'] });
    expect(dropLegs(shown, 3, 2, places)).toEqual([
      { from: { lat: 40, lon: -80 }, to: { lat: 40.02, lon: -80 } },
      { from: { lat: 40.02, lon: -80 }, to: { lat: 40.01, lon: -80 } },
    ]);
    // Dropped last: after the stop off the map, so no leg; first: one leg, to what follows it.
    expect(dropLegs(shown, 1, 4, places)).toEqual([]);
    expect(dropLegs(shown, 3, 1, places)).toEqual([
      { from: { lat: 40.02, lon: -80 }, to: { lat: 40, lon: -80 } },
    ]);
  });

  // Plan 8M-11B (S25): a held stop holds the map.
  it("turns the map's gestures off while a stop is held, and back on only those that were on", () => {
    const gesture = (on: boolean) => ({
      on,
      enabled() {
        return this.on;
      },
      enable() {
        this.on = true;
      },
      disable() {
        this.on = false;
      },
    });
    const zoom = gesture(true);
    const dragging = gesture(false);
    const release = holdMap([zoom, dragging]);
    expect([zoom.on, dragging.on]).toEqual([false, false]);
    release();
    expect([zoom.on, dragging.on]).toEqual([true, false]);
    // A second release (the drag ended twice) changes nothing someone else set since.
    zoom.disable();
    release();
    expect(zoom.on).toBe(false);
  });

  // Review C2: a second finger, or a pointer event of another, moves nothing of the drag.
  it('follows only the pointer that began the drag, until the drag ends', () => {
    const drag = new StopDrag();
    drag.begin(3, ['4', '1', '7'], false, 1);
    expect(drag.follows(1)).toBe(true);
    expect(drag.follows(2)).toBe(false);
    drag.cancel();
    expect(drag.follows(1)).toBe(false);
  });

  // Review C9: a stop dragged near an edge of the docked pane scrolls its list.
  it('scrolls the list while the pointer is near an edge of the pane, faster nearer, not in its middle', () => {
    const pane = { top: 100, bottom: 500 };
    expect(edgeScroll(300, pane)).toBe(0);
    expect(edgeScroll(130, pane)).toBeLessThan(0);
    expect(edgeScroll(105, pane)).toBeLessThan(edgeScroll(130, pane));
    expect(edgeScroll(470, pane)).toBeGreaterThan(0);
    expect(edgeScroll(495, pane)).toBeGreaterThan(edgeScroll(470, pane));
    // Beyond the pane, as fast as it goes.
    expect(edgeScroll(40, pane)).toBe(edgeScroll(100, pane));
    expect(edgeScroll(900, pane)).toBe(edgeScroll(500, pane));
    // A pane too low to have edges, or none drawn, does not scroll.
    expect(edgeScroll(110, { top: 100, bottom: 160 })).toBe(0);
    expect(edgeScroll(10, { top: 0, bottom: 0 })).toBe(0);
  });

  it('sends a dropped move with the route it was drawn from, not the one the train has by then', () => {
    expect(
      routeEditBody('move', train(), { from: '3', to: '1', drawn: ['4', '1', '7', '2'] }),
    ).toEqual({ body: { drawn: ['4', '1', '7', '2'], from: 3, to: 1 } });
  });
});

describe('the edits of route mode, one at a time (RouteEdits)', () => {
  /** An edit sent and waiting for its answer, which the test gives. */
  interface Waiting {
    edit: string;
    body: TrainBody;
    answer: (next: MapTrain | undefined) => void;
  }

  /**
   * Route mode over a fake that keeps each edit sent until the test answers it; `sendsCame(n)`
   * resolves once `n` edits have been sent in all.
   */
  const editing = () => {
    let shown: MapTrain | undefined = train({ route: ['4'], stop: 0 });
    const sent: Waiting[] = [];
    const waiters: Array<{ count: number; resolve: () => void }> = [];
    const busy: boolean[] = [];
    const edits = new RouteEdits({
      train: () => shown,
      send: (edit, body) =>
        new Promise<void>((done) => {
          sent.push({
            edit,
            body,
            answer: (next) => {
              shown = next;
              done();
            },
          });
          for (const waiter of waiters.filter(({ count }) => count <= sent.length)) {
            waiter.resolve();
          }
        }),
      busy: (on) => busy.push(on),
    });
    const sendsCame = (count: number): Promise<void> =>
      sent.length >= count
        ? Promise.resolve()
        : new Promise((resolve) => waiters.push({ count, resolve }));
    return { edits, sent, sendsCame, busy, end: () => (shown = undefined) };
  };

  it('sends gym clicks one after the other, each drawn from the route the answer before gave', async () => {
    const { edits, sent, sendsCame, busy } = editing();
    const first = edits.add('add', { gym: 1 });
    const second = edits.add('add', { gym: 7 });
    expect(edits.busy).toBe(true);
    expect(busy).toEqual([true]);
    await sendsCame(1);
    expect(sent.map(({ body }) => body)).toEqual([{ body: { drawn: ['4'], stop: '1' } }]);
    sent[0]?.answer(train({ route: ['4', '1'], stop: 0 }));
    await first;
    await sendsCame(2);
    expect(sent.map(({ body }) => body)).toEqual([
      { body: { drawn: ['4'], stop: '1' } },
      { body: { drawn: ['4', '1'], stop: '7' } },
    ]);
    sent[1]?.answer(train({ route: ['4', '1', '7'], stop: 0 }));
    await second;
    expect(edits.busy).toBe(false);
    expect(busy).toEqual([true, false]);
  });

  it('drops what waits once route mode ends', async () => {
    const { edits, sent, sendsCame, busy, end } = editing();
    const first = edits.add('add', { gym: 1 });
    const second = edits.add('add', { gym: 7 });
    await sendsCame(1);
    end();
    sent[0]?.answer(undefined);
    await Promise.all([first, second]);
    expect(sent).toHaveLength(1);
    expect(busy).toEqual([true, false]);
  });
});

describe("a train's answer (trainAnswerOf, sendTrainForm)", () => {
  it('takes whether it was done and the train as the server gives it', () => {
    expect(trainAnswerOf({ ok: true, text: 'Done.', train: train() })).toEqual({
      ok: true,
      train: train(),
    });
    expect(trainAnswerOf({ ok: false, text: 'No.' })).toEqual({ ok: false });
    expect(trainAnswerOf({ ok: true, train: { id: 3 } })).toEqual({ ok: true });
    expect(trainAnswerOf('nonsense')).toEqual({ ok: false });
  });

  it('sends with a token renewed once after a 403 of a stale one, and says the answer', async () => {
    const tokens: string[] = [];
    const steps: PressSteps = {
      post: (token) => {
        tokens.push(token);
        return Promise.resolve(
          token === 'old'
            ? { status: 403, body: { error: 'Not allowed.' } }
            : {
                status: 200,
                body: { ok: true, text: 'Old Stone Fountain is stop 4.', train: train() },
              },
        );
      },
      me: () =>
        Promise.resolve({
          loggedIn: true,
          name: 'Alice',
          member: true,
          csrf: 'new',
          readOnly: false,
        } as Me),
    };
    const sent = await sendTrainForm('old', steps);
    expect(tokens).toEqual(['old', 'new']);
    expect(sent).toEqual({
      text: 'Old Stone Fountain is stop 4.',
      csrf: 'new',
      ok: true,
      status: 200,
      train: train(),
    });
  });
});

describe("the side pane's parts in their order (keepTools)", () => {
  /** A side pane over a list of its children, recording each one it took out or moved. */
  const sidePanel = (...children: string[]) => {
    const panel = {
      children,
      takenOut: [] as string[],
      moved: [] as string[],
      get childNodes() {
        return panel.children;
      },
      removeChild(child: string) {
        panel.takenOut.push(child);
        panel.children = panel.children.filter((one) => one !== child);
      },
      insertBefore(child: string, before: string | null) {
        if (panel.children.includes(child)) panel.moved.push(child);
        const rest = panel.children.filter((one) => one !== child);
        const at = before === null ? rest.length : rest.indexOf(before);
        panel.children = [...rest.slice(0, at), child, ...rest.slice(at)];
      },
    };
    return panel;
  };

  it('leaves the box and the list in place while the list is drawn anew: a focus in either stays', () => {
    const panel = sidePanel('box', 'old line', 'list');
    keepTools(panel, ['box', 'list']);
    expect(panel.children).toEqual(['box', 'list']);
    expect(panel.takenOut).toEqual(['old line']);
    expect(panel.moved).toEqual([]);
  });

  // Plan 8M-11A (S11): the list is never taken out of the page to be put back, which lost the
  // focus of a line whose party ended before the list could give it to the sort.
  it('puts what is new before the list without moving the list, and takes out what is not offered', () => {
    const empty = sidePanel();
    keepTools(empty, ['box', 'list']);
    expect(empty.children).toEqual(['box', 'list']);
    const without = sidePanel('list');
    keepTools(without, ['box', 'report line', 'list']);
    expect(without.children).toEqual(['box', 'report line', 'list']);
    expect(without.moved).toEqual([]);
    const shown = sidePanel('box', 'report line', 'list');
    keepTools(shown, ['list']);
    expect(shown.children).toEqual(['list']);
    expect(shown.takenOut).toEqual(['box', 'report line']);
  });
});

describe('the button that starts a train', () => {
  it('is blue, as in every form; Cancel stays gray', () => {
    const form = startForm([{ id: 1, name: 'west' }]);
    const classOf = (attribute: string) =>
      all(form).find((node) => node.attributes?.[attribute] !== undefined)?.className;
    expect(classOf('data-submit')).toBe('press primary');
    expect(classOf('data-cancel')).toBe('press');
  });
});
