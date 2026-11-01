import { memberOf, type MeetupParty, type MeetupPlace } from '../domain/party/party.js';
import { nameOf } from '../domain/party/timed.js';
import { bottomControls } from './party-controls.js';
import {
  cutText,
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
} from './party-post.js';
import { addressLine } from '../domain/geo/google.js';
import { shownPlace, type KnownPlace } from '../domain/geo/place.js';
import { wayspotAddressLine } from '../domain/geo/wayfarer-address.js';
import { wayspotPicture } from '../domain/wayspots/picture.js';
import type { Wayspot } from '../domain/wayspots/kept.js';
import { PLACE_KIND_WORDS, pinLine } from './place.js';
import {
  gymMapsUrl,
  gymName,
  LOCATION_ROOM,
  mapMarkdown,
  placeSection,
  WHERE_HEADING,
  type PostGym,
} from './raid-post.js';
import { LIMITS, memberByName, plain, plainLines, plainNoLinks, truncate } from './text.js';
import { describeTimes, shownAsOver, TIMED_COLOUR, type TimedPostView } from './timed-post.js';

/**
 * What the post of a meetup is rendered from (see `TimedPostView`), with where the place of the
 * meetup is now: the gym with an id (the gyms of the bot) and the kept Wayspot with an id
 * (`ctx.wayspots`), each undefined when it is gone. Without them the place is shown as it was
 * named.
 */
export interface MeetupPostView extends TimedPostView<MeetupParty> {
  gym?: (id: number) => PostGym | undefined;
  wayspot?: (id: string) => Wayspot | undefined;
}

/** A known place as it is shown: the place, and the notice of a gym as it is now. */
interface ShownPlace {
  place: KnownPlace;
  notice: string | null;
}

/**
 * The place of a meetup as its post shows it now (`placeNow`): what a direct message about it
 * names, so that it says what the post says. Null without a place.
 */
export function meetupPlaceNow(view: MeetupPostView): MeetupPlace | null {
  const { place } = view.party.meetup;
  if (place === null || place.kind === 'pin') return place;
  return placeNow(view, place).place;
}

/**
 * The place a meetup was named at, as it is now while it is the same place (`shownPlace`: a
 * rename, a new picture, address or notice show), else as it was named.
 */
function placeNow(view: MeetupPostView, snapshot: KnownPlace): ShownPlace {
  let now: ShownPlace | undefined;
  if (snapshot.kind === 'gym') {
    const gym = /^\d+$/u.test(snapshot.id) ? view.gym?.(Number(snapshot.id)) : undefined;
    if (gym) {
      now = {
        place: {
          kind: 'gym',
          id: snapshot.id,
          title: gymName(gym),
          lat: gym.lat,
          lon: gym.lon,
          address: addressLine(gym.geodata ?? null),
          image: gym.imageUrl ?? null,
        },
        notice: gym.notice,
      };
    }
  } else {
    const wayspot = view.wayspot?.(snapshot.id);
    if (wayspot) {
      now = {
        place: {
          kind: wayspot.kind,
          id: wayspot.id,
          // A title gone blank is no name: the one it was named by stays.
          title: wayspot.title.trim() === '' ? snapshot.title : wayspot.title,
          lat: wayspot.lat,
          lon: wayspot.lon,
          address: wayspotAddressLine(wayspot.address),
          image: wayspot.image,
        },
        notice: null,
      };
    }
  }
  const shown = shownPlace(snapshot, now?.place);
  return now !== undefined && shown === now.place ? now : { place: snapshot, notice: null };
}

/** `Near **Fountain Square** (PokéStop)`: a known place as the first words of its line. */
function nearWords(place: KnownPlace, text: (raw: string) => string): string {
  return `Near **${text(place.title)}** (${PLACE_KIND_WORDS[place.kind]})`;
}

/**
 * Where the meetup is (Matt, 2026-10-17), under `**Where**` after its heading block: a gym,
 * PokéStop or power spot as `nearLine` says it (`Near **<title>** (PokéStop) · <address> ·
 * [Map](<…>)`, the address `NO_ADDRESS` beside a picture without one), then a gym's notice, with
 * the place's picture beside them; a pin as `pinLine` says it. Nothing without a place: what
 * more there is to say stands under "Meeting Information". A notice is cut through `fit.part`
 * when the post is too long.
 */
function meetupWhere(view: MeetupPostView, fit: Fit): PostBlock[] {
  const { place } = view.party.meetup;
  if (place === null) return [];
  if (place.kind === 'pin') {
    return [{ type: 'text', content: `${WHERE_HEADING}\n${pinLine(place, plain)}` }];
  }
  const shown = placeNow(view, place);
  const notice = shown.notice ? plainLines(shown.notice) : '';
  return [
    placeSection(fit, {
      heading: WHERE_HEADING,
      line: (address) =>
        [
          nearWords(shown.place, plain),
          ...(address === '' ? [] : [address]),
          mapMarkdown(shown.place),
        ].join(' · '),
      address: plain(shown.place.address ?? ''),
      picture: wayspotPicture(shown.place.image),
      under:
        notice === '' ? [] : [fit.part((room) => cutText(notice, Math.min(room, LOCATION_ROOM)))],
    }),
  ];
}

