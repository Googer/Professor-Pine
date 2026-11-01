import { describe, expect, it } from 'vitest';
import { RouteFocus } from './route-focus.js';

/** A dot of the map: its listeners, whether it is on the map, and its element's attributes. */
function dot() {
  const listeners = new Map<string, Array<() => void>>();
  const attributes = new Map<string, string>();
  let onMap = false;
  const made = {
    attributes,
    on(type: 'add' | 'remove', listener: () => void) {
      listeners.set(type, [...(listeners.get(type) ?? []), listener]);
      return made;
    },
    getElement() {
      return onMap
        ? {
            setAttribute: (name: string, value: string) => {
              attributes.set(name, value);
            },
            removeAttribute: (name: string) => {
              attributes.delete(name);
            },
          }
        : undefined;
    },
    /** Leaflet puts it on the map, or takes it off. */
    add() {
      onMap = true;
      for (const listener of listeners.get('add') ?? []) listener();
    },
    remove() {
      for (const listener of listeners.get('remove') ?? []) listener();
      onMap = false;
    },
  };
  return made;
}

const STOP = { tabindex: '0', role: 'button', 'aria-label': 'Lake Gazebo' };

// Re-review N1 of 8M-8C: dots are Tab stops in route mode only.
describe('the dots to add as stops (RouteFocus)', () => {
  it('makes the dots on the map Tab stops while route mode is on, and none before or after', () => {
    const focus = new RouteFocus();
    const lake = dot();
    focus.watch(lake, 'Lake Gazebo');
    lake.add();
    expect(Object.fromEntries(lake.attributes)).toEqual({});
    focus.set(true);
    expect(Object.fromEntries(lake.attributes)).toEqual(STOP);
    focus.set(false);
    expect(Object.fromEntries(lake.attributes)).toEqual({});
  });

  it('makes a dot drawn during route mode a Tab stop at once, and forgets one taken off the map', () => {
    const focus = new RouteFocus();
    focus.set(true);
    const lake = dot();
    focus.watch(lake, 'Lake Gazebo');
    lake.add();
    expect(Object.fromEntries(lake.attributes)).toEqual(STOP);
    lake.remove();
    focus.set(false);
    // Taken off while route mode was on: nothing of it is asked any more.
    expect(Object.fromEntries(lake.attributes)).toEqual(STOP);
  });
});
