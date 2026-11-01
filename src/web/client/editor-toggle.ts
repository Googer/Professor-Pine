import { EDIT_QUERY_NAME, EDIT_QUERY_VALUE } from '../../domain/web/editor-address.js';
import {
  CLOSE_FORM_FIRST,
  EDITOR_FAILED,
  type EditorClosed,
  type EditorMount,
  type EditorOpened,
  type EditorOpening,
  type MapView,
} from './editor-mount.js';
import type { Me } from './notice.js';

/**
 * The region editor as a toggle of the map (plan 8M-10): whether the address asks for it, who is
 * offered "Edit regions", its files loaded once, and turning it on and off. Pure but for the
 * page's parts it is handed; `main.ts` wires it.
 */

/** Said when the editor is asked for where it is not offered (S29). */
export const NOT_HERE_WORDS =
  'Edit regions on a computer with a mouse and a screen 1024 pixels wide or more.';
/**
 * Said as the editor starts to turn on (branch review W4): its files and data may take a moment;
 * the page shown with the editor empties it, a refusal takes its place.
 */
export const OPENING_WORDS = 'Opening the region editor…';

/**
 * The account menu's item (S31): "Edit regions", with "· 3 unsaved" while the browser holds edits
 * of this server's member that change three regions (`stagedRegions`).
 */
export function editItemLabel(unsaved: number): string {
  return unsaved === 0 ? 'Edit regions' : `Edit regions · ${unsaved} unsaved`;
}

/**
 * How many regions the menu counts as unsaved (review C4): once the editor was opened, its own
 * count as it last closed (`fromEditor`), so that a browser that keeps nothing still shows it;
 * before, what the browser keeps (`fromStorage`, asked only then).
 */
export function unsavedCount(fromEditor: number | undefined, fromStorage: () => number): number {
  return fromEditor ?? fromStorage();
}

/** What the menu's item and the address need of the page. */
export interface OfferPage {
  /** `editorFits` of the browser, asked at each use (a window resized, a mouse plugged in). */
  fits(): boolean;
  turnOn(): void;
  say(text: string): void;
}

/** "Edit regions" pressed: the editor turned on where it is offered, else why not said (S29). */
export function editItemPressed(page: OfferPage): void {
  if (page.fits()) page.turnOn();
  else page.say(NOT_HERE_WORDS);
}

/** Whether the address asks for the editor (`?edit=regions`, C5). */
export function editingAsked(search: string): boolean {
  return new URLSearchParams(search).getAll(EDIT_QUERY_NAME).includes(EDIT_QUERY_VALUE);
}

/** The address with `?edit=regions` while the editor is on, without it when it is off. */
export function addressWith(pathname: string, search: string, hash: string, on: boolean): string {
  const query = new URLSearchParams(search);
  query.delete(EDIT_QUERY_NAME);
  if (on) query.set(EDIT_QUERY_NAME, EDIT_QUERY_VALUE);
  const rest = query.toString();
  return `${pathname}${rest === '' ? '' : `?${rest}`}${hash}`;
}

/**
 * Whether "Edit regions" is built: for a member `/api/me` says may edit the server's regions (a
 * hint, C1: the editor's data asks Discord and decides). By the hint alone (branch review W5): a
 * window widened after the load finds it; `map.css` hides it where the editor is not offered
 * (`EDITOR_MEDIA`), and its click asks again (C6, S29).
 */
export function editingOffered(me: Me): boolean {
  return me.loggedIn && me.mayEditRegions === true;
}

/**
 * `/s/<guild>/regions/edit` led to the map (C5): once what it `waits` for settled, whether it
 * loaded or not (review 1, F8: the editor does not need the live map's layers), the editor turned
 * on, whatever the hint says (its data decides), where the editor is offered (S29); elsewhere, the
 * address left and why said (C6).
 */
export async function editorByAddress(
  asked: boolean,
  waits: readonly Promise<unknown>[],
  page: OfferPage & {
    /** Drops `?edit=regions` from the address. */
    leave(): void;
  },
): Promise<void> {
  await Promise.allSettled(waits);
  if (!asked) return;
  if (page.fits()) page.turnOn();
  else {
    page.leave();
    page.say(NOT_HERE_WORDS);
  }
}

/** What the loader needs of the document. */
export interface FilesDocument {
  createElement(tag: 'link'): HTMLLinkElement;
  createElement(tag: 'script'): HTMLScriptElement;
  head: { append(node: Node): void };
}

/**
 * One file added to the head once: loaded when its `load` came and `ready` says so; when it
 * failed (or loaded but is not ready) it is taken away again, and the next call adds it anew.
 */
function fileOnce(
  doc: FilesDocument,
  make: () => HTMLLinkElement | HTMLScriptElement,
  ready: () => boolean,
): () => Promise<void> {
  let loading: Promise<void> | undefined;
  return () => {
    if (loading) return loading;
    const file = make();
    const loaded = new Promise<void>((resolve, reject) => {
      file.addEventListener('load', () => {
        if (ready()) resolve();
        else reject(new Error('the region editor did not register'));
      });
      file.addEventListener('error', () => {
        reject(new Error("could not load the region editor's files"));
      });
    });
    doc.head.append(file);
    loading = loaded.catch((err: unknown) => {
      file.remove();
      loading = undefined;
      throw err;
    });
    return loading;
  };
}

