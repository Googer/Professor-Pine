import { describe, expect, it } from 'vitest';
import { catalogueFixture } from '../../../test/support/game-data.js';
import { parseRaidManifest } from '../pogo/raid-manifest.js';
import { parseResearchPage } from '../research/leekduck.js';
import { readListedEvents } from './event-listing.js';
import { parsePagedEventFeed } from './event-pages.js';
import { allIn, localAgrees, timedIn, trustedLocals } from './feed-times.js';
import { eventPageMaxHours, parseBigEventFeed, parseMaxEventFeed } from './max-events.js';
import { eventPageRaidHours, parseRaidEventFeed } from './raid-events.js';
import { parseResearchEventFeed } from './research-events.js';
import { parseSpawnEventFeed } from './spawn-events.js';

/*
 * Plan 19A-2: a feed's wall-clock time stays wall-clock time, a moment in each server's zone; a
 * feed's moment stays one moment. Every parser keeps them so; the list is read in the instance's
 * default zone (New York here), and `timedIn` gives it in Berlin's.
 */
const NEW_YORK = 'America/New_York';
const BERLIN = 'Europe/Berlin';
const KOLKATA = 'Asia/Kolkata';

/** 2026-11-14 18:00 to 19:00 on the wall clock, in New York and in Berlin. */
const SIX_NEW_YORK = Date.UTC(2026, 10, 14, 23);
const SIX_BERLIN = Date.UTC(2026, 10, 14, 17);
const HOUR = 60 * 60_000;

describe('timedIn and allIn', () => {
  const local = {
    name: 'Raid Hour',
    start: SIX_NEW_YORK,
    end: SIX_NEW_YORK + HOUR,
    startLocal: '2026-11-14T18:00:00',
    endLocal: '2026-11-14T19:00:00',
  };
  const moment = { name: 'Night Out', start: Date.UTC(2026, 10, 14, 20), end: SIX_NEW_YORK };

  it('gives a wall-clock event on each zone’s clock, a moment’s as it is', () => {
    expect(timedIn(local, BERLIN)).toEqual({ ...local, start: SIX_BERLIN, end: SIX_BERLIN + HOUR });
    expect(timedIn(local, KOLKATA).start).toBe(Date.UTC(2026, 10, 14, 12, 30));
    expect(timedIn(moment, BERLIN)).toBe(moment);
    expect(timedIn(local, NEW_YORK)).toBe(local);
  });

  it('orders a list again by the starts in the zone, and gives the same list where none moves', () => {
    const list = [moment, local];
    expect(allIn(list, BERLIN).map((event) => event.name)).toEqual(['Raid Hour', 'Night Out']);
    expect(allIn(list, NEW_YORK)).toBe(list);
  });
});

