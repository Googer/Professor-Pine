import type { AppContext } from '../app-context.js';
import { MAX_OPTION_TEXT, type LocatedInteraction } from '../discord/command.js';
import { UserError } from '../discord/errors.js';
import { guildIdOf, regionChannelOf } from '../discord/guards.js';
import { readPin } from '../domain/geo/pin-input.js';
import { cutWhole, MAX_PLACE_TITLE, type KnownPlace, type Place } from '../domain/geo/place.js';
import type { PlaceKind } from '../domain/search/place-merge.js';
import type { LatLon } from '@pine/wayspot-core/lat-lon';
import { distanceWords } from '../render/distance-words.js';
import { PLACE_KIND_WORDS } from '../render/place.js';
import { plain, truncate } from '../render/text.js';
import {
  ALL_PLACE_KINDS,
  clearOf,
  placeValue,
  readPlaceValue,
  type PlaceChoice,
} from '../services/place-finder.js';
import { byName, CHOICE_NAME, MAX_CHOICES, type Choice } from './choices.js';
import { serverValuesOf } from '../discord/server-values.js';

/**
 * As much as an option that names a place takes: a maps link with all its data (a Google Maps
 * place page is a few hundred characters) fits. It is the most any option takes, past which the
 * router answers autocomplete with no choices (`MAX_OPTION_TEXT`).
 */
export const MAX_PLACE_TEXT = MAX_OPTION_TEXT;

/** Said of a choice's value that names a place outside the server's regions. */
export const NOT_HERE =
  'That place is not in a region of this server. Pick one from the list that appears while you ' +
  'type.';

/**
 * Which kinds of place an option takes, and what a member who picked another kind is told (a
 * meetup is never at a power spot: Matt, 2026-10-17). Left out: every kind.
 */
export interface PlaceKindsOnly {
  kinds: readonly PlaceKind[];
  refusal: string;
}

/** The kinds of place `kinds` names, as a member reads them: "gym or PokéStop". */
function kindWords(kinds: readonly PlaceKind[]): string {
  return orList(kinds.map((kind) => PLACE_KIND_WORDS[kind]));
}

/** Said of a pin (a maps link, coordinates) outside the server's regions. */
export const PIN_NOT_HERE =
  'That pin is not in a region of this server. Give a place in the regions here.';

/** Said of coordinates that are no place on earth. */
export const NO_PLACE_ON_EARTH =
  'Those are no coordinates on earth: give the latitude first, then the longitude ' +
  '(`40.4406, -79.9959`).';

/**
 * Said of a short link (`maps.app.goo.gl`): the bot fetches nothing a member names, and tests use
 * no network (Matt, 2026-10-17).
 */
export const SHORT_LINK =
  'I do not follow short links. Open that one, and paste the address your browser shows then, ' +
  'or drop a pin in Google Maps and paste the coordinates it shows.';

/** Said of a link of a maps site that shows no one place (a search, a Street View). */
export const NO_POINT =
  'That link shows no one place: open the place itself and copy its address, or give its ' +
  'coordinates.';

/**
 * Said of a choice's value whose place is gone since it was offered (an import deleted the
 * Wayspot, or it is of another kind now; a gym deleted).
 */
export const PLACE_GONE = 'That place is gone from the list; pick it again.';

/** As many places as a refusal suggests. */
const SUGGESTIONS = 5;

/** "A, B or C". */
export function orList(names: readonly string[]): string {
  const rest = [...names];
  const last = rest.pop() ?? '';
  return rest.length === 0 ? last : `${rest.join(', ')} or ${last}`;
}

/**
 * Whether the place a choice's value names is still known, as that kind and by a title: a gym as
 * one of the server's (`row`; plan 19B-2: another server's is as gone).
 */
function stillKnown(
  ctx: PlaceContext,
  row: number | undefined,
  kind: PlaceKind,
  id: string,
): boolean {
  if (kind === 'gym') return /^\d+$/u.test(id) && ctx.gyms.of(row).get(Number(id)) !== undefined;
  const wayspot = ctx.wayspots.of(row).byId(id);
  return wayspot?.kind === kind && wayspot.title.trim() !== '';
}

