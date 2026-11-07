import type { LayerRegistry, LayerSpec } from './layer-registry.js';
import { rowFits, rowRoom } from './row-fit.js';

/**
 * The layer controls of the live map (plan 8M-7), over the registry: on the desktop a row in the
 * header with the layers as labelled toggles, as many as fit in `MAP_LAYERS`' order, and the rest
 * under "More" (Matt, 2026-11-07, `row-fit.ts`); narrower
 * than 1024 pixels (`map.css`; 768 until plan 8M-9B's two toggles, B7) a "Layers · n" button (n
 * the layers on) that opens a bottom sheet listing every layer with a switch, a line about it and
 * how many of its things are in view. Both follow the registry, so a toggle anywhere shows everywhere. A layer of members
 * only (PokéStops, Power Spots) is offered once `/api/me` says the visitor is one (`refresh`).
 */
export interface LayerControls {
  /** Draws the controls anew: who asks, or which layers are offered, changed. */
  refresh(member: boolean): void;
  /**
   * A layer's filter in words, or none (plan 8M-9B, goal 5): its toggle marked and named with it,
   * its row in the sheet saying it.
   */
  filtered(id: string, words: string | undefined): void;
}

/** "Layers · 3". */
export function layersButtonLabel(on: number): string {
  return `Layers · ${on}`;
}

/** "4 in view", or nothing before the layer said. */
export function inViewWords(count: number | undefined): string {
  return count === undefined ? '' : `${count} in view`;
}

/** A live layer's words on the desktop's toggle: its short words where it has them (B7). */
export function chipLabel(spec: LayerSpec): string {
  return spec.short ?? spec.name;
}

/**
 * A toggle's whole name, its title and its name for a screen reader: the layer's name, and the
 * filter on it where one is (plan 8M-9B, goal 5: "Field research · Rare Candy").
 */
export function toggleName(spec: LayerSpec, filter: string | undefined): string {
  return filter === undefined ? spec.name : `${spec.name} · ${filter}`;
}

/** A layer's switch is named by its layer, for a screen reader (fix round 1). */
export function switchLabel(spec: LayerSpec): string {
  return spec.name;
}

/** Whether the desktop's "More" closes: on Escape, and on a click outside it. */
export function moreCloses(event: { key?: string; clickInside?: boolean }): boolean {
  if (event.key !== undefined) return event.key === 'Escape';
  return event.clickInside === false;
}

/** What `SheetFocus` needs of an element: to take the focus. */
interface Focusable {
  focus(): void;
}

/**
 * The phone's sheet of layers as a dialog for the keyboard (fix round 1): opening it moves the
 * focus into it (its first switch), Escape closes it, and closing gives the focus back to what
 * opened it (the "Layers · n" button). While it is open, Tab and Shift+Tab stay inside it (review
 * fix 9: it says `aria-modal`): from its last control to its first and back, and from anywhere
 * outside it to its first or last.
 */
export class SheetFocus {
  private opener: Focusable | undefined;

  constructor(
    private readonly sheet: { hidden: boolean | string },
    /** The sheet's controls that take the focus, in their order. */
    private readonly controls: () => readonly Focusable[],
  ) {}

  open(opener: Focusable): void {
    this.opener = opener;
    this.sheet.hidden = false;
    this.controls()[0]?.focus();
  }

  close(): void {
    if (this.sheet.hidden === true) return;
    this.sheet.hidden = true;
    this.opener?.focus();
    this.opener = undefined;
  }

  /**
   * A key pressed anywhere, with Shift or not and the focus where it is: true when the sheet took
   * it (Escape, or a Tab it kept inside, while it is open), and the page lets the browser do
   * nothing more with it.
   */
  key(key: string, shift = false, active: unknown = null): boolean {
    if (this.sheet.hidden === true) return false;
    if (key === 'Escape') {
      this.close();
      return true;
    }
    if (key !== 'Tab') return false;
    const controls = this.controls();
    const first = controls[0];
    const last = controls.at(-1);
    if (first === undefined || last === undefined) return false;
    const at = controls.indexOf(active as Focusable);
    if (at < 0) (shift ? last : first).focus();
    else if (shift && active === first) last.focus();
    else if (!shift && active === last) first.focus();
    else return false;
    return true;
  }
}

