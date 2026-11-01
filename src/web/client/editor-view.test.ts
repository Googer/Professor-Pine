import { describe, expect, it } from 'vitest';
import type { LatLon } from '@pine/wayspot-core/lat-lon';
import {
  applyEdits,
  emptyEdits,
  newKey,
  record,
  regionKey,
  type Draft,
} from '../../domain/regions/edits.js';
import type { FixChoice } from '../../domain/regions/fix.js';
import type { EditorData, SaveRequest } from '../../domain/web/editor-data.js';
import {
  cannotFixWords,
  channelChoices,
  choiceWords,
  draftLabel,
  exportFileName,
  fixAllWords,
  fixesOffered,
  fixPick,
  fixWaiting,
  landingWords,
  loadedRegions,
  newChannelProblem,
  outlineProblems,
  pickerChange,
  pickerShown,
  pieceLine,
  pieceOrder,
  placeCounts,
  readSaveAnswer,
  reloadFailedLine,
  saveBody,
  saveReadiness,
  splitPartner,
  stretchTitle,
  coverageSummary,
  fixBoxPadding,
  fixFocus,
  outsideLine,
  theirsLine,
  NO_PIECES,
  ACCOUNT_CHANGED,
  firstView,
  reopenRefusal,
  START_VIEW,
  type ListedPiece,
  clusterWarns,
  placeLayers,
  unsavedLine,
  notChangedWords,
  notDeletedWords,
} from './editor-view.js';
import { wantedDots } from './gym-dots.js';
import { storageKey } from './staged-storage.js';

const p = (lat: number, lon: number): LatLon => ({ lat, lon });
function square(south: number, west: number, north: number, east: number): LatLon[] {
  return [p(south, west), p(north, west), p(north, east), p(south, east), p(south, west)];
}
const points = (ring: LatLon[]): [number, number][] => ring.map(({ lat, lon }) => [lat, lon]);

const DATA: EditorData = {
  guild: { id: '412345678901234567', name: 'Pinewood Raids' },
  userId: '700000000000000001',
  readOnly: false,
  mayManageChannels: true,
  regions: [
    {
      id: 1,
      channelId: '100000000000000001',
      name: 'west',
      category: 'Town',
      description: null,
      outline: points(square(40, -80.1, 40.1, -80)),
      version: 'AAAAAAAAAAAAAAAA',
    },
    {
      id: 2,
      channelId: '100000000000000002',
      name: 'east',
      category: 'Town',
      description: null,
      outline: points(square(40, -80, 40.1, -79.9)),
      version: 'BBBBBBBBBBBBBBBB',
    },
  ],
  others: [],
  gyms: [
    [1, 40.05, -80.05, 'Library'],
    [2, 40.05, -79.95, 'Bridge'],
    [3, 40.2, -80.05, 'Trailhead'],
  ],
  wayspots: [
    ['stop', 40.01, -80.01, 'Mural'],
    ['powerspot', 40.2, -80.0, 'Kiosk'],
  ],
  channels: [
    { id: '100000000000000005', name: 'south' },
    { id: '100000000000000006', name: 'north' },
  ],
};
const LOADED = loadedRegions(DATA);
const drafts = (...edits: Parameters<typeof record>[1][]): Draft[] =>
  applyEdits(
    LOADED,
    edits.reduce((state, edit) => record(state, edit), emptyEdits()),
  ).drafts;

