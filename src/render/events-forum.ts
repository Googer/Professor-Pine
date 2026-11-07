import type { APIComponentInContainer } from 'discord.js';
import { CAMPFIRE_DISCOVER_URL } from '../domain/campfire.js';
import {
  eventTimeWords,
  hasCampfireHint,
  hasCampfirePostHint,
  type ListedEvent,
  type ListingSections,
} from '../domain/time/event-listing.js';
import type { PlannedCounts } from '../domain/party/event-parties.js';
import type { V2Message } from '../discord/party-gateway.js';
import { plannedCountWords, plannedSection, type EventPlannedView } from './event-parties.js';
import { TEXT_BUDGET } from './party-post.js';
import { linkTextOf } from './raid-post.js';
import { fitLines } from './summary.js';
import { LIMITS, plain } from './text.js';
import { container, LIST_COLOUR, mediaGallery, separator, textDisplay } from './v2.js';

/*
 * The events forum's messages (plan 8V-1; design `2026-10-28-events-forum-design.md`): the pinned
 * listing "Events" and an event's post. Which events, in which section, and their times in words
 * are the domain's (`event-listing.ts`); the words around them are here. Times are plain local
 * text (ruling A), never Discord's stamps; nobody is pinged; the feed's text goes through
 * `plain()`.
 */

/** The listing post's title, and its message's heading. */
export const EVENTS_TITLE = 'Events';

/** What the listing says when nothing is listed. */
export const NO_EVENTS = 'No events listed right now.';

/** The link to Campfire's map, as the foot and a post show it. */
const CAMPFIRE_LINK = `[Campfire](<${CAMPFIRE_DISCOVER_URL}>)`;

/**
 * The foot under the listing where any listed event has the Campfire hint: Campfire named once
 * there, no line marked (plan 8M-15, V1; Matt 2026-10-30).
 */
export const CAMPFIRE_FOOT = `Official meetups by Community Ambassadors are on ${CAMPFIRE_LINK}`;

/** What an event's post says once Leek Duck dropped the event before its start. */
export const DROPPED_WORDS = 'Leek Duck no longer lists this event.';

/**
 * An event's post's title: its name cut to Discord's 100 characters, counted by code points as
 * the feed's names are (`eventName`), the white space at the end of a cut dropped (review V3).
 */
export function eventPostTitle(name: string): string {
  return Array.from(name).slice(0, LIMITS.title).join('').trimEnd();
}

/** The section headings, by the domain's sections. */
const HEADINGS: Readonly<Record<keyof ListingSections, string>> = {
  now: 'Now',
  week: 'This week',
  coming: 'Coming up',
};

/** The head's words for a section's count. */
const COUNT_WORDS: Readonly<Record<keyof ListingSections, string>> = {
  now: 'now',
  week: 'this week',
  coming: 'coming up',
};

/** An event's name, linked to its Leek Duck page where the feed gives one, in bold. */
function nameOf(event: Pick<ListedEvent, 'name' | 'link'>): string {
  return event.link === null
    ? `**${plain(event.name)}**`
    : `**[${linkTextOf(event.name)}](<${event.link}>)**`;
}

/**
 * An event's line: its name (linked to Leek Duck), its times as plain local text, and its post
 * where it has one, then the trains and meetups planned during it where it has any ("3 trains,
 * 1 meetup planned"). No line names Campfire (plan 8M-15, V1): the foot does, once.
 */
export function eventLine(
  event: ListedEvent,
  postId: string | undefined,
  zone: string,
  planned?: PlannedCounts,
): string {
  const counted = planned === undefined ? undefined : plannedCountWords(planned);
  return [
    nameOf(event),
    eventTimeWords(event.start, event.end, zone),
    ...(postId === undefined ? [] : [`<#${postId}>`]),
    ...(counted === undefined ? [] : [`${counted} planned`]),
  ].join(' · ');
}

/**
 * The listing (`EVENTS_TITLE`): a head counting the sections, each section with its count and its
 * lines by start (`listingSections`), the hint's foot once where a listed event has it, all within
 * `TEXT_BUDGET` (a section that does not fit ends with "…and N more" and keeps its count, as the
 * region's summary does). `postOf` gives an event's post where it has one, `plannedOf` the trains and
 * meetups planned during it.
 */
export function listingMessage(
  sections: ListingSections,
  postOf: (eventId: string) => string | undefined,
  zone: string,
  plannedOf: (eventId: string) => PlannedCounts | undefined = () => undefined,
): V2Message {
  const order = ['now', 'week', 'coming'] as const;
  const shown = order.filter((key) => sections[key].length > 0);
  const counts = shown.map((key) => `${String(sections[key].length)} ${COUNT_WORDS[key]}`);
  const head = `### ${EVENTS_TITLE}\n${counts.length === 0 ? NO_EVENTS : counts.join(' · ')}`;
  const hinted = shown.some((key) => sections[key].some((event) => hasCampfireHint(event)));
  const foot = hinted ? `-# ${CAMPFIRE_FOOT}` : undefined;
  const parts: APIComponentInContainer[] = [textDisplay(head)];
  let used = head.length + (foot?.length ?? 0);
  for (const [index, key] of shown.entries()) {
    const heading = `**${HEADINGS[key]} · ${String(sections[key].length)}**`;
    // Each section after it is sure of its heading and a line that counts what does not fit.
    const later = shown.slice(index + 1).length * 60;
    const room = TEXT_BUDGET - used - later - heading.length - 1;
    const lines = sections[key].map((event) =>
      eventLine(event, postOf(event.id), zone, plannedOf(event.id)),
    );
    const text = [heading, ...fitLines(lines, room)].join('\n');
    used += text.length;
    parts.push(separator(), textDisplay(text));
  }
  if (foot !== undefined) parts.push(separator(), textDisplay(foot));
  return { v2: true, components: [container(LIST_COLOUR, parts)] };
}

/**
 * An event's post: its name as a heading, its times, "More on Leek Duck" where the feed links its
 * page, the Campfire hint for an event shorter than a day whose kind gets it (`hasCampfirePostHint`,
 * plan 8M-15), and the feed's picture (Discord loads it or shows nothing; Pine fetches nothing,
 * R6). With `dropped`, the line that Leek Duck no longer lists it; with `planned`, the trains and
 * meetups planned during it under the times (`plannedSection`, within the text budget). No buttons,
 * and it pings nobody.
 */
export function eventPostMessage(
  event: ListedEvent,
  zone: string,
  options: { dropped?: boolean; planned?: EventPlannedView } = {},
): V2Message {
  const text = [
    `## ${plain(event.name)}`,
    eventTimeWords(event.start, event.end, zone),
    ...(event.link === null ? [] : [`[More on Leek Duck](<${event.link}>)`]),
    ...(hasCampfirePostHint(event) ? [`Official meetups, if any: ${CAMPFIRE_LINK}`] : []),
  ].join('\n');
  const planned =
    options.planned === undefined
      ? undefined
      : plannedSection(options.planned, zone, TEXT_BUDGET - text.length - DROPPED_WORDS.length);
  const parts: APIComponentInContainer[] = [
    textDisplay(text),
    ...(planned === undefined ? [] : [textDisplay(planned)]),
    ...(options.dropped === true ? [textDisplay(DROPPED_WORDS)] : []),
    ...(event.image === null ? [] : [mediaGallery([{ url: event.image }])]),
  ];
  return { v2: true, components: [container(LIST_COLOUR, parts)] };
}
