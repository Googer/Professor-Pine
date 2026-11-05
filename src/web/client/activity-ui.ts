import * as L from 'leaflet';
import type {
  ActivityModeName,
  ActivityPlaceView,
  ActivityView,
} from '../../domain/web/activity-data.js';
import {
  ACTIVITY_MODE_CHOICES,
  activityAddress,
  ActivityCounts,
  type AreaWords,
  CANVAS_TOLERANCE,
  historyStep,
  leftOutWords,
  MonthPlayer,
  nextAskWait,
  placeWords,
  sliderSteps,
  stepWords,
  tappablePlaces,
  todayStep,
  type ActivityChoice,
  type ActivitySpan,
} from './activity.js';
import { ActivityCircles, tapCircle } from './activity-circles.js';
import { getJson } from './common.js';
import { heatValue } from './heat.js';
import { HeatLayer } from './heat-layer.js';
import type { LayerRegistry } from './layer-registry.js';
import { ACTIVITY_PANE, ACTIVITY_PANE_Z, HEAT_PANE, HEAT_PANE_Z } from './panes.js';
import { onThemeChange, theme } from './theme.js';

/*
 * The activity layer of the live map (plan 8H-4, design Part B; its glow plan 8H-4H), Leaflet's
 * side: the places of `/api/activity` as a heat glow (`HeatLayer` over simpleheat, in a pane of
 * its own under every dot and marker, `HEAT_PANE`, its gradient the theme's `--heat-*`), and as
 * invisible circles on a canvas of their own pane over it (`ACTIVITY_PANE`; no fill and no
 * stroke, sized by weight, `tapRadius`) at street zoom where the place's own dot is not drawn
 * (`tappablePlaces`), a tap on one showing its parties as text; the counts in the gyms' and Power
 * Spots' popups and on the gyms' clusters (`ActivityShown`); and while the layer is on, a panel
 * over the map (`.activity-panel`, a Leaflet control at the top right, as the filters' line): the
 * mode, History's slider (by month or by year) and Play, and the parties left out. Asked again
 * when the mode, the slider or the server's hour changes (`changesInMs`, `nextAskWait`; a minute
 * after a failed answer in Expected now); nothing is polled. For members only: `main.ts` makes it
 * once `/api/me` says the visitor is one. Its pure part is `activity.ts`; this is tried at staging.
 */

/** Said in the panel when the activity could not be loaded. */
const LOAD_FAILED = 'The activity could not be loaded. Try again in a moment.';
/** Said in History while the server has no activity at all. */
const NO_HISTORY = 'No parties are recorded yet.';

const element = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] => {
  const made = document.createElement(tag);
  if (className !== undefined) made.className = className;
  if (text !== undefined) made.textContent = text;
  return made;
};

/**
 * What the layer gives the map's other popups (plan 8H-4H), from the answer it drew: a place's
 * line, and a gym cluster's sum on hover; nothing while the layer is off.
 */
export interface ActivityShown {
  /**
   * A gym's or a Power Spot's line for its popup ("Activity: 12 parties …"): always an element,
   * hidden while the layer is off or the glow does not draw the place, and kept to each answer
   * drawn while its popup is open.
   */
  line(kind: ActivityPlaceView['kind'], id: string): HTMLElement;
  /**
   * A gym cluster's parties ("≈ 140 parties in this area" seen, "about 140 …" spoken), by its
   * gyms' ids; none: nothing.
   */
  area(gymIds: readonly string[]): AreaWords | undefined;
  /** Whether the layer has counts now: an answer drawn, the layer on (review R4). */
  active(): boolean;
  /** Tells `listener` after each answer drawn, and when the layer is turned off (review R3). */
  onCounts(listener: () => void): void;
  /** Whether a place is being picked, or which dots are drawn, changed: the circles follow. */
  refresh(): void;
}

/** The class of a popup's activity line, by which the lines open are found to be kept current. */
const LINE_CLASS = 'activity-line';

/** How far round the view the invisible circles are drawn, in views (review P3). */
const CIRCLES_MARGIN = 0.5;