describe('the region editor page', () => {
  it('counts the gyms in each region, and finds the places in none', () => {
    const counts = placeCounts(drafts(), DATA);
    expect(counts.gyms).toEqual(
      new Map([
        [regionKey(1), 1],
        [regionKey(2), 1],
      ]),
    );
    // By their places in the data: the trailhead, and the kiosk.
    expect(counts.outsideGyms).toEqual([2]);
    expect(counts.outsideWayspots).toEqual([1]);
    // Follows an edit: west grows north over the trailhead.
    const grown = placeCounts(
      drafts({
        kind: 'outline',
        key: regionKey(1),
        outline: square(40, -80.1, 40.3, -80),
        bases: {},
      }),
      DATA,
    );
    expect(grown.gyms.get(regionKey(1))).toBe(2);
    expect(grown.outsideGyms).toEqual([]);
    // A region staged for removal holds nothing.
    const removed = placeCounts(
      drafts({ kind: 'remove', key: regionKey(2), forum: 'keep', bases: {} }),
      DATA,
    );
    expect(removed.outsideGyms).toEqual([1, 2]);
  });

  it('names a region by its channel, a new one by the channel it takes or makes', () => {
    const [west, , fresh] = drafts({
      kind: 'add',
      key: newKey(0),
      outline: square(39.9, -80.1, 40, -80),
      channel: { create: 'North Hills' },
      description: null,
    });
    expect(draftLabel(west!)).toBe('#west');
    expect(draftLabel(fresh!)).toBe('new channel North Hills');
    const [, , none] = drafts({
      kind: 'add',
      key: newKey(0),
      outline: square(39.9, -80.1, 40, -80),
      channel: null,
      description: null,
    });
    expect(draftLabel(none!)).toBe('new region (no channel yet)');
  });

  it('marks an outline that crosses itself', () => {
    const crossing = [p(40, -80.1), p(40.1, -80), p(40.1, -80.1), p(40, -80), p(40, -80.1)];
    const problems = outlineProblems(
      drafts({ kind: 'outline', key: regionKey(1), outline: crossing, bases: {} }),
    );
    expect(problems).toEqual(new Map([[regionKey(1), 'its outline crosses or touches itself']]));
  });

  it('offers a new region the channels no other region has taken', () => {
    const made = drafts(
      {
        kind: 'add',
        key: newKey(0),
        outline: square(39.9, -80.1, 40, -80),
        channel: { id: '100000000000000005', name: 'south' },
        description: null,
      },
      {
        kind: 'add',
        key: newKey(1),
        outline: square(41, -80.1, 41.1, -80),
        channel: null,
        description: null,
      },
    );
    expect(channelChoices(DATA.channels, made, newKey(1))).toEqual([
      { id: '100000000000000006', name: 'north' },
    ]);
    expect(channelChoices(DATA.channels, made, newKey(0))).toEqual(DATA.channels);
  });

  it('says why Save is off', () => {
    const ready = saveReadiness({
      readOnly: false,
      changes: true,
      problems: new Map(),
      missingChannel: [],
      conflicts: 0,
      fresh: { overlaps: 0, gaps: 0 },
      checking: false,
    });
    expect(ready).toEqual({ ready: true, reasons: [] });
    const notReady = saveReadiness({
      readOnly: true,
      changes: false,
      problems: new Map([['r1', 'its outline crosses or touches itself']]),
      missingChannel: ['n0'],
      conflicts: 2,
      fresh: { overlaps: 1, gaps: 2 },
      checking: true,
    });
    expect(notReady.ready).toBe(false);
    // No color named (plan 8M-10, C10): the swatch beside a sentence shows what is drawn.
    expect(notReady.reasons).toEqual([
      { text: 'Discord cannot be reached just now, so the editor is read-only.' },
      { text: 'Nothing is changed.' },
      { text: '1 outline cannot be saved.', swatch: 'broken' },
      { text: '1 new region has no channel yet.' },
      { text: '2 regions were changed by somebody else: take theirs or keep yours.' },
      { text: 'Your changes make 1 new overlap and 2 new gaps.' },
      { text: 'The overlaps and gaps are being worked out.' },
    ]);
    // A page that cannot work them out (its worker failed) waits for nothing: the server checks.
    expect(
      saveReadiness({
        readOnly: false,
        changes: true,
        problems: new Map(),
        missingChannel: [],
        conflicts: 0,
        fresh: { overlaps: 0, gaps: 0 },
        checking: true,
        checkFailed: true,
      }),
    ).toEqual({ ready: true, reasons: [] });
  });

  it('describes an overlap or a gap by its size, its regions and what lies in it', () => {
    expect(
      pieceLine(
        {
          kind: 'overlap',
          area: 1234.4,
          between: ['r1', 'r2'],
          fresh: true,
          counts: { gym: 2, stop: 1, powerspot: 0, wayfarerGym: 0 },
        },
        (key) => (key === 'r1' ? '#west' : '#east'),
      ),
    ).toBe('New overlap of 1,234 m², #west and #east: 2 gyms, 1 stop');
    expect(
      pieceLine(
        {
          kind: 'gap',
          area: 98765,
          between: null,
          fresh: false,
          counts: { gym: 0, stop: 0, powerspot: 3, wayfarerGym: 1 },
        },
        () => '',
      ),
    ).toBe('Gap of 98,765 m²: 3 Power Spots, 1 Wayfarer gym');
    expect(
      pieceLine(
        {
          kind: 'gap',
          area: 5,
          between: null,
          fresh: false,
          counts: { gym: 0, stop: 0, powerspot: 0, wayfarerGym: 0 },
        },
        () => '',
      ),
    ).toBe('Gap of 5 m²');
  });

  it('lists new pieces first, then the largest, or on a first open the worst first', () => {
    const piece = (
      name: string,
      area: number,
      places: number,
      fresh = false,
    ): ListedPiece & { name: string } => ({
      name,
      kind: 'gap',
      area,
      between: null,
      fresh,
      counts: { gym: places, stop: 0, powerspot: 0, wayfarerGym: 0 },
    });
    const pieces = [
      piece('large and empty', 9_000, 0),
      piece('small with gyms', 100, 3),
      piece('new', 10, 0, true),
      piece('middling with a gym', 500, 1),
      piece('tiny with a gym', 50, 1),
    ];
    const names = (worstFirst: boolean): string[] =>
      [...pieces].sort(pieceOrder(worstFirst)).map((one) => one.name);
    expect(names(false)).toEqual([
      'new',
      'large and empty',
      'middling with a gym',
      'small with gyms',
      'tiny with a gym',
    ]);
    expect(names(true)).toEqual([
      'new',
      'small with gyms',
      'middling with a gym',
      'tiny with a gym',
      'large and empty',
    ]);
  });

  it('words a fix: the stretch, each choice, where each place ends up, why not', () => {
    const name = (key: string): string => `#${key}`;
    expect(stretchTitle([['west'], ['east']], name)).toBe('The slivers between #west and #east');
    expect(stretchTitle([['south'], ['west', 'north']], name)).toBe(
      'Where #south, #west and #north meet',
    );
    expect(choiceWords(0, [['west'], ['east']], name)).toBe("#west's border");
    expect(choiceWords(1, [['south'], ['west', 'north']], name)).toBe(
      'the borders of #west and #north',
    );
    expect(choiceWords('midline', [['west'], ['east']], name)).toBe('the midline');
    // The places are numbered as the page gave them: the gyms, then the Wayspots.
    expect(landingWords({ place: 1, key: 'east' }, DATA, name)).toBe(
      'Gym #2 “Bridge” ends up in #east.',
    );
    expect(landingWords({ place: 3, key: null }, DATA, name)).toBe(
      'Stop “Mural” ends up in no region.',
    );
    expect(landingWords({ place: 4, key: 'west' }, DATA, name)).toBe(
      'Power Spot “Kiosk” ends up in #west.',
    );
    // The reach in the settings' units, by `distanceWords` (review fix 8).
    expect(cannotFixWords('too-wide', 'metric')).toBe(
      'Its borders lie more than 150 m apart: draw it by hand.',
    );
    expect(cannotFixWords('too-wide', 'imperial')).toBe(
      'Its borders lie more than 490 ft apart: draw it by hand.',
    );
    expect(cannotFixWords('new-pieces', 'imperial')).toBe(
      'That would make a new overlap or gap: draw it by hand.',
    );
    expect(cannotFixWords('corner-outside', 'imperial')).toBe(
      'The corner must stay inside the sliver.',
    );
    // The choices are worked out on the regions as they are: a border not found where the
    // stretch was found is the arithmetic's failure, not a change meanwhile.
    expect(cannotFixWords('stale', 'imperial')).toBe(
      'I could not work this fix out: draw it by hand.',
    );
    expect(fixAllWords(3, 0, 0)).toBe('Fixed 3 stretches.');
    expect(fixAllWords(1, 2, 1)).toBe(
      'Fixed 1 stretch; left 2 as they were; 1 could not be fixed automatically: draw it by hand.',
    );
    expect(fixAllWords(0, 0, 0)).toBe('Nothing was fixed.');
    expect(fixAllWords(2, 0, 0, 1)).toBe(
      'Fixed 2 stretches; 1 taken back, as it would make a new overlap or gap: draw it by hand.',
    );
  });

  it('keeps the midline shown after a drag of its corner, refused or not', () => {
    const option = (choice: FixChoice, ok: boolean): { choice: FixChoice; ok: boolean } => ({
      choice,
      ok,
    });
    const refused = [option(0, true), option(1, true), option('midline', false)];
    // An answer to a drag: the midline stays, with why it cannot be applied.
    expect(fixPick(refused, 'midline', true)).toBe('midline');
    // Otherwise a choice that cannot be made gives way: the midline, else the first that can.
    expect(fixPick(refused, 'midline', false)).toBe(0);
    expect(fixPick(refused, 1, false)).toBe(1);
    expect(fixPick([option(0, true), option('midline', true)], undefined, false)).toBe('midline');
    expect(fixPick([option(0, false)], undefined, false)).toBeUndefined();
  });

  it('shows no answer while the corner is dragged, and waits for the answer to the last drag', () => {
    let waiting = fixWaiting(0, 'asked');
    waiting = fixWaiting(waiting, 'answered');
    expect(waiting).toBe(0);
    // A drag, and a second one before the answer to the first came.
    waiting = fixWaiting(waiting, 'drag-started');
    waiting = fixWaiting(waiting, 'drag-ended');
    waiting = fixWaiting(waiting, 'drag-started');
    // The first drag's answer, while the corner is under the pointer: not shown.
    waiting = fixWaiting(waiting, 'answered');
    expect(waiting).toBeGreaterThan(0);
    waiting = fixWaiting(waiting, 'drag-ended');
    expect(waiting).toBeGreaterThan(0);
    // The last drag's answer is shown, and Apply can be pressed.
    expect(fixWaiting(waiting, 'answered')).toBe(0);
  });

  it('offers no fix once the overlaps and gaps could not be worked out', () => {
    expect(fixesOffered({ readOnly: false, checkFailed: false })).toBe(true);
    // A check that failed, or a worker that stopped with an error: the pieces listed may be
    // those of the regions before.
    expect(fixesOffered({ readOnly: false, checkFailed: true })).toBe(false);
    expect(fixesOffered({ readOnly: true, checkFailed: false })).toBe(false);
  });

  it('knows which region a new one was split off', () => {
    const state = record(emptyEdits(), {
      kind: 'split',
      key: regionKey(1),
      keep: square(40, -80.1, 40.1, -80.05),
      newKey: newKey(0),
      other: square(40, -80.05, 40.1, -80),
      bases: {},
    });
    expect(splitPartner(state, newKey(0))).toBe(regionKey(1));
    expect(splitPartner(state, regionKey(1))).toBe(newKey(0));
    expect(splitPartner(state, regionKey(2))).toBeUndefined();
  });

  it('refuses a new channel named as a channel the server has, as the server would', () => {
    expect(newChannelProblem('South', DATA.channels, LOADED)).toBe(
      '#south exists: pick it from the list.',
    );
    expect(newChannelProblem('#West', DATA.channels, LOADED)).toBe(
      '#west exists already: pick another name.',
    );
    expect(newChannelProblem('!!!', DATA.channels, LOADED)).toBe(
      'That name gives no channel name: use letters or digits.',
    );
    expect(newChannelProblem('North Hills', DATA.channels, LOADED)).toBeUndefined();
  });

  it("keeps what is typed into a new region's channel picker when the panel is drawn anew", () => {
    const [, , fresh] = drafts({
      kind: 'add',
      key: newKey(0),
      outline: square(39.9, -80.1, 40, -80),
      channel: null,
      description: null,
    });
    const shown = pickerShown(undefined, fresh!);
    expect(shown).toEqual({
      key: newKey(0),
      choice: '',
      name: '',
      category: '',
      refusal: undefined,
    });
    const typing = { ...shown, choice: 'new', name: 'North Hi', category: 'Sub' };
    // Drawn anew (an answer of the worker, another edit): as it was being filled in.
    expect(pickerShown(typing, fresh!)).toBe(typing);
    // Another region's picker starts from what that region has.
    const [, , taken] = drafts({
      kind: 'add',
      key: newKey(1),
      outline: square(39.9, -80.1, 40, -80),
      channel: { create: 'North Hills' },
      description: 'Suburbs',
    });
    expect(pickerShown(typing, taken!)).toEqual({
      key: newKey(1),
      choice: 'new',
      name: 'North Hills',
      category: 'Suburbs',
      refusal: undefined,
    });
  });

  it('records no channel for a refused name, and says why in the picker', () => {
    const state = {
      key: newKey(0),
      choice: 'new',
      name: 'South',
      category: 'Suburbs',
      refusal: undefined,
    };
    const refused = pickerChange(state, null, DATA.channels, DATA.channels, LOADED);
    expect(refused.details).toBeUndefined();
    expect(refused.state).toEqual({ ...state, refusal: '#south exists: pick it from the list.' });
    const taken = pickerChange(
      { ...refused.state, name: ' North Hills ' },
      null,
      DATA.channels,
      DATA.channels,
      LOADED,
    );
    expect(taken.details).toEqual({ channel: { create: 'North Hills' }, description: 'Suburbs' });
    expect(taken.state.refusal).toBeUndefined();
    const listed = pickerChange(
      { ...state, choice: 'id:100000000000000006' },
      null,
      DATA.channels,
      DATA.channels,
      LOADED,
    );
    expect(listed.details).toEqual({
      channel: { id: '100000000000000006', name: 'north' },
      description: null,
    });
    // No name yet: no channel, the category kept for when it comes.
    expect(
      pickerChange({ ...state, name: ' ' }, null, DATA.channels, DATA.channels, LOADED).details,
    ).toEqual({ channel: null, description: 'Suburbs' });
  });

  it('takes back the channel staged before when a name typed after it is refused', () => {
    const state = {
      key: newKey(0),
      choice: 'new',
      name: 'South',
      category: 'Suburbs',
      refusal: undefined,
    };
    // "North Hills" was staged; the panel now shows "South", refused: nothing hidden stays staged.
    const refused = pickerChange(
      state,
      { create: 'North Hills' },
      DATA.channels,
      DATA.channels,
      LOADED,
    );
    expect(refused.state.refusal).toBe('#south exists: pick it from the list.');
    expect(refused.details).toEqual({ channel: null, description: 'Suburbs' });
    // So does one after a channel picked from the list.
    expect(
      pickerChange(
        state,
        { id: '100000000000000006', name: 'north' },
        DATA.channels,
        DATA.channels,
        LOADED,
      ).details,
    ).toEqual({ channel: null, description: 'Suburbs' });
  });

  it('saves only what it previewed', () => {
    const moved = drafts({
      kind: 'outline',
      key: regionKey(1),
      outline: square(40, -80.1, 40.1, -80.02),
      bases: {},
    });
    const previewed = saveBody(LOADED, moved);
    // The versions of the data are invented: every region is sent as changed.
    expect((JSON.parse(previewed) as SaveRequest).changes[0]).toEqual({
      regionId: 1,
      outline: points(square(40, -80.1, 40.1, -80.02)),
      version: 'AAAAAAAAAAAAAAAA',
    });
    expect(saveBody(LOADED, moved)).toBe(previewed);
    const movedAgain = drafts({
      kind: 'outline',
      key: regionKey(1),
      outline: square(40, -80.1, 40.1, -80.03),
      bases: {},
    });
    expect(saveBody(LOADED, movedAgain)).not.toBe(previewed);
  });

  it('tells an answer it can read from one whose outcome is not known', () => {
    const saved = { kind: 'saved', worded: { lines: ['Imported 1 region.'], lists: [] } };
    expect(readSaveAnswer(200, JSON.stringify(saved))).toEqual({ kind: 'answer', answer: saved });
    const conflicts = { kind: 'conflicts', conflicts: [] };
    expect(readSaveAnswer(409, JSON.stringify(conflicts))).toEqual({
      kind: 'answer',
      answer: conflicts,
    });
    // The regions changed between the check and the save: the page loads them and previews again.
    const stale = { kind: 'stale', line: 'The regions changed meanwhile: preview again.' };
    expect(readSaveAnswer(409, JSON.stringify(stale))).toEqual({ kind: 'answer', answer: stale });
    // Refused before anything was done: said as it is.
    expect(readSaveAnswer(429, '{"error":"Too many requests. Try again in a minute."}')).toEqual({
      kind: 'refused',
      text: 'Too many requests. Try again in a minute.',
    });
    // A failure on the way, or an answer cut off: what the server did is not known.
    expect(readSaveAnswer(500, '{"error":"Something went wrong."}')).toEqual({ kind: 'unknown' });
    expect(readSaveAnswer(502, '<html>Bad gateway</html>')).toEqual({ kind: 'unknown' });
    expect(readSaveAnswer(200, '{"kind":"saved","wor')).toEqual({ kind: 'unknown' });
    expect(readSaveAnswer(200, '{"kind":"exploded"}')).toEqual({ kind: 'unknown' });
  });

  it('says what to do when the regions cannot be loaded after an outcome it shows', () => {
    expect(reloadFailedLine('saved')).toBe('Reload the page to see the regions as saved.');
    expect(reloadFailedLine('conflicts')).toBe(
      'Reload the page to see the regions as they are now.',
    );
  });

  it('keeps staged edits per server and member, and names an export after the server', () => {
    expect(storageKey(DATA.guild.id, DATA.userId)).toBe(
      'pine-region-edits:412345678901234567:700000000000000001',
    );
    expect(exportFileName(DATA.guild)).toBe('Pinewood-Raids-regions.kml');
    expect(exportFileName({ id: '412345678901234567', name: '../???' })).toBe(
      '412345678901234567-regions.kml',
    );
  });

  // Plan 8M-10, C10: what the panel says beside what is drawn names no color; its swatch shows it.
  it('says the places in no region and theirs of a region beside their swatch', () => {
    expect(outsideLine(0, 0)).toBeUndefined();
    expect(outsideLine(2, 1)).toEqual({
      text: 'In no region: 2 gyms, 1 Wayspot.',
      swatch: 'outside',
    });
    expect(theirsLine('oakland')).toEqual({
      text: '#oakland: theirs is drawn dashed.',
      swatch: 'theirs',
    });
  });

  // Plan 8M-10, C12 (Matt's note d): the stretch is shown beside the Fix box, never under it.
  it('fits a stretch into the part of the map the Fix box leaves free', () => {
    // A box of 340 pixels at the top right of a map of 1,000: the stretch in the 600 left of it.
    expect(fixBoxPadding({ width: 340, height: 500 }, { x: 1000, y: 750 })).toEqual({
      topLeft: [40, 40],
      bottomRight: [396, 40],
    });
    // No box drawn yet: the old margins.
    expect(fixBoxPadding({ width: 0, height: 0 }, { x: 1000, y: 750 })).toEqual({
      topLeft: [40, 40],
      bottomRight: [40, 40],
    });
    // A narrow map keeps a third of its width for the stretch, the box over the rest.
    expect(fixBoxPadding({ width: 340, height: 500 }, { x: 450, y: 750 })).toEqual({
      topLeft: [40, 40],
      bottomRight: [260, 40],
    });
  });

  // Branch review W3 and re-review V3: the Fix box's redraws never drop the focus, and a new
  // question of Fix all is read out where the focus was in the box.
  it("puts the focus of the Fix box's redraws where the member goes on", () => {
    const facts = {
      wasShown: true,
      shown: true,
      inside: true,
      lost: true,
      sameTitle: true,
      sameButton: true,
      newQuestion: false,
    };
    // Redrawn with the focus on a button that is still there: it stays on it.
    expect(fixFocus(facts)).toBe('same-button');
    // Fix all's next question, under the same title and with the same buttons: its lead.
    expect(fixFocus({ ...facts, newQuestion: true })).toBe('question');
    // The first question, as the box shows: its lead too.
    expect(fixFocus({ ...facts, wasShown: false, inside: false, newQuestion: true })).toBe(
      'question',
    );
    // A new question while the member is elsewhere on the page: the focus is left there.
    expect(fixFocus({ ...facts, inside: false, lost: false, newQuestion: true })).toBe('keep');
    expect(fixFocus({ ...facts, inside: false, lost: false })).toBe('keep');
    // Shown, or another title: its title.
    expect(fixFocus({ ...facts, wasShown: false, inside: false })).toBe('title');
    expect(fixFocus({ ...facts, sameTitle: false })).toBe('title');
    expect(fixFocus({ ...facts, sameButton: false })).toBe('title');
    // Closed with the focus in it: the panel; closed while it was elsewhere: left there.
    expect(fixFocus({ ...facts, shown: false })).toBe('panel');
    expect(fixFocus({ ...facts, shown: false, inside: false, lost: false })).toBe('keep');
  });

  // Plan 8M-10, C11 (Matt's note c): a clean set of regions reads as clean.
  it('says "No overlaps or gaps." only after a check that went through and found none', () => {
    const through = { pieces: 0, overlaps: 0, checking: false, checkFailed: false, checked: true };
    expect(coverageSummary(through)).toEqual({ kind: 'none', text: NO_PIECES });
    expect(NO_PIECES).toBe('No overlaps or gaps.');
    // Being worked out, never worked out, or the check or its worker failed: nothing said.
    expect(coverageSummary({ ...through, checking: true })).toEqual({ kind: 'nothing' });
    expect(coverageSummary({ ...through, checked: false })).toEqual({ kind: 'nothing' });
    expect(coverageSummary({ ...through, checkFailed: true })).toEqual({ kind: 'nothing' });
    // Some found: their heading (the list as the last check found it, also while checking).
    expect(coverageSummary({ ...through, pieces: 3, overlaps: 1 })).toEqual({
      kind: 'list',
      text: 'Overlaps (1) and gaps (2)',
    });
    expect(coverageSummary({ ...through, pieces: 3, overlaps: 1, checking: true })).toEqual({
      kind: 'list',
      text: 'Overlaps (1) and gaps (2)',
    });
  });

  // Branch review W2: the live map could not be loaded, so it has no view of its own to hand on.
  it("starts at the live map's view, or fits its regions when the live map has none", () => {
    const live = { lat: 40.45, lon: -79.9, zoom: 15 };
    expect(firstView(live)).toEqual({ view: live, fitRegions: false });
    expect(firstView(undefined)).toEqual({ view: START_VIEW, fitRegions: true });
  });

  // Branch review W6: staged edits of one member are never saved as another.
  it('refuses a reopening once the account changed, and says to reload', () => {
    expect(reopenRefusal(undefined, DATA.userId)).toBeUndefined();
    expect(reopenRefusal(DATA.userId, DATA.userId)).toBeUndefined();
    expect(reopenRefusal(DATA.userId, '700000000000000002')).toBe(ACCOUNT_CHANGED);
    expect(ACCOUNT_CHANGED).toBe('You are logged in as someone else now: reload the page.');
  });
});

