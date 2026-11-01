import { describe, expect, it, vi } from 'vitest';
import type { GeoView } from '../../domain/web/geo-data.js';
import type { StopsView } from '../../domain/web/meetup-data.js';
import type { MapMeetup } from '../../domain/web/party-data.js';
import {
  editorAfter,
  editorEnds,
  editorStep,
  editorTyped,
  gymPick,
  meetupActions,
  meetupAnswerOf,
  meetupChangeBody,
  meetupEditor,
  meetupHereBox,
  newMeetupBody,
  newMeetupForm,
  pinPick,
  PlacePicking,
  regionChosenBy,
  sendMeetupForm,
  StopLoads,
  meetupAtStopBox,
  stopFromMeetupButton,
  stopPick,
  stopsBox,
  type PickedPlace,
} from './meetup-forms.js';
import type { MapGym, PageNode } from './popup.js';

const ZONE = 'America/New_York';
/** 2026-10-13 14:00 in New York. */
const NOW = Date.UTC(2026, 9, 13, 18);
const HOUR = 3_600_000;

/** West and East, side by side, as `/api/geo` gives them. */
const REGIONS: GeoView['regions'] = [
  {
    id: 1,
    name: 'west',
    outline: [
      [40.0, -80.1],
      [40.1, -80.1],
      [40.1, -80.0],
      [40.0, -80.0],
      [40.0, -80.1],
    ],
  },
  {
    id: 2,
    name: 'east',
    outline: [
      [40.0, -80.0],
      [40.1, -80.0],
      [40.1, -79.9],
      [40.0, -79.9],
      [40.0, -80.0],
    ],
  },
];

const GYM: MapGym = {
  id: 1,
  name: 'Pinewood Public Library',
  nickname: 'The Stacks',
  lat: 40.05,
  lon: -80.05,
  regionIds: [1],
  address: null,
  description: null,
  notice: null,
};

const MEETUP: MapMeetup = {
  kind: 'meetup',
  postKey: null,
  id: 'm1',
  name: 'Picnic',
  startTime: NOW + 4 * HOUR,
  endTime: null,
  link: 'https://discord.com/channels/1/2',
  attendance: {
    groups: [],
    going: 0,
    mine: null,
    actions: [],
    remote: { offered: false, on: false },
    count: false,
  },
  place: {
    kind: 'gym',
    words: 'At The Stacks',
    lat: 40.05,
    lon: -80.05,
    gymId: 1,
    at: { key: 'gym:1', name: 'The Stacks' },
  },
  info: 'Bring snacks.',
  panel: { start: true },
};

function texts(node: PageNode): string[] {
  return [...(node.text === undefined ? [] : [node.text]), ...(node.children ?? []).flatMap(texts)];
}

/** The nodes of a tree that have this attribute. */
function withAttribute(node: PageNode, name: string): PageNode[] {
  return [
    ...(node.attributes?.[name] === undefined ? [] : [node]),
    ...(node.children ?? []).flatMap((child) => withAttribute(child, name)),
  ];
}

const VALUES = { name: 'Picnic', region: '1', start: '6pm', info: 'Bring snacks.' };

/** The editor's fields as `meetupEditor(MEETUP, …)` draws them, nothing typed. */
const SHOWN = { name: 'Picnic', info: 'Bring snacks.', start: '', end: '' };

/** The value an input of the tree is drawn with. */
function fieldValue(node: PageNode, name: string): string | undefined {
  return withAttribute(node, 'name').find((each) => each.attributes?.name === name)?.attributes
    ?.value;
}