/**
 * Loads the editor's stylesheet and script once (C3): both added to the head at the first call,
 * done when both loaded and the script registered its mount (`registered`), whose mount it
 * gives (the stylesheet waited for, so that nothing is drawn unstyled); a later call is the same
 * load. Each file is kept or tried again on its own (review 1, F6): one that failed, or a script
 * that loaded but did not register, is taken away and added anew at the next call; a file that
 * loaded is never added twice (the script would run again).
 */
export function loadOnce<T>(
  doc: FilesDocument,
  files: { script: string; style: string },
  registered: () => T | undefined,
): () => Promise<T> {
  const style = fileOnce(
    doc,
    () => {
      const link = doc.createElement('link');
      link.rel = 'stylesheet';
      link.href = files.style;
      return link;
    },
    () => true,
  );
  const script = fileOnce(
    doc,
    () => {
      const tag = doc.createElement('script');
      tag.src = files.script;
      return tag;
    },
    () => registered() !== undefined,
  );
  return async () => {
    await Promise.all([style(), script()]);
    const mount = registered();
    if (mount === undefined) throw new Error('the region editor did not register');
    return mount;
  };
}

/** What the toggle needs of the page. */
export interface ToggleDeps {
  /** Whether a form of the map holds (`FormHold`, route mode, Meet…, a report's step 2). */
  held(): boolean;
  /** The editor's mount, its files loaded first (once). */
  mount(): Promise<EditorMount>;
  /** What the editor is opened with now (the live map's view among it). */
  opening(): Omit<EditorOpening, 'show'>;
  /**
   * The page with the editor on (its hosts, the address, the pollers paused) or off (the live
   * map's parts back as they were); either may be asked again for the state it is in. `focus`:
   * whether the focus moves to where the member goes on ("Back to the map", or the account's
   * menu); never on a refusal before the editor was shown (review 2, R1), which leaves it where
   * the member is (a form being typed in, Find).
   */
  shown(on: boolean, focus: boolean): void;
  /** The live map takes the editor's view (clamped by its own limits). */
  handBack(view: MapView | undefined): void;
  say(text: string): void;
}

/**
 * The editor on or off (C4, C8): on, refused while a form holds, at the press and again when it
 * would be shown; its files loaded, its data asked fresh, the page shown with it only once the
 * data came; a refusal of the data said in the server's words, a failure as `EDITOR_FAILED`, the
 * page left as the live map (the editor closed when it was shown). Off, the editor closed and the
 * live map shown, at the editor's view.
 */
export class EditorToggle {
  private state: 'off' | 'opening' | 'on' = 'off';
  private mount: EditorMount | undefined;
  /**
   * How many regions the editor's staged edits changed as it last closed (review C4); none
   * before it was first closed.
   */
  unsaved: number | undefined;

  constructor(private readonly deps: ToggleDeps) {}

  get on(): boolean {
    return this.state === 'on';
  }

  async turnOn(): Promise<void> {
    const { deps } = this;
    if (this.state !== 'off') return;
    if (deps.held()) {
      deps.say(CLOSE_FORM_FIRST);
      return;
    }
    this.state = 'opening';
    deps.say(OPENING_WORDS);
    // Whether the editor's hosts were shown, and whether a form opened while it loaded (F4).
    let shown = false;
    let heldMeanwhile = false;
    let opened: EditorOpened;
    try {
      const mount = await deps.mount();
      this.mount = mount;
      opened = await mount.open({
        ...deps.opening(),
        show: () => {
          if (deps.held()) {
            heldMeanwhile = true;
            return false;
          }
          shown = true;
          deps.shown(true, true);
          return true;
        },
      });
    } catch {
      // Its files, the page's parts or the editor failed (review 1, F1): never left half on.
      opened = { ok: false, words: EDITOR_FAILED };
    }
    if (opened.ok) {
      this.state = 'on';
      return;
    }
    if (shown) this.closed(this.mount?.close());
    this.refused(heldMeanwhile ? CLOSE_FORM_FIRST : opened.words, shown);
  }

  turnOff(): void {
    if (this.state !== 'on') return;
    const view = this.closed(this.mount?.close());
    this.state = 'off';
    this.deps.shown(false, true);
    this.deps.handBack(view);
  }

  /** What the editor left as it closed: its count kept, its view given. */
  private closed(left: EditorClosed | undefined): MapView | undefined {
    if (left) this.unsaved = left.unsaved;
    return left?.view;
  }

  /** Off with `words` said; the focus moved only when the editor had been shown (R1). */
  private refused(words: string, wasShown: boolean): void {
    this.state = 'off';
    this.deps.shown(false, wasShown);
    this.deps.say(words);
  }
}
