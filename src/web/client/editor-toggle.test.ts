import { describe, expect, it } from 'vitest';
import {
  CLOSE_FORM_FIRST,
  EDITOR_FAILED,
  type EditorMount,
  type EditorOpened,
  type EditorOpening,
  type MapView,
} from './editor-mount.js';
import {
  addressWith,
  editorByAddress,
  EditorToggle,
  editingAsked,
  editingOffered,
  editItemLabel,
  editItemPressed,
  unsavedCount,
  loadOnce,
  NOT_HERE_WORDS,
  OPENING_WORDS,
  type FilesDocument,
} from './editor-toggle.js';
import { EDITOR_MEDIA, editorFits } from './editor-media.js';
import type { Me } from './notice.js';

const ME: Me = { loggedIn: true, name: 'Brock', csrf: 't', member: true, readOnly: false };
const VIEW: MapView = { lat: 40.44, lon: -79.95, zoom: 14 };

describe("the region editor's address (plan 8M-10, C5)", () => {
  it('is asked for by ?edit=regions alone', () => {
    expect(editingAsked('?edit=regions')).toBe(true);
    expect(editingAsked('?region=3&edit=regions')).toBe(true);
    expect(editingAsked('')).toBe(false);
    expect(editingAsked('?edit=raids')).toBe(false);
    expect(editingAsked('?edits=regions')).toBe(false);
  });

  it('is kept in the address while the editor is on, and dropped when it is off', () => {
    expect(addressWith('/s/1/map', '', '', true)).toBe('/s/1/map?edit=regions');
    expect(addressWith('/s/1/map', '?edit=regions', '', true)).toBe('/s/1/map?edit=regions');
    expect(addressWith('/s/1/map', '?edit=regions', '#x', false)).toBe('/s/1/map#x');
    expect(addressWith('/s/1/map', '?a=1&edit=regions', '', false)).toBe('/s/1/map?a=1');
  });
});

describe('who is offered "Edit regions" (C1, C6)', () => {
  // Branch review W5: built by the hint alone, whatever the width the page loaded at (a window
  // widened later finds it); the media rule hides it where it does not fit and its click asks
  // again (S29).
  it('is staff by the hint', () => {
    expect(editingOffered({ ...ME, mayEditRegions: true })).toBe(true);
    expect(editingOffered({ ...ME, mayEditRegions: false })).toBe(false);
    expect(editingOffered(ME)).toBe(false);
    expect(editingOffered({ loggedIn: false })).toBe(false);
  });
});

// Plan 8M-11C, S31: what the browser holds for this server, by the regions it changes.
describe('"Edit regions" with edits staged', () => {
  // Review C4: once the editor was opened, its own count as it closed (a browser that keeps
  // nothing still shows it); before, what the browser keeps.
  it('counts from the editor once it closed, else from what the browser keeps', () => {
    let read = 0;
    const stored = () => {
      read += 1;
      return 2;
    };
    expect(unsavedCount(undefined, stored)).toBe(2);
    expect(unsavedCount(5, stored)).toBe(5);
    expect(unsavedCount(0, stored)).toBe(0);
    expect(read).toBe(1);
  });

  it('says how many regions are unsaved, and nothing more without any', () => {
    expect(editItemLabel(0)).toBe('Edit regions');
    expect(editItemLabel(1)).toBe('Edit regions · 1 unsaved');
    expect(editItemLabel(3)).toBe('Edit regions · 3 unsaved');
  });
});

// Plan 8M-11C, S29: one rule for the menu, the address and the stylesheet (`phone-header.test.ts`
// holds `map.css` to `EDITOR_MEDIA`).
describe('where the editor is offered (S29)', () => {
  it('is a screen of 1024 pixels or more whose main pointer is a mouse or a trackpad', () => {
    expect(EDITOR_MEDIA).toBe('(min-width: 1024px) and (pointer: fine)');
    const asked: string[] = [];
    const matches = (yes: boolean) => (query: string) => {
      asked.push(query);
      return yes;
    };
    expect(editorFits(matches(true))).toBe(true);
    expect(editorFits(matches(false))).toBe(false);
    expect(asked).toEqual([EDITOR_MEDIA, EDITOR_MEDIA]);
  });

  it('is said in words naming both', () => {
    expect(NOT_HERE_WORDS).toBe(
      'Edit regions on a computer with a mouse and a screen 1024 pixels wide or more.',
    );
  });

  it('turns the editor on from the menu where it fits, else says why', () => {
    const calls: string[] = [];
    const page = (fits: boolean) => ({
      fits: () => fits,
      turnOn: () => {
        calls.push('on');
      },
      say: (text: string) => {
        calls.push(`say ${text}`);
      },
    });
    editItemPressed(page(true));
    editItemPressed(page(false));
    expect(calls).toEqual(['on', `say ${NOT_HERE_WORDS}`]);
  });
});

