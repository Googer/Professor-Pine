import { describe, expect, it } from 'vitest';
import { catalogueFixture, iconsFixture } from '../../../test/support/game-data.js';
import { feedLookupOf } from './feed-lookup.js';
import type { PokemonEntry } from './game-master.js';
import {
  iconAddress,
  iconCandidates,
  iconName,
  iconNamesOf,
  isTruncatedListing,
  maxBossPicture,
  MEGA_PORTRAIT_BASE,
  POKEMON_ICON_BASE,
  PokemonIcons,
  pokemonPicture,
  portraitNamesOf,
} from './pokemon-icons.js';
import { pictureIds } from './raid-boss-feed.js';

const catalogue = catalogueFixture();
const icons = iconsFixture();
const lookup = feedLookupOf(catalogue);

function entry(key: string): PokemonEntry {
  const found = catalogue.byKey(key);
  if (!found) throw new Error(`the fixture has no ${key}`);
  return found;
}

describe('iconNamesOf', () => {
  it('keeps the plain and the form icons of a listing, each once, sorted', () => {
    const listing = {
      truncated: false,
      tree: [
        { path: 'pm19.fALOLA.icon.png', type: 'blob' },
        { path: 'pm147.icon.png' },
        { path: 'pm147.icon.png' },
        { path: 'pm147.s.icon.png' },
        { path: 'pm25.cFALL_2019.icon.png' },
        { path: 'pm25.fVS_2019.g2.icon.png' },
        { path: 'pm201.fUNOWN_F.icon.png' },
        { path: 'README.md' },
        { path: '../pm1.icon.png' },
        { path: 7 },
        null,
      ],
    };
    expect(iconNamesOf(listing)).toEqual([
      'pm147.icon.png',
      'pm19.fALOLA.icon.png',
      'pm201.fUNOWN_F.icon.png',
    ]);
    expect(isTruncatedListing(listing)).toBe(false);
    expect(isTruncatedListing({ ...listing, truncated: true })).toBe(true);
  });

  it('refuses what is no listing, and a listing without any icon', () => {
    expect(() => iconNamesOf({ message: 'API rate limit exceeded' })).toThrow('not a tree');
    expect(() => iconNamesOf('pm1.icon.png')).toThrow('not a tree');
    expect(() => iconNamesOf(null)).toThrow('not a tree');
    expect(() => iconNamesOf({ tree: [{ path: 'README.md' }] })).toThrow('names no icon');
  });
});

describe('mega portraits', () => {
  const portraits = new PokemonIcons([
    ...icons.names(),
    ...portraitNamesOf({
      tree: [
        { path: 'pm687.fMEGA.portrait.png' },
        { path: 'pm687.fMEGA.s.portrait.png' },
        { path: 'pm6.fMEGA_X.portrait.png' },
        { path: 'pm150.fMEGA_Y.portrait.png' },
        { path: 'pm687.icon.png' },
      ],
    }),
  ]);
  const source = { catalogue, icons: portraits };

  it('keeps the portraits of a listing, not the shiny ones nor anything else', () => {
    expect(
      portraitNamesOf({
        tree: [
          { path: 'pm687.fMEGA.portrait.png' },
          { path: 'pm687.fMEGA.s.portrait.png' },
          { path: 'pm687.icon.png' },
        ],
      }),
    ).toEqual(['pm687.fMEGA.portrait.png']);
    expect(() => portraitNamesOf({ tree: [{ path: 'pm687.icon.png' }] })).toThrow(
      'names no portrait',
    );
    expect(() => portraitNamesOf({ message: 'API rate limit exceeded' })).toThrow('not a tree');
  });

  it('shows the portrait of a mega whose icon the list lacks, from PokeMiners', () => {
    expect(iconAddress(entry('malamar_mega'), source)).toBe(
      `${MEGA_PORTRAIT_BASE}pm687.fMEGA.portrait.png`,
    );
    expect(MEGA_PORTRAIT_BASE).toBe(
      'https://raw.githubusercontent.com/PokeMiners/pogo_assets/master/Images/Mega%20Portraits%20512x512/',
    );
    expect(pokemonPicture(undefined, entry('mewtwo_mega_y'), source)).toBe(
      `${MEGA_PORTRAIT_BASE}pm150.fMEGA_Y.portrait.png`,
    );
  });

  it('keeps the icon of a mega that has one, and guesses no file in neither list', () => {
    expect(iconAddress(entry('charizard_mega_x'), source)).toBe(
      `${POKEMON_ICON_BASE}pm6.fMEGA_X.icon.png`,
    );
    expect(iconAddress(entry('mewtwo_mega_x'), source)).toBeUndefined();
    expect(iconAddress(entry('malamar_mega'), { catalogue, icons })).toBeUndefined();
  });

  it('keeps the portraits apart from the icons', () => {
    expect(portraits.portraits().names()).toEqual([
      'pm150.fMEGA_Y.portrait.png',
      'pm6.fMEGA_X.portrait.png',
      'pm687.fMEGA.portrait.png',
    ]);
    expect(portraits.iconsOnly().names()).toEqual(icons.names());
  });
});