/**
 * A place as a choice of a `near` option: `Fountain Square (PokéStop) · Market Street`, the
 * title cut (never where it is) so that the whole fits a choice's name. With a `distance` in
 * words (a list of the places nearest those named before: Matt, 2026-10-27), it ends the label
 * where the whole fits uncut (`… · Market Street · 350 m`), and is left out otherwise.
 */
export function placeLabel(
  choice: Pick<PlaceChoice, 'kind' | 'title' | 'where'>,
  distance?: string,
): string {
  const suffix = ` (${PLACE_KIND_WORDS[choice.kind]})${choice.where === undefined ? '' : ` · ${choice.where}`}`;
  if (distance !== undefined) {
    const whole = `${choice.title}${suffix} · ${distance}`;
    if (whole.length <= CHOICE_NAME) return whole;
  }
  const room = CHOICE_NAME - Math.min(suffix.length, CHOICE_NAME - 20);
  return truncate(`${truncate(choice.title, room)}${suffix}`, CHOICE_NAME);
}

/**
 * The power spots of a region by name, as choices (`powerspot:<Wayfarer id>`, named by their
 * kind): what `/max spot:` and a max train's `/route add stop:` offer before anything is typed
 * (plans 8X-4, 8X-F): the server's (its row, plan 19B-3). None outside a region's channel.
 */
export function regionSpotChoices(
  ctx: Pick<AppContext, 'wayspots'>,
  row: number | undefined,
  region: string | undefined,
): Choice[] {
  if (region === undefined) return [];
  return ctx.wayspots
    .of(row)
    .inRegion(region)
    .filter((spot) => spot.kind === 'powerspot' && spot.title.trim() !== '')
    .sort((a, b) => byName(a.title, b.title))
    .map((spot) => ({
      name: placeLabel({ kind: 'powerspot', title: spot.title, where: undefined }),
      value: placeValue({ kind: 'powerspot', id: spot.id }),
    }));
}

/** The row of the interaction's server, by which its regions are known. */
function serverRow(interaction: LocatedInteraction, ctx: AppContext): Promise<number | undefined> {
  return interaction.inGuild()
    ? ctx.guilds.idFor(guildIdOf(interaction))
    : Promise.resolve(undefined);
}

/**
 * The places named before a list is asked for (Matt, 2026-10-27, "nearby stops first"): the
 * values of the other options that name a place (`/research`'s other stops), points that count
 * as near as well (where the member's last report stands, `/rocket report`), and how near the
 * places an empty option lists must lie to the nearest of them.
 */
export interface NamedBefore {
  /** The other options' values: only a choice of the list (`<kind>:<id>`) counts. */
  values?: readonly (string | null)[];
  /**
   * Points to measure from as well; the places there are not left out of the list. Read only
   * where the list can use them (review P2): not for a maps link or coordinates, nor where the
   * server is not known (outside a server, or one without a row).
   */
  points?: () => Promise<readonly LatLon[]>;
  /** An empty option lists the places within this many meters of the nearest; all without. */
  within?: number;
}

/**
 * The choices of a `near` option (plan 8W-2): the gyms, PokéStops and power spots of the
 * server's regions that fit what was typed (`PlaceFinder`), the member's region first, each
 * saying where it is; the value is the place's `<kind>:<id>`. A maps link or coordinates are
 * offered nothing: sent as typed, they are a pin. With places named before (`before`, of the
 * `kinds` and of the server: `PlaceFinder.chosen`), the nearer of places that fit alike come
 * first, and an empty option lists the places nearest them (`PlaceFinder.nearest`), those named
 * left out, each with its distance; nothing is listed without one, as without `before`.
 */
