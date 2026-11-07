import { describe, expect, it } from 'vitest';
import type { MapRaid } from '../../domain/web/party-data.js';
import type { RaidMovesView, RaidOptionsView } from '../../domain/web/raid-options-data.js';
import type { Me } from './notice.js';
import { gymRaidsPopup, raidPopup, type PressSteps, type ShowContext } from './parties.js';
import type { MapGym, PageNode } from './popup.js';
import {
  changeBody,
  changeForm,
  changesAsked,
  FormHold,
  keepingFocus,
  type FormClaim,
  OpenPopup,
  raidAnswerOf,
  reportBody,
  reportBox,
  reportButton,
  reportClosesForm,
  reportForm,
  reportOffered,
  sendRaidForm,
  timeLabel,
} from './raid-forms.js';

const OPTIONS: RaidOptionsView = {
  zone: 'America/New_York',
  bosses: [
    { value: 'b:yveltal:T5:0', name: 'Yveltal', tier: 'Level 5 raid' },
    { value: 'b:onix:T1:0', name: 'Onix', tier: 'Level 1 raid' },
    { value: 'b:raikou:T5:0', name: 'Raikou', tier: 'Level 5 raid' },
  ],
  eggs: [
    { value: 'e:T1:0', tier: 'Level 1 raid' },
    { value: 'e:T5:0', tier: 'Level 5 raid' },
  ],
};

const MOVES: RaidMovesView = {
  boss: 'Yveltal',
  fast: [
    { id: 'SNARL_FAST', name: 'Snarl' },
    { id: 'GUST_FAST', name: 'Gust' },
  ],
  charged: [{ id: 'DARK_PULSE', name: 'Dark Pulse' }],
};

const gym = (regionIds: number[]): MapGym => ({
  id: 4,
  name: 'Veterans Memorial Bridge',
  nickname: null,
  lat: 40.05,
  lon: -80.01,
  regionIds,
  address: null,
  description: null,
  notice: null,
});

const REGIONS = new Map([
  [1, 'west'],
  [2, 'east'],
]);

const raid = (more: Partial<MapRaid> = {}): MapRaid => ({
  kind: 'raid',
  postKey: null,
  id: 'r1',
  gymId: 4,
  picture: null,
  tier: 'Level 5 raid',
  tierGroup: '5',
  heading: 'Level 5 raid',
  boss: null,
  stage: 'egg',
  hatchTime: null,
  endTime: null,
  link: 'https://discord.com/channels/1/2',
  place: null,
  mayChange: true,
  attendance: {
    groups: [{ id: 'A', interested: 1, coming: 0, present: 0 }],
    going: 0,
    mine: null,
    actions: [],
    remote: { offered: false, on: false },
    count: false,
  },
  ...more,
});

/** Every node of a tree, depth first. */
function all(node: PageNode): PageNode[] {
  return [node, ...(node.children ?? []).flatMap(all)];
}

const byName = (node: PageNode, name: string) =>
  all(node).find((one) => one.attributes?.name === name);
const optionsOf = (select: PageNode | undefined) =>
  all(select ?? { tag: 'none' })
    .filter((one) => one.tag === 'option')
    .map((one) => [one.attributes?.value, one.text]);

describe('the zone the raid forms read typed times in (review N4)', () => {
  const HINT = "Clock times are read in the server's zone (Eastern).";
  it('is named for a reader in another zone, in the report and the change forms', () => {
    expect(
      JSON.stringify(reportForm(gym([1]), OPTIONS, REGIONS, {}, 'America/Los_Angeles')),
    ).toContain(HINT);
    expect(JSON.stringify(changeForm(raid(), OPTIONS, MOVES, 'America/Los_Angeles'))).toContain(
      HINT,
    );
    expect(
      JSON.stringify(reportForm(gym([1]), OPTIONS, REGIONS, {}, 'America/New_York')),
    ).not.toContain(HINT);
    expect(JSON.stringify(changeForm(raid(), OPTIONS, MOVES))).not.toContain(HINT);
  });
});