describe('iconCandidates', () => {
  it('names the plain file for an entry without a form, or with the form NORMAL', () => {
    const plain = ['pm147.icon.png', 'pm147.fNORMAL.icon.png'];
    expect(iconCandidates(entry('dratini'))).toEqual(plain);
    expect(iconCandidates({ ...entry('dratini'), form: 'DRATINI_NORMAL' })).toEqual(plain);
  });

  it('names a form by its id without the species, then by the whole id', () => {
    expect(iconCandidates(entry('rattata_alola'))).toEqual([
      'pm19.fALOLA.icon.png',
      'pm19.fRATTATA_ALOLA.icon.png',
    ]);
    expect(iconCandidates(entry('giratina_altered'))[0]).toBe('pm487.fALTERED.icon.png');
    expect(iconCandidates(entry('giratina_origin'))[0]).toBe('pm487.fORIGIN.icon.png');
    expect(iconCandidates(entry('unown_f'))).toEqual([
      'pm201.fF.icon.png',
      'pm201.fUNOWN_F.icon.png',
    ]);
  });

  it('names a mega by its kind, as the feed does', () => {
    expect(iconCandidates(entry('charizard_mega_x'))[0]).toBe('pm6.fMEGA_X.icon.png');
    expect(iconCandidates(entry('venusaur_mega'))[0]).toBe('pm3.fMEGA.icon.png');
  });
});

