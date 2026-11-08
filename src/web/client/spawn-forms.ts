import type { LatLon } from '@pine/wayspot-core/lat-lon';
import { ringContains } from '@pine/wayspot-core/region-membership';
import type { GeoView } from '../../domain/web/geo-data.js';
import type { WildOptionsView } from '../../domain/web/spawn-data.js';
import { sendButton } from './form-buttons.js';
import { pressParty, type PressSteps, type Pressed } from './parties.js';
import type { PageNode } from './popup.js';

/**
 * Reporting a wild Pokémon on the live map (plan 8M-4S, spec 3.8), the parts that need no
 * Leaflet: "Report spawn here" in a gym's, a PokéStop's or a Power Spot's popup, the regions a
 * point lies in, the form as a tree of nodes (`renderNode` sets every text as text), the body it
 * sends, and sending it with the page's CSRF token as a press is sent. What a member types is
 * read by the server with `/wild`'s readers; the page only says what is missing.
 */

/** As much as `/wild` takes of the Pokémon and of the details (its options' lengths). */
const POKEMON_LENGTH = 100;
const DETAILS_LENGTH = 200;

/** The id of the form's list of Pokémon (one form is open at a time). */
const POKEMON_LIST = 'wild-pokemon';

/** A region a point lies in, by id and name, as `/api/geo` names it. */
export interface PointRegion {
  id: number;
  name: string;
}

/** A coordinate to six decimals (about 10 cm), as the server keeps the point. */
const sixDecimals = (value: number): number => Math.round(value * 1e6) / 1e6;

/** The point of a report: where the map was pressed, or a gym's place, to six decimals. */
export function spawnPoint(lat: number, lon: number): LatLon {
  return { lat: sixDecimals(lat), lon: sixDecimals(lon) };
}

/**
 * The regions of the map whose outlines hold the point, in the order of `/api/geo`: where it
 * lies in several, the form asks which (the server decides by the same outlines).
 */
export function regionsAt(point: LatLon, regions: GeoView['regions']): PointRegion[] {
  return regions
    .filter((region) =>
      ringContains(
        region.outline.map(([lat, lon]) => ({ lat, lon })),
        point,
      ),
    )
    .map((region) => ({ id: region.id, name: region.name }));
}

/** What a press on the map says of a point that lies in no region of the map's outlines. */
export const NOT_IN_A_REGION = 'That point is not in a region of this server.';

/**
 * Where a long press or a right click on the map may report: the regions the point lies in by
 * the outlines of `/api/geo`, or, for a point in none, the words that say so at once (no form
 * is opened). The server still decides by its own outlines, at their edges too.
 */
export function pressedWhere(
  point: LatLon,
  regions: GeoView['regions'],
): { regions: PointRegion[] } | { text: string } {
  const lying = regionsAt(point, regions);
  return lying.length === 0 ? { text: NOT_IN_A_REGION } : { regions: lying };
}

/**
 * "Report spawn here" in the box a click opens the form in (`spawn-box`), in a gym's or a Power
 * Spot's popup, naming the place by its id: a gym that shows its raid, whose popup is drawn as a
 * tree, finds its gym by it; a Power Spot's popup listens to its own button.
 */
export function spawnBox(placeId: number | string): PageNode {
  return {
    tag: 'div',
    className: 'spawn-box place-control',
    children: [
      {
        tag: 'button',
        className: 'report-spawn',
        text: 'Report spawn here',
        attributes: { type: 'button', 'data-spawn': String(placeId) },
      },
    ],
  };
}

/**
 * The place a spawn is reported at from its "Report spawn here" (Matt, 2026-11-07): a gym, a
 * PokéStop or a Power Spot, sent by its kind and id as a choice of `/wild near:` names it (the
 * report is at the place itself), and its point, which the regions it lies in are read by.
 */
export interface SpawnPlace extends LatLon {
  kind: 'gym' | 'stop' | 'powerspot';
  id: string;
}

/** A gym as the place of a spawn. */
export function gymSpawnPlace(gym: { id: number; lat: number; lon: number }): SpawnPlace {
  return { kind: 'gym', id: String(gym.id), lat: gym.lat, lon: gym.lon };
}

