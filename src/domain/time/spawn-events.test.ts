import { describe, expect, it } from 'vitest';
import { catalogueFixture } from '../../../test/support/game-data.js';
import { readSpawnEventFeed as feed } from '../../../test/support/spawn-events.js';
import {
  costumedSpawn,
  isEventPage,
  parseSpawnEventFeed,
  spawnEventsAt,
  type SpawnSightingOf,
} from './spawn-events.js';
import { zonedAt } from '../../../test/support/time.js';

const ZONE = 'America/New_York';
const at = (local: string): number => zonedAt(local, ZONE);

describe('parseSpawnEventFeed (plan 8R-4)', () => {
  const events = parseSpawnEventFeed(feed(), ZONE);
  const ids = events.map((event) => event.id);

  it('takes the global events with spawns: community days, spotlight hours, ordinary events', () => {
    expect(ids).toEqual(
      expect.arrayContaining([
        'halloween-2026-part-1',
        'halloween-2026-part-2',
        'november-communityday2026',
        'pokemonspotlighthour2026-11-05',
        'minior-showers-orionids-2026',
        'into-the-wild-2026',
      ]),
    );
    const halloween = events.find((event) => event.id === 'halloween-2026-part-1');
    expect(halloween).toEqual({
      id: 'halloween-2026-part-1',
      name: 'Pokémon GO Halloween 2026 Part I',
      eventType: 'event',
      start: at('2026-10-27T10:00'),
      end: at('2026-11-01T10:00'),
      page: 'https://leekduck.com/events/halloween-2026-part-1/',
    });
  });

  it('takes a community day’s and a spotlight hour’s spawns from the feed, without a page', () => {
    const day = events.find((event) => event.id === 'november-communityday2026');
    expect(day?.spawns).toEqual([
      {
        name: 'Pawniard',
        image: 'https://cdn.leekduck.com/assets/img/pokemon_icons/pokemon_icon_624_00.png',
      },
    ]);
    expect(day).not.toHaveProperty('page');
    const spotlight = events.find((event) => event.id === 'pokemonspotlighthour2026-11-05');
    expect(spotlight?.spawns).toEqual([
      {
        name: 'Teddiursa wearing a witch hat',
        image: 'https://cdn.leekduck.com/assets/img/pokemon_icons/pm216.cHALLOWEEN_2025.icon.png',
      },
    ]);
  });

  it('takes the Global Wild Area, by the feed’s name and local times (Matt’s R-M5)', () => {
    expect(ids).toContain('pokemon-go-wild-area-2026-global');
  });

  it('takes only the types it knows to be global: an unknown type, a Tour in a city stay out', () => {
    const item = (eventType: string, name: string, start: string, end: string) => ({
      eventID: `${eventType}-${name}`,
      eventType,
      name,
      link: 'https://leekduck.com/events/x/',
      start,
      end,
      extraData: { generic: { hasSpawns: true } },
    });
    const parsed = parseSpawnEventFeed(
      [
        item(
          'pokemon-go-tour',
          'Tour: Alola - Global 2027',
          '2027-02-27T00:00',
          '2027-02-28T23:59',
        ),
        item(
          'pokemon-go-tour',
          'Tour: Alola - Kaohsiung',
          '2027-02-18T16:00Z',
          '2027-02-21T15:59Z',
        ),
        item('event', 'An event', '2027-03-01T10:00', '2027-03-02T20:00'),
        item('community-day', 'A day', '2027-03-06T14:00', '2027-03-06T17:00'),
        item('pokemon-spotlight-hour', 'An hour', '2027-03-04T18:00', '2027-03-04T19:00'),
        item('wild-area', 'Wild Area 2027: Global', '2027-03-13T10:00', '2027-03-14T18:00'),
        // Read since Matt's rule of 2026-10-24 (review W1), in place of the Global rule: local
        // times are enough for a Wild Area, GO Tour or GO Fest, whatever the name says; every
        // city edition the feed has listed came with zoned times, as Kaohsiung above.
        item('wild-area', 'Wild Area 2027: Sendai', '2027-03-20T10:00', '2027-03-21T18:00'),
        item('pokemon-go-tour', 'Tour: Alola - Honolulu', '2027-02-20T10:00', '2027-02-21T18:00'),
        // Since plan 8R-7 the Global edition by its id too, its name not saying it.
        {
          ...item('wild-area', 'Wild Area 2027', '2027-03-27T10:00', '2027-03-28T18:00'),
          eventID: 'pokemon-go-wild-area-2027-global',
        },
        item('max-battles', 'A max battle day', '2027-03-07T14:00', '2027-03-07T17:00'),
        item('research', 'Timed research', '2027-03-01T10:00', '2027-03-08T20:00'),
        item('brand-new-type', 'Something new', '2027-03-01T10:00', '2027-03-02T20:00'),
      ],
      ZONE,
    );
    expect(parsed.map((event) => event.name)).toEqual([
      'Tour: Alola - Honolulu',
      'Tour: Alola - Global 2027',
      'An event',
      'An hour',
      'A day',
      'Wild Area 2027: Global',
      'Wild Area 2027: Sendai',
      'Wild Area 2027',
    ]);
  });

  it('takes GO Fest only at local times, as a Wild Area (Matt’s Q2; Matt, 2026-10-24)', () => {
    const fest = (name: string, start: string, end: string) => ({
      eventID: name,
      eventType: 'pokemon-go-fest',
      name,
      link: 'https://leekduck.com/events/x/',
      start,
      end,
      extraData: { generic: { hasSpawns: true } },
    });
    const parsed = parseSpawnEventFeed(
      [
        fest('Pokémon GO Fest 2027: Global', '2027-07-10T10:00', '2027-07-11T18:00'),
        // A city's, in its own zone and without the word.
        fest('Pokémon GO Fest 2027: Osaka', '2027-05-30T01:00Z', '2027-06-01T09:00Z'),
        // The word alone is not enough: the times must be local too.
        fest('Pokémon GO Fest 2027: Global', '2027-07-10T14:00Z', '2027-07-11T22:00Z'),
        // Local times without the word: read since Matt's rule of 2026-10-24 (review W1), which
        // replaces Q2's Global rule. Local times are enough: GO Fest 2025's Max Finale was
        // everyone's and said no "global", and every city edition came with zoned times.
        fest('Pokémon GO Fest 2027: Paris', '2027-06-13T10:00', '2027-06-15T18:00'),
      ],
      ZONE,
    );
    expect(parsed.map((event) => [event.name, event.start])).toEqual([
      ['Pokémon GO Fest 2027: Paris', at('2027-06-13T10:00')],
      ['Pokémon GO Fest 2027: Global', at('2027-07-10T10:00')],
    ]);
  });

  it('leaves out the location-bound events, the seasons and those without spawns (F11)', () => {
    for (const id of [
      // City Wild Areas and City Safaris are in-person (Matt, 2026-10-22).
      'pokemon-go-wild-area-2026-sendai-japan',
      'pokemon-go-city-safari-boston-2026-rescheduled',
      // Fixed times in UTC: Pokémon Night Out in a city.
      'pokemon-night-out-los-angeles-2026',
      'pokemon-night-out-london-2026',
      // A season's spawns stand for three months: never a costume's moment.
      'season-24-twilight-trails',
      // No spawns.
      'raidhour20261028',
      'max-mondays-2026-11-02',
      'dynamax-trails-2026',
    ]) {
      expect(ids, id).not.toContain(id);
    }
  });

  it('says which addresses are Leek Duck’s events pages, the only ones read (F11)', () => {
    expect(isEventPage('https://leekduck.com/events/halloween-2026-part-1/')).toBe(true);
    expect(isEventPage('https://leekduck.com/events/halloween-2026-part-1')).toBe(true);
    for (const url of [
      'http://leekduck.com/events/halloween-2026-part-1/',
      'https://example.test/events/elsewhere/',
      'https://leekduck.com/research/',
      'https://leekduck.com/events/a/b/',
      'https://leekduck.com.example.test/events/x/',
    ]) {
      expect(isEventPage(url), url).toBe(false);
    }
  });

  it('refuses a document that is no list', () => {
    expect(() => parseSpawnEventFeed({}, ZONE)).toThrow();
  });
});