describe('iconName', () => {
  it('picks the first candidate that exists', () => {
    expect(iconName(entry('dratini'), icons, catalogue)).toBe('pm147.icon.png');
    expect(iconName(entry('rattata_alola'), icons, catalogue)).toBe('pm19.fALOLA.icon.png');
    expect(iconName(entry('giratina_origin'), icons, catalogue)).toBe('pm487.fORIGIN.icon.png');
    expect(iconName(entry('charizard_mega_x'), icons, catalogue)).toBe('pm6.fMEGA_X.icon.png');
    // Unown's files carry the whole form id.
    expect(iconName(entry('unown_f'), icons, catalogue)).toBe('pm201.fUNOWN_F.icon.png');
  });

  it('gives a species whose files exist per form only the file of its first form in the catalogue', () => {
    expect(icons.has('pm201.icon.png')).toBe(false);
    expect(iconName(entry('unown'), icons, catalogue)).toBe('pm201.fUNOWN_A.icon.png');
    expect(iconName(entry('burmy'), icons, catalogue)).toBe('pm412.fBURMY_PLANT.icon.png');
    expect(iconName(entry('shellos'), icons, catalogue)).toBe('pm422.fEAST_SEA.icon.png');
    // Not where the species has a file of its own named NORMAL.
    expect(icons.has('pm646.icon.png')).toBe(false);
    expect(iconName(entry('kyurem'), icons, catalogue)).toBe('pm646.fNORMAL.icon.png');
  });

  it('prefers the ordinary form where the first in the catalogue is not it', () => {
    expect(catalogue.byDex(718).find((one) => one.kind === 'form')?.key).toBe('zygarde_complete');
    expect(iconName(entry('zygarde'), icons, catalogue)).toBe('pm718.fFIFTY_PERCENT.icon.png');
    expect(iconName(entry('furfrou'), icons, catalogue)).toBe('pm676.fNATURAL.icon.png');
    // The form a species is known by, where the catalogue's first is another.
    for (const [key, file] of [
      ['basculin', 'pm550.fRED_STRIPED.icon.png'],
      ['deerling', 'pm585.fSPRING.icon.png'],
      ['sawsbuck', 'pm586.fSPRING.icon.png'],
      ['flabebe', 'pm669.fRED.icon.png'],
      ['floette', 'pm670.fRED.icon.png'],
      ['florges', 'pm671.fRED.icon.png'],
      ['urshifu', 'pm892.fSINGLE_STRIKE.icon.png'],
      ['vivillon', 'pm666.fMEADOW.icon.png'],
    ] as const) {
      expect(iconName(entry(key), icons, catalogue), key).toBe(file);
    }
    // The preferred form has no file: the first that has one.
    const without = new PokemonIcons(
      icons.names().filter((name) => name !== 'pm718.fFIFTY_PERCENT.icon.png'),
    );
    expect(iconName(entry('zygarde'), without, catalogue)).toBe('pm718.fCOMPLETE.icon.png');
  });

  it('never shows a whole species as its mega, primal or Gigantamax', () => {
    // Toxtricity has a Gigantamax file, which is no entry of the catalogue.
    expect(icons.has('pm849.fGIGANTAMAX.icon.png')).toBe(true);
    expect(iconName(entry('toxtricity'), icons, catalogue)).toBe('pm849.fAMPED.icon.png');
    const megaOnly = new PokemonIcons(['pm6.fMEGA_X.icon.png', 'pm6.fGIGANTAMAX.icon.png']);
    expect(iconName(entry('charizard'), megaOnly, catalogue)).toBeUndefined();
    expect(iconName(entry('charizard_mega_x'), megaOnly, catalogue)).toBe('pm6.fMEGA_X.icon.png');
    for (const one of catalogue.all) {
      if (one.kind !== 'species') continue;
      expect(iconName(one, icons, catalogue) ?? '', one.key).not.toMatch(
        /\.f(?:MEGA|PRIMAL|GIGANTAMAX)/,
      );
    }
  });

  it('shows a form without a file of its own by the plain file of its species', () => {
    // Scatterbug's patterns only change the look: one file for all of them.
    const pattern = catalogue
      .byDex(664)
      .find((one) => one.kind === 'form' && iconCandidates(one).every((name) => !icons.has(name)));
    expect(pattern).toBeDefined();
    if (pattern) expect(iconName(pattern, icons, catalogue)).toBe('pm664.icon.png');
    const few = new PokemonIcons([
      'pm19.icon.png',
      'pm147.fSOMETHING.icon.png',
      'pm6.icon.png',
      'pm646.fNORMAL.icon.png',
    ]);
    expect(iconName(entry('rattata'), few, catalogue)).toBe('pm19.icon.png');
    // Not a regional form: an Alolan Rattata is not the Rattata of the plain file.
    expect(entry('rattata_alola').kind).toBe('regional');
    expect(iconName(entry('rattata_alola'), few, catalogue)).toBeUndefined();
    expect(iconName(entry('kyurem_black'), few, catalogue)).toBe('pm646.fNORMAL.icon.png');
    // Not a mega: it is another Pokémon to look at.
    expect(iconName(entry('charizard_mega_x'), few, catalogue)).toBeUndefined();
  });

  it('never shows Ultra Necrozma by the plain file: like a mega it is another Pokémon to look at', () => {
    expect(entry('necrozma_ultra').kind).toBe('form');
    expect(icons.has('pm800.icon.png')).toBe(true);
    expect(iconCandidates(entry('necrozma_ultra')).some((name) => icons.has(name))).toBe(false);
    expect(iconName(entry('necrozma_ultra'), icons, catalogue)).toBeUndefined();
    // Its own file is shown once there is one.
    const [own = ''] = iconCandidates(entry('necrozma_ultra'));
    expect(iconName(entry('necrozma_ultra'), icons.with(new PokemonIcons([own])), catalogue)).toBe(
      own,
    );
    expect(iconName(entry('necrozma'), icons, catalogue)).toBe('pm800.icon.png');
  });

  it('shows the plain file only for an entry of kind form: a species known by a form has its own or none', () => {
    // Eiscue is known by its Ice Face (there is no entry `eiscue`), and has no file of its own.
    const ice = entry('eiscue_ice');
    expect(ice.kind).toBe('species');
    expect(iconCandidates(ice).some((name) => icons.has(name))).toBe(false);
    const withPlain = icons.with(new PokemonIcons([`pm${String(ice.dex)}.icon.png`]));
    expect(iconName(ice, withPlain, catalogue)).toBeUndefined();
    // Never by the file of another of its forms either.
    const other = catalogue.byDex(ice.dex).find((one) => one.kind === 'form');
    expect(other).toBeDefined();
    const withOther = icons.with(new PokemonIcons(other ? iconCandidates(other) : []));
    expect(iconName(ice, withOther, catalogue)).toBeUndefined();
  });

  it('gives nothing when no file fits', () => {
    const few = new PokemonIcons(['pm19.icon.png', 'pm147.fSOMETHING.icon.png']);
    // No plain file of the species, and a form is never shown by another form.
    expect(iconName(entry('giratina_origin'), few, catalogue)).toBeUndefined();
    expect(iconName(entry('giratina_origin'), icons, { byDex: () => [] })).toBe(
      'pm487.fORIGIN.icon.png',
    );
    // A file of the number that is no form of the catalogue shows nothing.
    expect(iconName(entry('dratini'), few, catalogue)).toBeUndefined();
    expect(iconName(entry('dratini'), new PokemonIcons([]), catalogue)).toBeUndefined();
  });
});

