import { describe, expect, it } from 'vitest';
import { catalogueFixture, gameDataFixture } from '../../../test/support/game-data.js';
import {
  readRaidManifestFixture,
  readRotationFixture,
  ROTATION_SLUGS,
} from '../../../test/support/raid-manifest.js';
import { PokemonCatalogue } from './catalogue.js';
import { feedLookup } from './feed-lookup.js';
import { parseRaidBossFeed } from './raid-boss-feed.js';
import { effectiveBosses } from './raid-bosses.js';
import {
  mergeRotations,
  nextRotationChange,
  parseRaidManifest,
  parseRotationFragment,
  rotationAddress,
  rotationsAt,
  type RaidRotation,
  type RotationEntry,
} from './raid-manifest.js';
import { zonedAt } from '../../../test/support/time.js';

const ZONE = 'America/New_York';

/** A wall-clock time in `zone` as epoch milliseconds. */
function at(local: string, zone = ZONE): number {
  return zonedAt(local, zone);
}

const manifest = parseRaidManifest(readRaidManifestFixture(), ZONE);

function slugsAt(local: string): string[] {
  return rotationsAt(manifest.rotations, at(local)).map((rotation) => rotation.slug);
}

/** A rotation of the manifest's shape, with the times given (Leek Duck's Pacific placeholder). */
function rotation(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    slug: 'some-rotation',
    title: 'Some rotation',
    start_date: '2026-10-27 10:00:00 -0800',
    end_date: '2026-10-27 20:00:00 -0800',
    local_time: true,
    type: 'regular',
    ...extra,
  };
}

describe('parseRaidManifest', () => {
  it('reads the rotations of 2026-10-27, everyone’s at the local times of the zone', () => {
    expect(manifest.rotations.map((r) => [r.slug, r.kind])).toEqual([
      ['palkia-mega-charizard-x-mega-charizard-y', 'regular'],
      ['halloween-2026-part-1-palkia', 'regular'],
      ['giratina-origin-mega-sableye', 'regular'],
      ['chandelure-super-mega-raid-day-2026', 'regular'],
      ['pokemon-go-wild-area-2026-global', 'regular'],
      ['shadow-landorus-incarnate-october-november-2026', 'shadow'],
    ]);
    const halloween = manifest.rotations[1];
    expect(halloween).toEqual({
      slug: 'halloween-2026-part-1-palkia',
      title: 'Halloween 2026 Part I (Palkia)',
      kind: 'regular',
      start: at('2026-10-27T10:00'),
      end: at('2026-10-27T20:00'),
      startLocal: '2026-10-27T10:00:00',
      endLocal: '2026-10-27T20:00:00',
    });
    expect(manifest.skipped).toBe(0);
  });

  it('leaves out the rotations at a city’s own times (an in-person event’s)', () => {
    expect(manifest.elsewhere).toBe(2);
    expect(manifest.rotations.map((r) => r.slug)).not.toContain(
      'pokemon-go-wild-area-2026-sendai-japan',
    );
    expect(manifest.rotations.map((r) => r.slug)).not.toContain(
      'pokemon-go-wild-area-2026-mexico-city',
    );
  });

  it('reads the local times in the zone it is given, never Leek Duck’s offset', () => {
    const berlin = parseRaidManifest(readRaidManifestFixture(), 'Europe/Berlin');
    expect(berlin.rotations[1]?.start).toBe(at('2026-10-27T10:00', 'Europe/Berlin'));
  });

  it('skips and counts a rotation with a bad slug, date or order of times', () => {
    const parsed = parseRaidManifest(
      {
        regular_raids: [
          rotation({ slug: 'Bad Slug' }),
          rotation({ slug: '../manifest' }),
          rotation({ slug: 'bad-date', start_date: '27 October 2026' }),
          rotation({ slug: 'no-such-day', start_date: '2026-02-30 10:00:00 -0800' }),
          rotation({ slug: 'backwards', end_date: '2026-10-27 09:00:00 -0800' }),
          rotation({ slug: 'no-end', end_date: undefined }),
          'a rotation',
          null,
          rotation({ slug: 'good' }),
          rotation({ slug: 'good', title: 'Listed twice' }),
        ],
        shadow_raids: [rotation({ slug: 'shadow-good', type: 'shadow' })],
      },
      ZONE,
    );
    expect(parsed.rotations.map((r) => `${r.kind} ${r.slug}`)).toEqual([
      'regular good',
      'shadow shadow-good',
    ]);
    expect(parsed.skipped).toBe(9);
  });

  it('takes a rotation without a title by its slug, and one without shadow raids', () => {
    const parsed = parseRaidManifest({ regular_raids: [rotation({ title: undefined })] }, ZONE);
    expect(parsed.rotations).toEqual([
      {
        slug: 'some-rotation',
        title: 'some-rotation',
        kind: 'regular',
        start: at('2026-10-27T10:00'),
        end: at('2026-10-27T20:00'),
        startLocal: '2026-10-27T10:00:00',
        endLocal: '2026-10-27T20:00:00',
      },
    ]);
  });

  it('takes a rotation that does not say local_time at the times it gives, as Leek Duck’s page', () => {
    const parsed = parseRaidManifest(
      {
        regular_raids: [
          rotation({
            local_time: undefined,
            start_date: '2026-10-27 10:00:00',
            end_date: '2026-10-27 20:00:00',
          }),
          rotation({ slug: 'zoned', local_time: undefined }),
        ],
      },
      ZONE,
    );
    expect(parsed.rotations.map((r) => r.slug)).toEqual(['some-rotation']);
    expect(parsed.elsewhere).toBe(1);
  });

  it.each([
    ['nothing', null],
    ['a list', []],
    ['no regular raids', { shadow_raids: [] }],
    ['regular raids that are no list', { regular_raids: 'none' }],
  ])('throws for %s', (_label, json) => {
    expect(() => parseRaidManifest(json, ZONE)).toThrow(/raid manifest/);
  });
});