/**
 * The place of a meetup in one line for a direct message (the first line of its Where without
 * its map, without links: `plainNoLinks`), and its point for the brief's Map; undefined without
 * a place.
 */
function briefPlace(view: MeetupPostView): { line: string; map: string } | undefined {
  const { place } = view.party.meetup;
  if (place === null) return undefined;
  if (place.kind === 'pin') {
    return { line: pinLine(place, plainNoLinks, { map: false }), map: gymMapsUrl(place) };
  }
  const { place: shown } = placeNow(view, place);
  const address = shown.address ? plainNoLinks(shown.address) : '';
  return {
    line: [nearWords(shown, plainNoLinks), ...(address === '' ? [] : [address])].join(' · '),
    map: gymMapsUrl(shown),
  };
}

/**
 * The kind word a meetup's title starts with (plan 8R-9F, M1: a list that shows the title does not
 * say the kind again).
 */
export const MEETUP_TITLE_KIND = 'Meetup';

/** `Meetup · Community Day picnic`: the title of the post, which is also how lists name it. */
export function meetupTitle(party: MeetupParty): string {
  return tidyTitle(truncate(tidyTitle(`${MEETUP_TITLE_KIND} · ${nameOf(party)}`), LIMITS.title));
}

/** What it is, and that it has ended once it is over. */
export function meetupTags(party: MeetupParty, now: number): ForumTag[] {
  return ['Meetup', ...(shownAsOver(party, now) ? ['Ended' as const] : [])];
}

/** What the members wrote about the meetup, made plain; empty when it is nothing. */
function information(party: MeetupParty): string {
  // A text of nothing but white space is empty once plain, and then has no heading either.
  return party.meetup.description === null ? '' : plainLines(party.meetup.description);
}

function colour(view: MeetupPostView): number {
  return view.closed !== undefined || shownAsOver(view.party, view.now)
    ? ENDED_COLOUR
    : TIMED_COLOUR;
}

/**
 * The post of a meetup laid out: its name and times; what the members wrote about it, never
 * cut (a form takes 1,000 characters, well within the text a post may have); who comes, with the
 * buttons; the rows of the rest of the controls; who made it (a meetup always names its maker).
 */
function meetupLayout(view: MeetupPostView): PostLayout {
  const { party } = view;
  const header = [
    `### Meetup: ${plain(nameOf(party))}`,
    view.closed ?? describeTimes(view),
    // Not in the last showing of a meetup that was closed: that post is archived.
    ...(party.saved && view.closed === undefined ? [KEPT_OPEN] : []),
  ].join('\n');
  const about = information(party);
  return fittedLayout((fit) => ({
    accent: colour(view),
    blocks: [
      { type: 'text', content: header, role: 'head' },
      { type: 'separator' },
      ...meetupWhere(view, fit).map((block) => inRole('where', block)),
      { type: 'separator' },
      ...(about === ''
        ? []
        : [{ type: 'text' as const, content: `**Meeting Information**\n${about}` }]),
      { type: 'separator' },
      ...trainerBlocks(view, { complete: false, lobby: false, meetHint: false }, fit),
      { type: 'separator' },
      { type: 'controls', rows: bottomControls(party, { emoji: view.emoji }) },
      {
        type: 'text',
        role: 'note',
        content: `-# Created by ${memberByName(memberOf(party, party.createdById))}`,
      },
    ],
  }));
}

/**
 * The meetup in brief, for a direct message: its name, its times as the post says them and how
 * many come, with the colour of its post.
 */
function meetupBrief(view: MeetupPostView): PartyBrief {
  const { party } = view;
  const place = briefPlace(view);
  return {
    accent: colour(view),
    lines: [
      `**Meetup: ${plain(nameOf(party))}**`,
      view.closed ?? describeTimes(view),
      ...(place === undefined ? [] : [place.line]),
      trainerCount(party),
    ],
    ...(place === undefined ? {} : { whereLine: place.line }),
    ...(place?.map === undefined ? {} : { map: place.map }),
  };
}

/**
 * The forum post of a meetup: title, tags, the components-v2 message and the brief of a direct
 * message. Pure: the same view gives the same post. It has what the post of a raid has without
 * what belongs to a gym or a boss.
 */
export function renderMeetupPost(view: MeetupPostView): RenderedPost {
  const { party, now } = view;
  const tags = meetupTags(party, now);
  return renderedPost({
    title: meetupTitle(party),
    tags: view.closed === undefined || tags.includes('Ended') ? tags : [...tags, 'Ended'],
    layout: meetupLayout(view),
    brief: meetupBrief(view),
  });
}
