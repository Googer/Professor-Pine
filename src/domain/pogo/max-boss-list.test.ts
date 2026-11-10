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
import { featuredAt, parseMaxEventFeed } from '../time/max-events.js';
import { maxBossChoices, typedMaxBoss } from './max-boss-list.js';
import { comingMaxBosses, maxBossesAt, parseMaxBossFeed, type MaxBoss } from './max-bosses.js';
import type { MaxTier } from './max-tier.js';
import { zonedAt } from '../../../test/support/time.js';

const catalogue = catalogueFixture();
const pokemon = pokemonFixture();
const exact = (text: string) => pokemon.exact(text);
const events = parseMaxEventFeed(readMaxEventFeed(), MAX_ZONE).events;
const stored = parseMaxBossFeed(readPokebattlerFeed(), catalogue, {
  now: MAX_FEED_READ_AT,
  zone: MAX_ZONE,
}).bosses.map((boss) => ({ ...boss, firstSeen: Math.max(MAX_FEED_READ_AT, boss.startsAt ?? 0) }));
/** The recorded bosses in effect at `time`, with a Gigantamax Machamp added as staff would. */
const bossesAt = (time: number): MaxBoss[] =>
  maxBossesAt(
    stored,
    [
      {
        id: 1,
        action: 'add',
        pokemonId: 'MACHAMP',
        form: null,
        tier: 'G',
        shiny: false,
        expiresAt: null,
        createdBy: '123456789012345678',
        createdAt: MAX_FEED_READ_AT,
      },
    ],
    catalogue,
    time,
  );
const choicesAt = (time: number) =>
  maxBossChoices(bossesAt(time), featuredAt(events, time, MAX_ZONE), exact);