describe('the icons of the whole catalogue', () => {
  const every = catalogue.all;

  it('names only files the reader of feed pictures can read', () => {
    for (const one of every) {
      for (const name of iconCandidates(one)) {
        expect(
          pictureIds(`${POKEMON_ICON_BASE}${name}`, lookup),
          `${one.key}: ${name}`,
        ).toBeDefined();
      }
    }
  });

  it('is read back by the feed as the same entry, wherever the feed can tell', () => {
    let found = 0;
    const missing: string[] = [];
    const firstForm: string[] = [];
    const bySpecies: string[] = [];
    const unreadable: string[] = [];
    for (const one of every) {
      const address = iconAddress(one, { catalogue, icons });
      if (address === undefined) {
        missing.push(one.key);
        continue;
      }
      found += 1;
      const ids = pictureIds(address, lookup);
      if (!ids) throw new Error(`${one.key}: ${address} is not read`);
      const back = lookup.keyOf(ids.pokemonId, ids.form);
      if (back === one.key) continue;
      // The entry of a whole species shown by one of its forms, or a form shown by the plain
      // file of its species: another entry of the same species.
      if (iconCandidates(one).every((name) => !icons.has(name))) {
        (one.kind === 'species' ? firstForm : bySpecies).push(one.key);
        expect(one.kind, one.key).not.toBe('mega');
        expect(catalogue.byKey(back ?? '')?.dex, one.key).toBe(one.dex);
        continue;
      }
      // What the feed's reader cannot place: ids the catalogue has no entry for under that
      // spelling. Never another Pokémon.
      expect(back, `${one.key}: ${address}`).toBeUndefined();
      unreadable.push(one.key);
    }
    // Measured with the game master of 2026-10-10 and the files of 2026-10-12: 1,271 of 1,431
    // entries have a picture, 40 of them forms shown by the plain file of their species
    // (Scatterbug's and Spewpa's patterns and the like); the 160 without are species and megas
    // that are not released (97 and 13) and forms of species that have no plain file either, or
    // must not be shown by it (50: Silvally's types, Minior's colours, Spinda's later patterns
    // and the like, and Ultra Necrozma). A refresh of either fixture may move these a little.
    expect(missing).toContain('necrozma_ultra');
    expect(found / every.length).toBeGreaterThan(0.87);
    expect(missing.length).toBeLessThan(every.length * 0.13);
    expect(unreadable).toEqual([]);
    // Whole species that have files per form only: Unown, Burmy, Shellos, Vivillon and so on.
    expect(firstForm).toContain('unown');
    expect(firstForm).not.toContain('kyurem');
    expect(firstForm.length).toBeLessThan(30);
    expect(bySpecies.length).toBeGreaterThan(20);
    expect(bySpecies.length).toBeLessThan(60);
  });
});