describe('"Hold meetup here" in a PokéStop\'s popup', () => {
  const STOP = { key: 'abc.16', name: 'Market Fountain', at: { lat: 40.05, lon: -79.95 } };

  it('names the stop on its button, in a box of its own, and reads it back', () => {
    const box = meetupAtStopBox(STOP);
    expect(box).toMatchObject({ className: 'meetup-box place-control' });
    const text = JSON.stringify(box);
    expect(text).toContain('Hold meetup here');
    // As the stop's other buttons, nothing added of the gym's button.
    expect(text).toContain('"className":"press"');
    expect(
      stopFromMeetupButton({
        meetupAtStop: 'abc.16',
        stopName: 'Market Fountain',
        stopLat: '40.05',
        stopLon: '-79.95',
      }),
    ).toEqual(['abc.16', 40.05, -79.95, 'Market Fountain']);
  });

  it('reads nothing from a button that does not say all of it', () => {
    expect(stopFromMeetupButton({ stopName: 'Market Fountain' })).toBeUndefined();
    expect(
      stopFromMeetupButton({ meetupAtStop: 'abc.16', stopName: 'Market Fountain' }),
    ).toBeUndefined();
  });
});

describe('the places a meetup may be picked at on the map', () => {
  it('names a gym as its post does, a PokéStop and a pin, each with the regions it lies in', () => {
    expect(gymPick(GYM)).toEqual({
      body: { kind: 'gym', id: '1' },
      label: 'The Stacks (gym)',
      regionIds: [1],
    });
    expect(stopPick(['abc.16', 40.05, -79.95, 'Market Fountain'], REGIONS)).toEqual({
      body: { kind: 'stop', id: 'abc.16' },
      label: 'Market Fountain (PokéStop)',
      regionIds: [2],
    });
    expect(pinPick({ lat: 40.0512345678, lon: -80.0512345678 }, REGIONS)).toEqual({
      body: { lat: 40.051235, lon: -80.051235 },
      label: 'A pin at 40.05123, -80.05124',
      regionIds: [1],
    });
  });

  it('picks what is clicked only while picking, once, and opens no popup for it', () => {
    const picked = vi.fn<(place: PickedPlace) => void>();
    const picking = new PlacePicking(picked);
    expect(picking.gym(GYM)).toBe(false);
    picking.start();
    expect(picking.picking).toBe(true);
    expect(picking.point({ lat: 40.05, lon: -79.95 }, REGIONS)).toBe(true);
    expect(picking.picking).toBe(false);
    expect(picking.gym(GYM)).toBe(false);
    picking.start();
    expect(picking.stopClicked(['abc.16', 40.05, -79.95, 'Fountain'], REGIONS)).toBe(true);
    picking.start();
    picking.end();
    expect(picking.gym(GYM)).toBe(false);
    expect(picked.mock.calls.map(([place]) => place.label)).toEqual([
      'A pin at 40.05000, -79.95000',
      'Fountain (PokéStop)',
    ]);
  });
});

describe('the zone the new meetup form reads its start in (review N4)', () => {
  it('is named for a reader in another zone', () => {
    const zones = { zone: 'America/New_York', reader: 'Asia/Kolkata' };
    expect(texts(newMeetupForm(REGIONS, gymPick(GYM), {}, false, false, zones))).toContain(
      "Clock times are read in the server's zone (Eastern).",
    );
    expect(texts(newMeetupForm(REGIONS, gymPick(GYM)))).not.toContain(
      "Clock times are read in the server's zone (Eastern).",
    );
  });
});

