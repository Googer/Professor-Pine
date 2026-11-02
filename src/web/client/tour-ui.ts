import { renderNode } from './popup.js';
import {
  cardPlace,
  dimmedAround,
  holeOnScreen,
  nextStop,
  SAMPLE_MARKER,
  shownTarget,
  TourRun,
  unionOf,
  type Rect,
  type TourStep,
} from './tour.js';

/**
 * The map's walk-through on the page (plan 8M-17, `tour.ts`): four rectangles dim all but what a
 * step points at, a ring goes round it, and a card beside it holds the words, Back, Next and Skip
 * tour. Everything is placed from the script (the CSP lets no inline style into the HTML) and
 * placed anew whenever the page may have moved, the target looked up each time: a draw replaces
 * the markers and the layers' row, and a turned phone changes which control there is.
 */

export interface TourUi {
  /** Starts a tour, or starts it over; `after` takes the focus when it ends. */
  open(steps: readonly TourStep[], after?: HTMLElement): void;
  running(): boolean;
  /** The page may have moved: places the tour anew. */
  replace(): void;
}

/** What is open over the tour: it takes no keys then. */
const OVER_THE_TOUR = '.sheet-wrap:not([hidden]), .report-wrap:not([hidden])';

/** Whether nothing is open, typed or being said: the tour by itself takes no such moment. */
export function quietPage(filter: HTMLInputElement): boolean {
  const open = document.querySelector(
    `${OVER_THE_TOUR}, #notice:not([hidden]), details[open], .leaflet-popup, .party-card:not([hidden])`,
  );
  const body = document.body.classList;
  return (
    open === null &&
    !body.contains('list-open') &&
    !body.contains('search-open') &&
    filter.value === '' &&
    document.activeElement !== filter
  );
}

const rectOf = (element: Element): Rect => {
  const { left, top, width, height } = element.getBoundingClientRect();
  return { left, top, width, height };
};

/**
 * What a selector shows on the screen. Of the markers, the first wholly in the map's box, with
 * its time and count, which hang outside it: one panned out of sight is still in its pane.
 */
function rectsOf(selector: string): Rect[] {
  const elements = [...document.querySelectorAll(selector)];
  if (!selector.startsWith('#map ')) return elements.map(rectOf);
  const shown = document.querySelector('#map');
  if (shown === null) return [];
  const box = rectOf(shown);
  return elements
    .map((element) =>
      [...element.querySelectorAll('.badge, .going')].map(rectOf).reduce(unionOf, rectOf(element)),
    )
    .filter(
      (rect) =>
        rect.left >= box.left &&
        rect.top >= box.top &&
        rect.left + rect.width <= box.left + box.width &&
        rect.top + rect.height <= box.top + box.height,
    )
    .slice(0, 1);
}

const place = (element: HTMLElement, rect: Rect): void => {
  element.style.left = `${rect.left}px`;
  element.style.top = `${rect.top}px`;
  element.style.width = `${rect.width}px`;
  element.style.height = `${rect.height}px`;
};

/** Whether it can take the focus: what a closed `<details>` holds has a size, and cannot. */
const shows = (element: Element): boolean => element.checkVisibility();

