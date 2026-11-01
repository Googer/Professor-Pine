import { ComponentType, type APIMessageTopLevelComponent } from 'discord.js';
import { describe, expect, it } from 'vitest';
import { listedEvent } from '../../test/support/event-forum-store-cases.js';
import type { ListedEvent, ListingSections } from '../domain/time/event-listing.js';
import {
  CAMPFIRE_FOOT,
  DROPPED_WORDS,
  eventLine,
  eventPostMessage,
  listingMessage,
  NO_EVENTS,
} from './events-forum.js';
import { TEXT_BUDGET } from './party-post.js';
import { plain } from './text.js';

const ZONE = 'America/New_York';
const at = (iso: string): number =>
  Temporal.PlainDateTime.from(iso).toZonedDateTime(ZONE).epochMilliseconds;

/** The texts of a message's text displays, in order. */
function texts(components: readonly APIMessageTopLevelComponent[]): string[] {
  const found: string[] = [];
  const visit = (component: unknown): void => {
    const one = component as { type: ComponentType; content?: string; components?: unknown[] };
    if (one.type === ComponentType.TextDisplay && one.content !== undefined) {
      found.push(one.content);
    }
    for (const child of one.components ?? []) visit(child);
  };
  for (const component of components) visit(component);
  return found;
}

const day = listedEvent({
  start: at('2026-11-21T14:00'),
  end: at('2026-11-21T17:00'),
});
const hour = listedEvent({
  id: 'raidhour20261118',
  name: 'Cresselia and Darkrai Raid Hour',
  eventType: 'raid-hour',
  link: 'https://leekduck.com/events/raidhour20261118/',
  image: null,
  start: at('2026-11-18T18:00'),
  end: at('2026-11-18T19:00'),
});
const wild = listedEvent({
  id: 'into-the-wild-2026',
  name: 'Into the Wild',
  eventType: 'event',
  link: null,
  start: at('2026-11-09T10:00'),
  end: at('2026-11-13T20:00'),
});
const sections = (over: Partial<ListingSections> = {}): ListingSections => ({
  now: [],
  week: [],
  coming: [],
  ...over,
});

describe('an event’s line of the listing (plan 8V-1)', () => {
  // Plan 8M-15 (V1): no line is marked Campfire; the foot says it once.
  it('names it, linked to Leek Duck, with its times and its post', () => {
    expect(eventLine(day, '800000000000000001', ZONE)).toBe(
      '**[Pawniard Community Day](<https://leekduck.com/events/november-communityday2026/>)** · ' +
        'Sat, Nov 21, 2–5 PM · <#800000000000000001>',
    );
  });

  it('names one without a link or post plainly, its name made safe', () => {
    const odd = listedEvent({ ...wild, name: 'Into the *Wild* [2026](x)' });
    expect(eventLine(odd, undefined, ZONE)).toBe(`**${plain(odd.name)}** · Nov 9 – Nov 13`);
    expect(plain(odd.name)).toContain('\\*Wild\\*');
  });
});

describe('the listing "Events" (plan 8V-1)', () => {
  it('counts the sections in its head, lists each by start, and says the hint once at the foot', () => {
    const message = listingMessage(
      sections({ now: [wild], week: [hour], coming: [day] }),
      (id) => (id === day.id ? '800000000000000001' : undefined),
      ZONE,
    );
    const shown = texts(message.components);
    expect(shown[0]).toBe('### Events\n1 now · 1 this week · 1 coming up');
    expect(shown[1]).toBe(`**Now · 1**\n${eventLine(wild, undefined, ZONE)}`);
    expect(shown[2]).toBe(`**This week · 1**\n${eventLine(hour, undefined, ZONE)}`);
    expect(shown[3]).toBe(`**Coming up · 1**\n${eventLine(day, '800000000000000001', ZONE)}`);
    // Plan 8M-15 (V1): Campfire once, at the foot, with its link.
    expect(shown[4]).toBe(`-# ${CAMPFIRE_FOOT}`);
    expect(CAMPFIRE_FOOT).toBe(
      'Official meetups by Community Ambassadors are on ' +
        '[Campfire](<https://campfire.scopely.com/discover>)',
    );
    expect(shown.slice(0, 4).join('\n')).not.toContain('Campfire');
    expect(JSON.stringify(message)).not.toMatch(/<t:/u);
  });

  it('has no foot where no listed event has the hint', () => {
    const safari = listedEvent({ ...day, id: 'safari', eventType: 'city-safari' });
    const shown = texts(
      listingMessage(sections({ coming: [safari] }), () => undefined, ZONE).components,
    );
    expect(shown.join('\n')).not.toContain('Campfire');
  });

  it('says so when nothing is listed, without the foot', () => {
    expect(texts(listingMessage(sections(), () => undefined, ZONE).components)).toEqual([
      `### Events\n${NO_EVENTS}`,
    ]);
    expect(NO_EVENTS).toBe('No events listed right now.');
  });

  it('keeps within the text budget, a section ending with "…and N more" and keeping its count', () => {
    const many = Array.from({ length: 200 }, (_, n) =>
      listedEvent({
        id: `event-${String(n)}`,
        name: `A rather long event name number ${String(n)} for the listing`,
        start: day.start + n * 60_000,
        end: day.end + n * 60_000,
      }),
    );
    const shown = texts(
      listingMessage(sections({ coming: many }), () => undefined, ZONE).components,
    );
    const coming = shown.find((text) => text.startsWith('**Coming up'));
    expect(coming?.split('\n')[0]).toBe('**Coming up · 200**');
    expect(coming?.split('\n').at(-1)).toMatch(/^…and \d+ more$/u);
    expect(shown.join('\n').length).toBeLessThanOrEqual(TEXT_BUDGET);
  });
});

describe('an event’s post (plan 8V-1)', () => {
  it('has the name as a heading, the times, Leek Duck, the hint and the feed’s picture', () => {
    const message = eventPostMessage(day, ZONE);
    expect(texts(message.components)).toEqual([
      '## Pawniard Community Day\nSat, Nov 21, 2–5 PM\n' +
        '[More on Leek Duck](<https://leekduck.com/events/november-communityday2026/>)\n' +
        'Official meetups, if any: [Campfire](<https://campfire.scopely.com/discover>)',
    ]);
    expect(JSON.stringify(message.components)).toContain(
      JSON.stringify({
        media: { url: 'https://cdn.leekduck.com/assets/img/events/cd/pawniard.jpg' },
      }),
    );
    // No buttons, and nobody pinged.
    expect(JSON.stringify(message.components)).not.toMatch(/"type":1[,}]/u);
    expect(message.mention).toBeUndefined();
  });

  // Plan 8M-15 (V1): an event of a day or more names no Campfire in its post.
  it('goes without a link or picture the feed lacks, and says when Leek Duck dropped it', () => {
    const bare: ListedEvent = { ...wild, image: null };
    const message = eventPostMessage(bare, ZONE, { dropped: true });
    expect(texts(message.components)).toEqual(['## Into the Wild\nNov 9 – Nov 13', DROPPED_WORDS]);
    expect(DROPPED_WORDS).toBe('Leek Duck no longer lists this event.');
    expect(JSON.stringify(message.components)).not.toMatch(/"type":12[,}]/u);
  });
});
