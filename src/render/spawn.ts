import type { APIComponentInContainer } from 'discord.js';
import type { ClassicMessage, V2Message } from '../discord/party-gateway.js';
import {
  memberName,
  memberText,
  plain,
  plainNoLinks,
  timestamp,
  type NamedMember,
} from './text.js';
import { wayspotPicture } from '../domain/wayspots/picture.js';
import type { Place } from '../domain/geo/place.js';
import { PLACE_KIND_WORDS, pinLine, placeImage } from './place.js';
import { mapMarkdown } from './raid-post.js';
import { container, section, separator, textDisplay, thumbnail } from './v2.js';

/** The colour of a spawn report, as the legacy bot's. */
export const SPAWN_COLOUR = 0x2ecc71;

/** How long a spawn report stays in the region's channel. */
export const SPAWN_MINUTES = 30;

/** The legacy bot's sentence about what a report of a spawn is worth. */
export const SPAWN_WARNING =
  '**Warning: Spawns are user-reported. There is no way to know exactly how long a Pokémon ' +
  'will be there. Most spawns are 30 min. Use your discretion when chasing them.**';

/** What the public message has in the place of the legacy bot's second line about `!want`. */
export const SPAWN_FOOTER = '/want tells you of spawns like this one · /wild reports one';

/**
 * The footer of the public message: it names `/want` only where the server has notifications
 * (`settings.features.notifications`); elsewhere there is no such command.
 */
export function spawnFooter(notifications: boolean): string {
  return notifications ? SPAWN_FOOTER : '/wild reports a spawn like this one';
}

/**
 * The gym, PokéStop or power spot a reporter said the Pokémon is near (`/wild near:`, plan 8W-2),
 * as it was then (a snapshot: the report is never shown anew), or a pin they gave by a maps link
 * or coordinates (Matt, 2026-10-17).
 */
export type SpawnPlace = Place;

/** Said in place of the address of a place that has none. */
const NO_PLACE_ADDRESS = '(no address available)';

/**
 * The picture of the place a spawn is near as a report shows it beside Where (a gym's or
 * Wayspot's, `wayspotPicture`); none for a pin or a place without one. The map's popup shows the
 * same one (`spawnsView`).
 */
export function nearPicture(place: SpawnPlace | undefined): string | undefined {
  return wayspotPicture(placeImage(place));
}

/**
 * The address of a place a spawn is near as `nearLine` says it: none for a place without one, or
 * `(no address available)` where its picture is shown beside the line (`pictured`); none for a
 * pin, whose line names no address. `text` makes it safe where it is shown (`plainNoLinks` on
 * Discord; the map's popup, which shows text as text, takes it as it is).
 */
export function nearAddress(
  place: SpawnPlace,
  pictured: boolean,
  text: (raw: string) => string = plainNoLinks,
): string | undefined {
  if (place.kind === 'pin') return undefined;
  const address = place.address === null || place.address === '' ? '' : text(place.address);
  if (address !== '') return address;
  return pictured ? NO_PLACE_ADDRESS : undefined;
}

/**
 * `Near **Fountain Square** (PokéStop) · 20 Market Street, Pinewood · [Map](<…>)`: the title and
 * the address made plain without links (they reach other members' direct messages), the kind,
 * and the place's maps link. A place without an address says so where its picture is shown
 * beside the line (`pictured`), so that the picture never sits beside a bare name; elsewhere (a
 * direct message, a report sent again without pictures, classic text) the address is left out.
 * A pin is `pinLine` (the report's details are its own line):
 * `📍 Near **Fountain Square** (PokéStop) · [Map](<…>)`, `📍 Dropped pin · [Map](<…>)`.
 */
export function nearLine(
  place: SpawnPlace,
  { pictured = false, officially }: { pictured?: boolean; officially?: string | undefined } = {},
): string {
  if (place.kind === 'pin') return pinLine(place, plainNoLinks);
  const shown = nearAddress(place, pictured) ?? '';
  // The moderators' posts (plan 8S-2) name a gym's official name beside the nickname it shows.
  const kind =
    officially === undefined
      ? PLACE_KIND_WORDS[place.kind]
      : `${PLACE_KIND_WORDS[place.kind]}; officially **${plainNoLinks(officially)}**`;
  return (
    `Near **${plainNoLinks(place.title)}** (${kind}) · ` +
    `${shown === '' ? '' : `${shown} · `}${mapMarkdown(place)}`
  );
}

/** A reported wild Pokémon as it is shown. */
export interface SpawnView {
  /** The Pokémon's name as the game data has it. */
  pokemon: string;
  /** Set when the reporter says its IVs are perfect or zero. */
  iv?: 'perfect' | 'zero' | undefined;
  /** Where it is, as the member typed it; null when they said nothing. */
  details: string | null;
  reporter: NamedMember;
  /** The address of the Pokémon's picture, when one is known. */
  image?: string | undefined;
  /** The place the reporter named it near, when they did. */
  near?: SpawnPlace | undefined;
  /** An event on lists it costumed (plan 8R-4): "costumed" before its name. */
  costumed?: boolean;
}

/** How the IVs a reporter checked are said: `100% IVs`, `0% IVs`. */
export const IV_WORDS = { perfect: '100% IVs', zero: '0% IVs' } as const;