describe('the form of a report (reportForm)', () => {
  it("offers the bosses by tier in /raid's order, then the eggs, nothing picked yet", () => {
    const form = reportForm(gym([1]), OPTIONS, REGIONS);
    expect(form.attributes).toMatchObject({ 'data-form': 'report', 'data-gym': '4' });
    expect(
      all(form)
        .filter((one) => one.tag === 'optgroup')
        .map((one) => one.attributes?.label),
    ).toEqual(['Level 5 raid', 'Level 1 raid', 'Eggs']);
    expect(optionsOf(byName(form, 'boss'))).toEqual([
      ['', 'Pick the boss or the egg'],
      ['b:yveltal:T5:0', 'Yveltal'],
      ['b:raikou:T5:0', 'Raikou'],
      ['b:onix:T1:0', 'Onix'],
      ['e:T1:0', 'Level 1 raid egg'],
      ['e:T5:0', 'Level 5 raid egg'],
    ]);
    expect(byName(form, 'time')?.attributes).toMatchObject({ maxlength: '40' });
    expect(byName(form, 'region')).toBeUndefined();
  });

  it('asks for the region of a gym that lies in several, and keeps what was filled in', () => {
    const form = reportForm(gym([1, 2]), OPTIONS, REGIONS, {
      boss: 'e:T5:0',
      time: '20',
      region: '2',
    });
    expect(optionsOf(byName(form, 'region'))).toEqual([
      ['', 'Pick the region'],
      ['1', 'west'],
      ['2', 'east'],
    ]);
    const selected = all(form).filter((one) => one.attributes?.selected !== undefined);
    expect(selected.map((one) => one.attributes?.value)).toEqual(['e:T5:0', '2']);
    expect(byName(form, 'time')?.attributes?.value).toBe('20');
  });

  it('names the time by what is picked: when an egg hatches, when a raid ends', () => {
    expect(timeLabel('e:T5:0')).toBe('Hatches in');
    expect(timeLabel('b:yveltal:T5:0')).toBe('Ends in');
    expect(timeLabel('')).toBe('Hatches in');
  });

  it('makes the body of a report, or says what is missing', () => {
    expect(reportBody(4, { boss: 'e:T5:0', time: ' 20 ', region: '' })).toEqual({
      body: { gym: 4, boss: 'e:T5:0', time: '20' },
    });
    expect(reportBody(4, { boss: 'b:yveltal:T5:0', time: '', region: '2' })).toEqual({
      body: { gym: 4, boss: 'b:yveltal:T5:0', region: 2 },
    });
    expect(reportBody(4, { boss: '', time: '20', region: '' })).toEqual({
      text: 'Pick the boss or the egg first.',
    });
  });

  it('is offered in the popup of a gym by a button that names the gym', () => {
    expect(reportButton(4)).toMatchObject({
      tag: 'button',
      text: 'Report raid',
      attributes: { type: 'button', 'data-report': '4' },
    });
  });

  it('is offered also in the popup of a gym that shows a raid, after its raids', () => {
    const context: ShowContext = { now: 0, zone: 'UTC', gym: () => gym([1]) };
    const popup = gymRaidsPopup(4, [raid()], context, [reportBox(4)]);
    const reports = all(popup).filter((one) => one.attributes?.['data-report'] !== undefined);
    expect(reports).toEqual([reportButton(4)]);
    expect(popup.children?.at(-1)).toEqual({
      tag: 'div',
      className: 'report-box place-control',
      children: [reportButton(4)],
    });
    const without = gymRaidsPopup(4, [raid()], context);
    expect(all(without).filter((one) => one.attributes?.['data-report'] !== undefined)).toEqual([]);
  });

  it('is offered as the list says at each draw: not while the parties are read-only', () => {
    // Before the first list, by what /api/me said at the load.
    expect(reportOffered(true, undefined)).toBe(true);
    expect(reportOffered(false, undefined)).toBe(false);
    // Discord could not be asked a while: the list is read-only, and "Report raid" goes.
    expect(reportOffered(true, { readOnly: true })).toBe(false);
    // Discord answers again: it comes back, also for a page loaded while it could not.
    expect(reportOffered(true, { readOnly: false })).toBe(true);
    expect(reportOffered(false, { readOnly: false })).toBe(true);
  });

  it('closes once the report went through, also when the answer names no raid to open', () => {
    expect(reportClosesForm({ ok: true })).toBe(true);
    expect(reportClosesForm({ ok: true, raid: { id: 'r1', gymId: 4 } })).toBe(true);
    // A raid already there: the form gives way to it.
    expect(reportClosesForm({ ok: false, raid: { id: 'r1', gymId: 4 } })).toBe(true);
    expect(reportClosesForm({ ok: false })).toBe(false);
  });
});