export function showLayerControls(registry: LayerRegistry, nav: HTMLElement): LayerControls {
  let member = false;
  /** The filters on, by layer, in words (plan 8M-9B). */
  const filters = new Map<string, string>();
  /**
   * A toggle's whole name and mark: its full name where the row shows it short (B7), and its
   * filter where one is on (goal 5), for the pointer and a screen reader; marked while filtered.
   */
  const named = (button: HTMLElement, spec: LayerSpec): void => {
    const filter = filters.get(spec.id);
    const whole = toggleName(spec, filter);
    button.classList.toggle('filtered', filter !== undefined);
    if (whole === chipLabel(spec)) {
      button.removeAttribute('title');
      button.removeAttribute('aria-label');
    } else {
      button.title = whole;
      button.setAttribute('aria-label', whole);
    }
  };
  const sheet = document.createElement('div');
  sheet.className = 'sheet-wrap';
  sheet.hidden = true;
  document.body.append(sheet);

  const toggle = (id: string, on: boolean): void => {
    registry.set(id, on);
  };

  const chip = (spec: LayerSpec): HTMLButtonElement => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'chip';
    button.dataset.layer = spec.id;
    const dot = document.createElement('span');
    dot.className = 'dot';
    const name = document.createElement('span');
    name.textContent = chipLabel(spec);
    button.append(dot, name);
    named(button, spec);
    button.addEventListener('click', () => {
      toggle(spec.id, !registry.isOn(spec.id));
    });
    return button;
  };

  const checkbox = (spec: LayerSpec, role?: 'switch'): HTMLInputElement => {
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.dataset.layer = spec.id;
    if (role) input.setAttribute('role', role);
    // Named by its layer, for a screen reader (not only on or off).
    input.setAttribute('aria-label', switchLabel(spec));
    input.addEventListener('change', () => {
      toggle(spec.id, input.checked);
    });
    return input;
  };

  const sync = (): void => {
    for (const element of document.querySelectorAll<HTMLElement>('[data-layer]')) {
      const id = element.dataset.layer ?? '';
      const on = registry.isOn(id);
      if (element instanceof HTMLInputElement) element.checked = on;
      else element.setAttribute('aria-pressed', String(on));
    }
    for (const button of nav.querySelectorAll<HTMLElement>('.layers-button')) {
      button.textContent = layersButtonLabel(registry.countOn(member));
    }
  };

  const counted = (): void => {
    for (const line of sheet.querySelectorAll<HTMLElement>('[data-count]')) {
      line.textContent = inViewWords(registry.count(line.dataset.count ?? ''));
    }
  };

  /**
   * The row's toggles that fit, the rest under More (Matt, 2026-11-07): every offered layer has a
   * toggle in the row and a checkbox under More, and the measure shows one of the two. A toggle
   * moved while it has the focus hands it to its other self, or to More while that is closed.
   */
  const fit = (): void => {
    const chips = nav.querySelector<HTMLElement>('.chips');
    const more = nav.querySelector<HTMLDetailsElement>('.more');
    const phone = nav.querySelector<HTMLElement>('.layers-button');
    const header = nav.parentElement;
    if (!chips || !more || !phone || !header) return;
    // Below 1024 pixels "Layers · n" stands for the row, and while the region editor is on the
    // row is not shown (the row's own parts may be `hidden` by the last measure).
    if (getComputedStyle(phone).display !== 'none' || nav.getClientRects().length === 0) return;
    const toggles = [...chips.querySelectorAll<HTMLElement>('.chip')];
    const boxes = [...more.querySelectorAll<HTMLElement>('label[data-entry]')];
    const focused = document.activeElement;
    // Everything shown to be measured; nothing is painted before the outcome is set.
    chips.hidden = false;
    more.hidden = false;
    for (const toggle of toggles) toggle.hidden = false;
    const style = getComputedStyle(header);
    const others = [...header.children]
      .filter((child) => child !== nav && child.getClientRects().length > 0)
      .map((child) => {
        // "Find a gym" gives way down to its own width (`map.css`).
        const basis = child.id === 'filter' ? parseFloat(getComputedStyle(child).flexBasis) : NaN;
        return Number.isFinite(basis) ? basis : child.getBoundingClientRect().width;
      });
    const shown = rowFits({
      room: rowRoom(
        header.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight),
        others,
        parseFloat(style.columnGap) || 0,
      ),
      chips: toggles.map((toggle) => toggle.getBoundingClientRect().width),
      more: more.getBoundingClientRect().width,
      gap: parseFloat(getComputedStyle(nav).columnGap) || 0,
    });
    toggles.forEach((toggle, at) => {
      toggle.hidden = at >= shown;
    });
    boxes.forEach((box, at) => {
      box.hidden = at < shown;
    });
    chips.hidden = shown === 0;
    more.hidden = shown === toggles.length;
    if (more.hidden) more.open = false;
    // The focus follows a toggle that moved.
    if (
      focused instanceof HTMLElement &&
      nav.contains(focused) &&
      focused.dataset.layer !== undefined
    ) {
      if (focused.closest('[hidden]') === null) return;
      const other = [...nav.querySelectorAll<HTMLElement>('[data-layer]')].find(
        (one) => one.dataset.layer === focused.dataset.layer && one.closest('[hidden]') === null,
      );
      if (other && (other.closest('details') === null || more.open)) other.focus();
      else more.querySelector('summary')?.focus();
    }
  };
  let fitting: number | undefined;
  /** One measure a frame, however many sizes changed in it. */
  const fitSoon = (): void => {
    if (fitting !== undefined) return;
    fitting = requestAnimationFrame(() => {
      fitting = undefined;
      fit();
    });
  };

  const draw = (): void => {
    const offered = registry.layers().filter((spec) => registry.offered(spec, member));
    const chips = document.createElement('span');
    chips.className = 'chips';
    chips.append(...offered.map(chip));
    const more = document.createElement('details');
    more.className = 'more';
    const summary = document.createElement('summary');
    summary.textContent = 'More';
    const menu = document.createElement('div');
    menu.className = 'menu';
    for (const spec of offered) {
      const label = document.createElement('label');
      label.dataset.entry = spec.id;
      const name = document.createElement('span');
      name.className = 'entry-name';
      name.textContent = toggleName(spec, filters.get(spec.id));
      const box = checkbox(spec);
      // Its words, the filter's too, as the row's toggle is named.
      box.removeAttribute('aria-label');
      label.append(box, name);
      menu.append(label);
    }
    more.append(summary, menu);
    const phone = document.createElement('button');
    phone.type = 'button';
    phone.className = 'layers-button';
    phone.setAttribute('aria-haspopup', 'dialog');
    phone.addEventListener('click', () => {
      focus.open(phone);
    });
    nav.replaceChildren(chips, more, phone);

    const scrim = document.createElement('div');
    scrim.className = 'scrim';
    scrim.addEventListener('click', () => {
      focus.close();
    });
    const panel = document.createElement('div');
    panel.className = 'sheet';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Layers');
    panel.setAttribute('aria-modal', 'true');
    const heading = document.createElement('h2');
    heading.textContent = 'Layers';
    panel.append(heading);
    for (const spec of offered) {
      const row = document.createElement('label');
      row.className = 'sheet-row';
      row.dataset.kind = spec.id;
      const words = document.createElement('span');
      words.className = 'words';
      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = spec.name;
      const small = document.createElement('small');
      small.textContent = spec.hint ?? '';
      const count = document.createElement('small');
      count.dataset.count = spec.id;
      // Its filter, while one is on (plan 8M-9B).
      const filter = document.createElement('small');
      filter.className = 'filter-note';
      filter.dataset.filterNote = spec.id;
      const said = filters.get(spec.id);
      filter.textContent = said === undefined ? '' : `Filter: ${said}`;
      filter.hidden = said === undefined;
      words.append(name, ...(spec.hint ? [small] : []), filter, count);
      row.append(words, checkbox(spec, 'switch'));
      panel.append(row);
    }
    const done = document.createElement('button');
    done.type = 'button';
    done.className = 'press primary sheet-done';
    done.textContent = 'Done';
    done.addEventListener('click', () => {
      focus.close();
    });
    panel.append(done);
    sheet.replaceChildren(scrim, panel);
    sync();
    counted();
    fit();
  };

  const focus = new SheetFocus(sheet, () => [
    ...sheet.querySelectorAll<HTMLElement>('input, button'),
  ]);
  document.addEventListener('keydown', (event) => {
    if (focus.key(event.key, event.shiftKey, document.activeElement)) {
      event.preventDefault();
      return;
    }
    const more = nav.querySelector('details');
    if (more?.open && moreCloses({ key: event.key })) more.open = false;
  });
  document.addEventListener('click', (event) => {
    const more = nav.querySelector('details');
    const inside = event.target instanceof Node && more?.contains(event.target) === true;
    if (more?.open && moreCloses({ clickInside: inside })) more.open = false;
  });
  registry.onChange(sync);
  registry.onCount(counted);
  // Measured anew when the header or a control beside the row changes its size: the window, the
  // account once `/api/me` answered, Report shown, the title's font loaded, the editor closed.
  const header = nav.parentElement;
  if (header && typeof ResizeObserver === 'function') {
    const sizes = new ResizeObserver(fitSoon);
    sizes.observe(header);
    for (const child of header.children) if (child !== nav) sizes.observe(child);
  }
  draw();
  return {
    refresh(next) {
      member = next;
      draw();
    },
    filtered(id, words) {
      if (filters.get(id) === words) return;
      if (words === undefined) filters.delete(id);
      else filters.set(id, words);
      const spec = registry.layers().find((one) => one.id === id);
      for (const button of nav.querySelectorAll<HTMLElement>(`.chip[data-layer="${id}"]`)) {
        if (spec) named(button, spec);
      }
      for (const name of nav.querySelectorAll<HTMLElement>(
        `label[data-entry="${id}"] .entry-name`,
      )) {
        if (spec) name.textContent = toggleName(spec, words);
      }
      for (const note of sheet.querySelectorAll<HTMLElement>(`[data-filter-note="${id}"]`)) {
        note.textContent = words === undefined ? '' : `Filter: ${words}`;
        note.hidden = words === undefined;
      }
    },
  };
}