describe('the form of a new meetup', () => {
  it('asks the name, the region (the place’s by default), the place, the start and the information', () => {
    const form = newMeetupForm(REGIONS, gymPick(GYM));
    expect(texts(form)).toEqual([
      'New meetup',
      'Name',
      'Region',
      'Pick the region',
      'west',
      'east',
      'Place',
      'The Stacks (gym)',
      'Pick again',
      'Starts',
      'Information',
      'Make the meetup',
      'Cancel',
    ]);
    const selected = withAttribute(form, 'selected').map((node) => node.text);
    expect(selected).toEqual(['west']);
    // What was typed and a region the member chose stay when it is drawn anew.
    const again = newMeetupForm(
      REGIONS,
      gymPick(GYM),
      { ...VALUES, region: '2', info: 'x' },
      false,
      true,
    );
    expect(withAttribute(again, 'selected').map((node) => node.text)).toEqual(['east']);
    expect(texts(again)).toContain('x');
  });

  it('follows the place picked with its region unless the member chose one', () => {
    const regionOf = (form: PageNode) => withAttribute(form, 'selected').map((node) => node.text);
    const east = stopPick(['abc.16', 40.05, -79.95, 'Market Fountain'], REGIONS);
    // Drawn again with nothing chosen yet: the place's region.
    expect(regionOf(newMeetupForm(REGIONS, gymPick(GYM), { ...VALUES, region: '' }))).toEqual([
      'west',
    ]);
    // Picked again in East, the region drawn before not chosen: East.
    expect(regionOf(newMeetupForm(REGIONS, east, { ...VALUES, region: '1' }))).toEqual(['east']);
    // Chosen by the member: it stays whatever is picked.
    expect(regionOf(newMeetupForm(REGIONS, east, { ...VALUES, region: '1' }, false, true))).toEqual(
      ['west'],
    );
    // Chosen, then set back to none: the place's region again.
    expect(regionOf(newMeetupForm(REGIONS, east, { ...VALUES, region: '' }, false, true))).toEqual([
      'east',
    ]);
  });

  it('says what to click while picking, and that a pin waits for a moderator', () => {
    expect(texts(newMeetupForm(REGIONS, undefined, {}, true))).toContain(
      'Click a gym, a PokéStop or a point of the map.',
    );
    expect(texts(newMeetupForm(REGIONS, undefined))).toContain('Pick on the map');
    expect(texts(newMeetupForm(REGIONS, pinPick({ lat: 40.05, lon: -80.05 }, REGIONS)))).toContain(
      "A meetup at a pin needs a moderator's approval before it is posted.",
    );
  });

  it('sends what /meetup takes, and says first what is missing', () => {
    expect(newMeetupBody(VALUES, gymPick(GYM))).toEqual({
      body: {
        region: 1,
        name: 'Picnic',
        place: { kind: 'gym', id: '1' },
        start: '6pm',
        info: 'Bring snacks.',
      },
    });
    expect(newMeetupBody({ ...VALUES, name: ' ' }, gymPick(GYM))).toEqual({
      text: 'Give the meetup a name first.',
    });
    expect(newMeetupBody({ ...VALUES, region: '' }, gymPick(GYM))).toEqual({
      text: 'Pick the region first.',
    });
    expect(newMeetupBody(VALUES, undefined)).toEqual({ text: 'Pick its place on the map first.' });
    expect(newMeetupBody({ ...VALUES, start: '' }, gymPick(GYM))).toEqual({
      text: 'Say when it starts first.',
    });
    expect(newMeetupBody({ ...VALUES, info: '\n ' }, gymPick(GYM))).toEqual({
      text: 'Say what there is to know first: where to meet, what to bring.',
    });
  });

  it('is opened from a gym’s popup with the gym as its place', () => {
    expect(withAttribute(meetupHereBox(7), 'data-meetup-here')[0]?.attributes).toMatchObject({
      'data-meetup-here': '7',
    });
  });
});