describe('a form open in a popup (FormHold)', () => {
  /** A popup as Leaflet's: `update()` asks its content function again. */
  class FakePopup<T> {
    node: T | undefined;
    constructor(private readonly content: () => T) {}
    update(): void {
      this.node = this.content();
    }
  }

  /** Work put off by `later`, run when the test says (after Leaflet's handling, in the page). */
  const putOff = () => {
    const queued: Array<() => void> = [];
    return {
      later: (run: () => void) => {
        queued.push(run);
      },
      run: () => {
        for (const run of queued.splice(0)) run();
      },
    };
  };

  /**
   * A hold over fakes: the lists drawn (with the popup a redraw would open again), the popup that
   * is open (`OpenPopup`, as Leaflet tells it), work put off, and the controls that open a form
   * turned off and on.
   */
  const holding = () => {
    const shown = new OpenPopup<FakePopup<{ n: number }>>();
    const after = putOff();
    const drawn: Array<{ view: string; reopen: string | undefined }> = [];
    const controls: boolean[] = [];
    const hold = new FormHold<string>({
      draw: (view) => drawn.push({ view, reopen: shown.key }),
      popup: () => shown.popup,
      later: after.later,
      controls: (on) => controls.push(on),
    });
    const views = () => drawn.map((one) => one.view);
    return { shown, after, drawn, views, controls, hold };
  };

  /** A form opened: its claim taken, its lists come, drawn, and its popup fitted to it. */
  const openForm = (hold: FormHold<string>, inPopup = true): FormClaim => {
    const claim = hold.take(inPopup);
    if (!claim || !hold.ready(claim, true)) throw new Error('the form did not open');
    hold.fit();
    return claim;
  };

  it('keeps the form in place when the popup is fitted to it, and draws what came meanwhile once the popup closes', () => {
    const { shown, after, views, hold } = holding();
    let count = 0;
    const popup = new FakePopup(hold.content(() => ({ n: ++count })));
    shown.opened(popup);
    popup.update();
    const opened = popup.node;
    expect(opened).toEqual({ n: 1 });
    // The form is drawn into the node; the popup is fitted to it, and asked again later.
    openForm(hold);
    expect(hold.editing).toBe(true);
    expect(popup.node).toBe(opened);
    popup.update();
    expect(popup.node).toBe(opened);
    // A list that came meanwhile waits for the form.
    hold.shown('second');
    expect(views()).toEqual([]);
    // The popup closed with the form in it: the list is drawn after Leaflet's handling, and the
    // next ones at once.
    shown.closed(popup);
    hold.popupClosed();
    expect(hold.editing).toBe(false);
    after.run();
    expect(views()).toEqual(['second']);
    hold.shown('third');
    expect(views()).toEqual(['second', 'third']);
    // Opened again: drawn anew.
    popup.update();
    expect(popup.node).toEqual({ n: 2 });
  });

  /**
   * A layer's popup that holds a form, as Leaflet opens it (the map's `popupopen`, then the
   * layer's), with a list waiting.
   */
  const heldInPopup = () => {
    const made = holding();
    const popup = new FakePopup(made.hold.content(() => ({ n: 1 })));
    made.shown.opened(popup);
    made.shown.openedAs('gym:1');
    popup.update();
    const claim = openForm(made.hold);
    made.hold.shown('second');
    return { ...made, popup, claim };
  };

  it('draws nothing while Leaflet closes a popup with a list waiting, and opens nothing again after it', () => {
    const { shown, after, drawn, hold, popup } = heldInPopup();
    // Closed: the map's `popupclose` first, then the layer's.
    shown.closed(popup);
    hold.popupClosed();
    expect(hold.editing).toBe(false);
    expect(drawn).toEqual([]);
    shown.closedAs('gym:1');
    after.run();
    expect(drawn).toEqual([{ view: 'second', reopen: undefined }]);
  });

  it('opens only the popup clicked after one holding a form, when the list is drawn', () => {
    const { shown, after, drawn, hold, popup } = heldInPopup();
    // Another marker clicked: Leaflet closes the first popup inside opening the second.
    shown.closed(popup);
    hold.popupClosed();
    expect(drawn).toEqual([]);
    shown.closedAs('gym:1');
    const other = new FakePopup(hold.content(() => ({ n: 2 })));
    shown.opened(other);
    shown.openedAs('gym:2');
    after.run();
    expect(drawn).toEqual([{ view: 'second', reopen: 'gym:2' }]);
    expect(shown.popup).toBe(other);
  });

  it('keeps what waits while a form is open again before the work put off runs', () => {
    const { shown, after, views, hold, popup } = heldInPopup();
    shown.closed(popup);
    hold.popupClosed();
    const again = openForm(hold);
    after.run();
    expect(views()).toEqual([]);
    hold.release(again);
    expect(views()).toEqual(['second']);
  });

  it('draws what came meanwhile once the form closes in a popup that stays open', () => {
    const { shown, after, views, hold } = holding();
    let count = 0;
    const popup = new FakePopup(hold.content(() => ({ n: ++count })));
    shown.opened(popup);
    popup.update();
    const claim = openForm(hold);
    hold.shown('second');
    hold.release(claim);
    expect(views()).toEqual(['second']);
    // Fitted to what it shows without the form: drawn anew.
    expect(popup.node).toEqual({ n: 2 });
    hold.popupClosed();
    after.run();
    expect(views()).toEqual(['second']);
  });

  it('opens one form at a time: the controls that open the others are off until it closes', () => {
    const { controls, hold } = holding();
    const first = hold.take(true);
    if (!first) throw new Error('no claim');
    expect(controls).toEqual([false]);
    // "Report raid" or "Manage…" clicked again meanwhile, in the popup or in the side panel.
    expect(hold.take(true)).toBeUndefined();
    expect(hold.take(false)).toBeUndefined();
    expect(hold.ready(first, true)).toBe(true);
    hold.release(first);
    expect(controls).toEqual([false, true]);
    expect(hold.editing).toBe(false);
    expect(hold.take(false)).toBeDefined();
  });

  it('never lets the late answer of a form whose popup closed close the form open now', () => {
    const { shown, after, views, controls, hold, popup, claim } = heldInPopup();
    shown.closed(popup);
    hold.popupClosed();
    expect(controls).toEqual([false, true]);
    after.run();
    expect(views()).toEqual(['second']);
    const now = openForm(hold);
    hold.shown('third');
    // The first form's answer comes: it closes nothing of the form open now.
    hold.release(claim);
    expect(hold.editing).toBe(true);
    expect(hold.holds(now)).toBe(true);
    expect(hold.holds(claim)).toBe(false);
    expect(controls).toEqual([false, true, false]);
    expect(views()).toEqual(['second']);
    hold.release(now);
    expect(views()).toEqual(['second', 'third']);
  });

  it('draws no form whose place left the page, or whose popup closed, while its lists were loading', () => {
    const { controls, hold } = holding();
    const gone = hold.take(true);
    if (!gone) throw new Error('no claim');
    expect(hold.ready(gone, false)).toBe(false);
    expect(hold.editing).toBe(false);
    expect(controls).toEqual([false, true]);
    const closed = hold.take(true);
    if (!closed) throw new Error('no claim');
    hold.popupClosed();
    expect(hold.ready(closed, true)).toBe(false);
    expect(hold.editing).toBe(false);
    expect(controls).toEqual([false, true, false, true]);
  });

  it('keeps a form of the side panel open when a popup closes', () => {
    const { after, views, hold } = holding();
    const claim = openForm(hold, false);
    hold.shown('second');
    hold.popupClosed();
    after.run();
    expect(hold.holds(claim)).toBe(true);
    expect(views()).toEqual([]);
    hold.release(claim);
    expect(views()).toEqual(['second']);
  });

  it("draws the list under a form of the trains' box, which a redraw keeps, and still opens no other form", () => {
    const { views, controls, hold } = holding();
    const claim = hold.take(false, true);
    if (!claim) throw new Error('no claim');
    hold.shown('second');
    expect(views()).toEqual(['second']);
    expect(hold.editing).toBe(true);
    expect(hold.take(true)).toBeUndefined();
    hold.release(claim);
    expect(views()).toEqual(['second']);
    expect(controls).toEqual([false, true]);
  });

  it('lets go the claim of a form outside a popup whenever its form went away (fix round 1)', () => {
    const { views, hold, controls } = holding();
    // A change form opened in a line of the list (no popup), whose place a redraw took away.
    let there = true;
    const claim = hold.take(false, false, () => there);
    if (!claim || !hold.ready(claim, true)) throw new Error('the form did not open');
    hold.shown('a list');
    expect(views()).toEqual([]);
    // Still there: nothing let go.
    hold.checkGone();
    expect(hold.editing).toBe(true);
    there = false;
    hold.checkGone();
    expect(hold.editing).toBe(false);
    expect(views()).toEqual(['a list']);
    expect(controls.at(-1)).toBe(true);
    // A new list also finds it gone, without a check of its own.
    let here = true;
    const again = hold.take(false, false, () => here);
    if (!again) throw new Error('no claim');
    here = false;
    hold.shown('another');
    expect(hold.editing).toBe(false);
    expect(views()).toEqual(['a list', 'another']);
  });

  // Branch review W1 of 8M-9B: the list drawn anew (the reports at stops changed, a layer toggled)
  // never takes the place of a newer list waiting under a form.
  it('draws the list it has anew, keeping a newer one that waits under a form', () => {
    const { views, hold } = holding();
    hold.redraw(() => 'first');
    expect(views()).toEqual(['first']);
    const claim = openForm(hold, false);
    hold.shown('second');
    hold.redraw(() => 'first');
    expect(views()).toEqual(['first']);
    hold.release(claim);
    expect(views()).toEqual(['first', 'second']);
    // Nothing waiting: the list it has is drawn once the form closes.
    const again = openForm(hold, false);
    hold.redraw(() => 'second');
    expect(views()).toEqual(['first', 'second']);
    hold.release(again);
    expect(views()).toEqual(['first', 'second', 'second']);
    // Under a form of the trains' box, which a redraw keeps: drawn now.
    const aside = hold.take(false, true);
    if (!aside) throw new Error('no claim');
    hold.redraw(() => 'second');
    expect(views()).toEqual(['first', 'second', 'second', 'second']);
  });

  // Re-review X1 of 8M-9B: a form gone from the page lets go inside the redraw, which draws the
  // newer list that waited; the list the page has is read after that, never the older one before.
  it('draws the newer list a gone form let go, not the older one it had before', () => {
    const drawn: string[] = [];
    let current = 'first';
    const hold = new FormHold<string>({
      draw: (view) => {
        current = view;
        drawn.push(view);
      },
      popup: () => undefined,
      later: (run) => {
        run();
      },
      controls: () => undefined,
    });
    hold.shown('first');
    // A Manage… form in a line of the list, whose line a redraw takes away later.
    let there = true;
    const claim = hold.take(false, false, () => there);
    if (!claim || !hold.ready(claim, true)) throw new Error('the form did not open');
    hold.shown('second');
    expect(drawn).toEqual(['first']);
    there = false;
    hold.redraw(() => current);
    expect(hold.editing).toBe(false);
    expect(drawn).toEqual(['first', 'second', 'second']);
    expect(current).toBe('second');
  });

  it("says when a form of the side pane's box holds, and tells each take and letting go (fix round 1)", () => {
    const told: boolean[] = [];
    const hold = new FormHold<string>({
      draw: () => undefined,
      popup: () => undefined,
      later: (run) => {
        run();
      },
      controls: () => undefined,
      changed: () => told.push(hold.asideHeld),
    });
    const claim = hold.take(false, true);
    if (!claim) throw new Error('no claim');
    expect(hold.asideHeld).toBe(true);
    hold.release(claim);
    // The list comes back over the pane once the form closes.
    expect(hold.asideHeld).toBe(false);
    expect(told).toEqual([true, false]);
  });
});