export function showActivity(
  map: L.Map,
  guild: string,
  registry: LayerRegistry,
  /**
   * Whether a place or a point is being picked (the Report button's step 2, a meetup's place,
   * research's stops, route mode): the circles take no tap meanwhile (review P4); `refresh` is
   * called when it changes. Left out: never.
   */
  picking: () => boolean = () => false,
  /**
   * Whether a place's own dot is drawn now (review 8H4H-3: a gym's dot, a Power Spot's of the
   * last answer), whose popup carries its count: no circle there; `refresh` is called when the
   * dots change. Left out: none.
   */
  drawn: (kind: ActivityPlaceView['kind'], id: string) => boolean = () => false,
): ActivityShown {
  const pane = map.createPane(ACTIVITY_PANE);
  // Leaflet sets a pane's place by its style from the script (as the regions' names' pane).
  pane.style.zIndex = String(ACTIVITY_PANE_Z);
  // The tolerance makes the quietest circle a tap target of 32 pixels (review P6).
  const renderer = L.canvas({ pane: ACTIVITY_PANE, tolerance: CANVAS_TOLERANCE });
  // The glow's pane under the circles' (plan 8H-4H), taking no taps: the circles' canvas over it
  // takes them.
  const heatPane = map.createPane(HEAT_PANE);
  heatPane.style.zIndex = String(HEAT_PANE_Z);
  heatPane.style.pointerEvents = 'none';
  const heat = new HeatLayer(HEAT_PANE, theme().heat);
  const group = L.layerGroup([heat]);
  /** A place's circle on the circles' canvas, its popup the words it is given as it opens. */
  const circles = new ActivityCircles((place, words) => {
    const circle = L.circleMarker([place.lat, place.lon], {
      renderer,
      stroke: false,
      fill: false,
    }).addTo(group);
    return tapCircle(
      circle,
      place,
      words,
      (text) => element('p', 'activity-popup', text),
      () => {
        group.removeLayer(circle);
      },
    );
  });
  let view: ActivityView | undefined;
  /** The counts of the answer drawn, while the layer is on (plan 8H-4H). */
  let counts: ActivityCounts | undefined;
  /** Who hears that the counts changed (review R3: the clusters' labels). */
  const countListeners: Array<() => void> = [];
  let mode: ActivityModeName = 'now';
  let span: ActivitySpan = 'month';
  /** History's step shown (`yyyy-mm`, or `yyyy` by year). */
  let step: string | undefined;
  /** The answer of the latest question only is drawn. */
  let asked = 0;
  let hourTimer: number | undefined;
  const player = new MonthPlayer({
    set: (run, ms) => window.setTimeout(run, ms),
    clear: (handle) => {
      window.clearTimeout(handle);
    },
  });

  // The panel.
  const panel = element('div', 'activity-panel');
  panel.setAttribute('role', 'group');
  panel.setAttribute('aria-label', 'Activity');
  panel.hidden = true;
  L.DomEvent.disableClickPropagation(panel);
  L.DomEvent.disableScrollPropagation(panel);
  const modeLabel = element('label', 'activity-mode');
  modeLabel.append(element('span', 'activity-title', 'Activity'));
  const modeMenu = element('select');
  for (const choice of ACTIVITY_MODE_CHOICES) {
    const option = element('option', undefined, choice.label);
    option.value = choice.value;
    modeMenu.append(option);
  }
  modeLabel.append(modeMenu);
  const history = element('div', 'activity-history');
  history.hidden = true;
  const spanMenu = element('select', 'activity-span');
  spanMenu.setAttribute('aria-label', 'Step by');
  for (const [value, label] of [
    ['month', 'By month'],
    ['year', 'By year'],
  ] as const) {
    const option = element('option', undefined, label);
    option.value = value;
    spanMenu.append(option);
  }
  const slider = element('input', 'activity-slider');
  slider.type = 'range';
  slider.min = '0';
  slider.step = '1';
  slider.setAttribute('aria-label', 'When');
  const stepLabel = element('span', 'activity-step');
  stepLabel.setAttribute('aria-live', 'polite');
  const play = element('button', 'press activity-play', 'Play');
  play.type = 'button';
  history.append(spanMenu, slider, stepLabel, play);
  const note = element('p', 'activity-note');
  note.hidden = true;
  panel.append(modeLabel, history, note);
  const control = new L.Control({ position: 'topright' });
  control.onAdd = () => panel;
  control.addTo(map);

  const steps = (): string[] => sliderSteps(view?.months ?? null, span);

  const choice = (): ActivityChoice | undefined => {
    if (mode !== 'history') return { mode };
    return step === undefined ? undefined : { mode, step };
  };

  const say = (text: string | undefined): void => {
    note.textContent = text ?? '';
    note.hidden = text === undefined;
  };

  /** The step in words beside the slider, and as the slider's own value for a screen reader (P9). */
  const sayStep = (): void => {
    const words = step === undefined ? '' : stepWords(step);
    stepLabel.textContent = words;
    slider.setAttribute('aria-valuetext', words);
  };

  /** History's slider and label as the step and the months stand. */
  const drawHistory = (): void => {
    history.hidden = mode !== 'history';
    if (mode !== 'history') return;
    const all = steps();
    slider.max = String(Math.max(0, all.length - 1));
    slider.disabled = all.length < 2;
    play.disabled = all.length < 2;
    const at = step === undefined ? -1 : all.indexOf(step);
    if (at >= 0) slider.value = String(at);
    sayStep();
    play.textContent = player.playing() ? 'Stop' : 'Play';
  };

  /** The layer's count in view: the places drawn on the glow within the map's bounds. */
  const inView = (): void => {
    if (!registry.isOn('activity')) return;
    const shown = map.getBounds();
    registry.setCount(
      'activity',
      (view?.places ?? []).filter((place) => shown.contains([place.lat, place.lon])).length,
    );
  };

  /** A popup's line as the counts stand: its words, hidden without any. */
  const fillLine = (line: HTMLElement): void => {
    const kind = line.dataset.activityKind === 'spot' ? 'spot' : 'gym';
    const words = counts?.line(kind, line.dataset.activityId ?? '');
    line.textContent = words ?? '';
    line.hidden = words === undefined;
  };
  /** The lines of the popups open, kept to the answer drawn (or hidden, the layer off). */
  const fillLines = (): void => {
    for (const line of map.getContainer().querySelectorAll<HTMLElement>(`.${LINE_CLASS}`)) {
      fillLine(line);
    }
  };

  /** History's step of the answer drawn, for its circles' popups. */
  let drawnStep: string | undefined;

  /**
   * The invisible circles as the zoom, the view and the dots stand (`tappablePlaces`, plan
   * 8H-4H): at street zoom, those of the places in the view and half a view round it whose own
   * dot is not drawn (review 8H4H-3), none while a place is picked; kept by place through a pan, a
   * zoom and a new answer (`ActivityCircles`, review P3).
   */
  const drawCircles = (): void => {
    const shown = view;
    if (shown === undefined || !registry.isOn('activity')) {
      circles.clear();
      return;
    }
    const near = map.getBounds().pad(CIRCLES_MARGIN);
    const tappable = tappablePlaces(
      shown.places,
      map.getZoom(),
      { drawn: (place) => drawn(place.kind, place.id), picking: picking() },
      {
        south: near.getSouth(),
        west: near.getWest(),
        north: near.getNorth(),
        east: near.getEast(),
      },
    );
    const shownStep = drawnStep;
    circles.show(tappable, (place) => placeWords(shown, place, shownStep));
  };

  /**
   * The answer drawn: the glow's places set at once (Play's step drawn in one go, no blink), the
   * popups' counts and the invisible circles with it, worded by `answerStep`, History's step the
   * answer is of (review 8H4H-4: the slider may have been dragged on since it was asked).
   */
  const draw = (answerStep: string | undefined): void => {
    const shown = view;
    heat.setPlaces(
      (shown?.places ?? []).map((place) => ({
        lat: place.lat,
        lon: place.lon,
        value: heatValue(place.weight),
      })),
    );
    drawnStep = answerStep;
    counts = shown === undefined ? undefined : new ActivityCounts(shown, drawnStep);
    fillLines();
    for (const listener of countListeners) listener();
    drawCircles();
    inView();
  };

  const clearHour = (): void => {
    if (hourTimer !== undefined) window.clearTimeout(hourTimer);
    hourTimer = undefined;
  };

  /**
   * Expected now asked again by itself (`nextAskWait`): by the server's count to its next hour
   * after a good answer (review P5), a minute after a failed one (8H4-2).
   */
  const scheduleHour = (answer: ActivityView | undefined): void => {
    clearHour();
    const wait = nextAskWait(mode, answer);
    if (wait === undefined || !registry.isOn('activity')) return;
    hourTimer = window.setTimeout(() => {
      hourTimer = undefined;
      void load();
    }, wait);
  };

  /**
   * Asks the server for what the panel shows and draws its answer: true once drawn, false when
   * it failed (the panel says so) or a later question took its place. History before any month is
   * known asks for this month by the page's clock (review P8), and moves to one the server has
   * once the answer brings the months.
   */
  async function load(): Promise<boolean> {
    if (!registry.isOn('activity')) return false;
    const guessed = mode === 'history' && step === undefined;
    const asking: ActivityChoice | undefined = guessed
      ? { mode: 'history', step: todayStep(Date.now(), span) }
      : choice();
    if (asking === undefined) return false;
    asked += 1;
    const mine = asked;
    try {
      const answer = await getJson<ActivityView>(activityAddress(guild, asking));
      if (mine !== asked) return false;
      view = answer;
      if (guessed && asking.mode === 'history') {
        const wanted = historyStep(answer.months, span, asking.step);
        step = wanted ?? asking.step;
        if (wanted !== undefined && wanted !== asking.step) return await load();
      }
      draw(asking.mode === 'history' ? asking.step : undefined);
      drawHistory();
      say(mode === 'history' && answer.months === null ? NO_HISTORY : leftOutWords(answer.leftOut));
      scheduleHour(answer);
      return true;
    } catch {
      if (mine !== asked) return false;
      say(LOAD_FAILED);
      scheduleHour(undefined);
      return false;
    }
  }

  modeMenu.addEventListener('change', () => {
    player.stop();
    mode = modeMenu.value as ActivityModeName;
    // Out of Expected now, its hourly question goes (review P5).
    if (mode !== 'now') clearHour();
    if (mode === 'history' && step === undefined && view?.months) {
      step = historyStep(view.months, span, todayStep(Date.now(), span));
    }
    drawHistory();
    void load();
  });
  spanMenu.addEventListener('change', () => {
    player.stop();
    const before = step;
    span = spanMenu.value === 'year' ? 'year' : 'month';
    const all = steps();
    // The same year, by month its last month shown; by year the year of the month.
    step =
      before === undefined
        ? all.at(-1)
        : span === 'year'
          ? before.slice(0, 4)
          : (all.filter((one) => one.startsWith(before)).at(-1) ?? all.at(-1));
    drawHistory();
    void load();
  });
  // The label follows the slider as it is dragged; the map once it is let go.
  slider.addEventListener('input', () => {
    player.stop();
    step = steps()[Number(slider.value)] ?? step;
    sayStep();
  });
  slider.addEventListener('change', () => {
    void load();
  });
  play.addEventListener('click', () => {
    if (player.playing()) {
      player.stop();
      return;
    }
    if (step === undefined) return;
    player.play(steps(), step, {
      // The next step a second after this one's answer is drawn; a failure stops Play, its line
      // said by `load` (review P1).
      step: (at) => {
        step = at;
        drawHistory();
        return load();
      },
      ended: () => {
        play.textContent = 'Play';
        // Each step is said again once Play stops, not a month a second while it runs (P9).
        stepLabel.setAttribute('aria-live', 'polite');
      },
    });
    play.textContent = 'Stop';
    stepLabel.setAttribute('aria-live', 'off');
  });
  // Any other press stops Play (the design: it steps until the end or another press).
  const otherPress = (event: Event): void => {
    if (!player.playing()) return;
    if (event.target instanceof Node && play.contains(event.target)) return;
    player.stop();
  };
  document.addEventListener('pointerdown', otherPress, true);
  document.addEventListener('keydown', otherPress, true);

  const turned = (on: boolean): void => {
    panel.hidden = !on;
    if (on) {
      group.addTo(map);
      void load();
    } else {
      player.stop();
      group.remove();
      clearHour();
      // Nothing of the last answer stays drawn, nor comes late (review P5): turned on again, the
      // layer shows only what its new question brings, and nothing where that fails.
      asked += 1;
      view = undefined;
      draw(undefined);
    }
  };
  registry.onChange((id, on) => {
    // The Gyms or Power Spots layer turned: their dots, drawn anew, call `refresh` (8H4H-3).
    if (id === 'activity') turned(on);
  });
  map.on('moveend', inView);
  // The circles follow the view and the zoom: kept where still wanted, from street zoom only.
  map.on('moveend', drawCircles);
  // A double-click on the glow zooms the map (the circle's dblclick bubbles to it, Leaflet's
  // `DoubleClickZoom`), and closes the count its first click opened (review 8H4H-6).
  map.on('dblclick', () => {
    circles.close();
  });
  // The page turned light or dark: the glow takes the new gradient.
  onThemeChange((changed) => {
    heat.setStops(changed.heat);
  });
  if (registry.isOn('activity')) turned(true);
  return {
    line: (kind, id) => {
      const line = element('p', LINE_CLASS);
      line.dataset.activityKind = kind;
      line.dataset.activityId = id;
      fillLine(line);
      return line;
    },
    area: (gymIds) => counts?.area(gymIds),
    active: () => counts !== undefined,
    onCounts: (listener) => {
      countListeners.push(listener);
    },
    refresh: drawCircles,
  };
}
