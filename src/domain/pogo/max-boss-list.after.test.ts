import { describe, expect, it } from 'vitest';
import { catalogueFixture } from '../../../test/support/game-data.js';
import {
  at,
  MAX_FEED_READ_AT,
  MAX_ZONE,
  readPokebattlerFeed,
} from '../../../test/support/max-bosses.js';
import { readMaxEventFeed } from '../../../test/support/max-events.js';
import { pokemonFixture } from '../../../test/support/providers.js';
import { parseMaxEventFeed, type MaxEvent } from '../time/max-events.js';
import { withoutEndedUpcoming } from './max-boss-list.js';
import { maxBossesAt, parseMaxBossFeed } from './max-bosses.js';

const catalogue = catalogueFixture();
const pokemon = pokemonFixture();
const exact = (text: string) => pokemon.exact(text);
const events = parseMaxEventFeed(readMaxEventFeed(), MAX_ZONE).events;
const feed = parseMaxBossFeed(readPokebattlerFeed(), catalogue, {
  now: MAX_FEED_READ_AT,
  zone: MAX_ZONE,
}).bosses.map((boss) => ({ ...boss, firstSeen: Math.max(MAX_FEED_READ_AT, boss.startsAt ?? 0) }));

/** The names of the list in effect at a time, the upcoming bosses past their event left out. */
function namesAt(time: number, known: readonly MaxEvent[] = events): string[] {
  const bosses = maxBossesAt(feed, [], catalogue, time);
  return withoutEndedUpcoming(bosses, feed, known, exact, time, MAX_ZONE).map((boss) => boss.name);
}

describe('withoutEndedUpcoming: an upcoming boss after its event (plan 8X-3, change 4)', () => {
  it('offers the lake trio on their Max Battle Day and leaves them out once it is over', () => {
    // Pokebattler lists them ahead with a start and no end (2026-10-20).
    expect(namesAt(at('2026-10-24T09:00'))).toEqual(expect.arrayContaining(['Uxie', 'Azelf']));
    expect(namesAt(at('2026-10-24T16:59'))).toContain('Mesprit');
    const after = namesAt(at('2026-10-24T17:00'));
    expect(after).not.toContain('Uxie');
    expect(after).not.toContain('Mesprit');
    expect(after).not.toContain('Azelf');
    // Every boss of the pool that came before the event stays.
    expect(after).toContain('Sneasel');
  });

  // The ended Max Battle Day is still known here: the bot has kept ScrapedDuck's feed since it.
  it('keeps one a later event names, the ended event still known', () => {
    const again: MaxEvent = {
      kind: 'max-battle',
      name: 'Dynamax Uxie Max Battle Weekend',
      start: at('2026-11-07T06:00'),
      end: at('2026-11-08T21:00'),
      short: false,
      hoursAssumed: false,
      featured: { gigantamax: false, names: ['Uxie'] },
      id: 'uxie-weekend',
    };
    const after = namesAt(at('2026-10-25T12:00'), [...events, again]);
    expect(after).toContain('Uxie');
    expect(after).not.toContain('Azelf');
  });

  // Final review, X3-F2: what it does not cover. ScrapedDuck drops an event once it has ended,
  // so a bot started after the Max Battle Day never learns of it, and the trio is offered again
  // (utilities.md; step 11 of the 8X-2 staging decides whether more is needed).
  it('offers the trio again once the ended event is no longer known (a restart)', () => {
    const later = events.filter((event) => event.end > at('2026-10-25T00:00'));
    expect(namesAt(at('2026-10-25T12:00'))).not.toContain('Uxie');
    expect(namesAt(at('2026-10-25T12:00'), later)).toEqual(
      expect.arrayContaining(['Uxie', 'Mesprit', 'Azelf']),
    );
  });
});
