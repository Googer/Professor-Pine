import { describe, expect, it } from 'vitest';
import { catalogueFixture } from '../../../test/support/game-data.js';
import { costumedSighting, isCostumed } from './costumes.js';
import { costumeLookupOf } from './feed-lookup.js';
import { identifyBoss, pictureIds, wornBy } from './raid-boss-feed.js';

const lookup = costumeLookupOf(catalogueFixture());
const ICONS = 'https://cdn.leekduck.com/assets/img/pokemon_icons/';
const CROP = 'https://cdn.leekduck.com/assets/img/pokemon_icons_crop/';
const HALLOWEEN =
  'https://cdn.leekduck.com/assets/img/events/article-images/2026/2026-10-27-halloween-2026-part-1/';

/** The costume test as a feed's boss or a page's reward is judged: the picture's ids. */
const costumed = (name: string, image?: string): boolean =>
  isCostumed(name, image, { ids: pictureIds(image, lookup), lookup });

describe('isCostumed: what the game data says', () => {
  it('takes a form id the game data has as a costume', () => {
    expect(
      isCostumed('Pikachu', undefined, {
        ids: { pokemonId: 'PIKACHU', form: 'PIKACHU_PXP_2026' },
        lookup,
      }),
    ).toBe(true);
    // Corsola's costume copies Galarian Corsola, and is a costume all the same.
    expect(
      isCostumed('Galarian Corsola', undefined, {
        ids: { pokemonId: 'CORSOLA', form: 'CORSOLA_SPRING_2026' },
        lookup,
      }),
    ).toBe(true);
  });

  it('never takes a form of its own, a region, or the wild legendaries of GO Tour: Johto', () => {
    for (const [pokemonId, form] of [
      ['MEWTWO', 'MEWTWO_A'],
      ['CORSOLA', 'CORSOLA_GALARIAN'],
      ['RAIKOU', 'RAIKOU_S'],
      ['LUGIA', 'LUGIA_S'],
      ['GIRATINA', 'GIRATINA_ORIGIN'],
      ['PIKACHU', null],
    ] as const) {
      expect(
        isCostumed('Pokémon', undefined, { ids: { pokemonId, form }, lookup }),
        String(form),
      ).toBe(false);
    }
  });

  it('takes a form newer than the game data that is shaped like a costume (isCostumeForm)', () => {
    // The raid boss feed of 2026-10-11: Astronaut Pikachu in a glass helmet.
    expect(costumed('Astronaut Pikachu', `${ICONS}pm25.fGLASS_HELMET_2026.icon.png`)).toBe(true);
    // A new form of its own is not: it carries no year, or says a region.
    expect(costumed('Mewtwo Z', `${ICONS}pm150.fMEGA_Z.icon.png`)).toBe(false);
    expect(costumed('Alolan Raichu (Holiday)', `${ICONS}pm26.fALOLA_WINTER_2030.icon.png`)).toBe(
      false,
    );
  });
});

describe('isCostumed: the picture', () => {
  it('takes a picture with a costume part', () => {
    // Halloween 2026 Part I's spawns and the Teddiursa Spotlight Hour of 2026-11-05.
    expect(
      costumed(
        'Piplup wearing a Halloween Mischief costume',
        `${CROP}pm393.cHALLOWEEN_2021_NOEVOLVE.icon.png`,
      ),
    ).toBe(true);
    expect(costumed('Teddiursa', `${ICONS}pm216.cHALLOWEEN_2025.icon.png`)).toBe(true);
  });

  it('takes a picture whose form part the game data has as a costume', () => {
    expect(costumed('Pikachu', `${ICONS}pm25.fPXP_2026.icon.png`)).toBe(true);
    expect(costumed('Pikachu', `${ICONS}pm25.icon.png`)).toBe(false);
    expect(costumed('Galarian Corsola', `${ICONS}pm222.fGALARIAN.icon.png`)).toBe(false);
  });

  it('reads the older pictures by number, whose third number is a costume', () => {
    // ScrapedDuck's community day spawns (Pawniard, 2026-11-21) and the raid events.
    expect(costumed('Pawniard', `${ICONS}pokemon_icon_624_00.png`)).toBe(false);
    expect(costumed('Giratina (Origin)', `${ICONS}pokemon_icon_487_12.png`)).toBe(false);
    expect(costumed('Pawniard', `${ICONS}pokemon_icon_624_00_shiny.png`)).toBe(false);
    expect(costumed('Pikachu', `${ICONS}pokemon_icon_025_00_05.png`)).toBe(true);
    expect(costumed('Pikachu', `${ICONS}pokemon_icon_025_00_05_shiny.png`)).toBe(true);
  });
});