describe('maxBossChoices', () => {
  it('lists 5 stars down to 1 and Gigantamax last, each choice saying its tier', () => {
    const choices = choicesAt(at('2026-10-24T09:00')).filter((choice) => !choice.featured);
    const tiers = choices.map((choice) => choice.boss.tier);
    const order: MaxTier[] = ['D5', 'D4', 'D3', 'D2', 'D1', 'G'];
    expect([...tiers].sort((a, b) => order.indexOf(a) - order.indexOf(b))).toEqual(tiers);
    expect(choices.slice(0, 5).map((choice) => choice.name)).toEqual([
      'Azelf · Dynamax 5★',
      'Mesprit · Dynamax 5★',
      'Uxie · Dynamax 5★',
      'Duraludon · Dynamax 4★',
      'Toxtricity · Dynamax 4★',
    ]);
    expect(choices.at(-1)?.name).toBe('Gigantamax Machamp');
  });

  it('gives Machamp the 2-star Dynamax and Gigantamax Machamp as two choices', () => {
    const machamp = choicesAt(at('2026-10-21T12:00')).filter(
      (choice) => choice.boss.key === 'machamp',
    );
    expect(machamp.map((choice) => choice.name)).toEqual(['Gigantamax Machamp']);
    const list = bossesAt(at('2026-10-21T12:00'));
    const gigantamax = list.filter((boss) => boss.key === 'machamp');
    const dynamax = gigantamax.map((boss): MaxBoss => ({ ...boss, tier: 'D2' }));
    const withD2 = maxBossChoices([...list, ...dynamax], [], exact).filter(
      (choice) => choice.boss.key === 'machamp',
    );
    expect(withD2.map((choice) => choice.name)).toEqual([
      'Machamp · Dynamax 2★',
      'Gigantamax Machamp',
    ]);
  });

  it("puts the week's Max Monday boss first", () => {
    const [first, second] = choicesAt(at('2026-10-21T12:00'));
    expect(first).toMatchObject({ name: 'Sneasel · Dynamax 1★', featured: true });
    expect(second?.featured).toBe(false);
    // The boss is not listed a second time.
    expect(
      choicesAt(at('2026-10-21T12:00')).filter((choice) => choice.boss.key === 'sneasel'),
    ).toHaveLength(1);
  });

  it("puts a Max Battle Day's bosses first during its hours, then the week's boss", () => {
    const featured = choicesAt(at('2026-10-24T15:00')).filter((choice) => choice.featured);
    expect(featured.map((choice) => choice.name)).toEqual([
      'Uxie · Dynamax 5★',
      'Mesprit · Dynamax 5★',
      'Azelf · Dynamax 5★',
      'Sneasel · Dynamax 1★',
    ]);
    expect(
      choicesAt(at('2026-10-24T17:00'))
        .filter((choice) => choice.featured)
        .map((choice) => choice.name),
    ).toEqual(['Sneasel · Dynamax 1★']);
  });

  it('features nothing it cannot find on the list: a Gigantamax day features no Dynamax boss', () => {
    const giga = parseMaxEventFeed(
      [
        {
          eventType: 'max-battles',
          name: 'Gigantamax Machamp Max Battle Day',
          start: '2026-10-21T14:00:00.000',
          end: '2026-10-21T17:00:00.000',
        },
        {
          eventType: 'max-battles',
          name: 'Dynamax Missingno Max Battle Day',
          start: '2026-10-21T14:00:00.000',
          end: '2026-10-21T17:00:00.000',
        },
      ],
      MAX_ZONE,
    ).events;
    const time = at('2026-10-21T15:00');
    const featured = maxBossChoices(bossesAt(time), featuredAt(giga, time, MAX_ZONE), exact).filter(
      (choice) => choice.featured,
    );
    expect(featured.map((choice) => choice.name)).toEqual(['Gigantamax Machamp']);
  });

  it('offers an upcoming boss its featured event names from the event on, east of UTC too', () => {
    const TOKYO = 'Asia/Tokyo';
    const tokyo = (local: string) => zonedAt(local, TOKYO);
    const parsed = parseMaxBossFeed(readPokebattlerFeed(), catalogue, {
      now: MAX_FEED_READ_AT,
      zone: TOKYO,
    }).bosses.map((boss) => ({ ...boss, firstSeen: boss.startsAt ?? MAX_FEED_READ_AT }));
    // Pokebattler's start (21:00Z) is the next morning in Tokyo, after the event.
    const lake = parsed.filter((boss) => boss.tier === 'D5');
    expect(lake.map((boss) => boss.firstSeen)).toEqual(Array(3).fill(tokyo('2026-10-25T00:00')));
    const time = tokyo('2026-10-24T15:00');
    const tokyoEvents = parseMaxEventFeed(readMaxEventFeed(), TOKYO).events;
    const choices = maxBossChoices(
      maxBossesAt(parsed, [], catalogue, time),
      featuredAt(tokyoEvents, time, TOKYO),
      exact,
      { coming: comingMaxBosses(parsed, [], catalogue, time), time, catalogue },
    );
    expect(choices.filter((choice) => choice.featured).map((choice) => choice.name)).toEqual([
      'Uxie · Dynamax 5★',
      'Mesprit · Dynamax 5★',
      'Azelf · Dynamax 5★',
      'Sneasel · Dynamax 1★',
    ]);
    // Before the event they are not offered.
    const before = tokyo('2026-10-24T13:59');
    expect(
      maxBossChoices(
        maxBossesAt(parsed, [], catalogue, before),
        featuredAt(tokyoEvents, before, TOKYO),
        exact,
        { coming: comingMaxBosses(parsed, [], catalogue, before), time: before, catalogue },
      ).some((choice) => choice.boss.key === 'uxie'),
    ).toBe(false);
  });

  it('offers a Gigantamax boss its event names during the event, though the feed lists none', () => {
    const day = (name: string) => ({
      eventType: 'max-battles',
      name,
      start: '2026-10-21T14:00:00.000',
      end: '2026-10-21T17:00:00.000',
    });
    const giga = parseMaxEventFeed(
      [
        day('Gigantamax Kingler Max Battle Day'),
        day('Gigantamax Sneasel Max Battle Day'),
        day('Dynamax Kingler Max Battle Day'),
      ],
      MAX_ZONE,
    ).events;
    const choose = (time: number) =>
      maxBossChoices(bossesAt(time), featuredAt(giga, time, MAX_ZONE), exact, {
        coming: [],
        time,
        catalogue,
      }).filter((choice) => choice.featured);
    const during = choose(at('2026-10-21T15:00'));
    // Sneasel has no Gigantamax form, and a Dynamax boss off the list has no known tier.
    expect(during.map((choice) => [choice.name, choice.boss.tier, choice.boss.source])).toEqual([
      ['Gigantamax Kingler', 'G', 'event'],
    ]);
    expect(choose(at('2026-10-21T17:00'))).toEqual([]);
    // Staff hid Gigantamax Kingler: the event does not bring it back.
    const time = at('2026-10-21T15:00');
    const hidden = maxBossChoices(bossesAt(time), featuredAt(giga, time, MAX_ZONE), exact, {
      coming: [],
      time,
      catalogue,
      hidden: [{ key: 'kingler', tier: 'G' }],
    });
    expect(hidden.some((choice) => choice.boss.key === 'kingler')).toBe(false);
  });
});

describe('typedMaxBoss', () => {
  const now = at('2026-10-21T12:00');
  const entry = (key: string) => {
    const found = catalogue.byKey(key);
    if (!found) throw new Error(key);
    return found;
  };

  it('is the list’s bosses of a Pokémon on it, and the tiers the game master allows beyond', () => {
    const machop = typedMaxBoss(entry('machop'), bossesAt(now), catalogue);
    expect(machop.listed.map((boss) => boss.tier)).toEqual(['D2']);
    expect(machop.others).toEqual(['D1', 'D3', 'D4', 'D5']);
    const machamp = typedMaxBoss(entry('machamp'), bossesAt(now), catalogue);
    expect(machamp.listed.map((boss) => boss.tier)).toEqual(['G']);
    expect(machamp.others).toEqual(['D1', 'D2', 'D3', 'D4', 'D5']);
  });

  it('is the tiers to ask for a Pokémon off the list the game master lets battle', () => {
    expect(typedMaxBoss(entry('kingler'), bossesAt(now), catalogue)).toEqual({
      listed: [],
      others: ['D1', 'D2', 'D3', 'D4', 'D5', 'G'],
    });
  });

  it('is nothing for a Pokémon that is no max boss', () => {
    expect(typedMaxBoss(entry('rattata'), bossesAt(now), catalogue)).toEqual({
      listed: [],
      others: [],
    });
  });
});