describe('the rotations in force', () => {
  it('has the Palkia week until 10:00 local on 2026-10-27, then Halloween Part I', () => {
    expect(slugsAt('2026-10-27T09:59')).toEqual([
      'palkia-mega-charizard-x-mega-charizard-y',
      'shadow-landorus-incarnate-october-november-2026',
    ]);
    expect(slugsAt('2026-10-27T10:00')).toEqual([
      'halloween-2026-part-1-palkia',
      'shadow-landorus-incarnate-october-november-2026',
    ]);
  });

  it('has the Raid Day inside the Giratina week', () => {
    expect(slugsAt('2026-10-31T15:00')).toEqual([
      'giratina-origin-mega-sableye',
      'chandelure-super-mega-raid-day-2026',
      'shadow-landorus-incarnate-october-november-2026',
    ]);
  });

  it('has neither Sendai’s nor Mexico City’s Wild Area on 2026-11-06', () => {
    expect(slugsAt('2026-11-06T12:00')).toEqual([]);
  });

  it('keeps the rotation that ended last between rotations, until the next starts', () => {
    // Halloween Part I ends at 20:00, the Giratina week starts at 06:00 the next day.
    for (const time of ['2026-10-27T20:00', '2026-10-27T22:00', '2026-10-28T05:59']) {
      expect(slugsAt(time), time).toEqual([
        'halloween-2026-part-1-palkia',
        'shadow-landorus-incarnate-october-november-2026',
      ]);
    }
    expect(slugsAt('2026-10-28T06:00')).toEqual([
      'giratina-origin-mega-sableye',
      'shadow-landorus-incarnate-october-november-2026',
    ]);
  });

  it('keeps an ended rotation for 24 hours at most, each kind on its own', () => {
    // The Giratina week ends 11-03 20:00, the shadow rotation 22:00; nothing follows till 11-14.
    expect(slugsAt('2026-11-04T19:59')).toEqual([
      'giratina-origin-mega-sableye',
      'shadow-landorus-incarnate-october-november-2026',
    ]);
    expect(slugsAt('2026-11-04T20:00')).toEqual([
      'shadow-landorus-incarnate-october-november-2026',
    ]);
    expect(slugsAt('2026-11-04T22:00')).toEqual([]);
  });

  it('keeps every rotation that ended last, and none that ended before it', () => {
    const rotations: RaidRotation[] = [
      { slug: 'a', title: 'a', kind: 'regular', start: 0, end: 100 },
      { slug: 'b', title: 'b', kind: 'regular', start: 50, end: 200 },
      { slug: 'c', title: 'c', kind: 'regular', start: 60, end: 200 },
    ];
    expect(rotationsAt(rotations, 300).map((r) => r.slug)).toEqual(['b', 'c']);
  });

  it('says when the rotations in force change next', () => {
    const next = (local: string) => nextRotationChange(manifest.rotations, at(local));
    expect(next('2026-10-27T09:59')).toBe(at('2026-10-27T10:00'));
    // Halloween's end at 20:00 changes nothing: it is kept until the Giratina week starts.
    expect(next('2026-10-27T10:00')).toBe(at('2026-10-28T06:00'));
    expect(next('2026-10-27T20:00')).toBe(at('2026-10-28T06:00'));
    expect(next('2026-10-31T15:00')).toBe(at('2026-10-31T17:00'));
    // The Giratina week is kept until 24 hours after its end; Sendai's start is not counted.
    expect(next('2026-11-04T00:00')).toBe(at('2026-11-04T20:00'));
    expect(next('2026-11-04T20:00')).toBe(at('2026-11-04T22:00'));
    expect(next('2026-11-05T00:00')).toBe(at('2026-11-14T10:00'));
    expect(next('2026-11-15T18:00')).toBe(at('2026-11-16T18:00'));
    expect(next('2026-11-16T18:00')).toBeUndefined();
  });
});

