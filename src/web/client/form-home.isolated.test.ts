import { afterEach, describe, expect, it, vi } from 'vitest';
import { FakeElement, focused, make, resetFocus } from '../../../test/support/fake-page.js';
import { formHome } from './form-home.js';

// The page's helpers this comes in with load Leaflet, which reads the browser's `window` as it
// loads; none of it is used here. Isolated: a mocked module needs a module graph of its own.
vi.mock('leaflet', () => ({}));

function fixture() {
  const body = make('body');
  body.page = true;
  const popup = make('div');
  popup.className = 'leaflet-popup';
  const box = make('div');
  const control = make('button');
  box.append(control);
  popup.append(box);
  const tools = make('div');
  const idle = make('button');
  tools.append(idle);
  body.append(popup, tools);
  vi.stubGlobal('HTMLElement', FakeElement);
  const takes: unknown[][] = [];
  const released: unknown[] = [];
  let holder: unknown;
  const hold = {
    take: (...args: unknown[]) => {
      if (holder !== undefined) return undefined;
      takes.push(args);
      holder = {};
      return holder as never;
    },
    holds: (claim: unknown) => claim === holder,
    release: (claim: unknown) => {
      released.push(claim);
      if (claim === holder) holder = undefined;
    },
    fit: vi.fn(),
  };
  const closePopup = vi.fn();
  const deps = {
    tools: tools as unknown as HTMLElement,
    hold,
    closePopup,
    idle: () => {
      tools.replaceChildren(idle);
    },
  };
  const anchored = {
    box: box as unknown as HTMLElement,
    control: control as unknown as HTMLButtonElement,
  };
  return { body, box, control, tools, idle, takes, hold, closePopup, deps, anchored };
}

const formEl = () => make('div') as unknown as HTMLElement;

describe('where a form opened at a place is (Matt, 2026-10-30)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('is in the place of its control, claimed as a form of that popup', () => {
    const made = fixture();
    const home = formHome(made.deps, made.anchored);
    expect(home.open()).toBeDefined();
    const form = formEl();
    home.draw(form);
    expect(made.box.childNodes).toEqual([form]);
    expect(made.tools.childNodes).toEqual([made.idle]);
    expect(made.takes[0]?.slice(0, 2)).toEqual([true, false]);
    expect(made.hold.fit).toHaveBeenCalled();
    expect(made.closePopup).not.toHaveBeenCalled();
    expect(home.inPane()).toBe(false);
  });

  it('puts back what was there and lets go when it closes', () => {
    const made = fixture();
    const home = formHome(made.deps, made.anchored);
    home.open();
    home.draw(formEl());
    home.close();
    expect(made.box.childNodes).toEqual([made.control]);
    expect(home.holds()).toBe(false);
  });

  it('goes to the side pane when it needs the map, the popup closed, the claim an aside one', () => {
    const made = fixture();
    const home = formHome(made.deps, made.anchored);
    home.open();
    home.draw(formEl());
    expect(home.toPane()).toBe(true);
    expect(made.box.childNodes).toEqual([made.control]);
    expect(made.closePopup).toHaveBeenCalled();
    expect(made.takes[1]).toEqual([false, true]);
    expect(home.holds()).toBe(true);
    expect(home.inPane()).toBe(true);
    const form = formEl();
    home.draw(form);
    expect(made.tools.childNodes).toEqual([form]);
    home.close();
    expect(made.tools.childNodes).toEqual([made.idle]);
    expect(home.holds()).toBe(false);
  });

  it('stays where it was when it cannot move: gone with its popup, another form open', () => {
    const made = fixture();
    const home = formHome(made.deps, made.anchored);
    const claim = home.open();
    const form = formEl();
    home.draw(form);
    // The popup closed, and another form took the hold.
    made.hold.release(claim);
    formHome(made.deps).open();
    made.closePopup.mockClear();
    expect(home.toPane()).toBe(false);
    expect(home.inPane()).toBe(false);
    expect(home.element()).toBe(made.anchored.box);
    expect(made.box.childNodes).toEqual([form]);
    expect(made.closePopup).not.toHaveBeenCalled();
    expect(home.holds()).toBe(false);
  });

  it('gives the focus back to the control as the popup drew it anew when the form let go', () => {
    resetFocus();
    const made = fixture();
    const fresh = make('button');
    fresh.setAttribute('data-meetup-here', '1');
    made.control.setAttribute('data-meetup-here', '1');
    vi.stubGlobal('CSS', { escape: (text: string) => text });
    vi.stubGlobal('document', {
      querySelector: (selector: string) => made.body.querySelector(selector),
    });
    const home = formHome(
      {
        ...made.deps,
        hold: {
          ...made.hold,
          release: (claim) => {
            made.hold.release(claim);
            made.box.replaceChildren(fresh);
          },
        },
      },
      made.anchored,
    );
    home.open();
    home.draw(formEl());
    home.close();
    expect(focused().at(-1) === fresh).toBe(true);
  });

  it('is in the side pane without a place, and refused while another form is open', () => {
    const made = fixture();
    const home = formHome(made.deps);
    expect(home.open()).toBeDefined();
    expect(made.takes[0]).toEqual([false, true]);
    expect(home.inPane()).toBe(true);
    expect(formHome(made.deps, made.anchored).open()).toBeUndefined();
    expect(made.box.childNodes).toEqual([made.control]);
  });
});