describe('keepingFocus (re-review, 4): what a popup fitted to its form takes out of the page', () => {
  /** A field that the page may blur, as taking it out and putting it back does. */
  const field = (connected = true) => {
    const made = {
      isConnected: connected,
      selectionStart: 3 as number | null,
      selectionEnd: 5 as number | null,
      focused: 0,
      caret: [] as (number | null)[][],
      focus() {
        this.focused += 1;
        page.activeElement = this as unknown as Element;
      },
      setSelectionRange(from: number, to: number) {
        this.caret.push([from, to]);
      },
    };
    return made;
  };
  const page: { activeElement: Element | null } = { activeElement: null };
  const has = (one: unknown) => {
    page.activeElement = one as Element;
  };

  it('puts the focus and the caret back on a field blurred by the update', () => {
    const typing = field();
    has(typing);
    keepingFocus(page, () => {
      page.activeElement = null;
    });
    expect(typing.focused).toBe(1);
    expect(page.activeElement).toBe(typing);
    expect(typing.caret).toEqual([[3, 5]]);
  });

  it('touches nothing when the focus stayed where it was, outside the popup', () => {
    const outside = field();
    has(outside);
    keepingFocus(page, () => undefined);
    expect(outside.focused).toBe(0);
    expect(outside.caret).toEqual([]);
  });

  it('leaves alone a control the update took away for good', () => {
    const removed = field();
    has(removed);
    keepingFocus(page, () => {
      removed.isConnected = false;
      page.activeElement = null;
    });
    expect(removed.focused).toBe(0);
    expect(page.activeElement).toBeNull();
  });

  it('sets no caret on what has none (a button, a select)', () => {
    const button = { ...field(), selectionStart: undefined, selectionEnd: undefined };
    has(button);
    keepingFocus(page, () => {
      page.activeElement = null;
    });
    expect(button.focused).toBe(1);
    expect(button.caret).toEqual([]);
  });

  it('does nothing with no focus at all', () => {
    page.activeElement = null;
    let ran = false;
    keepingFocus(page, () => {
      ran = true;
    });
    expect(ran).toBe(true);
    expect(page.activeElement).toBeNull();
  });
});