describe('rotationAddress', () => {
  it('is the slug’s page beside the manifest, as Leek Duck’s own script asks for it', () => {
    expect(rotationAddress('https://leekduck.com/raids/manifest.json', 'giratina-origin')).toBe(
      'https://leekduck.com/raids/giratina-origin.html',
    );
  });
});

describe('parseRotationFragment', () => {
  it('reads each boss card under its tier heading, as ScrapedDuck lists them', () => {
    const { entries, skipped } = parseRotationFragment(
      readRotationFixture('halloween-2026-part-1-palkia'),
    );
    expect(skipped).toBe(0);
    expect(entries.map((e) => `${e.tier}: ${e.name}`)).toEqual([
      '1-Star Raids: Pikachu wearing a hat and capelet',
      '1-Star Raids: Sinistea wearing a bow',
      '3-Star Raids: Alolan Raichu',
      '3-Star Raids: Alolan Ninetales',
      '3-Star Raids: Alolan Muk',
      '5-Star Raids: Palkia',
      'Mega Raids: Mega Charizard X',
      'Mega Raids: Mega Charizard Y',
    ]);
    expect(entries[0]).toEqual({
      name: 'Pikachu wearing a hat and capelet',
      tier: '1-Star Raids',
      canBeShiny: true,
      image: 'https://cdn.leekduck.com/assets/img/pokemon_icons/pm25.fHALLOWEEN_2026.icon.png',
    });
  });

  it('reads the shadow cards, named Shadow under the star headings', () => {
    const { entries } = parseRotationFragment(
      readRotationFixture('shadow-landorus-incarnate-october-november-2026'),
    );
    expect(entries.map((e) => `${e.tier}: ${e.name}`)).toEqual([
      '1-Star Raids: Shadow Gastly',
      '1-Star Raids: Shadow Totodile',
      '1-Star Raids: Shadow Shieldon',
      '1-Star Raids: Shadow Gible',
      '3-Star Raids: Shadow Primeape',
      '3-Star Raids: Shadow Kirlia',
      '3-Star Raids: Shadow Drapion',
      '5-Star Raids: Shadow Landorus (Incarnate)',
    ]);
  });

  it('reads a card without the shiny mark as never shiny, entities and all', () => {
    const html = `
      <div class="tier"><h2 class="header" data-tier="3"><span class="tier-label">3-Star&nbsp;Raids</span></h2>
        <div class="card"><div class="boss-img"><img src="https://cdn.leekduck.com/assets/img/pokemon_icons/pm669.icon.png"></div>
          <div class="identity"><p class="name">Flab&eacute;b&eacute;</p></div></div>
      </div>`;
    expect(parseRotationFragment(html).entries).toEqual([
      {
        name: 'Flabébé',
        tier: '3-Star Raids',
        canBeShiny: false,
        image: 'https://cdn.leekduck.com/assets/img/pokemon_icons/pm669.icon.png',
      },
    ]);
  });

  it('takes the shiny mark only on the boss’s picture', () => {
    const html = `
      <div class="tier"><span class="tier-label">1-Star Raids</span>
        <div class="card"><div class="boss-img"><img src="pm25.icon.png"></div>
          <p class="name">Pikachu</p><svg class="shiny-icon"></svg></div>
      </div>`;
    expect(parseRotationFragment(html).entries).toEqual([
      { name: 'Pikachu', tier: '1-Star Raids', canBeShiny: false, image: 'pm25.icon.png' },
    ]);
  });

  it('skips and counts a card without a name, and takes a tier without a label by data-tier', () => {
    const html = `
      <div class="tier"><h2 class="header" data-tier="Super Mega"></h2>
        <div class="card"><div class="boss-img"></div><p class="name small-type">Mega Chandelure</p></div>
        <div class="card"><div class="boss-img"><img src="x.png"></div><p class="name"> </p></div>
      </div>`;
    expect(parseRotationFragment(html)).toEqual({
      entries: [{ name: 'Mega Chandelure', tier: 'Super Mega', canBeShiny: false }],
      skipped: 1,
    });
  });

  it('reads nothing of a page without tiers', () => {
    expect(parseRotationFragment('<html><body>Not found</body></html>')).toEqual({
      entries: [],
      skipped: 0,
    });
  });

  it('gives the bosses the raid boss feed reads, costumes as matchBoss places them', () => {
    const { entries } = parseRotationFragment(readRotationFixture('halloween-2026-part-1-palkia'));
    const catalogue = catalogueFixture();
    const { bosses, unknownLevels } = parseRaidBossFeed(entries, feedLookup(catalogue));
    expect(unknownLevels).toEqual([]);
    const t1 = effectiveBosses(bosses, [], catalogue, 0).filter((b) => b.tier.level === 'T1');
    expect(t1.map((b) => [b.key, b.pokemonId, b.form, b.costumed])).toEqual([
      ['pikachu', 'PIKACHU', 'PIKACHU_HALLOWEEN_2026', true],
      ['sinistea', 'SINISTEA', 'SINISTEA_P_HALLOWEEN_2026_01', true],
    ]);
  });

  it('places the costumed Pikachu as its costume once the game data knows it', () => {
    const data = gameDataFixture();
    const catalogue = new PokemonCatalogue({
      ...data,
      aliases: { ...data.aliases, pikachu_halloween_2026: 'pikachu' },
      costumes: [...data.costumes, 'pikachu_halloween_2026'],
    });
    const { entries } = parseRotationFragment(readRotationFixture('halloween-2026-part-1-palkia'));
    const { bosses } = parseRaidBossFeed(entries, feedLookup(catalogue));
    const pikachu = effectiveBosses(bosses, [], catalogue, 0).find((b) => b.key === 'pikachu');
    expect(pikachu).toMatchObject({
      form: 'PIKACHU_HALLOWEEN_2026',
      costumed: true,
      tier: { level: 'T1', shadow: false },
    });
    expect(pikachu?.entry).toBeDefined();
  });
});