describe('the editor of a meetup', () => {
  it('is offered to who may change it', () => {
    expect(texts({ tag: 'div', children: meetupActions(MEETUP) })).toEqual(['Manage…']);
    expect(meetupActions({ ...MEETUP, panel: null })).toEqual([]);
  });

  it('names the server’s zone after its times for a reader in another (8A-11)', () => {
    const editor = meetupEditor(MEETUP, ZONE, NOW, {}, 'America/Los_Angeles');
    expect(texts(editor)).toContain('Starts now: 6:00 PM (Eastern)');
    expect(texts(meetupEditor(MEETUP, ZONE, NOW, {}, ZONE))).toContain('Starts now: 6:00 PM');
  });

  it('shows its name and information to change, its times as they are, with one Submit', () => {
    const editor = meetupEditor(MEETUP, ZONE, NOW);
    expect(texts(editor)).toEqual([
      'Manage Picnic',
      'At The Stacks',
      'Name',
      'Information',
      'Bring snacks.',
      'Starts now: 6:00 PM',
      'Starts',
      'Ends now: none',
      'Ends',
      'Submit',
      'Cancel',
    ]);
    // Not signed up: the start is not theirs to change.
    const staff = meetupEditor({ ...MEETUP, panel: { start: false } }, ZONE, NOW);
    expect(texts(staff)).toContain('Sign up for it to change when it starts.');
    expect(withAttribute(staff, 'name').map((node) => node.attributes?.name)).toEqual([
      'name',
      'info',
      'end',
    ]);
  });

  it('takes information stored with other line endings, untouched, as not typed in', () => {
    // Stored with `\r\n`; the browser's textarea gives it back with `\n`.
    const stored = { ...MEETUP, info: 'Bring snacks.\r\nAnd water.\rAnd a hat.' };
    const shown = { ...SHOWN, info: 'Bring snacks.\nAnd water.\nAnd a hat.' };
    expect(editorTyped({ meetup: stored, filled: {} }, shown)).toEqual({});
    // A real change still counts, drawn from what is stored.
    expect(
      editorTyped({ meetup: stored, filled: {} }, { ...shown, info: 'Bring snacks.' }),
    ).toEqual({ info: { text: 'Bring snacks.', drawn: stored.info } });
  });

  it('sends each change alone with the value it was drawn from', () => {
    const typed = (values: Record<string, string>) =>
      editorTyped({ meetup: MEETUP, filled: {} }, { ...SHOWN, ...values });
    expect(meetupChangeBody('name', MEETUP, typed({ name: ' Park picnic ' }))).toEqual({
      body: { drawn: 'Picnic', name: 'Park picnic' },
    });
    expect(meetupChangeBody('info', MEETUP, typed({ info: '' }))).toEqual({
      body: { drawn: 'Bring snacks.', info: '' },
    });
    expect(meetupChangeBody('start', MEETUP, typed({ start: '7pm' }))).toEqual({
      body: { drawn: NOW + 4 * HOUR, time: '7pm' },
    });
    expect(meetupChangeBody('end', MEETUP, typed({ end: 'none' }))).toEqual({
      body: { drawn: null, time: 'none' },
    });
    expect(meetupChangeBody('end', MEETUP, typed({}))).toEqual({ text: 'Say when it ends first.' });
    expect(meetupChangeBody('name', MEETUP, typed({ name: '' }))).toEqual({
      text: 'Give the meetup a name first.',
    });
  });

  it('redraws a field not typed in from each answer’s meetup', () => {
    const changed = { ...MEETUP, name: 'Park picnic', info: 'Bring water.' };
    const after = editorAfter({ meetup: MEETUP, filled: {} }, SHOWN, 'end', {
      ok: true,
      meetup: changed,
    });
    expect(after).toEqual({ meetup: changed, filled: {} });
    const editor = meetupEditor(after.meetup, ZONE, NOW, after.filled);
    expect(texts(editor)).toContain('Bring water.');
    expect(texts(editor)).not.toContain('Bring snacks.');
    expect(fieldValue(editor, 'name')).toBe('Park picnic');
    // A Set on a field not typed in sends what it shows, drawn from that.
    expect(
      meetupChangeBody(
        'info',
        after.meetup,
        editorTyped(after, { ...SHOWN, info: 'Bring water.' }),
      ),
    ).toEqual({ body: { drawn: 'Bring water.', info: 'Bring water.' } });
  });

  it('keeps a field typed in with the value it was drawn from, so a change meanwhile is refused', () => {
    const changed = { ...MEETUP, name: 'Googer picnic', info: 'Bring water.' };
    const after = editorAfter(
      { meetup: MEETUP, filled: {} },
      { ...SHOWN, name: 'Park picnic' },
      'end',
      { ok: true, meetup: changed },
    );
    expect(fieldValue(meetupEditor(after.meetup, ZONE, NOW, after.filled), 'name')).toBe(
      'Park picnic',
    );
    expect(
      meetupChangeBody('name', after.meetup, editorTyped(after, { ...SHOWN, name: 'Park picnic' })),
    ).toEqual({ body: { drawn: 'Picnic', name: 'Park picnic' } });
    // Typed on after it was first read: the text follows, the value drawn from stays.
    expect(editorTyped(after, { ...SHOWN, name: 'Park picnic!' }).name).toEqual({
      text: 'Park picnic!',
      drawn: 'Picnic',
    });
  });

  it('takes a field typed in as not typed in once it shows what the meetup has again', () => {
    const refused = { meetup: MEETUP, filled: { start: { text: '7pm', drawn: MEETUP.startTime } } };
    // A refused start cleared: nothing to send of it, so no "Say when it starts first."
    expect(editorTyped(refused, { ...SHOWN, start: '' })).toEqual({});
    const named = { meetup: MEETUP, filled: { name: { text: 'Feast', drawn: MEETUP.name } } };
    expect(editorTyped(named, { ...SHOWN, name: MEETUP.name })).toEqual({});
    const stored = { ...MEETUP, info: 'Bring snacks.\r\nAnd water.' };
    const informed = { meetup: stored, filled: { info: { text: 'More.', drawn: stored.info } } };
    expect(editorTyped(informed, { ...SHOWN, info: 'Bring snacks.\nAnd water.' })).toEqual({});
  });

  it('after an answer to a field’s change: a change made shows the meetup’s value, a refused one keeps the text drawn from the meetup as it is now', () => {
    const typedName = { ...SHOWN, name: 'Park picnic' };
    const renamed = { ...MEETUP, name: 'Park picnic' };
    expect(
      editorAfter({ meetup: MEETUP, filled: {} }, typedName, 'name', { ok: true, meetup: renamed }),
    ).toEqual({ meetup: renamed, filled: {} });
    const theirs = { ...MEETUP, name: 'Googer picnic' };
    const refused = editorAfter({ meetup: MEETUP, filled: {} }, typedName, 'name', {
      ok: false,
      status: 409,
      meetup: theirs,
    });
    expect(refused.filled).toEqual({ name: { text: 'Park picnic', drawn: 'Googer picnic' } });
    // Without a meetup in the answer (a broken connection) nothing is redrawn from.
    expect(
      editorAfter({ meetup: MEETUP, filled: {} }, typedName, 'name', { ok: false }).filled,
    ).toEqual({ name: { text: 'Park picnic', drawn: 'Picnic' } });
  });
});

