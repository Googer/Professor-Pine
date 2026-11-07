import type { RegionChangeAnswer, RegionsMineView } from '../../domain/web/region-data.js';
import type { Me } from './notice.js';
import { pressParty } from './parties.js';
import { renderNode } from './popup.js';
import type { FormClaim, FormHold } from './raid-forms.js';
import { legendWanted, regionRows, regionsBox, regionsList, regionsOffered } from './regions.js';

/*
 * "Your regions" on the map's page (plan 8M-20; review R10 to R14, round 1 B2 to B10), its
 * wiring: the member's view of the regions (the outlines restyled by it, "Your regions…" offered
 * by it), and the box in the side pane's box (docked under the map on a phone), an aside claim of
 * the hold as Report's step 2, the popup or card closed as it opens. A press disables every Join
 * and Leave, then draws the rows anew in place from the view that came with the answer (or asks
 * it again; a read-only view or none keeps the rows, the outlines and the entry as they were,
 * W5), restyles the outlines and asks the parties again, and says the answer in its row; the
 * focus stays on the same control, with the answer in the box's live line on the next frame (W7),
 * or goes to the row's answer line where that is gone, which is read as it is focused. Escape (unless a popup, the card, the layers or the
 * tour has it), × and ← Back close it. Its pure part is `regions.ts`.
 */

/** What the page says of "Your regions…" while another form is open. */
const FORM_OPEN = 'Close the form that is open first.';

/** What the page says when the view cannot be had. */
const NOT_LOADED = 'Your regions could not be loaded. Try again in a moment.';

export interface RegionsUiDeps {
  guild: string;
  /** The page's CSRF token, which a stale one's renewal changes. */
  csrf: { get(): string; set(token: string): void };
  hold: Pick<FormHold<unknown>, 'take' | 'release' | 'holds'>;
  /** The side pane's box. */
  tools: HTMLElement;
  /** The side pane's box given back ("New train"). */
  idle(): void;
  /** The regions' names by id, as `/api/geo` gives them: only those are listed (R11). */
  names: ReadonlyMap<number, string>;
  /** A view came (undefined: none could be had): the outlines restyled, the entry offered or not. */
  shown(view: RegionsMineView | undefined): void;
  /** A region's outline marked while its row is hovered, focused or tapped; undefined: none. */
  highlight(regionId: number | undefined): void;
  /** The parties asked for again: a role changed what the member sees. */
  partiesChanged(): void;
  /** The parties drawn anew (B4): the side pane shows the box, or the list again. */
  redrawn(): void;
  /** The popup open, or the phone card, closed as the box opens (B3). */
  closePopup(): void;
  /** Whether Escape is another's now (B3): a popup, the card, the layers' sheet or the tour. */
  escapeTaken(): boolean;
  /** Whether the Region outlines layer is on (B8). */
  outlinesShown(): boolean;
  /** The focus back where "Your regions…" was (the account's menu) as the box closes. */
  focusBack(): void;
  /** Reads JSON (`getJson`). */
  ask<T>(url: string): Promise<T>;
  /** POSTs JSON with the token in `X-Pine-CSRF`: the status and the body read. */
  post(url: string, token: string, body: unknown): Promise<{ status: number; body: unknown }>;
  /** `/api/me` again, for a token gone stale. */
  me(): Promise<Me>;
  say(text: string): void;
  /** Runs `run` on the next frame (`requestAnimationFrame`): the live line written after clearing. */
  nextFrame(run: () => void): void;
}

