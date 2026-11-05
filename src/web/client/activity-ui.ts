import * as L from 'leaflet';
import type { ActivityModeName, ActivityView } from '../../domain/web/activity-data.js';
import {
  ACTIVITY_MODE_CHOICES,
  activityAddress,
  CANVAS_TOLERANCE,
  circleLook,
  historyStep,
  leftOutWords,
  MonthPlayer,
  nextAskWait,
  placeWords,
  sliderSteps,
  stepWords,
  todayStep,
  type ActivityChoice,
  type ActivitySpan,
} from './activity.js';
import { getJson } from './common.js';
import type { LayerRegistry } from './layer-registry.js';
import { ACTIVITY_PANE, ACTIVITY_PANE_Z } from './panes.js';
import { onThemeChange, theme } from './theme.js';

/*
 * The activity layer of the live map (plan 8H-4, design Part B), Leaflet's side: the places of
 * `/api/activity` as circles on a canvas of their own pane (`ACTIVITY_PANE`, under every dot and
 * marker), sized and filled by weight (`circleLook`) in the theme's `--activity`, a tap on one
 * showing its parties as text; and while the layer is on, a panel over the map (`.activity-panel`,
 * a Leaflet control at the top right, as the filters' line): the mode, History's slider (by month
 * or by year) and Play, and the parties left out. Asked again when the mode, the slider or the
 * server's hour changes (`changesInMs`, `nextAskWait`; a minute after a failed answer in Expected
 * now); nothing is polled. For members only: `main.ts` makes it
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

export function showActivity(map: L.Map, guild: string, registry: LayerRegistry): void {
  const pane = map.createPane(ACTIVITY_PANE);
  // Leaflet sets a pane's place by its style from the script (as the regions' names' pane).
  pane.style.zIndex = String(ACTIVITY_PANE_Z);
  // The tolerance makes the quietest circle a tap target of 32 pixels (review P6).
  const renderer = L.canvas({ pane: ACTIVITY_PANE, tolerance: CANVAS_TOLERANCE });
  const group = L.layerGroup();
  const circles: L.CircleMarker[] = [];
  let view: ActivityView | undefined;
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

  const inView = (): void => {
    if (!registry.isOn('activity')) return;
    const shown = map.getBounds();
    registry.setCount(
      'activity',
      circles.filter((circle) => shown.contains(circle.getLatLng())).length,
    );
  };

  const draw = (): void => {
    group.clearLayers();
    circles.length = 0;
    const shown = view;
    if (shown === undefined) return;
    const shownStep = step;
    const { colours } = theme();
    for (const place of shown.places) {
      const look = circleLook(place.weight);
      const circle = L.circleMarker([place.lat, place.lon], {
        renderer,
        ...look,
        stroke: false,
        fillColor: colours.activity,
      }).bindPopup(() => element('p', 'activity-popup', placeWords(shown, place, shownStep)));
      circle.addTo(group);
      circles.push(circle);
    }
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
      draw();
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
    }
  };
  registry.onChange((id, on) => {
    if (id === 'activity') turned(on);
  });
  map.on('moveend', inView);
  // The device changed between light and dark: the circles take the new set.
  onThemeChange(({ colours }) => {
    for (const circle of circles) circle.setStyle({ fillColor: colours.activity });
  });
  if (registry.isOn('activity')) turned(true);
}
