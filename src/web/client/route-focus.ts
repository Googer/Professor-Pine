/*
 * The dots a member adds as stops in route mode, gyms and Power Spots, as Tab stops only while
 * route mode is on (plan 8M-8C, re-review N1): there Enter on a focused dot adds it (`gymClicks`);
 * outside it hundreds of dots before the side pane would stand in the keyboard's way.
 */

/** What `RouteFocus` asks of a dot: Leaflet's events of a layer and its element on the map. */
export interface FocusableDot {
  on(type: 'add' | 'remove', listener: () => void): unknown;
  getElement(): Pick<Element, 'setAttribute' | 'removeAttribute'> | undefined;
}

/**
 * The dots that are stops to add, and whether route mode is on (`set`): each dot on the map
 * then has `tabindex="0"`, `role="button"` and its name as `aria-label`, and none of them
 * otherwise; a dot added to the map takes the state as it is, and one taken off is forgotten.
 */
export class RouteFocus {
  private on = false;
  private readonly dots = new Map<FocusableDot, string>();

  /** Keeps the dot `dot`, named `name`, in step with route mode while it is on the map. */
  watch(dot: FocusableDot, name: string): void {
    dot.on('add', () => {
      this.dots.set(dot, name);
      this.apply(dot, name);
    });
    dot.on('remove', () => {
      this.dots.delete(dot);
    });
  }

  /** Route mode began (true) or ended (false). */
  set(on: boolean): void {
    this.on = on;
    for (const [dot, name] of this.dots) this.apply(dot, name);
  }

  private apply(dot: FocusableDot, name: string): void {
    const element = dot.getElement();
    if (!element) return;
    if (this.on) {
      element.setAttribute('tabindex', '0');
      element.setAttribute('role', 'button');
      element.setAttribute('aria-label', name);
    } else {
      element.removeAttribute('tabindex');
      element.removeAttribute('role');
      element.removeAttribute('aria-label');
    }
  }
}
