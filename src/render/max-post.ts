import { shownPlace, type KnownPlace } from '../domain/geo/place.js';
import { wayspotAddressLine } from '../domain/geo/wayfarer-address.js';
import { maxEnded, maxSpotName, UNLISTED_SPOT } from '../domain/party/max.js';
import { memberOf, type MaxParty, type PowerSpot } from '../domain/party/party.js';
import type { PokemonCatalogue } from '../domain/pogo/catalogue.js';
import { listedMaxBoss } from '../domain/pogo/max-boss-list.js';
import type { MaxBoss } from '../domain/pogo/max-bosses.js';
import { maxBossTitle } from '../domain/pogo/max-tier.js';
import { titleCase } from '../domain/pogo/names.js';
import type { MaxLook } from '../domain/web/party-view.js';
import { maxBossPicture, type PokemonIcons } from '../domain/pogo/pokemon-icons.js';
import type { WayspotRow } from '../domain/wayspots/kept.js';
import { wayspotPicture } from '../domain/wayspots/picture.js';
import { bottomControls } from './party-controls.js';
import {
  ENDED_COLOUR,
  fittedLayout,
  inRole,
  KEPT_OPEN,
  renderedPost,
  tidyTitle,
  trainerBlocks,
  trainerCount,
  type Fit,
  type ForumTag,
  type PartyBrief,
  type PostBlock,
  type PostLayout,
  type RenderedPost,
  type TrainersView,
} from './party-post.js';
import { PLACE_KIND_WORDS } from './place.js';
import {
  gymMapsUrl,
  mapMarkdown,
  maxBossFacts,
  placeSection,
  typesLine,
  WHERE_HEADING,
  type ShownBoss,
} from './raid-post.js';
import { LIMITS, memberByName, plain, plainNoLinks, timestamp, truncate } from './text.js';

/** The colour of a max battle's post while it is on: the game's Dynamax red. */
export const MAX_COLOUR = 0xd81b60;

/** What the post of a max battle is rendered from (`PartyService.maxView`). */
export interface MaxPostView extends TrainersView {
  party: MaxParty;
  now: number;
  /** `settings.timezone`. */
  zone: string;
  /** The boss as it is shown: its name, catalogue entry, shiny flag and picture. */
  boss: ShownBoss;
  catalogue: PokemonCatalogue;
  /**
   * The kept Wayspot with an id (`ctx.wayspots`): a power spot is shown as it is now while it is
   * the same place (`shownPlace`), else as it was named. Without it, as it was named.
   */
  wayspot?: (id: string) => WayspotRow | undefined;
  /** The sentence of its last showing when staff closed it (`RaidPostView.closed`). */
  closed?: string;
}

/**
 * The boss of a max battle as its post shows it: the catalogue's entry of its reference (or the
 * name a boss the game master does not know was reported by), shiny as the max boss list says of
 * that boss in that tier, and its picture (design 3.3): the Gigantamax picture where the game's
 * icons have one (`maxBossPicture`), else the species', else the list's.
 */
export function shownMaxBoss(
  party: MaxParty,
  catalogue: PokemonCatalogue,
  bosses: readonly MaxBoss[],
  icons?: PokemonIcons,
): ShownBoss {
  const ref = party.max.boss;
  const { tier } = party.max;
  const { entry, listed } = listedMaxBoss(ref, tier, catalogue, bosses);
  const shown = entry ?? listed?.entry;
  const image = maxBossPicture(shown, tier, { catalogue, icons }) ?? listed?.image;
  return {
    name: shown?.name ?? ('name' in ref ? ref.name : titleCase(ref.key)),
    ...(shown ? { entry: shown } : {}),
    shiny: listed?.shiny ?? false,
    ...(image === undefined ? {} : { image }),
  };
}

/** Shown as over: its end has passed, or staff closed it. */
function shownOver(view: MaxPostView): boolean {
  return view.closed !== undefined || maxEnded(view.party, view.now);
}

/** The power spot as it is now while it is the same place (`shownPlace`), else as named. */
export function spotNow(
  spot: PowerSpot,
  wayspot: ((id: string) => WayspotRow | undefined) | undefined,
): PowerSpot {
  const kept = wayspot?.(spot.id);
  if (!kept) return spot;
  const now: KnownPlace = {
    kind: kept.kind === 'powerspot' ? 'powerspot' : 'stop',
    id: kept.id,
    // A title gone blank is no name: the one it was named by stays.
    title: kept.title.trim() === '' ? spot.title : kept.title,
    lat: kept.lat,
    lon: kept.lon,
    address: wayspotAddressLine(kept.address),
    image: kept.image,
  };
  const shown = shownPlace(spot, now);
  return shown === now ? { ...now, kind: 'powerspot' } : spot;
}