describe('the form of a change (changeForm)', () => {
  it('asks the hatch time, the end time, the boss and, when the boss is known, its moves, with one Submit', () => {
    const form = changeForm(raid(), OPTIONS, MOVES);
    expect(form.attributes).toMatchObject({ 'data-form': 'change', 'data-party': 'r1' });
    expect(
      all(form)
        .filter((one) => one.tag === 'button')
        .map((one) => one.text),
    ).toEqual(['Submit', 'Cancel']);
    for (const name of ['hatch', 'end', 'boss', 'quick', 'charge']) {
      expect(byName(form, name)).toBeDefined();
    }
    expect(optionsOf(byName(form, 'quick'))).toEqual([
      ['', 'Fast move: no change'],
      ['SNARL_FAST', 'Snarl'],
      ['GUST_FAST', 'Gust'],
    ]);
    expect(optionsOf(byName(form, 'charge'))).toEqual([
      ['', 'Charged move: no change'],
      ['DARK_PULSE', 'Dark Pulse'],
    ]);
    const noMoves = changeForm(raid(), OPTIONS, undefined);
    expect(byName(noMoves, 'quick')).toBeUndefined();
  });

  it("asks for what was filled in, never the moves with a boss: they are the old one's", () => {
    expect(changesAsked({ hatch: '', end: '', boss: '', quick: '', charge: '' })).toEqual([]);
    expect(
      changesAsked({ hatch: '20', end: '6:15pm', boss: 'e:T3:0', quick: 'SNARL_FAST', charge: '' }),
    ).toEqual([
      { change: 'boss', body: { boss: 'e:T3:0' } },
      { change: 'hatch', body: { time: '20' } },
      { change: 'end', body: { time: '6:15pm' } },
    ]);
    expect(
      changesAsked({ hatch: '20', end: '', boss: '', quick: 'SNARL_FAST', charge: '' }),
    ).toEqual([
      { change: 'hatch', body: { time: '20' } },
      { change: 'moves', body: { quick: 'SNARL_FAST' } },
    ]);
  });

  it("says where the new boss's moves are set, hidden until a boss is picked, only with moves", () => {
    const later = (form: PageNode) =>
      all(form).find((one) => one.className?.includes('moves-later'));
    expect(later(changeForm(raid(), OPTIONS, MOVES))).toMatchObject({
      text: "The new boss's moves are set in Manage… afterwards.",
      attributes: { hidden: '' },
    });
    expect(later(changeForm(raid(), OPTIONS, undefined))).toBeUndefined();
  });

  it('makes the body of each change, or says what is missing', () => {
    expect(changeBody('hatch', { hatch: ' 20 ' })).toEqual({ body: { time: '20' } });
    expect(changeBody('end', { end: '6:15pm' })).toEqual({ body: { time: '6:15pm' } });
    expect(changeBody('end', { end: '' })).toEqual({ text: 'Type the time first.' });
    expect(changeBody('boss', { boss: 'e:T3:0' })).toEqual({ body: { boss: 'e:T3:0' } });
    expect(changeBody('boss', { boss: '' })).toEqual({ text: 'Pick the boss or the egg first.' });
    expect(changeBody('moves', { quick: 'SNARL_FAST', charge: '' })).toEqual({
      body: { quick: 'SNARL_FAST' },
    });
    expect(changeBody('moves', { quick: '', charge: '' })).toEqual({
      text: 'Pick the fast move, the charged move, or both.',
    });
  });

  it('is offered in the popup of a raid the member may change, and only there', () => {
    const context: ShowContext = { now: 0, zone: 'UTC', gym: () => gym([1]) };
    const change = (shown: MapRaid) =>
      all(raidPopup(shown, context)).filter((one) => one.attributes?.['data-change-raid']);
    expect(change(raid())).toHaveLength(1);
    expect(change(raid({ mayChange: false }))).toEqual([]);
  });
});