export function tourUi(): TourUi {
  const root = document.createElement('div');
  root.className = 'tour';
  root.hidden = true;
  const dims = [0, 1, 2, 3].map(() => {
    const dim = document.createElement('div');
    dim.className = 'tour-dim';
    return dim;
  });
  const ring = document.createElement('div');
  ring.className = 'tour-ring';
  const card = document.createElement('div');
  card.className = 'tour-card';
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-labelledby', 'tour-heading');
  const heading = document.createElement('h2');
  heading.id = 'tour-heading';
  const body = document.createElement('div');
  body.className = 'tour-body';
  const count = document.createElement('span');
  count.className = 'tour-count';
  const button = (words: string, className: string): HTMLButtonElement => {
    const made = document.createElement('button');
    made.type = 'button';
    made.className = `press ${className}`;
    made.textContent = words;
    return made;
  };
  const skip = button('Skip tour', 'secondary tour-skip');
  const back = button('Back', 'secondary');
  const next = button('Next', 'primary');
  const foot = document.createElement('div');
  foot.className = 'tour-foot';
  foot.append(count, skip, back, next);
  card.append(heading, body, foot);
  root.append(...dims, ring, card);
  document.body.append(root);

  let run: TourRun | undefined;
  let after: HTMLElement | undefined;
  /** The words shown, so that placing anew leaves them, and a reader's scroll in them, alone. */
  let shownWords: readonly string[] | undefined;
  let shownStep: TourStep | undefined;

  const end = (): void => {
    run = undefined;
    root.hidden = true;
    for (const more of document.querySelectorAll<HTMLDetailsElement>('#layers .more[open]')) {
      more.open = false;
    }
    after?.focus();
    after = undefined;
  };

  const replace = (): void => {
    const step = run?.current();
    if (step === undefined || run === undefined) return;
    const found = shownTarget(step, rectsOf);
    const words = found?.target.words ?? step.words ?? shownWords ?? [];
    if (step !== shownStep || words !== shownWords) {
      shownStep = step;
      shownWords = words;
      heading.textContent = step.heading;
      body.replaceChildren(
        ...(step.sample === true ? [renderNode(SAMPLE_MARKER, document)] : []),
        ...words.map((line) => {
          const said = document.createElement('p');
          said.textContent = line;
          return said;
        }),
      );
    }
    const position = run.position();
    count.textContent = `${position.at} of ${position.of}`;
    back.hidden = position.first;
    skip.hidden = position.last;
    next.textContent = position.last ? 'Done' : 'Next';
    const screen = { width: window.innerWidth, height: window.innerHeight };
    const hole = found === undefined ? undefined : holeOnScreen(found.hole, screen);
    dimmedAround(hole, screen).forEach((rect, index) => {
      const dim = dims[index];
      if (dim === undefined) return;
      dim.hidden = false;
      place(dim, rect);
    });
    for (const dim of dims.slice(hole === undefined ? 1 : 4)) dim.hidden = true;
    ring.hidden = hole === undefined;
    if (hole !== undefined) place(ring, hole);
    // Presses reach what the step points at only where it says so.
    const through = step.pressable === true;
    ring.classList.toggle('through', through);
    // The controls under the hole stay in use on that step: not modal for a screen reader then.
    if (through) card.removeAttribute('aria-modal');
    else card.setAttribute('aria-modal', 'true');
    const at = cardPlace(hole, { width: card.offsetWidth, height: card.offsetHeight }, screen);
    card.style.left = `${at.left}px`;
    card.style.top = `${at.top}px`;
  };

  /** What Tab goes through: the card's buttons, and what is under the hole where it may be used. */
  const tabStops = (): HTMLElement[] => {
    const step = run?.current();
    const under =
      step?.pressable === true
        ? (shownTarget(step, rectsOf)?.target.selectors ?? []).flatMap((selector) =>
            [...document.querySelectorAll<HTMLElement>(selector)].flatMap((element) =>
              element.matches('button, summary')
                ? [element]
                : [...element.querySelectorAll<HTMLElement>('button, summary, input')],
            ),
          )
        : [];
    return [...new Set([...under, ...card.querySelectorAll<HTMLElement>('button')])].filter(shows);
  };

  const shown = (): void => {
    replace();
    next.focus();
  };

  skip.addEventListener('click', end);
  next.addEventListener('click', () => {
    if (run?.next()) shown();
    else end();
  });
  back.addEventListener('click', () => {
    run?.back();
    shown();
  });
  // Capturing: Escape and Tab are the tour's alone, not Report's or a popup's, unless a sheet is
  // open over it.
  document.addEventListener(
    'keydown',
    (event) => {
      if (run === undefined || document.querySelector(OVER_THE_TOUR) !== null) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        end();
      } else if (event.key === 'Tab') {
        event.preventDefault();
        event.stopPropagation();
        nextStop(tabStops(), document.activeElement, event.shiftKey)?.focus();
      }
    },
    true,
  );
  // More opening grows the hole: `toggle` does not bubble, so it is caught on its way down.
  for (const name of ['toggle', 'scroll']) document.addEventListener(name, replace, true);
  window.addEventListener('resize', replace);
  const watch = new ResizeObserver(replace);
  for (const id of ['header', 'content']) {
    const part = document.getElementById(id);
    if (part !== null) watch.observe(part);
  }

  return {
    open(steps, focusAfter) {
      after = focusAfter;
      shownStep = undefined;
      shownWords = undefined;
      run = new TourRun(
        steps,
        (step) => !step.required || shownTarget(step, rectsOf) !== undefined,
      );
      if (run.current() === undefined) {
        run = undefined;
        return;
      }
      root.hidden = false;
      shown();
    },
    running: () => run !== undefined,
    replace,
  };
}
