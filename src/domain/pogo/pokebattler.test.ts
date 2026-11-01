import { describe, expect, it } from 'vitest';
import { POKEBATTLER_EXCEPTIONS, pokebattlerId } from './pokebattler.js';

describe('pokebattlerId', () => {
  it('uses the species id for a species', () => {
    expect(pokebattlerId('VENUSAUR', null, null)).toBe('VENUSAUR');
    expect(pokebattlerId('MR_MIME', null, null)).toBe('MR_MIME');
  });

  it('appends _FORM to a form', () => {
    expect(pokebattlerId('RATTATA', 'RATTATA_ALOLA', null)).toBe('RATTATA_ALOLA_FORM');
    expect(pokebattlerId('GIRATINA', 'GIRATINA_ORIGIN', null)).toBe('GIRATINA_ORIGIN_FORM');
  });

  it('names megas after the species', () => {
    expect(pokebattlerId('VENUSAUR', null, 'MEGA')).toBe('VENUSAUR_MEGA');
    expect(pokebattlerId('CHARIZARD', null, 'MEGA_X')).toBe('CHARIZARD_MEGA_X');
    expect(pokebattlerId('KYOGRE', null, 'PRIMAL')).toBe('KYOGRE_PRIMAL');
  });

  it('applies the exceptions', () => {
    expect(pokebattlerId('ARCEUS', null, null)).toBe('ARCEUS_NORMAL_FORM');
    expect(pokebattlerId('TORNADUS', 'TORNADUS_INCARNATE', null)).toBe('TORNADUS_INCARNATE_FORM');
    expect(pokebattlerId('KYUREM', 'KYUREM_WHITE', null)).toBe('KYUREM_WHITE');
    expect(pokebattlerId('CHERRIM', 'CHERRIM_SUNNY', null)).toBe('CHERRIM');
    expect(pokebattlerId('JANGMO_O', null, null)).toBe('JANGMO-O');
    expect(pokebattlerId('DARMANITAN', 'DARMANITAN_GALARIAN_ZEN', null)).toBe(
      'DARMANITAN_ZEN_GALARIAN_FORM',
    );
  });

  it('keys every exception in lower case', () => {
    for (const key of Object.keys(POKEBATTLER_EXCEPTIONS)) {
      expect(key).toBe(key.toLowerCase());
    }
  });
});