describe('every parser keeps the feed’s wall-clock time', () => {
  const at = (start: string, end: string) => ({ start, end });
  const sixToSeven = at('2026-11-14T18:00:00.000', '2026-11-14T19:00:00.000');
  const inBerlin = <T extends { start: number }>(events: readonly T[]) =>
    events.map((event) => timedIn(event as T & { end: number }, BERLIN).start);

  it('the raid events: a Raid Hour at 18:00 is 18:00 in Berlin, a Z time the same moment', () => {
    const events = parseRaidEventFeed(
      [
        { eventType: 'raid-hour', name: 'Local', ...sixToSeven },
        {
          eventType: 'raid-hour',
          name: 'Zoned',
          ...at('2026-11-14T20:00:00.000Z', '2026-11-14T21:00:00.000Z'),
        },
      ],
      NEW_YORK,
    );
    expect(events.map((event) => event.start)).toEqual([Date.UTC(2026, 10, 14, 20), SIX_NEW_YORK]);
    expect(inBerlin(events)).toEqual([Date.UTC(2026, 10, 14, 20), SIX_BERLIN]);
  });

  it('the research, spawn, paged and big events', () => {
    const item = {
      eventID: 'pokemon-go-wild-area-2026-global',
      eventType: 'wild-area',
      name: 'Wild Area',
      link: 'https://leekduck.com/events/wild-area/',
      ...sixToSeven,
      extraData: {
        generic: { hasFieldResearchTasks: true, hasSpawns: true },
      },
    };
    expect(inBerlin(parseResearchEventFeed([item], NEW_YORK))).toEqual([SIX_BERLIN]);
    expect(inBerlin(parseSpawnEventFeed([item], NEW_YORK))).toEqual([SIX_BERLIN]);
    expect(inBerlin(parsePagedEventFeed([item], NEW_YORK))).toEqual([SIX_BERLIN]);
    const big = parseBigEventFeed([item], NEW_YORK);
    expect(inBerlin(big)).toEqual([SIX_BERLIN]);
    const listed = readListedEvents([item], NEW_YORK, { max: [], big });
    expect(inBerlin(listed.read)).toEqual([SIX_BERLIN]);
  });

  it('the max events, the hours assumed for one without any too', () => {
    const monday = (day: number, times: object) => ({
      eventID: `max-mondays-2026-11-${String(day)}`,
      eventType: 'max-mondays',
      name: 'Dynamax Sneasel during Max Monday',
      ...times,
    });
    const parsed = parseMaxEventFeed(
      [
        monday(9, at('2026-11-09T18:00:00.000', '2026-11-09T19:00:00.000')),
        monday(16, { start: null, end: null }),
      ],
      NEW_YORK,
    );
    expect(parsed.assumed).toHaveLength(1);
    expect(inBerlin(parsed.events)).toEqual([
      Date.UTC(2026, 10, 9, 17),
      Date.UTC(2026, 10, 16, 17),
    ]);
  });

  it('the hours an event’s page names, the listed lines of them by their local day', () => {
    const span = { start: Date.UTC(2026, 10, 10), end: Date.UTC(2026, 10, 20) };
    const hour = { hour: 18, minutes: 60 };
    const page = { event: 'into-the-wild', link: 'https://leekduck.com/events/into-the-wild/' };
    const raid = eventPageRaidHours(
      [{ month: 11, day: 14, bosses: [] }],
      span,
      hour,
      NEW_YORK,
      page,
    );
    const max = eventPageMaxHours(
      [{ month: 11, day: 14, bosses: ['Registeel'], gigantamax: false }],
      span,
      hour,
      NEW_YORK,
      page,
    );
    expect(inBerlin(raid)).toEqual([SIX_BERLIN]);
    expect(inBerlin(max)).toEqual([SIX_BERLIN]);
  });

  it('the raid rotations of the manifest at local times', () => {
    const { rotations } = parseRaidManifest(
      {
        regular_raids: [
          {
            slug: 'week',
            title: 'Week',
            start_date: '2026-11-14 18:00:00 -0800',
            end_date: '2026-11-21 10:00:00 -0800',
            local_time: true,
          },
        ],
      },
      NEW_YORK,
    );
    expect(inBerlin(rotations)).toEqual([SIX_BERLIN]);
  });

  it('a research section’s end, as wall-clock time', () => {
    const page =
      '<div class="task-category event-field-research" data-event-end="2026-11-14T18:00:00-0800">' +
      '<h2>Halloween Tasks</h2><li class="task-item"><span class="task-text">' +
      '<span>Catch 7 Pokémon</span></span></li></div>';
    const [task] = parseResearchPage(page, catalogueFixture(), NEW_YORK).tasks;
    expect(task?.endsAt).toBe(SIX_NEW_YORK);
    expect(task?.endsLocal).toBe('2026-11-14T18:00:00');
  });
});

describe('trustedLocals: the read rule of the stored wall-clock times (fix round 1, L8, M6)', () => {
  const kept = {
    start: Date.UTC(2026, 10, 9, 15),
    end: Date.UTC(2026, 10, 14, 1),
    startLocal: '2026-11-09T10:00:00',
    endLocal: '2026-11-13T20:00:00',
  };

  it('keeps a wall-clock time whose moment in the default zone is the stored one', () => {
    expect(localAgrees(kept.startLocal, kept.start, NEW_YORK)).toBe(true);
    expect(trustedLocals(kept, NEW_YORK)).toBe(kept);
  });

  it('leaves out one a write that knew nothing of it left behind, the moment the truth', () => {
    const moved = { ...kept, end: kept.end - 3_600_000 };
    expect(localAgrees(moved.endLocal, moved.end, NEW_YORK)).toBe(false);
    const { endLocal: _gone, ...rest } = moved;
    expect(trustedLocals(moved, NEW_YORK)).toEqual(rest);
    expect(localAgrees('not a time', kept.start, NEW_YORK)).toBe(false);
  });
});
