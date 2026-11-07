import { formKeys } from './form-keys.js';
import type { LatLon } from '@pine/wayspot-core/lat-lon';
import type { GeoView } from '../../domain/web/geo-data.js';
import type { WildOptionsView } from '../../domain/web/spawn-data.js';
import { getJson, say } from './common.js';
import type { Me } from './notice.js';
import { renderNode, type MapGym } from './popup.js';
import { formPlace, type FormClaim, type FormHold } from './raid-forms.js';
import { fieldsOf, sayUnder } from './raid-ui.js';
import {
  pressedWhere,
  redrawnAfter,
  regionsAt,
  sendSpawnForm,
  spawnBody,
  spawnBox,
  spawnForm,
  spawnPoint,
  type PointRegion,
  type SpawnValues,
} from './spawn-forms.js';

/**
 * The spawn form of the live map in the page (plan 8M-4S, spec 3.8): a long press or a right
 * click on the map opens it in a popup at that point; "Report spawn here" in a gym's popup opens
 * it in place of its button, the gym's place being the point. The pick list comes from
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
  hold: Pick<FormHold<unknown>, 'editing' | 'take' | 'holds' | 'ready' | 'fit' | 'release'>;
  /** Opens a popup of its own at the point with this content; `close` closes it. */
  popupAt(point: LatLon, content: HTMLElement): { close(): void };
  /** A spawn was reported from this page: the spawns asked for at once. */
  reported?(): void;
}

/** What the page says when the pick list cannot be loaded. */
const NO_OPTIONS = 'The list of Pokémon could not be loaded. Try again in a moment.';

/** What the page says of a long press while another form is open. */
const FORM_OPEN = 'Close the form that is open first.';

export function spawnUi(deps: SpawnUiDeps) {
  const { guild, hold } = deps;

  /** Sends a report with the page's token; disables the form's buttons meanwhile. */
  const send = async (form: HTMLElement, body: Record<string, string | number>) => {
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
    return sent;
  };

  /**
   * Draws the form into `box` once the pick list came, when its claim still holds and the box is
   * still in the page, asking for a region where `lying` (the regions the page sees the point
   * in) has several; `finish` closes it (and lets the hold go).
   */
  const openForm = async (
    box: HTMLElement,
    point: LatLon,
    lying: readonly PointRegion[],
    claim: FormClaim,
    finish: () => void,
    /** The Report button's step 3 (plan 8M-9A, R1-3): the Pokémon's field takes the focus. */
    focusFirst = false,
  ): Promise<void> => {
    let options: WildOptionsView;
    try {
      options = await getJson<WildOptionsView>(`/s/${guild}/api/wild-options`);
    } catch {
      say(NO_OPTIONS);
      if (hold.holds(claim)) finish();
      return;
    }
    if (!hold.ready(claim, box.isConnected)) return;
    let regions = lying;
    // The form is drawn anew whenever the server's answer names regions (`redrawnAfter`); each
    // drawing has its own click handler.
    const draw = (filled: Partial<SpawnValues>): void => {
      const form = renderNode(spawnForm(options, regions, filled), document);
      formKeys(form);
      form.addEventListener('click', (event) => {
        clicked(form, event);
      });
      box.replaceChildren(form);
      hold.fit();
    };
    const clicked = (form: HTMLElement, event: Event): void => {
      const target = event.target;
      if (!(target instanceof HTMLButtonElement)) return;
      if (target.dataset.cancel !== undefined) {
        finish();
        return;
      }
      if (target.dataset.submit !== 'spawn') return;
      const fields = fieldsOf(form);
      const values: SpawnValues = {
        pokemon: fields.pokemon ?? '',
        details: fields.details ?? '',
        iv: fields.iv ?? '',
        region: fields.region ?? '',
      };
      const body = spawnBody(point, values, options);
      if ('text' in body) {
        sayUnder(form, body.text);
        return;
      }
      void send(form, body.body).then((sent) => {
        if (sent.ok) deps.reported?.();
        // A form gone with its popup meanwhile: nothing more to do.
        if (!hold.holds(claim)) {
          say(sent.text);
          return;
        }
        if (sent.ok) {
          finish();
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
   * A click on "Report spawn here" (`spawnBox`): the form in place of the button, the gym's place
   * the point.
   */
  const spawnClicked = (button: HTMLButtonElement, gym: MapGym): void => {
    const box = button.parentElement;
    if (!box) return;
    const claim = hold.take(formPlace(box));
    if (!claim) return;
    const point = spawnPoint(gym.lat, gym.lon);
    void openForm(box, point, regionsAt(point, deps.regions), claim, () => {
      box.replaceChildren(button);
      hold.release(claim);
    });
  };

  return {
    /** "Report spawn here" for a gym's own popup; a click opens the form in its place. */
    spawnControl(gym: MapGym): HTMLElement {
      const box = renderNode(spawnBox(gym.id), document);
      const button = box.querySelector('button');
      button?.addEventListener('click', () => {
        spawnClicked(button, gym);
      });
      return box;
    },

    /** A click on "Report spawn here" in the popup of a gym that shows raids. */
    spawnClicked,

    /**
     * A long press or a right click on the map: the form in a popup at that point; a point in no
     * region of the map's outlines is said to be in none, and nothing opens.
     */
    spawnAt(point: LatLon, focusFirst = false): void {
      if (hold.editing) {
        say(FORM_OPEN);
        return;
      }
      const where = pressedWhere(point, deps.regions);
      if ('text' in where) {
        say(where.text);
        return;
      }
      const box = document.createElement('div');
      box.className = 'spawn-box';
      box.textContent = 'Loading the Pokémon…';
      // Opened first: opening it closes any other popup, which must not take the new claim.
      const popup = deps.popupAt(point, box);
      const claim = hold.take(true);
      // Another form took the hold meanwhile: no popup is left showing "Loading" for ever.
      if (!claim) {
        popup.close();
        return;
      }
      void openForm(
        box,
        point,
        where.regions,
        claim,
        () => {
          hold.release(claim);
          popup.close();
        },
        focusFirst,
      );
    },
  };
}

export type SpawnUi = ReturnType<typeof spawnUi>;