describe('spawnEventsAt and costumedSpawn', () => {
  const events = parseSpawnEventFeed(feed(), ZONE);

  it('gives the events on at a moment', () => {
    expect(spawnEventsAt(events, at('2026-10-28T12:00')).map((event) => event.id)).toEqual([
      'halloween-2026-part-1',
    ]);
    expect(spawnEventsAt(events, at('2026-11-05T18:30')).map((event) => event.id)).toEqual([
      'halloween-2026-part-2',
      'pokemonspotlighthour2026-11-05',
    ]);
    expect(spawnEventsAt(events, at('2026-11-01T10:00')).map((event) => event.id)).toEqual([
      'halloween-2026-part-2',
    ]);
  });

  it('calls a spawn costumed where an active event lists its entry costumed, plain beside it or not', () => {
    const catalogue = catalogueFixture();
    const sightings: SpawnSightingOf = [
      { key: 'zubat', dex: 41, costumed: true },
      { key: 'duskull', dex: 355, costumed: false },
      { key: 'pikachu', dex: 25, costumed: false },
      { key: 'pikachu', dex: 25, costumed: true },
      { key: 'corsola_galarian', dex: 222, costumed: true },
    ];
    const entry = (key: string) => {
      const found = catalogue.byKey(key);
      if (!found) throw new Error(key);
      return found;
    };
    expect(costumedSpawn(sightings, entry('zubat'))).toBe(true);
    expect(costumedSpawn(sightings, entry('duskull'))).toBe(false);
    expect(costumedSpawn(sightings, entry('pikachu'))).toBe(true);
    // The costume is of Galarian Corsola: a plain Corsola is not it.
    expect(costumedSpawn(sightings, entry('corsola'))).toBe(false);
    expect(costumedSpawn(sightings, entry('corsola_galarian'))).toBe(true);
    expect(costumedSpawn([], entry('zubat'))).toBe(false);
  });
});