describe('pokemonPicture', () => {
  const feed = 'https://cdn.leekduck.com/assets/img/pokemon_icons/pm25.cFALL_2019.icon.png';

  it('is the picture of the feed when there is one: it shows what the boss wears now', () => {
    expect(pokemonPicture(feed, entry('pikachu'), { catalogue, icons })).toBe(feed);
    expect(pokemonPicture(feed, undefined, undefined)).toBe(feed);
  });

  it('is the icon of the catalogue entry when the feed has none', () => {
    expect(pokemonPicture(undefined, entry('dratini'), { catalogue, icons })).toBe(
      'https://cdn.leekduck.com/assets/img/pokemon_icons/pm147.icon.png',
    );
    expect(pokemonPicture(undefined, entry('unown'), { catalogue, icons })).toBe(
      'https://cdn.leekduck.com/assets/img/pokemon_icons/pm201.fUNOWN_A.icon.png',
    );
  });

  it('is nothing without either: no entry, no icon for it, or no list of icons', () => {
    expect(pokemonPicture(undefined, undefined, { catalogue, icons })).toBeUndefined();
    expect(
      pokemonPicture(undefined, entry('dratini'), { catalogue, icons: new PokemonIcons([]) }),
    ).toBeUndefined();
    expect(pokemonPicture(undefined, entry('dratini'), { catalogue })).toBeUndefined();
    expect(pokemonPicture(undefined, entry('dratini'), undefined)).toBeUndefined();
    expect(iconAddress(entry('dratini'), undefined)).toBeUndefined();
  });
});

describe('maxBossPicture (plan 8X-2)', () => {
  const at = (name: string): string => `${POKEMON_ICON_BASE}${name}`;

  it('is the Gigantamax file of a Gigantamax boss: of its form first, else of its species', () => {
    const withForm = new PokemonIcons([
      ...icons.names(),
      'pm892.fRAPID_STRIKE_GIGANTAMAX.icon.png',
    ]);
    expect(maxBossPicture(entry('machamp'), 'G', { catalogue, icons })).toBe(
      at('pm68.fGIGANTAMAX.icon.png'),
    );
    expect(maxBossPicture(entry('toxtricity_amped'), 'G', { catalogue, icons })).toBe(
      at('pm849.fGIGANTAMAX.icon.png'),
    );
    expect(maxBossPicture(entry('urshifu_rapid_strike'), 'G', { catalogue, icons: withForm })).toBe(
      at('pm892.fRAPID_STRIKE_GIGANTAMAX.icon.png'),
    );
  });

  it("is the Pokémon's own picture where the game has no Gigantamax file", () => {
    expect(maxBossPicture(entry('urshifu_rapid_strike'), 'G', { catalogue, icons })).toBe(
      at('pm892.fRAPID_STRIKE.icon.png'),
    );
    expect(maxBossPicture(entry('eternatus_eternamax'), 'G', { catalogue, icons })).toBe(
      at('pm890.fETERNAMAX.icon.png'),
    );
  });

  it('is never the Gigantamax file of a Dynamax boss', () => {
    expect(maxBossPicture(entry('machamp'), 'D2', { catalogue, icons })).toBe(at('pm68.icon.png'));
  });

  it('is nothing without a list of icons', () => {
    expect(maxBossPicture(entry('machamp'), 'G', { catalogue })).toBeUndefined();
    expect(maxBossPicture(undefined, 'G', { catalogue, icons })).toBeUndefined();
  });
});