describe('mergeRotations', () => {
  const entry = (tier: string, name: string): RotationEntry => ({
    name,
    tier,
    canBeShiny: false,
  });
  const span = (slug: string, start: string, end: string, kind: RaidRotation['kind'] = 'regular') =>
    ({ slug, title: slug, kind, start: at(start), end: at(end) }) satisfies RaidRotation;

  it('adds the Raid Day’s Super Mega raids to the Giratina week, the shadow raids beside', () => {
    const read = rotationsAt(manifest.rotations, at('2026-10-31T15:00')).map((r) => ({
      rotation: r,
      entries: parseRotationFragment(readRotationFixture(r.slug)).entries,
    }));
    expect(mergeRotations(read).map((e) => `${e.tier}: ${e.name}`)).toEqual([
      'Super Mega Raids: Mega Chandelure',
      '1-Star Raids: Pikachu wearing a hat and capelet',
      '1-Star Raids: Sinistea wearing a bow',
      '3-Star Raids: Cofagrigus',
      '3-Star Raids: Trevenant',
      '3-Star Raids: Dhelmise',
      '5-Star Raids: Giratina (Origin)',
      'Mega Raids: Mega Sableye',
      'Shadow 1-Star Raids: Shadow Gastly',
      'Shadow 1-Star Raids: Shadow Totodile',
      'Shadow 1-Star Raids: Shadow Shieldon',
      'Shadow 1-Star Raids: Shadow Gible',
      'Shadow 3-Star Raids: Shadow Primeape',
      'Shadow 3-Star Raids: Shadow Kirlia',
      'Shadow 3-Star Raids: Shadow Drapion',
      'Shadow 5-Star Raids: Shadow Landorus (Incarnate)',
    ]);
  });

  it('puts a shadow rotation’s bosses in the shadow tiers, Shadow in their names or not', () => {
    const shadow = span('shadow', '2026-10-29T06:00', '2026-11-03T20:00', 'shadow');
    const merged = mergeRotations([
      {
        rotation: shadow,
        entries: [
          entry('1-Star Raids', 'Gastly'),
          entry('3-Star Raids', 'Shadow Kirlia'),
          entry('Shadow 5-Star Raids', 'Landorus'),
        ],
      },
    ]);
    expect(merged.map((e) => `${e.tier}: ${e.name}`)).toEqual([
      'Shadow 1-Star Raids: Gastly',
      'Shadow 3-Star Raids: Shadow Kirlia',
      'Shadow 5-Star Raids: Landorus',
    ]);
    const { bosses } = parseRaidBossFeed(merged, feedLookup(catalogueFixture()));
    expect(bosses.map((b) => `${String(b.tier.shadow)} ${b.tier.level} ${b.name}`)).toEqual([
      'true T1 Gastly',
      'true T3 Kirlia',
      'true T5 Landorus',
    ]);
  });

  it('gives a heading to the rotation that started last, whatever its spelling', () => {
    const week = span('week', '2026-10-28T06:00', '2026-11-03T20:00');
    const day = span('day', '2026-10-31T14:00', '2026-10-31T17:00');
    const merged = mergeRotations([
      { rotation: week, entries: [entry('5-Star Raids', 'Giratina'), entry('Mega Raids', 'X')] },
      {
        rotation: day,
        entries: [entry('5 star raids', 'Kyogre'), entry('5-Star Raids', 'Groudon')],
      },
    ]);
    expect(merged.map((e) => e.name)).toEqual(['Kyogre', 'Groudon', 'X']);
  });

  it('gives a heading to the one that ends first of two that started together', () => {
    const long = span('long', '2026-10-28T06:00', '2026-11-03T20:00');
    const short = span('short', '2026-10-28T06:00', '2026-10-28T09:00');
    const merged = mergeRotations([
      { rotation: long, entries: [entry('1-Star Raids', 'Long')] },
      { rotation: short, entries: [entry('1-Star Raids', 'Short')] },
    ]);
    expect(merged.map((e) => e.name)).toEqual(['Short']);
  });

  it('never lets a shadow rotation take a heading from a regular one', () => {
    const week = span('week', '2026-10-28T06:00', '2026-11-03T20:00');
    const shadow = span('shadow', '2026-10-29T06:00', '2026-11-03T20:00', 'shadow');
    const merged = mergeRotations([
      { rotation: week, entries: [entry('1-Star Raids', 'Pikachu')] },
      { rotation: shadow, entries: [entry('1-Star Raids', 'Shadow Gastly')] },
    ]);
    expect(merged.map((e) => e.name)).toEqual(['Pikachu', 'Shadow Gastly']);
  });

  it('keeps a heading the newer rotation lists twice (a Wild Area’s two days)', () => {
    const week = span('week', '2026-11-11T06:00', '2026-11-17T20:00');
    const wild = span('wild', '2026-11-14T10:00', '2026-11-15T18:00');
    const merged = mergeRotations([
      { rotation: week, entries: [entry('5-Star Raids', 'Palkia')] },
      {
        rotation: wild,
        entries: [entry('5-Star Raids', 'Zekrom'), entry('5-Star Raids', 'Reshiram')],
      },
    ]);
    expect(merged.map((e) => e.name)).toEqual(['Zekrom', 'Reshiram']);
  });
});

describe('the fixtures', () => {
  it('has a page for each rotation the tests read', () => {
    for (const slug of ROTATION_SLUGS) {
      expect(parseRotationFragment(readRotationFixture(slug)).entries.length).toBeGreaterThan(0);
    }
  });
});
