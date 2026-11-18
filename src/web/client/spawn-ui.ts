import { isOff } from './form-buttons.js';
import { liveCheck, type FormCheck } from './form-check.js';
import { formKeys } from './form-keys.js';
import { formHome, type FormHome, type FormFrame } from './form-home.js';
import type { LatLon } from '@pine/wayspot-core/lat-lon';
import type { GeoView } from '../../domain/web/geo-data.js';
import type { WildOptionsView } from '../../domain/web/spawn-data.js';
import { getJson, say } from './common.js';
import type { Me } from './notice.js';
import { renderNode } from './popup.js';
import type { FormHold } from './raid-forms.js';
import { fieldsOf, sayUnder } from './raid-ui.js';
import {
  pressedWhere,
  redrawnAfter,
  regionsAt,
  sendSpawnForm,
  spawnBody,
  spawnBox,
  spotSpawnBox,
  spawnForm,
  spawnMissing,
  spawnPoint,
  type PointRegion,
  type SpawnPlace,
  type SpawnValues,
} from './spawn-forms.js';

/**
 * The spawn form of the live map in the page (plan 8M-4S, spec 3.8): a long press or a right
 * click on the map opens it at that point, step 2's pin there; "Report spawn here" in a gym's, a
 * PokéStop's or a Power Spot's popup opens it at the place; in the side pane or on a phone the card
 * (plan 8M-22, `formHome`). The pick
 * list comes from
 * `/api/wild-options` (the browser revalidates it by its ETag). It is held like the raid forms
 * (`FormHold`, one form at a time). A success is said and closes the form, and the spawns are
 * asked for at once (`reported`), which draws it on the map.
 */
export interface SpawnUiDeps {
  guild: string;
  /** The page's CSRF token, which a stale one's renewal changes. */
  csrf: { get(): string; set(token: string): void };
  /** The server's regions with their outlines, as `/api/geo` gives them. */
  regions: GeoView['regions'];
  /** The form that is open, shared with the raid forms. */
  hold: Pick<FormHold<unknown>, 'editing'>;
  /** Where the forms open (plan 8M-22, `formHome`): the side pane, the place's popup closed. */
  frame: FormFrame;
  /**
   * The pin of the Report button's step 2 (`report-pin`) at a point, fixed while its form is open:
   * `drawn` once the form is drawn (on a phone the map pans the point clear of the card, review
   * P10), `remove` as it closes, whichever way (`whenClosed`, review P2).
   */
  pinAt(point: LatLon): { drawn: () => void; remove: () => void };
  /** A spawn was reported from this page: the spawns asked for at once. */
  reported?(): void;
}

/** What the page says when the pick list cannot be loaded. */
const NO_OPTIONS = 'The list of Pokémon could not be loaded. Try again in a moment.';

/** What the page says of a long press while another form is open. */
const FORM_OPEN = 'Close the form that is open first.';

/** What a spawn's form holds. */
function valuesOf(form: HTMLElement): SpawnValues {
  const fields = fieldsOf(form);
  return {
    pokemon: fields.pokemon ?? '',
    details: fields.details ?? '',
    iv: fields.iv ?? '',
    region: fields.region ?? '',
  };
}

