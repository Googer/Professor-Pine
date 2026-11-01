import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { catalogueFixture } from '../../../test/support/game-data.js';
import {
  LEGACY_NAME_ALIASES,
  keyForLegacyName,
  legacyNameForKey,
  legacyNamesForKey,
} from './legacy-names.js';
import { POKEBATTLER_EXCEPTIONS } from './pokebattler.js';

interface LegacyPokemon {
  name?: string;
  pbName?: string;
  number?: number;
}

const legacy = JSON.parse(
  readFileSync(path.resolve(import.meta.dirname, '../../../data/pokemon.json'), 'utf8'),
) as LegacyPokemon[];
const catalogue = catalogueFixture();

/** In the legacy data but not in the game master, so the new bot cannot know them. */
const NOT_IN_GAME_MASTER = ['basculegion', 'sliggoo_hisuian', 'goodra_hisuian'];
/**
 * Where the legacy Pokebattler name was wrong and the derived name is used instead: Torracat and
 * Incineroar were both listed as LITTEN, and the White-Striped Basculin entry was typed by hand
 * under a form id the game master never had.
 */
const LEGACY_POKEBATTLER_ERRORS: Record<string, string> = {
  torracat: 'TORRACAT',
  incineroar: 'INCINEROAR',
  basculin_white_striped: 'BASCULIN_WHITE_STRIPED_FORM',
};

/**
 * Legacy entries under a bare species name whose Pokebattler name was the species id, where the
 * catalogue now knows the species by its default form and derives `<FORM>_FORM`. Which of the
 * two Pokebattler accepts is checked when `/counters` is ported (Phase 6).
 */
const LEGACY_SPECIES_ID_FOR_DEFAULT_FORM = [
  'aegislash',
  'darmanitan',
  'eiscue',
  // Listed twice in the legacy data, once with each Pokebattler name.
  'enamorus',
  'gourgeist',
  'hoopa',
  'indeedee',
  'koraidon',
  'lycanroc',
  'miraidon',
  'morpeko',
  'oricorio',
  'pumpkaboo',
  'wishiwashi',
];

describe('legacy names', () => {
  it('maps hand-typed legacy names to catalogue keys', () => {
    expect(keyForLegacyName('nidoran♀')).toBe('nidoran_female');
    expect(keyForLegacyName('mr. mime')).toBe('mr_mime');
    expect(keyForLegacyName('OINKOLOGNE_FEMALE')).toBe('oinkologne_female');
    expect(keyForLegacyName('deoxys_normal')).toBe('deoxys');
    expect(keyForLegacyName(' Venusaur ')).toBe('venusaur');
  });

  it('maps a species the catalogue knows by its default form to that form', () => {
    expect(keyForLegacyName('landorus')).toBe('landorus_incarnate');
    expect(keyForLegacyName('Hoopa')).toBe('hoopa_confined');
    expect(keyForLegacyName('giratina_altered')).toBe('giratina_altered');
    // The legacy data has only the bare name: that is the row the legacy bot reads.
    expect(legacyNamesForKey('landorus_incarnate')).toEqual(['landorus', 'landorus_incarnate']);
    // It has both names: the form's name is the exact match.
    expect(legacyNamesForKey('hoopa_confined')).toEqual(['hoopa_confined', 'hoopa']);
    // It has only the form's name; a stray row under the bare name is still found.
    expect(legacyNamesForKey('giratina_altered')).toEqual(['giratina_altered', 'giratina']);
    expect(keyForLegacyName('zacian')).toBe('zacian_hero');
    expect(legacyNamesForKey('zacian_hero')).toEqual(['zacian_hero', 'zacian']);
  });

  it('maps back to the name the legacy bot uses', () => {
    expect(legacyNameForKey('nidoran_female')).toBe('nidoran♀');
    expect(legacyNameForKey('mr_mime')).toBe('mr. mime');
    expect(legacyNameForKey('deoxys')).toBe('deoxys_normal');
    expect(legacyNameForKey('oinkologne_female')).toBe('OINKOLOGNE_FEMALE');
    expect(legacyNameForKey('obstagoon')).toBe('obstagoon');
    expect(legacyNameForKey('oinkologne')).toBe('oinkologne');
    expect(legacyNameForKey('venusaur')).toBe('venusaur');
  });

  it('lists every name a legacy row may have, the preferred one first', () => {
    expect(legacyNamesForKey('deoxys')).toEqual(['deoxys_normal', 'deoxys']);
    expect(legacyNamesForKey('obstagoon')).toEqual(['obstagoon', 'obstagoon_normal']);
    expect(legacyNamesForKey('oinkologne_female')).toEqual([
      'OINKOLOGNE_FEMALE',
      'oinkologne_female',
    ]);
    expect(legacyNamesForKey('nidoran_female')[0]).toBe('nidoran♀');
    expect(legacyNamesForKey('venusaur')).toEqual(['venusaur']);
  });

  it('maps the bare name of every species known by a default form', () => {
    const missing = catalogue.all
      .filter((entry) => entry.kind === 'species' && entry.form !== null)
      .filter((entry) => keyForLegacyName(entry.pokemonId) !== entry.key)
      .map((entry) => entry.key);
    expect(missing).toEqual([]);
  });

  it('points every alias at a real catalogue entry, by its own key', () => {
    for (const [legacyName, key] of Object.entries(LEGACY_NAME_ALIASES)) {
      expect(catalogue.byKey(key)?.key, legacyName).toBe(key);
    }
  });
});