describe('isCostumed: the name, last', () => {
  it('takes "<Pokémon> wearing …", the way Leek Duck names a costume the game data lacks', () => {
    // Halloween 2026 Part I, with Leek Duck's own pictures named by hand.
    expect(costumed('Zubat wearing a top hat', `${HALLOWEEN}zubat-top-hat.png`)).toBe(true);
    expect(
      costumed('Pikachu wearing a hat and capelet', `${HALLOWEEN}pikachu-hat-capelet.png`),
    ).toBe(true);
    expect(costumed('Sinistea wearing a bow', `${HALLOWEEN}sinistea-bow.png`)).toBe(true);
    expect(costumed('Teddiursa wearing a witch hat')).toBe(true);
  });

  it('takes nothing else from a name', () => {
    expect(costumed('Duskull', `${CROP}pokemon_icon_355_00.png`)).toBe(false);
    expect(costumed('Pikachu')).toBe(false);
    expect(costumed('Shadow Rider Calyrex')).toBe(false);
    // "wearing" must stand between the Pokémon and what it wears.
    expect(costumed('Wearing')).toBe(false);
  });
});

describe('wornBy', () => {
  it('gives the Pokémon of a name that says what it wears', () => {
    expect(wornBy('Zubat wearing a top hat')).toBe('Zubat');
    expect(wornBy('Galarian Corsola wearing a crown')).toBe('Galarian Corsola');
    expect(wornBy('Pikachu')).toBeUndefined();
    expect(wornBy('wearing a hat')).toBeUndefined();
  });
});

describe('a costume known by name only is its species (F2)', () => {
  const key = (name: string, image?: string): string | undefined => {
    const ids = identifyBoss(name, image, lookup)?.resolved;
    return ids && lookup.keyOf(ids.pokemonId, ids.form);
  };

  it('places the names of the event pages under their species', () => {
    expect(key('Zubat wearing a top hat', `${HALLOWEEN}zubat-top-hat.png`)).toBe('zubat');
    expect(key('Pikachu wearing a hat and capelet', `${HALLOWEEN}pikachu-hat-capelet.png`)).toBe(
      'pikachu',
    );
    expect(key('Sinistea wearing a bow', `${HALLOWEEN}sinistea-bow.png`)).toBe('sinistea');
    expect(
      key(
        'Piplup wearing a Halloween Mischief costume',
        `${CROP}pm393.cHALLOWEEN_2021_NOEVOLVE.icon.png`,
      ),
    ).toBe('piplup');
    expect(key('Teddiursa wearing a witch hat', `${ICONS}pm216.cHALLOWEEN_2025.icon.png`)).toBe(
      'teddiursa',
    );
  });

  it('never places a name whose picture says another Pokémon', () => {
    expect(key('Zubat wearing a top hat', `${ICONS}pm25.icon.png`)).toBeUndefined();
  });
});

describe('costumedSighting', () => {
  it('gives the catalogue key and whether it is costumed, as a sighting carries them', () => {
    const catalogue = catalogueFixture();
    expect(
      costumedSighting(catalogue, 'Zubat wearing a top hat', `${HALLOWEEN}zubat-top-hat.png`),
    ).toEqual({ key: 'zubat', dex: 41, costumed: true });
    expect(costumedSighting(catalogue, 'Duskull', `${CROP}pokemon_icon_355_00.png`)).toEqual({
      key: 'duskull',
      dex: 355,
      costumed: false,
    });
    expect(costumedSighting(catalogue, 'Newmon wearing a hat')).toBeUndefined();
  });
});