describe('the state of the page’s meetup forms', () => {
  it('takes the region as chosen by the member only when one is chosen in the list', () => {
    expect(regionChosenBy('2')).toBe(true);
    expect(regionChosenBy('')).toBe(false);
  });

  it('closes the editor, draws it anew, or only says the words of an editor closed meanwhile', () => {
    expect(editorStep(true, { ok: true, status: 200, meetup: MEETUP })).toBe('redraw');
    expect(editorStep(true, { ok: false, status: 409, meetup: MEETUP })).toBe('redraw');
    expect(editorStep(true, { ok: false, status: 409 })).toBe('close');
    expect(editorStep(true, { ok: false, status: 403, meetup: { ...MEETUP, panel: null } })).toBe(
      'close',
    );
    expect(editorStep(false, { ok: true, status: 200, meetup: MEETUP })).toBe('aside');
    expect(editorStep(false, { ok: false, status: 409 })).toBe('aside');
  });
});

describe('the box the PokéStops are asked for', () => {
  it('is the map’s view kept to the world', () => {
    expect(stopsBox({ south: -95, west: -200.5, north: 91, east: 540 })).toEqual({
      south: -90,
      west: -180,
      north: 90,
      east: 180,
    });
    const inside = { south: 40, west: -80.1, north: 40.1, east: -79.9 };
    expect(stopsBox(inside)).toEqual(inside);
  });
});
describe('the answers of the meetups’ addresses', () => {
  it('reads whether it was done, what came of a making, and the meetup', () => {
    expect(meetupAnswerOf({ ok: true, outcome: 'held', text: 'x' })).toEqual({
      ok: true,
      outcome: 'held',
    });
    expect(meetupAnswerOf({ ok: false, text: 'x', meetup: MEETUP })).toEqual({
      ok: false,
      meetup: MEETUP,
    });
    expect(meetupAnswerOf({ ok: true, meetup: { id: 1 } })).toEqual({ ok: true });
    expect(meetupAnswerOf('nonsense')).toEqual({ ok: false });
  });

  it('closes the editor for a meetup that is gone, or that the member may no longer change', () => {
    expect(editorEnds({ ok: false, status: 409 })).toBe(true);
    expect(editorEnds({ ok: false, status: 409, meetup: MEETUP })).toBe(false);
    expect(editorEnds({ ok: false, status: 429 })).toBe(false);
    expect(editorEnds({ ok: false })).toBe(false);
    // No longer staff (a 403 with the meetup), or not any more after a change that went through.
    const notTheirs = { ...MEETUP, panel: null };
    expect(editorEnds({ ok: false, status: 403, meetup: notTheirs })).toBe(true);
    expect(editorEnds({ ok: true, status: 200, meetup: notTheirs })).toBe(true);
  });

  it('sends with the page’s token, and once more with a new one after a stale token’s 403', async () => {
    const tokens: string[] = [];
    const sent = await sendMeetupForm('old', {
      post: (token) => {
        tokens.push(token);
        return Promise.resolve(
          token === 'old'
            ? { status: 403, body: { error: 'Forbidden' } }
            : { status: 200, body: { ok: true, outcome: 'posted', text: 'Made.', meetup: MEETUP } },
        );
      },
      me: () =>
        Promise.resolve({
          loggedIn: true,
          name: 'Alice',
          member: true,
          csrf: 'new',
          readOnly: false,
        }),
    });
    expect(tokens).toEqual(['old', 'new']);
    expect(sent).toEqual({
      text: 'Made.',
      csrf: 'new',
      ok: true,
      outcome: 'posted',
      meetup: MEETUP,
      status: 200,
    });
  });
});