describe('parity with the legacy data/pokemon.json', () => {
  const real = legacy.filter(
    (entry): entry is LegacyPokemon & { name: string } =>
      typeof entry.name === 'string' &&
      entry.number === undefined &&
      !['mega', 'elite'].includes(entry.name),
  );

  it('knows every Pokémon the legacy bot knew', () => {
    const unknown = real
      .map((entry) => entry.name)
      .filter((name) => catalogue.byKey(keyForLegacyName(name)) === undefined);
    expect(unknown.sort()).toEqual([...NOT_IN_GAME_MASTER].sort());
  });

  it('gives the key of an entry, never an alias of one, for every legacy name', () => {
    const aliased = real
      .map((entry) => entry.name)
      .filter((name) => {
        const key = keyForLegacyName(name);
        const found = catalogue.byKey(key);
        return found !== undefined && found.key !== key;
      });
    expect(aliased).toEqual([]);
  });

  it('round-trips every legacy name to a name the legacy data has', () => {
    const names = new Set(real.map((entry) => entry.name));
    const resolvable = [...names].filter(
      (name) => catalogue.byKey(keyForLegacyName(name)) !== undefined,
    );
    const notInData = resolvable.filter(
      (name) => !names.has(legacyNameForKey(keyForLegacyName(name))),
    );
    const notListed = resolvable.filter(
      (name) => !legacyNamesForKey(keyForLegacyName(name)).includes(name),
    );
    expect(notInData.sort()).toEqual([]);
    expect(notListed.sort()).toEqual([]);
  });

  it('derives the same Pokebattler name, apart from three legacy errors and the default forms', () => {
    const different: Record<string, string> = {};
    const speciesIdInLegacy: string[] = [];
    for (const entry of real) {
      const pokemon = catalogue.byKey(keyForLegacyName(entry.name));
      if (!pokemon || entry.pbName === undefined || pokemon.pokebattlerId === entry.pbName)
        continue;
      if (entry.pbName === pokemon.pokemonId) speciesIdInLegacy.push(entry.name);
      else different[pokemon.key] = pokemon.pokebattlerId;
    }
    expect(different).toEqual(LEGACY_POKEBATTLER_ERRORS);
    expect(speciesIdInLegacy.sort()).toEqual(LEGACY_SPECIES_ID_FOR_DEFAULT_FORM);
  });

  it('needs every Pokebattler exception it lists', () => {
    for (const key of Object.keys(POKEBATTLER_EXCEPTIONS)) {
      expect(catalogue.byKey(key)?.key, key).toBe(key);
    }
  });
});