/**
 * "Report spawn here" in a PokéStop's popup (Matt, 2026-11-07), beside the stop's other actions
 * and in their look: the stop by its id and its point, to six decimals (`spawnAtOf` reads them
 * back).
 */
export function spawnAtBox(stop: { key: string; at: LatLon }): PageNode {
  const point = spawnPoint(stop.at.lat, stop.at.lon);
  return {
    tag: 'div',
    className: 'spawn-box place-control',
    children: [
      {
        tag: 'button',
        className: 'press',
        text: 'Report spawn here',
        attributes: {
          type: 'button',
          'data-spawn-at': `${String(point.lat)},${String(point.lon)}`,
          'data-spawn-stop': stop.key,
        },
      },
    ],
  };
}

/** The stop a "Report spawn here" of a PokéStop names (`spawnAtBox`), or none. */
export function spawnAtOf(
  data: Readonly<Record<string, string | undefined>>,
): SpawnPlace | undefined {
  const { spawnAt, spawnStop } = data;
  if (spawnStop === undefined || spawnStop === '') return undefined;
  const [lat, lon, ...more] = (spawnAt ?? '').split(',').map((part) => Number(part));
  if (lat === undefined || lon === undefined || more.length > 0) return undefined;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return undefined;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return undefined;
  return { kind: 'stop', id: spawnStop, lat, lon };
}

/** A spawn report's body, or what the member must fill in first. */
export type SpawnBody = { body: Record<string, unknown> } | { text: string };

/** What a spawn form holds, kept when it is drawn anew (a region to pick, say). */
export interface SpawnValues {
  pokemon: string;
  details: string;
  iv: string;
  region: string;
}

const option = (value: string, text: string, selected: boolean): PageNode => ({
  tag: 'option',
  text,
  attributes: { value, ...(selected ? { selected: '' } : {}) },
});

const labelled = (text: string, ...children: PageNode[]): PageNode => ({
  tag: 'label',
  className: 'form-row',
  children: [{ tag: 'span', text }, ...children],
});

/** The IVs as `/wild`'s option offers them; none when they were not checked. */
const IV_OPTIONS: ReadonlyArray<[string, string]> = [
  ['', 'Not checked'],
  ['perfect', 'Perfect (100%)'],
  ['zero', 'Zero (0%)'],
];

/**
 * The form of a spawn report at a point: the Pokémon, picked by name from `/wild`'s list while
 * typing (a `datalist`, which the browser filters), where it is (`details`, required as in
 * `/wild`), the IVs if checked, and the region where the point lies in several.
 */
export function spawnForm(
  options: WildOptionsView,
  regions: readonly PointRegion[],
  filled: Partial<SpawnValues> = {},
): PageNode {
  const text = (name: string, length: number, placeholder: string, value: string | undefined) =>
    ({
      tag: 'input',
      attributes: {
        name,
        type: 'text',
        maxlength: String(length),
        placeholder,
        autocomplete: 'off',
        ...(name === 'pokemon' ? { list: POKEMON_LIST } : {}),
        ...(value === undefined ? {} : { value }),
      },
    }) satisfies PageNode;
  return {
    tag: 'div',
    className: 'raid-form spawn-form',
    attributes: { 'data-form': 'spawn' },
    children: [
      { tag: 'strong', className: 'name', text: 'Wild Pokémon here' },
      labelled(
        'Pokémon',
        text('pokemon', POKEMON_LENGTH, 'Type to pick from the list', filled.pokemon),
        {
          tag: 'datalist',
          attributes: { id: POKEMON_LIST },
          children: options.pokemon.map(([, name]): PageNode => ({
            tag: 'option',
            attributes: { value: name },
          })),
        },
      ),
      labelled(
        'Where it is',
        text('details', DETAILS_LENGTH, 'a street corner, a park, a gym nearby', filled.details),
      ),
      labelled('IVs', {
        tag: 'select',
        attributes: { name: 'iv' },
        children: IV_OPTIONS.map(([value, name]) =>
          option(value, name, (filled.iv ?? '') === value && value !== ''),
        ),
      }),
      ...(regions.length > 1
        ? [
            labelled('Region', {
              tag: 'select',
              attributes: { name: 'region' },
              children: [
                option('', 'Pick the region', (filled.region ?? '') === ''),
                ...regions.map((region) =>
                  option(String(region.id), region.name, String(region.id) === filled.region),
                ),
              ],
            }),
          ]
        : []),
      {
        tag: 'div',
        className: 'form-buttons',
        children: [
          sendButton('Report', { 'data-submit': 'spawn' }),
          {
            tag: 'button',
            className: 'press',
            text: 'Cancel',
            attributes: { type: 'button', 'data-cancel': '' },
          },
        ],
      },
      { tag: 'div', className: 'form-answer', attributes: { hidden: '' } },
    ],
  };
}