export function spawnUi(deps: SpawnUiDeps) {
  const { guild, hold } = deps;

  /** Sends a report with the page's token; disables the form's buttons meanwhile. */
  const send = async (form: HTMLElement, body: Record<string, unknown>, check: FormCheck) => {
    const buttons = form.querySelectorAll('button');
    for (const each of buttons) each.disabled = true;
    const sent = await sendSpawnForm(deps.csrf.get(), {
      post: async (token) => {
        const reply = await fetch(`/s/${guild}/api/spawns`, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json', 'x-pine-csrf': token },
          body: JSON.stringify(body),
        });
        return {
          status: reply.status,
          body: (await reply.json().catch(() => undefined)) as unknown,
        };
      },
      me: () => getJson<Me>(`/s/${guild}/api/me`),
    });
    deps.csrf.set(sent.csrf);
    for (const each of buttons) each.disabled = false;
    // The check again (plan 8M-22), the answer kept on the line.
    check.run(true);
    return sent;
  };

  /**
   * Draws the form into `box` once the pick list came, when its claim still holds and the box is
   * still in the page, asking for a region where `lying` (the regions the page sees the point
   * in) has several; `finish` closes it (and lets the hold go). `where`: the point, or the place
   * (a gym, PokéStop or Power Spot) the report is at.
   */
  const openForm = async (
    home: FormHome,
    where: LatLon | SpawnPlace,
    lying: readonly PointRegion[],
    finish: (how: 'back' | 'done') => void,
    /** The Report button's step 3 (plan 8M-9A, R1-3): the Pokémon's field takes the focus. */
    focusFirst = false,
  ): Promise<void> => {
    let options: WildOptionsView;
    try {
      options = await getJson<WildOptionsView>(`/s/${guild}/api/wild-options`);
    } catch {
      say(NO_OPTIONS);
      if (home.holds()) finish('back');
      return;
    }
    if (!home.holds()) return;
    const box = home.element();
    let regions = lying;
    // The form is drawn anew whenever the server's answer names regions (`redrawnAfter`); each
    // drawing has its own click handler.
    const draw = (filled: Partial<SpawnValues>): void => {
      const form = renderNode(spawnForm(options, regions, filled), document);
      // Report off until the Pokémon and where it is are given (plan 8M-22).
      const check = liveCheck(form, () => spawnMissing(valuesOf(form)));
      formKeys(form);
      form.addEventListener('click', (event) => {
        clicked(form, event, check);
      });
      home.draw(form);
    };
    const clicked = (form: HTMLElement, event: Event, check: FormCheck): void => {
      const target = event.target;
      if (!(target instanceof HTMLButtonElement)) return;
      if (target.dataset.cancel !== undefined) {
        finish('back');
        return;
      }
      if (target.dataset.submit !== 'spawn' || isOff(target)) return;
      const values = valuesOf(form);
      const body = spawnBody(where, values, options);
      if ('text' in body) {
        sayUnder(form, body.text);
        return;
      }
      void send(form, body.body, check).then((sent) => {
        if (sent.ok) deps.reported?.();
        // A form gone meanwhile: nothing more to do.
        if (!home.holds()) {
          say(sent.text);
          return;
        }
        if (sent.ok) {
          finish('done');
          say(sent.text);
          return;
        }
        // The server names the regions to pick from: the form offers those.
        const redrawn = redrawnAfter(sent, values);
        if (redrawn) {
          regions = redrawn.regions;
          draw(redrawn.filled);
        }
        const shown = box.firstElementChild;
        if (shown instanceof HTMLElement) sayUnder(shown, sent.text);
        else say(sent.text);
      });
    };
    draw({});
    if (focusFirst) box.querySelector<HTMLInputElement>('input[name="pokemon"]')?.focus();
  };

  /**
   * A click on "Report spawn here" (`spawnBox`, `spawnAtBox`): the form in the side pane,
   * reporting at the place (a gym, a PokéStop or a Power Spot) itself, as `/wild near:` does
   * (Matt, 2026-11-07); its point the regions are read by.
   */
  const spawnClicked = (button: HTMLElement, place: SpawnPlace): void => {
    const home = formHome(deps.frame, { control: button });
    if (!home.open()) return;
    const point = spawnPoint(place.lat, place.lon);
    void openForm(home, { ...place, ...point }, regionsAt(point, deps.regions), (how) => {
      home.close(how);
    });
  };

  return {
    /**
     * "Report spawn here" for a gym's own popup or a Power Spot's; a click opens the form in its
     * place.
     */
    spawnControl(place: SpawnPlace): HTMLElement {
      const box = renderNode(
        place.kind === 'powerspot' ? spotSpawnBox(place.id) : spawnBox(place.id),
        document,
      );
      const button = box.querySelector('button');
      button?.addEventListener('click', () => {
        spawnClicked(button, place);
      });
      return box;
    },

    /**
     * A click on "Report spawn here" in a popup drawn as a tree (a gym that shows raids, a
     * PokéStop), its place found by the popup's own clicks.
     */
    spawnClicked,

    /**
     * A long press or a right click on the map: the form in the side pane, step 2's pin at the
     * point while it is open (plan 8M-22, Matt's ruling 3), `where` read once here; a point in no
     * region of the map's outlines is said to be in none, and nothing opens. The Report button's
     * pin at a gym, PokéStop or Power Spot tapped reports at that `place` itself; Cancel gives the
     * focus to `control` (the Report button).
     */
    spawnAt(
      point: LatLon,
      focusFirst = false,
      place?: SpawnPlace,
      control?: HTMLElement | null,
    ): void {
      if (hold.editing) {
        say(FORM_OPEN);
        return;
      }
      const where = pressedWhere(point, deps.regions);
      if ('text' in where) {
        say(where.text);
        return;
      }
      const home = formHome(deps.frame, { control });
      if (!home.open()) return;
      const pin = deps.pinAt(point);
      home.whenDrawn(pin.drawn);
      home.whenClosed(pin.remove);
      void openForm(
        home,
        place ?? point,
        where.regions,
        (how) => {
          home.close(how);
        },
        focusFirst,
      );
    },
  };
}

export type SpawnUi = ReturnType<typeof spawnUi>;