/** `**Dratini**`, `**Dratini** with 100% IVs`, `costumed **Pikachu**` (plan 8R-4). */
function spawnName(view: Pick<SpawnView, 'pokemon' | 'iv' | 'costumed'>): string {
  const ivs = view.iv === undefined ? '' : ` with ${IV_WORDS[view.iv]}`;
  return `${view.costumed === true ? 'costumed ' : ''}**${plain(view.pokemon)}**${ivs}`;
}

/** What a report says of a spawn's worth in its small print (the legacy bot's warning, shorter). */
export const SPAWN_CAUTION = 'Spawns can be gone before you get there.';

/**
 * The blocks under the head of a report: where the spawn is (the place it is near after the
 * reporter's words, with its picture beside them; the Pokémon's stays beside the head), then
 * the small print.
 */
function spawnBody(view: SpawnView, smallPrint: string): APIComponentInContainer[] {
  const picture = nearPicture(view.near);
  const where = [
    whereText(view),
    ...(view.near ? [nearLine(view.near, { pictured: picture !== undefined })] : []),
  ]
    .filter((line) => line !== '')
    .join('\n');
  const text = `**Where**\n${where}`;
  return [
    ...(where === ''
      ? []
      : [
          separator(),
          picture === undefined ? textDisplay(text) : section(text, thumbnail(picture)),
        ]),
    textDisplay(`-# ${smallPrint}`),
  ];
}

/** The head of a report with the Pokémon's picture beside it, or alone without one. */
function spawnHead(view: SpawnView, text: string): APIComponentInContainer {
  return view.image === undefined ? textDisplay(text) : section(text, thumbnail(view.image));
}

/**
 * The public message in the region's text channel, a components-v2 message (the draft "In the
 * channels"): `### Wild Dratini`, the IVs and who reported it (in a sentence that pings
 * nobody), when the report goes away, the picture beside them; where it is, in the member's
 * words made plain without a working link (the legacy bot posted them raw, and they could
 * ping); and in small print the caution and `spawnFooter`. It is deleted after `SPAWN_MINUTES`.
 */
export function spawnMessage(view: SpawnView, footer: string, goneAt: number): V2Message {
  const by = (word: 'Reported' | 'reported') => `${word} by ${memberText(view.reporter)}`;
  const head = [
    `### Wild ${view.costumed === true ? 'costumed ' : ''}${plain(view.pokemon)}`,
    view.iv === undefined ? by('Reported') : `with ${IV_WORDS[view.iv]} · ${by('reported')}`,
    `This report goes away ${timestamp(goneAt, 'R')}.`,
  ].join('\n');
  return {
    v2: true,
    components: [
      container(SPAWN_COLOUR, [
        spawnHead(view, head),
        ...spawnBody(view, `${SPAWN_CAUTION} · ${footer}`),
      ]),
    ],
  };
}

/**
 * The public message for a channel in which the bot may not post embeds: classic text, as
 * before components v2 (whether Discord shows a v2 message there is not known; staging), with
 * the legacy bot's warning, the footer in small print, and no picture.
 */
export function spawnTextMessage(view: SpawnView, footer: string): ClassicMessage {
  const details = [whereText(view), ...(view.near ? [nearLine(view.near)] : [])]
    .filter((line) => line !== '')
    .join('\n');
  const description = details === '' ? SPAWN_WARNING : `${details}\n\n${SPAWN_WARNING}`;
  return {
    content:
      `A wild ${spawnName(view)} has been reported by ${memberText(view.reporter)}:\n` +
      `${description}\n-# ${footer}`,
  };
}

/**
 * The sentence where the region has to be named: in a direct message, and in the channel for
 * Unown sightings. The reporter is named by name alone, as in every direct message. A direct
 * message leads to the report by its "Go to report" button; the sighting is the head of its
 * own container (`sightingMessage`).
 */
export function spawnSentence(view: SpawnView, regionChannelId: string): string {
  return (
    `A wild ${spawnName(view)} has been reported in <#${regionChannelId}> ` +
    `by **${memberName(view.reporter)}**.`
  );
}

/** Where a spawn is, in the reporter's words made plain without links; empty when they said nothing. */
function whereText(view: SpawnView): string {
  return view.details === null ? '' : plainNoLinks(view.details);
}

/**
 * A spawn in brief, for a direct message (`notifyDm`): where it is and when the report goes away,
 * with the Pokémon's picture and the colour of a report.
 */
export function spawnBrief(
  view: SpawnView,
  goneAt: number,
): { accent: number; picture?: string; lines: string[] } {
  const where = whereText(view);
  return {
    accent: SPAWN_COLOUR,
    ...(view.image === undefined ? {} : { picture: view.image }),
    lines: [
      ...(where === '' ? [] : [`**Where** ${where}`]),
      ...(view.near ? [nearLine(view.near)] : []),
      `The report goes away ${timestamp(goneAt, 'R')}.`,
    ],
  };
}

/**
 * The message in the server's channel for Unown sightings, which stays: the report's container
 * with the sentence that names the region as its head, and the caution in small print (no
 * "goes away": the sighting stays, and no footer, as before).
 */
export function sightingMessage(view: SpawnView, regionChannelId: string): V2Message {
  return {
    v2: true,
    components: [
      container(SPAWN_COLOUR, [
        spawnHead(view, spawnSentence(view, regionChannelId)),
        ...spawnBody(view, SPAWN_CAUTION),
      ]),
    ],
  };
}