/**
 * The body of a spawn report (`POST /s/<guild>/api/spawns`), or what the member must fill in
 * first. A Pokémon whose name is one of the list's (whatever its letter case) is sent as its
 * value, as a choice of `/wild` is; anything else as typed, for the server to read or refuse.
 * At a place (`SpawnPlace`) the place itself is sent, as `/wild near:` names it; else the point.
 */
export function spawnBody(
  where: LatLon | SpawnPlace,
  values: SpawnValues,
  options: WildOptionsView,
): SpawnBody {
  const typed = values.pokemon.trim();
  if (typed === '') return { text: 'Pick the Pokémon first.' };
  const details = values.details.trim();
  if (details === '') return { text: 'Say where it is first: a street corner, a park, a gym.' };
  const folded = typed.toLocaleLowerCase();
  const picked = options.pokemon.find(([, name]) => name.toLocaleLowerCase() === folded);
  const region = Number(values.region);
  return {
    body: {
      pokemon: picked ? picked[0] : typed,
      details,
      ...(values.iv === 'perfect' || values.iv === 'zero' ? { iv: values.iv } : {}),
      ...('kind' in where
        ? { place: { kind: where.kind, id: where.id } }
        : { lat: where.lat, lon: where.lon }),
      ...(values.region !== '' && Number.isInteger(region) ? { region } : {}),
    },
  };
}

/**
 * What the page takes of a report's answer: whether it was made, and the regions to pick from
 * when the point lies in several (only those it can read).
 */
export interface SpawnAnswered {
  ok: boolean;
  regions?: PointRegion[];
}

export function spawnAnswerOf(body: unknown): SpawnAnswered {
  if (typeof body !== 'object' || body === null) return { ok: false };
  const { ok, regions } = body as { ok?: unknown; regions?: unknown };
  const answered: SpawnAnswered = { ok: ok === true };
  if (Array.isArray(regions)) {
    const read = regions.flatMap((region: unknown): PointRegion[] => {
      if (typeof region !== 'object' || region === null) return [];
      const { id, name } = region as { id?: unknown; name?: unknown };
      return typeof id === 'number' && typeof name === 'string' ? [{ id, name }] : [];
    });
    if (read.length > 0) answered.regions = read;
  }
  return answered;
}

/**
 * The form after an answer that made no report: whenever the answer names regions (the server
 * decides by the outlines it has now, which may differ from the page's), drawn again with those,
 * keeping what was filled in, a region picked only while it is among them. Undefined: the form
 * stays as it is.
 */
export function redrawnAfter(
  answered: SpawnAnswered,
  values: SpawnValues,
): { regions: PointRegion[]; filled: SpawnValues } | undefined {
  if (answered.ok || answered.regions === undefined) return undefined;
  const { regions } = answered;
  const kept = regions.some((region) => String(region.id) === values.region);
  return { regions, filled: kept ? values : { ...values, region: '' } };
}

/**
 * Sends a spawn report with the page's CSRF token as a press is sent (`pressParty`: a 403 of a
 * stale token is tried once more with a new one): the words to say, the token now, and what the
 * answer says.
 */
export async function sendSpawnForm(
  csrf: string,
  steps: PressSteps,
): Promise<Pressed & SpawnAnswered> {
  let last: unknown;
  const pressed = await pressParty(csrf, {
    post: async (token) => {
      const answer = await steps.post(token);
      last = answer.body;
      return answer;
    },
    me: () => steps.me(),
  });
  return { ...pressed, ...spawnAnswerOf(last) };
}