export async function nearChoices(
  interaction: LocatedInteraction,
  ctx: AppContext,
  typed: string,
  kinds: readonly PlaceKind[] = ALL_PLACE_KINDS,
  before?: NamedBefore,
): Promise<Choice[]> {
  if (readPin(typed).kind !== 'none') return [];
  const empty = typed.trim() === '';
  if (empty && before === undefined) return [];
  const row = await serverRow(interaction, ctx);
  if (row === undefined) return [];
  const named = (before?.values ?? []).flatMap((value) => {
    const chosen = value === null ? undefined : ctx.placeFinder.chosen(row, value.trim());
    return chosen && kinds.includes(chosen.kind) ? [chosen] : [];
  });
  const anchors = [...named.map((choice) => choice.point), ...((await before?.points?.()) ?? [])];
  if (empty) {
    const { distanceUnits } = serverValuesOf(interaction, ctx);
    return ctx.placeFinder
      .nearest(row, kinds, anchors, {
        ...(before?.within === undefined ? {} : { within: before.within }),
        count: MAX_CHOICES,
        except: new Set(named.map(placeValue)),
      })
      .map(({ choice, metres }) => ({
        name: placeLabel(choice, distanceWords(metres, distanceUnits)),
        value: placeValue(choice),
      }));
  }
  return ctx.placeFinder
    .find(row, regionChannelOf(interaction, ctx), typed, kinds, { anchors })
    .slice(0, MAX_CHOICES)
    .map((choice) => ({ name: placeLabel(choice), value: placeValue(choice) }));
}

/**
 * A choice as the place a member named: what it was when they named it (a snapshot), a gym by
 * the name its post shows (`gymName`: the nickname first).
 */
function knownPlace(ctx: PlaceContext, row: number | undefined, choice: PlaceChoice): KnownPlace {
  // A gym is named as its post names it: by its nickname, when it has one.
  const gym = choice.kind === 'gym' ? ctx.gyms.of(row).get(Number(choice.id)) : undefined;
  return {
    kind: choice.kind,
    id: choice.id,
    // Kept to what its state takes, never half of an emoji.
    title: cutWhole(gym ? gym.nickname || gym.name : choice.title, MAX_PLACE_TITLE),
    lat: choice.point.lat,
    lon: choice.point.lon,
    // Nothing is none: an empty address or picture is not kept as one.
    address: choice.address === '' ? null : choice.address,
    image: choice.image === '' ? null : choice.image,
  };
}

/** What naming a place by a pick needs: the gyms, the kept Wayspots, the search. */
type PlaceContext = Pick<AppContext, 'gyms' | 'wayspots' | 'placeFinder'>;

/**
 * The place a pick names (`gym:7`, `stop:<Wayfarer id>`, as a choice of a `near` option has it),
 * as `namedPlace` makes it: the same snapshot; undefined when it is gone, of another kind now, or
 * in no region of the server (`row`). For the live map's meetups (plan 8M-5M), which pick a gym or a
 * PokéStop on the map rather than by an option.
 */
export function pickedPlace(ctx: PlaceContext, row: number, value: string): KnownPlace | undefined {
  const read = readPlaceValue(value);
  if (!read || !stillKnown(ctx, row, read.kind, read.id)) return undefined;
  const chosen = ctx.placeFinder.chosen(row, value);
  return chosen && knownPlace(ctx, row, chosen);
}

/**
 * The place a choice names (`gym:7`, `stop:<Wayfarer id>`, read by `readPlaceValue`), as a `near`
 * option takes it (`namedPlace`), the same snapshot; refused when the place is of a kind `only`
 * does not take (its `refusal`), when it is gone or of another kind now (`PLACE_GONE`), or in no
 * region of the server (`row`; `NOT_HERE`). Also for the map's "Report spawn here" of a gym, a
 * PokéStop or a Power Spot (Matt, 2026-11-07), which reports at the place as `/wild near:` does.
 */
export function chosenPlace(
  ctx: PlaceContext,
  row: number | undefined,
  read: { kind: PlaceKind; id: string },
  only?: PlaceKindsOnly,
): KnownPlace {
  if (only && !only.kinds.includes(read.kind)) throw new UserError(only.refusal);
  if (!stillKnown(ctx, row, read.kind, read.id)) throw new UserError(PLACE_GONE);
  const chosen = row === undefined ? undefined : ctx.placeFinder.chosen(row, placeValue(read));
  if (!chosen) throw new UserError(NOT_HERE);
  return knownPlace(ctx, row, chosen);
}