/**
 * How the live map shows a max battle (plan 8X-5), decided here as for the post: the boss's
 * picture and name (`shownMaxBoss`), and where it is as Where names it: the power spot as it is
 * now while it is the same place (`spotNow`), its address line or null; a pin as
 * `Unlisted power spot`, no address, and no spot.
 */
export function maxLook(view: MaxPostView): MaxLook {
  const { spot } = view.party.max;
  const picture = view.boss.image;
  const shown = spot.kind === 'pin' ? undefined : spotNow(spot, view.wayspot);
  return {
    ...(picture === undefined ? {} : { picture }),
    boss: view.boss.name,
    place: shown
      ? { name: shown.title, lat: shown.lat, lon: shown.lon, address: shown.address || null }
      : { name: UNLISTED_SPOT, lat: spot.lat, lon: spot.lon, address: null },
    spotId: shown?.id ?? null,
  };
}

/** `Dynamax Machamp (2★)`, `Gigantamax Machamp`: what the battle is (`maxBossTitle`). */
function what(view: MaxPostView): string {
  return maxBossTitle(view.boss.name, view.party.max.tier);
}

/** `Until 21:00 (in 3 hours).`, `Ended at …`, or why staff closed it. */
function timesOf(view: MaxPostView): string {
  if (view.closed !== undefined) return view.closed;
  const end = view.party.endTime ?? view.party.lastPossibleTime ?? view.now;
  return maxEnded(view.party, view.now)
    ? `Ended at ${timestamp(end, 'f')}.`
    : `Until ${timestamp(end)} (${timestamp(end, 'R')}).`;
}

/**
 * What the post says under the end of a max battle whose end was guessed from a screenshot (as
 * a raid's `UNCERTAIN_TIME`; only `/end` sets a max battle's time, review R14): the moment it
 * was taken is not known (guessed, its sources disagree, or a clock read poorly); a dated file or
 * a clock read surely is exact however old (decision 7, review S-6).
 */
export const UNCERTAIN_MAX_TIME =
  'This end is a guess: I could not tell when the screenshot was taken. `/end` sets it right.';

/** The end, and under it that it is a guess while the battle is on (`UNCERTAIN_MAX_TIME`). */
function describeEnd(view: MaxPostView): string[] {
  const uncertain = view.party.max.screenshot?.timeUncertain === true && !shownOver(view);
  return [timesOf(view), ...(uncertain ? [UNCERTAIN_MAX_TIME] : [])];
}

/**
 * The lines about the boss: its types, what it is weak to and the CP it is caught with (level 20,
 * never boosted, so no weather: plan 8F-1); no moves (Matt: random from the pool).
 */
function bossLines(view: MaxPostView): string[] {
  const { entry } = view.boss;
  if (!entry) return [];
  return [typesLine(entry, view.emoji), ...maxBossFacts(view.catalogue, entry, view.emoji)];
}

/** `**Gazebo of the Park** (Power Spot)`: a spot's first words, made safe by `text`. */
function spotWords(spot: PowerSpot, text: (raw: string) => string): string {
  return `**${text(spot.title)}** (${PLACE_KIND_WORDS.powerspot})`;
}

/**
 * Where the battle is (design 3.3), under `**Where**`: a power spot as a meetup's known place,
 * `**<title>** (Power Spot) · <address> · [Map](<…>)` with its Wayfarer picture beside it
 * (`placeSection`); a pin `📍 **Unlisted power spot** · [Map](<…>)` (Q7), without a picture.
 */
function maxWhere(view: MaxPostView, fit: Fit): PostBlock {
  const { spot } = view.party.max;
  if (spot.kind === 'pin') {
    return {
      type: 'text',
      content: `${WHERE_HEADING}\n📍 **${UNLISTED_SPOT}** · ${mapMarkdown(spot)}`,
    };
  }
  const shown = spotNow(spot, view.wayspot);
  return placeSection(fit, {
    heading: WHERE_HEADING,
    line: (address) =>
      [spotWords(shown, plain), ...(address === '' ? [] : [address]), mapMarkdown(shown)].join(
        ' · ',
      ),
    address: plain(shown.address ?? ''),
    picture: wayspotPicture(shown.image),
    under: [],
  });
}