/** A page of a script and a stylesheet loading, as the test lets them. */
function filesPage() {
  const appended: FakeFile[] = [];
  class FakeFile {
    src = '';
    href = '';
    rel = '';
    removed = false;
    private readonly listeners = new Map<string, Array<() => void>>();
    constructor(readonly tag: string) {}
    addEventListener(type: string, listener: () => void): void {
      this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
    }
    remove(): void {
      this.removed = true;
    }
    fire(type: 'load' | 'error'): void {
      for (const listener of this.listeners.get(type) ?? []) listener();
    }
  }
  const doc = {
    createElement: (tag: string) => new FakeFile(tag),
    head: {
      append: (file: FakeFile) => {
        appended.push(file);
      },
    },
  };
  return { doc: doc as unknown as FilesDocument, appended };
}

const FILES = { script: '/assets/e.js', style: '/assets/e.css' };
const MOUNT: EditorMount = {
  open: () => Promise.resolve({ ok: true }),
  close: () => undefined,
};

describe("the editor's files (C3)", () => {
  it('are added once, and give the mount once both came', async () => {
    const { doc, appended } = filesPage();
    const load = loadOnce(doc, FILES, () => MOUNT);
    const first = load();
    const second = load();
    expect(appended.map((file) => [file.tag, file.src || file.href])).toEqual([
      ['link', '/assets/e.css'],
      ['script', '/assets/e.js'],
    ]);
    expect(appended[0]?.rel).toBe('stylesheet');
    appended[1]?.fire('load');
    appended[0]?.fire('load');
    expect(await first).toBe(MOUNT);
    expect(await second).toBe(MOUNT);
    expect(await load()).toBe(MOUNT);
    expect(appended).toHaveLength(2);
  });

  it('wait for the stylesheet before the editor shows: its failure fails a loaded script', async () => {
    const { doc, appended } = filesPage();
    const load = loadOnce(doc, FILES, () => MOUNT);
    const loading = load();
    appended[1]?.fire('load');
    appended[0]?.fire('error');
    await expect(loading).rejects.toThrow();
  });

  it('take the one that failed away, and add only it again at the next press', async () => {
    const { doc, appended } = filesPage();
    const load = loadOnce(doc, FILES, () => MOUNT);
    const failed = load();
    appended[1]?.fire('load');
    appended[0]?.fire('error');
    await expect(failed).rejects.toThrow();
    expect(appended.map((file) => [file.tag, file.removed])).toEqual([
      ['link', true],
      ['script', false],
    ]);
    const again = load();
    // The script ran once: only the stylesheet is added again.
    expect(appended.map((file) => file.tag)).toEqual(['link', 'script', 'link']);
    appended[2]?.fire('load');
    expect(await again).toBe(MOUNT);
  });

  it('add the script again when it loaded but did not register', async () => {
    const { doc, appended } = filesPage();
    const registry: { mount?: EditorMount } = {};
    const load = loadOnce(doc, FILES, () => registry.mount);
    const failed = load();
    appended[0]?.fire('load');
    appended[1]?.fire('load');
    await expect(failed).rejects.toThrow();
    expect(appended[1]?.removed).toBe(true);
    const again = load();
    expect(appended.map((file) => file.tag)).toEqual(['link', 'script', 'script']);
    registry.mount = MOUNT;
    appended[2]?.fire('load');
    expect(await again).toBe(MOUNT);
  });
});