/**
 * The place a `near` option names (`/wild near:`, `/meetup near:`): a choice
 * (refused when its place is gone or of another kind now, `PLACE_GONE`, or not in a region of the
 * server, `NOT_HERE`); a maps link or coordinates, which are a pin (`readPin`; refused outside
 * the server's regions, `PIN_NOT_HERE`, as a short link, `SHORT_LINK`, and as numbers that are no
 * place, `NO_PLACE_ON_EARTH`), named by the nearest place within 50 metres (`PlaceFinder.pin`);
 * or typed text that means one place beyond doubt (`clearOf` what the one search,
 * `PlaceFinder.find`, gave); otherwise the member is asked to pick, with up to five of what fits.
 * Undefined without the option. With `only`, a place of another kind is refused with its
 * `refusal`, typed text finds only those kinds, and a pin is named only by one of them.
 *
 * Resolved once per interaction (`resolvedPlaces`): a guard resolves it, so that a refusal does
 * not count against the throttle, and the command then takes what the guard found (a guard hands
 * nothing on otherwise) instead of searching again.
 */
export function namedPlace(
  interaction: LocatedInteraction,
  ctx: AppContext,
  value: string | null,
  otherwise = 'or say where in `details` alone',
  only?: PlaceKindsOnly,
): Promise<Place | undefined> {
  const key = JSON.stringify([value, otherwise, only?.kinds ?? null]);
  const before = resolvedPlaces.get(interaction);
  if (before?.key === key) return before.place;
  const place = resolvePlace(interaction, ctx, value, otherwise, only);
  resolvedPlaces.set(interaction, { key, place });
  return place;
}

/**
 * The place each interaction's `near` was resolved to, with what it was asked (`namedPlace`), for
 * as long as the interaction lives: the guard's answer is the command's.
 */
const resolvedPlaces = new WeakMap<
  LocatedInteraction,
  { key: string; place: Promise<Place | undefined> }
>();

async function resolvePlace(
  interaction: LocatedInteraction,
  ctx: AppContext,
  value: string | null,
  otherwise: string,
  only: PlaceKindsOnly | undefined,
): Promise<Place | undefined> {
  const kinds = only?.kinds ?? ALL_PLACE_KINDS;
  const text = (value ?? '').trim();
  if (text === '') return undefined;
  const row = await serverRow(interaction, ctx);
  const read = readPlaceValue(text);
  if (read) return chosenPlace(ctx, row, read, only);
  const pin = readPin(text);
  switch (pin.kind) {
    case 'pin': {
      const made =
        row === undefined ? undefined : ctx.placeFinder.pin(row, pin.point, pin.linkName, kinds);
      if (!made) throw new UserError(PIN_NOT_HERE);
      return made;
    }
    case 'short-link':
      throw new UserError(SHORT_LINK);
    case 'out-of-range':
      throw new UserError(NO_PLACE_ON_EARTH);
    case 'no-point':
      throw new UserError(NO_POINT);
    case 'none':
      break;
  }
  const regionChannelId = regionChannelOf(interaction, ctx);
  const found = row === undefined ? [] : ctx.placeFinder.find(row, regionChannelId, text, kinds);
  const clear = clearOf(found);
  if (clear) return knownPlace(ctx, row, clear);
  const shown = plain(truncate(text, 80));
  if (found.length === 0) {
    throw new UserError(
      `I know no ${kindWords(kinds)} called "${shown}" here. Pick one from the list ` +
        `that appears while you type, ${otherwise}.`,
    );
  }
  const named = found
    .slice(0, SUGGESTIONS)
    .map((choice) => `${plain(choice.title)} (${PLACE_KIND_WORDS[choice.kind]})`);
  throw new UserError(
    `Which place is "${shown}"? Pick one from the list that appears while you type: ` +
      `${orList(named)}.`,
  );
}

/**
 * How an answer names a place a member gave: `near Fountain Square`; a pin by the place it is
 * near, the name its link gave (`at Blue Tent`), or as `at your pin`.
 */
export function placeWords(place: Place): string {
  if (place.kind !== 'pin') return `near ${plain(place.title)}`;
  if (place.near) return `near ${plain(place.near.title)}`;
  return place.linkName === null ? 'at your pin' : `at ${plain(place.linkName)}`;
}