/** The spot in one line for a direct message (no links, no Map), and its point for the Map. */
function briefSpot(view: MaxPostView): { line: string; map: string } {
  const { spot } = view.party.max;
  if (spot.kind === 'pin') return { line: `📍 **${UNLISTED_SPOT}**`, map: gymMapsUrl(spot) };
  const shown = spotNow(spot, view.wayspot);
  const address = shown.address ? plainNoLinks(shown.address) : '';
  return {
    line: [spotWords(shown, plainNoLinks), ...(address === '' ? [] : [address])].join(' · '),
    map: gymMapsUrl(shown),
  };
}

/** `Dynamax Machamp (2★) · Gazebo of the Park`: the post's title; the spot gives way last. */
export function maxTitle(view: Pick<MaxPostView, 'party' | 'boss' | 'wayspot'>): string {
  const { spot } = view.party.max;
  const name = spot.kind === 'pin' ? UNLISTED_SPOT : spotNow(spot, view.wayspot).title;
  const where = truncate(tidyTitle(name), 60);
  const battle = tidyTitle(maxBossTitle(view.boss.name, view.party.max.tier));
  return tidyTitle(`${truncate(battle, LIMITS.title - where.length - 3)} · ${where}`);
}

/** Its forum tag (`Max battle`), and `Ended` once it is over. */
export function maxTags(party: MaxParty, now: number): ForumTag[] {
  return ['Max battle', ...(maxEnded(party, now) ? ['Ended' as const] : [])];
}

function colour(view: MaxPostView): number {
  return shownOver(view) ? ENDED_COLOUR : MAX_COLOUR;
}

/**
 * The post of a max battle laid out (design 3.3), as a raid's (plan 8D): what it is, its end, its
 * boss's types and weaknesses, with the boss's picture beside them; Where (the spot); who comes,
 * a group's heading counting its lobby; the controls (a battle's: Done completes; Remote kept; no
 * Set time, no Screenshot feedback); who reported it.
 */
function maxLayout(view: MaxPostView): PostLayout {
  const { party, boss } = view;
  const shiny = boss.shiny ? ` ${view.emoji.shiny}` : '';
  const header = [
    `### ${plain(what(view))}${shiny}`,
    ...describeEnd(view),
    // Not in the last showing of one that was closed: that post is archived.
    ...(party.saved && view.closed === undefined ? [KEPT_OPEN] : []),
    ...bossLines(view),
  ].join('\n');
  return fittedLayout((fit) => ({
    accent: colour(view),
    ...(boss.image === undefined ? {} : { picture: boss.image }),
    blocks: [
      { type: 'section', content: header, accessory: 'picture', role: 'head' },
      { type: 'separator' },
      inRole('where', maxWhere(view, fit)),
      { type: 'separator' },
      // The hint names Meet…, which a max battle has while it is on.
      ...trainerBlocks(view, { complete: true, lobby: true, meetHint: !shownOver(view) }, fit),
      { type: 'separator' },
      { type: 'controls', rows: bottomControls(party, { emoji: view.emoji }) },
      ...(party.anonymous
        ? []
        : [
            {
              type: 'text' as const,
              role: 'note' as const,
              content: `-# Reported by ${memberByName(memberOf(party, party.createdById))}`,
            },
          ]),
    ],
  }));
}

/**
 * The max battle in brief, for a direct message (design 3.3: as a raid's, the spot in the place
 * of the gym): what it is, its end, where, how many come; the post's colour and picture, the
 * spot's Map.
 */
function maxBrief(view: MaxPostView): PartyBrief {
  const spot = briefSpot(view);
  return {
    accent: colour(view),
    ...(view.boss.image === undefined ? {} : { picture: view.boss.image }),
    lines: [`**${plain(what(view))}**`, timesOf(view), spot.line, trainerCount(view.party)],
    whereLine: spot.line,
    map: spot.map,
  };
}

/**
 * The forum post of a max battle: title, tags, the components-v2 message and the brief of a
 * direct message. Pure: the same view gives the same post.
 */
export function renderMaxPost(view: MaxPostView): RenderedPost {
  const tags = maxTags(view.party, view.now);
  return renderedPost({
    title: maxTitle(view),
    tags: view.closed === undefined || tags.includes('Ended') ? tags : [...tags, 'Ended'],
    layout: maxLayout(view),
    brief: maxBrief(view),
  });
}

/** A max battle's spot by name, made safe for text that reaches DMs (`plainNoLinks`). */
export function spotText(party: MaxParty): string {
  return plainNoLinks(maxSpotName(party.max.spot));
}