/** A promise and what settles it, for the test to settle. */
function settled<T>(): { promise: Promise<T>; resolve(value: T): void } {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

/**
 * A toggle over a mount of the test's: its openings (`opened` settles at each), and the page's
 * side as calls. By default the mount answers when the test says (`answer`); `open` replaces it.
 */
function toggleWith(
  options: {
    held?: () => boolean;
    noMount?: boolean;
    up?: () => void;
    open?: (opening: EditorOpening) => Promise<EditorOpened>;
  } = {},
) {
  const calls: string[] = [];
  const openings: EditorOpening[] = [];
  const came: Array<ReturnType<typeof settled<EditorOpening>>> = [];
  const coming = (index: number) => (came[index] ??= settled<EditorOpening>());
  let answer: (opened: EditorOpened) => void = () => undefined;
  const mount: EditorMount = {
    open(opening) {
      coming(openings.length).resolve(opening);
      openings.push(opening);
      if (options.open) return options.open(opening);
      return new Promise((resolve) => {
        answer = resolve;
      });
    },
    close() {
      calls.push('close');
      return { view: { lat: 40.5, lon: -80, zoom: 9 }, unsaved: 3 };
    },
  };
  const toggle = new EditorToggle({
    ...(options.up === undefined ? {} : { opened: options.up }),
    held: () => options.held?.() ?? false,
    mount: () =>
      options.noMount === true ? Promise.reject(new Error('no file')) : Promise.resolve(mount),
    opening: () => ({
      hosts: {} as EditorOpening['hosts'],
      guild: '1',
      me: ME,
      worker: '/assets/w.js',
      units: 'imperial',
      tiles: 'osm',
      googleKey: undefined,
      view: VIEW,
    }),
    // The focus moved, or left where the member is (review 2, R1).
    shown: (on, focus) => {
      calls.push(`${on ? 'shown' : 'live'}${focus ? '' : ' (focus left)'}`);
    },
    handBack: (view) => {
      calls.push(`back ${view?.zoom ?? 'none'}`);
    },
    say: (text) => {
      calls.push(`say ${text}`);
    },
  });
  return {
    toggle,
    calls,
    openings,
    /** The `index`th opening of the editor, once the toggle opened it. */
    opened: (index = 0) => coming(index).promise,
    answer: (opened: EditorOpened) => {
      answer(opened);
    },
  };
}

/** What the toggle says as it starts to turn the editor on (branch review W4). */
const OPENING = `say ${OPENING_WORDS}`;

describe('turning the editor on and off (C4, C8)', () => {
  it('tells that it is up only once it is, not when the editor failed after showing', async () => {
    let told = 0;
    const up = (): void => {
      told += 1;
    };
    const fine = toggleWith({ up });
    const on = fine.toggle.turnOn();
    (await fine.opened()).show();
    expect(told).toBe(0);
    fine.answer({ ok: true });
    await on;
    expect(told).toBe(1);
    expect(fine.toggle.used).toBe(true);
    told = 0;
    const failed = toggleWith({ up });
    const off = failed.toggle.turnOn();
    (await failed.opened()).show();
    failed.answer({ ok: false, words: 'no' });
    await off;
    expect(told).toBe(0);
  });

  it('says that it is opening the region editor', () => {
    expect(OPENING_WORDS).toBe('Opening the region editor…');
  });

  it('opens the editor at the live map’s view, shown once its data came', async () => {
    const made = toggleWith();
    const on = made.toggle.turnOn();
    const opening = await made.opened();
    expect(opening.view).toEqual(VIEW);
    // Said at once (branch review W4): the files and the data may take a moment.
    expect(made.calls).toEqual([OPENING]);
    expect(opening.show()).toBe(true);
    made.answer({ ok: true });
    await on;
    expect(made.calls).toEqual([OPENING, 'shown']);
    expect(made.toggle.on).toBe(true);
    // A second press meanwhile opens nothing more.
    await made.toggle.turnOn();
    expect(made.openings).toHaveLength(1);
  });

  it('turns off by the server’s words when the data was refused', async () => {
    const made = toggleWith();
    const on = made.toggle.turnOn();
    await made.opened();
    made.answer({ ok: false, words: 'Only staff of this server may edit its regions.' });
    await on;
    // Nothing was shown: the focus stays where the member is (review 2, R1).
    expect(made.calls).toEqual([
      OPENING,
      'live (focus left)',
      'say Only staff of this server may edit its regions.',
    ]);
    expect(made.toggle.on).toBe(false);
  });

  it('is refused while a form holds, and says so', async () => {
    const made = toggleWith({ held: () => true });
    await made.toggle.turnOn();
    expect(made.openings).toEqual([]);
    expect(made.calls).toEqual([`say ${CLOSE_FORM_FIRST}`]);
  });

  it('is not shown over a form opened while it loaded, and says so', async () => {
    let held = false;
    const made = toggleWith({ held: () => held });
    const on = made.toggle.turnOn();
    const opening = await made.opened();
    held = true;
    expect(opening.show()).toBe(false);
    made.answer({ ok: false, words: CLOSE_FORM_FIRST });
    await on;
    expect(made.calls).toEqual([OPENING, 'live (focus left)', `say ${CLOSE_FORM_FIRST}`]);
    expect(made.toggle.on).toBe(false);
  });

  it('says so when its files could not be loaded', async () => {
    const made = toggleWith({ noMount: true });
    await made.toggle.turnOn();
    expect(made.calls).toEqual([OPENING, 'live (focus left)', `say ${EDITOR_FAILED}`]);
    expect(made.toggle.on).toBe(false);
  });

  it('closes the editor it showed when the opening then failed, and can be turned on again', async () => {
    let fail = true;
    const made = toggleWith({
      open: (opening) => {
        opening.show();
        return fail ? Promise.reject(new Error('no map')) : Promise.resolve({ ok: true });
      },
    });
    await made.toggle.turnOn();
    expect(made.calls).toEqual([OPENING, 'shown', 'close', 'live', `say ${EDITOR_FAILED}`]);
    expect(made.toggle.on).toBe(false);
    fail = false;
    await made.toggle.turnOn();
    expect(made.toggle.on).toBe(true);
  });

  it('closes the editor it showed when the editor said it could not open', async () => {
    const made = toggleWith({
      open: (opening) => {
        opening.show();
        return Promise.resolve({ ok: false, words: EDITOR_FAILED });
      },
    });
    await made.toggle.turnOn();
    expect(made.calls).toEqual([OPENING, 'shown', 'close', 'live', `say ${EDITOR_FAILED}`]);
  });

  it('turned off, shows the live map and hands it the editor’s view', async () => {
    const made = toggleWith();
    expect(made.toggle.unsaved).toBeUndefined();
    const on = made.toggle.turnOn();
    (await made.opened()).show();
    made.answer({ ok: true });
    await on;
    made.toggle.turnOff();
    expect(made.calls).toEqual([OPENING, 'shown', 'close', 'live', 'back 9']);
    expect(made.toggle.on).toBe(false);
    // What the editor left staged (plan 8M-11C, review C4), for the menu's count.
    expect(made.toggle.unsaved).toBe(3);
    made.toggle.turnOff();
    expect(made.calls).toHaveLength(5);
  });
});

describe('the editor asked for by the address (C5)', () => {
  /** The page's side of `editorByAddress`, as calls. */
  function addressPage(wide: boolean) {
    const calls: string[] = [];
    return {
      calls,
      page: {
        fits: () => wide,
        turnOn: () => {
          calls.push('on');
        },
        leave: () => {
          calls.push('leave');
        },
        say: (text: string) => {
          calls.push(`say ${text}`);
        },
      },
    };
  }

  it('turns the editor on once the map is loaded', async () => {
    const { calls, page } = addressPage(true);
    await editorByAddress(true, [Promise.resolve()], page);
    expect(calls).toEqual(['on']);
  });

  it('waits for what it is given before it turns the editor on', async () => {
    const { calls, page } = addressPage(true);
    const map = settled<undefined>();
    const done = editorByAddress(true, [map.promise], page);
    expect(calls).toEqual([]);
    map.resolve(undefined);
    await done;
    expect(calls).toEqual(['on']);
  });

  it('turns the editor on also when the live map could not be loaded', async () => {
    const { calls, page } = addressPage(true);
    await editorByAddress(true, [Promise.reject(new Error('no geo')), Promise.resolve()], page);
    expect(calls).toEqual(['on']);
  });

  it('where the editor is not offered leaves the address and says why', async () => {
    const { calls, page } = addressPage(false);
    await editorByAddress(true, [Promise.reject(new Error('no geo'))], page);
    expect(calls).toEqual(['leave', `say ${NOT_HERE_WORDS}`]);
  });

  it('does nothing when the address does not ask', async () => {
    const { calls, page } = addressPage(true);
    await editorByAddress(false, [Promise.resolve()], page);
    expect(calls).toEqual([]);
  });
});
