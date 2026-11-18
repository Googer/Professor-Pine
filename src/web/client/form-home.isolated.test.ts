import { afterEach, describe, expect, it, vi } from 'vitest';
import { FakeElement, focused, make, resetFocus } from '../../../test/support/fake-page.js';
import { formHome, type FormFrame } from './form-home.js';

// The page's helpers this comes in with load Leaflet, which reads the browser's `window` as it
// loads; none of it is used here. Isolated: a mocked module needs a module graph of its own.
vi.mock('leaflet', () => ({}));

/**
 * A page with a place's popup (its name, the control that opens a form) and the side pane's box,
 * a hold that takes one claim at a time, and the frame the party layer gives the forms: leaving
 * closes the popup, and its way back opens it again, drawn anew.
 */
function fixture() {
  const body = make('body');
  body.page = true;
  const popup = make('div');
  popup.className = 'leaflet-popup';
  const name = make('strong');
  name.className = 'name';
  name.textContent = 'East Fountain';
  const control = make('button');
  control.setAttribute('data-report-research', 's1');
  popup.append(name, control);
  const tools = make('div');
  const idle = make('button');
  tools.append(idle);
  body.append(popup, tools);
  vi.stubGlobal('HTMLElement', FakeElement);
  vi.stubGlobal('CSS', { escape: (text: string) => text });
  vi.stubGlobal('document', {
    createElement: make,
    querySelector: (selector: string) => body.querySelector(selector),
  });
  const takes: unknown[][] = [];
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
      if (claim === holder) holder = undefined;
    },
  };
  let open = true;
  /** The popup drawn anew as it opens again: a fresh control in it. */
  const fresh = make('button');
  fresh.setAttribute('data-report-research', 's1');
  const frame: FormFrame = {
    tools: tools as unknown as HTMLElement,
    hold,
    idle: () => {
      tools.replaceChildren(idle);
    },
    leave: () => {
      if (!open) return {};
      open = false;
      body.replaceChildren(tools);
      return {
        place: 'East Fountain',
        back: () => {
          open = true;
          popup.replaceChildren(name, fresh);
          body.replaceChildren(popup, tools);
        },
      };
    },
  };
  return { body, popup, control, fresh, tools, idle, takes, frame, isOpen: () => open };
}

/** A form with its heading, as the forms draw theirs. */
function formEl() {
  const form = make('div');
  const heading = make('strong');
  heading.className = 'name';
  heading.setAttribute('data-form-heading', '');
  heading.textContent = 'Report field research';
  form.append(heading);
  return { form, heading, element: form as unknown as HTMLElement };
}

describe('where a form opened at a place is (plan 8M-22)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('opens in the side pane, an aside claim, the place’s popup closed', () => {
    const made = fixture();
    const home = formHome(made.frame, { control: made.control as unknown as HTMLElement });
    expect(home.open()).toBeDefined();
    expect(made.takes[0]).toEqual([false, true]);
    expect(made.isOpen()).toBe(false);
    expect(home.inPane()).toBe(true);
    const { form, element } = formEl();
    home.draw(element);
    expect(made.tools.childNodes).toEqual([form]);
  });

  it('names the place in a line under its heading, and gives the heading the focus', () => {
    resetFocus();
    const made = fixture();
    const home = formHome(made.frame);
    home.open();
    const { form, heading, element } = formEl();
    home.draw(element);
    expect(form.childNodes.map((child) => child.className)).toEqual(['name', 'form-place']);
    expect(form.querySelector('.form-place')?.textContent).toBe('East Fountain');
    expect(focused().at(-1) === heading).toBe(true);
  });

  it('names the place its opener gives, a stop and how many more', () => {
    const made = fixture();
    const home = formHome(made.frame, { place: () => 'East Fountain +2' });
    home.open();
    const { form, element } = formEl();
    home.draw(element);
    expect(form.querySelector('.form-place')?.textContent).toBe('East Fountain +2');
  });

  it('Cancel: the side pane as it was, the popup open again, the focus on its control there', () => {
    resetFocus();
    const made = fixture();
    const home = formHome(made.frame, { control: made.control as unknown as HTMLElement });
    home.open();
    home.draw(formEl().element);
    home.close('back');
    expect(made.tools.childNodes).toEqual([made.idle]);
    expect(home.holds()).toBe(false);
    expect(made.isOpen()).toBe(true);
    expect(focused().at(-1) === made.fresh).toBe(true);
  });

  it('a success leaves the page to open what was made: the popup stays closed', () => {
    const made = fixture();
    const home = formHome(made.frame, { control: made.control as unknown as HTMLElement });
    home.open();
    home.draw(formEl().element);
    home.close('done');
    expect(made.tools.childNodes).toEqual([made.idle]);
    expect(home.holds()).toBe(false);
    expect(made.isOpen()).toBe(false);
  });

  it('is refused while another form is open, the popup left open', () => {
    const made = fixture();
    expect(formHome(made.frame).open()).toBeDefined();
    const other = fixture();
    other.frame.hold.take(false, true);
    expect(formHome(other.frame).open()).toBeUndefined();
    expect(other.isOpen()).toBe(true);
  });
});