describe('the PokéStops of "pick a place" mode (StopLoads)', () => {
  /** Questions answered as the test says, a timer run by hand. */
  function loads() {
    const answers: Array<(view: StopsView) => void> = [];
    const shown: StopsView[] = [];
    const more: boolean[] = [];
    let timer: { run: () => void; ms: number } | undefined;
    const stopLoads = new StopLoads({
      load: () =>
        new Promise<StopsView>((resolve) => {
          answers.push(resolve);
        }),
      show: (view) => shown.push(view),
      more: (on) => more.push(on),
      failed: () => undefined,
      delayMs: 300,
      setTimer: (run, ms) => {
        timer = { run, ms };
        return () => {
          timer = undefined;
        };
      },
    });
    const fire = () => {
      const due = timer;
      timer = undefined;
      due?.run();
    };
    return { stopLoads, answers, shown, more, fire, timer: () => timer };
  }
  const view = (n: number, many = false): StopsView => ({
    stops: [[`s${n}`, 40, -80, `Stop ${n}`]],
    more: many,
  });

  it('asks once the map has rested 300 ms, however often it moved', () => {
    const { stopLoads, answers, fire, timer } = loads();
    stopLoads.moved();
    stopLoads.moved();
    stopLoads.moved();
    expect(answers).toHaveLength(0);
    expect(timer()?.ms).toBe(300);
    fire();
    expect(answers).toHaveLength(1);
  });

  it('shows only the answer to the last question, and none once stopped', async () => {
    const { stopLoads, answers, shown } = loads();
    stopLoads.now();
    stopLoads.now();
    answers[1]?.(view(2));
    answers[0]?.(view(1));
    await stopLoads.idle();
    expect(shown.map((one) => one.stops[0]?.[0])).toEqual(['s2']);
    stopLoads.now();
    stopLoads.stop();
    answers[2]?.(view(3));
    await stopLoads.idle();
    expect(shown).toHaveLength(1);
  });

  it('says there are more only when that changes', async () => {
    const { stopLoads, answers, more } = loads();
    for (const [n, many] of [
      [1, true],
      [2, true],
      [3, false],
      [4, true],
    ] as const) {
      stopLoads.now();
      answers[n - 1]?.(view(n, many));
      await stopLoads.idle();
    }
    expect(more).toEqual([true, false, true]);
  });
});