export function regionsUi(deps: RegionsUiDeps) {
  const { guild, hold, tools } = deps;
  let view: RegionsMineView | undefined;
  let claim: FormClaim | undefined;
  /** The box in the side pane while it is open. */
  let box: HTMLElement | undefined;
  /** The region whose row was tapped: its outline marked until a tap elsewhere (B8). */
  let tapped: number | undefined;

  /** The view asked for, without telling anybody (after a press, W5); undefined: none had. */
  const reread = async (): Promise<RegionsMineView | undefined> => {
    try {
      return await deps.ask<RegionsMineView>(`/s/${guild}/api/regions/mine`);
    } catch {
      return undefined;
    }
  };

  /** The view asked for; undefined where it could not be had (`shown` told either way). */
  const load = async (): Promise<RegionsMineView | undefined> => {
    view = await reread();
    deps.shown(view);
    return view;
  };

  const close = (): void => {
    if (!claim) return;
    const held = claim;
    claim = undefined;
    box = undefined;
    tapped = undefined;
    deps.highlight(undefined);
    deps.idle();
    hold.release(held);
    deps.redrawn();
    deps.focusBack();
  };

  /** The rows' events: a row's region marked while hovered, focused or tapped (B8). */
  const watchRows = (list: HTMLElement): void => {
    for (const row of list.querySelectorAll<HTMLElement>('[data-region-row]')) {
      const id = Number(row.dataset.regionRow);
      for (const type of ['mouseenter', 'focusin']) {
        row.addEventListener(type, () => {
          deps.highlight(id);
        });
      }
      // Left: the tapped row's mark back, if any (W6).
      for (const type of ['mouseleave', 'focusout']) {
        row.addEventListener(type, () => {
          deps.highlight(tapped);
        });
      }
      row.addEventListener('click', () => {
        tapped = id;
        deps.highlight(id);
      });
    }
  };

  /** Every Join and Leave of the box, off during a press (B9) or back after it. */
  const buttons = (): HTMLButtonElement[] =>
    box ? [...box.querySelectorAll<HTMLButtonElement>('button[data-region-action]')] : [];

  /**
   * The rows drawn anew in place from the view (B2): the list replaced, the legend and the
   * outlines' line shown or not, the box and its live line left as they are.
   */
  const update = (): void => {
    if (!box || !view) return;
    const rows = regionRows(view, deps.names);
    const list = renderNode(regionsList(rows), document);
    watchRows(list);
    box.querySelector('[data-regions-rows]')?.replaceChildren(list);
    const legend = box.querySelector<HTMLElement>('[data-regions-legend]');
    if (legend) legend.hidden = !legendWanted(rows);
    const off = box.querySelector<HTMLElement>('[data-regions-outlines-off]');
    if (off) off.hidden = deps.outlinesShown();
  };

  /** A Join or Leave pressed: every button off until the answer, said in its row and the box. */
  const press = async (button: HTMLButtonElement): Promise<void> => {
    const { regionAction: action = '', region: regionId = '', role = '' } = button.dataset;
    const before = buttons().map((each) => [each, each.disabled] as const);
    for (const [each] of before) each.disabled = true;
    let body: unknown;
    const pressed = await pressParty(deps.csrf.get(), {
      post: async (token) => {
        const sent = await deps.post(`/s/${guild}/api/regions/${regionId}/${action}`, token, {
          role,
        });
        body = sent.body;
        return sent;
      },
      me: () => deps.me(),
    });
    deps.csrf.set(pressed.csrf);
    const answered = body as Partial<RegionChangeAnswer> | undefined;
    // The view that came with the answer, from the member fetched afresh; else asked again; a
    // view read-only or none at all leaves the rows, the outlines and the entry as they were,
    // their buttons back (B10, W5).
    const live = (one: RegionsMineView | undefined) =>
      one !== undefined && !one.readOnly ? one : undefined;
    const fresh = live(answered?.view) ?? live(await reread());
    if (fresh) {
      view = fresh;
      deps.shown(view);
    }
    if (!box) {
      deps.partiesChanged();
      return;
    }
    if (fresh) update();
    else for (const [each, was] of before) each.disabled = was;
    const line = box.querySelector<HTMLElement>(`[data-region-answer="${regionId}"]`);
    if (line) line.textContent = pressed.text;
    // The focus on the same control where it is still there and may be pressed, else the row's
    // answer line, else the heading (B2).
    const same = buttons().find(
      (each) =>
        each.dataset.regionAction === action &&
        each.dataset.region === regionId &&
        each.dataset.role === role &&
        !each.disabled,
    );
    const focus = same ?? line ?? box.querySelector<HTMLElement>('[data-regions-heading]');
    focus?.focus();
    // The live line cleared and written on the next frame, so that the same words are read
    // again; not where the focus is on the answer line, which is read as it is focused (W7).
    const liveLine = box.querySelector('[data-regions-live]');
    if (liveLine) {
      liveLine.textContent = '';
      if (focus !== line) {
        deps.nextFrame(() => {
          liveLine.textContent = pressed.text;
        });
      }
    }
    deps.partiesChanged();
  };

  /** The box drawn into the side pane's box. */
  const draw = (): void => {
    if (!claim || !view) return;
    const rows = regionRows(view, deps.names);
    box = renderNode(regionsBox(rows, { outlinesShown: deps.outlinesShown() }), document);
    box.addEventListener('click', (event) => {
      const target = event.target instanceof HTMLElement ? event.target.closest('button') : null;
      if (!(target instanceof HTMLButtonElement)) return;
      if (target.dataset.regionsClose !== undefined) close();
      else if (target.dataset.regionAction !== undefined) void press(target);
    });
    const list = box.querySelector<HTMLElement>('.regions-list');
    if (list) watchRows(list);
    tools.replaceChildren(box);
  };

  // Escape closes the box, unless a field, a popup, the card, the layers or the tour has it (B3).
  document.addEventListener(
    'keydown',
    (event) => {
      if (event.key !== 'Escape' || !claim || deps.escapeTaken()) return;
      if (document.activeElement?.closest('input, select, textarea') != null) return;
      event.preventDefault();
      event.stopPropagation();
      close();
    },
    true,
  );
  // A tapped row's mark goes with a tap anywhere else (B8).
  document.addEventListener('click', (event) => {
    if (tapped === undefined) return;
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (target?.closest(`[data-region-row="${String(tapped)}"]`)) return;
    tapped = undefined;
    deps.highlight(undefined);
  });

  return {
    load,
    /** "Your regions…" pressed: the box in the side pane, or why not. */
    open: (): void => {
      if (claim) return;
      if (!view) {
        deps.say(NOT_LOADED);
        return;
      }
      const taken = hold.take(false, true);
      if (!taken) {
        deps.say(FORM_OPEN);
        return;
      }
      claim = taken;
      deps.closePopup();
      draw();
      deps.redrawn();
      tools.querySelector<HTMLElement>('[data-regions-heading]')?.focus();
    },
    close,
    /** Whether the box is in the side pane's box. */
    inTools: (): boolean => claim !== undefined,
    /** Whether "Your regions…" is offered (R11, R15). */
    offered: (): boolean => regionsOffered(view),
  };
}

export type RegionsUi = ReturnType<typeof regionsUi>;