describe('sending a raid form (sendRaidForm)', () => {
  const steps = (answers: Array<{ status: number; body: unknown }>, me?: Me): PressSteps => ({
    post: () => {
      const next = answers.shift();
      return next ? Promise.resolve(next) : Promise.reject(new Error('no answer'));
    },
    me: () => Promise.resolve(me ?? { loggedIn: false }),
  });

  it('gives the words and the raid to open; never regions (the form has them from /api/geo)', async () => {
    const raidView = raid({ id: 'r9', gymId: 7 });
    expect(
      await sendRaidForm(
        'token',
        steps([{ status: 200, body: { ok: true, text: 'Reported.', raid: raidView } }]),
      ),
    ).toEqual({ text: 'Reported.', csrf: 'token', ok: true, raid: { id: 'r9', gymId: 7 } });
    const several = await sendRaidForm(
      'token',
      steps([
        {
          status: 422,
          body: { ok: false, text: 'Pick one.', regions: [{ id: 1, name: 'west' }] },
        },
      ]),
    );
    expect(several).toEqual({ ok: false, text: 'Pick one.', csrf: 'token' });
  });

  it('tries once more with a new token after a 403, as a press does', async () => {
    const sent = await sendRaidForm(
      'old',
      steps(
        [
          { status: 403, body: { error: 'Forbidden' } },
          { status: 200, body: { ok: true, text: 'Done.' } },
        ],
        { loggedIn: true, name: 'Alice', member: true, csrf: 'new', readOnly: false },
      ),
    );
    expect(sent).toMatchObject({ text: 'Done.', csrf: 'new', ok: true });
  });

  it('reads what the server answered, and nothing else', () => {
    expect(raidAnswerOf({ ok: true, text: 'x', raid: { id: 5 } })).toEqual({ ok: true });
    expect(raidAnswerOf('nonsense')).toEqual({ ok: false });
    expect(raidAnswerOf({ ok: false, regions: [{ id: '1', name: 2 }] })).toEqual({ ok: false });
    expect(raidAnswerOf({ ok: false, regions: [{ id: 1, name: 'west' }] })).toEqual({ ok: false });
  });
});