// Plan 8M-11C, S30: the editor's places by layer, clustered by the live map's clusterer.
describe("the editor's places", () => {
  const MORE: EditorData = {
    ...DATA,
    wayspots: [
      ['stop', 40.03, -80.05, 'Mural'],
      ['gym', 40.02, -80.02, 'Old fountain'],
      ['powerspot', 40.2, -80.0, 'Kiosk'],
      ['stop', 40.031, -80.051, 'Bench'],
    ],
  };

  it('are in a layer each, known by their place in the data, as the places in no region are', () => {
    const layers = placeLayers(MORE);
    expect(layers.gyms.map(({ id, name }) => [id, name])).toEqual([
      [0, 'Library'],
      [1, 'Bridge'],
      [2, 'Trailhead'],
    ]);
    expect(layers.stops.map(({ id, name }) => [id, name])).toEqual([
      [0, 'Mural'],
      [3, 'Bench'],
    ]);
    expect(layers.wayfarerGyms.map(({ id, name }) => [id, name])).toEqual([[1, 'Old fountain']]);
    expect(layers.powerspots.map(({ id, lat, lon }) => [id, lat, lon])).toEqual([[2, 40.2, -80.0]]);
  });

  it("warn on a cluster's ring when one of its places is in no region", () => {
    const view = { south: 39.9, west: -80.2, north: 40.3, east: -79.8 };
    const zoomedOut = [...wantedDots(placeLayers(MORE).stops, 12, view, undefined).values()];
    expect(zoomedOut).toHaveLength(1);
    const [cluster] = zoomedOut;
    if (cluster?.kind !== 'cluster') throw new Error('expected one cluster of both stops');
    expect(clusterWarns(cluster.points, new Set([3]))).toBe(true);
    expect(clusterWarns(cluster.points, new Set([1, 2]))).toBe(false);
    expect(clusterWarns(cluster.points, new Set())).toBe(false);
    // Zoomed in, each place on its own.
    const zoomedIn = [...wantedDots(placeLayers(MORE).stops, 16, view, undefined).values()];
    expect(zoomedIn.map((item) => item.kind)).toEqual(['dot', 'dot']);
  });
});

// Plan 8M-11C, S31: the editor's line under its tools.
describe("the editor's unsaved line", () => {
  it('counts the regions with unsaved changes, and says nothing without any', () => {
    expect(unsavedLine(0)).toBeUndefined();
    expect(unsavedLine(1)).toBe(
      '1 region has unsaved changes. It waits here until you save or undo it.',
    );
    expect(unsavedLine(3)).toBe(
      '3 regions have unsaved changes. They wait here until you save or undo them.',
    );
  });
});

// Plan 8M-11C, S32: a shared corner's deletion refused.
describe('a shared corner not deleted', () => {
  it('names the region that would be left without an area', () => {
    expect(notDeletedWords('#east')).toBe(
      'Not deleted: #east would have fewer than three corners.',
    );
  });
});

// Branch review BR-4: a reshape refused for lack of area says why.
describe('a reshape not staged', () => {
  it('names the region that would be left without an area', () => {
    expect(notChangedWords('#east')).toBe(
      'Not changed: #east would have fewer than three corners.',
    );
  });
});
