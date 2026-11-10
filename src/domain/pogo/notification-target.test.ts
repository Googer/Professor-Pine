import { describe, expect, it } from 'vitest';
import {
  decodeNotification,
  ivCode,
  notificationTiers,
  tierCode,
  encodeNotification,
  isPokedexNumber,
  MAX_POKEDEX_NUMBER,
  parseNotificationScope,
  pokemonTarget,
  readNotification,
  sameNotificationTarget,
  type NotificationScope,
  type NotificationTarget,
} from './notification-target.js';
import { RAID_LEVELS, SHADOW_RAID_LEVELS, type RaidLevel } from './raid-tier.js';

const SCOPES: readonly NotificationScope[] = ['raid', 'spawn', 'both'];
/** What a row holds in the two newer columns when it is for no form and not for shadow raids. */
const NONE = { form: null, shadow: false };

const tier = (level: RaidLevel, shadow = false): NotificationTarget => ({
  kind: 'tier',
  tier: { level, shadow },
});

describe('notification codec: the bound of a Pokédex number', () => {
  it('is six digits, as a token and a typed label take them', () => {
    expect(MAX_POKEDEX_NUMBER).toBe(999_999);
    for (const dex of [1, 150, 999_999]) expect(isPokedexNumber(dex)).toBe(true);
    for (const not of [0, -6, 1.5, 1_000_000, 2 ** 31 - 1, Number.NaN, Infinity]) {
      expect(isPokedexNumber(not)).toBe(false);
    }
  });

  it('reads a row up to the bound and no row above it', () => {
    expect(decodeNotification({ pokemon: 999_999, type: 'both' })).toEqual(pokemonTarget(999_999));
    expect(readNotification({ pokemon: 999_999, type: 'raid' })).toEqual({
      target: pokemonTarget(999_999),
      scope: 'raid',
    });
    for (const pokemon of [1_000_000, 12_345_678, 2 ** 31 - 1]) {
      for (const type of SCOPES) {
        expect(decodeNotification({ pokemon, type })).toBeUndefined();
        expect(readNotification({ pokemon, type, form: 'mewtwo_a', shadow: true })).toBeUndefined();
      }
    }
  });

  it('writes no row above the bound', () => {
    expect(encodeNotification(pokemonTarget(999_999), 'both').pokemon).toBe(999_999);
    expect(() => encodeNotification(pokemonTarget(1_000_000), 'both')).toThrow(RangeError);
  });
});

describe('notification codec: legacy rows', () => {
  it('reads a positive number as a Pokédex number, whatever the scope', () => {
    expect(decodeNotification({ pokemon: 150, type: 'both' })).toEqual({
      kind: 'pokemon',
      dex: 150,
    });
    expect(decodeNotification({ pokemon: 201, type: 'spawn' })).toEqual({
      kind: 'pokemon',
      dex: 201,
    });
  });

  it('reads the legacy tier numbers', () => {
    expect(decodeNotification({ pokemon: -1, type: 'raid' })).toEqual(tier('T1'));
    expect(decodeNotification({ pokemon: -3, type: 'both' })).toEqual(tier('T3'));
    expect(decodeNotification({ pokemon: -5, type: 'raid' })).toEqual(tier('T5'));
    expect(decodeNotification({ pokemon: -4, type: 'raid' })).toEqual(tier('Mega'));
  });

  it('reads -6 as perfect IVs unless the scope is raid', () => {
    const perfect = { kind: 'iv', iv: 'perfect' };
    expect(decodeNotification({ pokemon: -6, type: 'spawn' })).toEqual(perfect);
    expect(decodeNotification({ pokemon: -6, type: 'both' })).toEqual(perfect);
    expect(decodeNotification({ pokemon: -6, type: 'Both' })).toEqual(perfect);
    expect(decodeNotification({ pokemon: -6, type: 'raid' })).toEqual(tier('MegaLegendary'));
  });

  it('reads -8 as the zero-IV target whatever the scope', () => {
    for (const type of SCOPES) {
      expect(decodeNotification({ pokemon: -8, type })).toEqual({ kind: 'iv', iv: 'zero' });
    }
  });

  it('reads the type in any letter case, with padding', () => {
    expect(decodeNotification({ pokemon: -6, type: 'Spawn' })).toEqual({
      kind: 'iv',
      iv: 'perfect',
    });
    expect(decodeNotification({ pokemon: -8, type: 'Spawn' })).toEqual({ kind: 'iv', iv: 'zero' });
    expect(decodeNotification({ pokemon: 150, type: 'BOTH' })).toEqual({
      kind: 'pokemon',
      dex: 150,
    });
    expect(decodeNotification({ pokemon: -5, type: 'Raid' })).toEqual(tier('T5'));
    expect(decodeNotification({ pokemon: -5, type: ' both ' })).toEqual(tier('T5'));
  });

  it('returns undefined for a type that is not a scope', () => {
    for (const type of ['', 'sometimes']) {
      expect(decodeNotification({ pokemon: 150, type })).toBeUndefined();
      expect(decodeNotification({ pokemon: -5, type })).toBeUndefined();
    }
  });

  it('does not read a tier from a spawn row', () => {
    expect(decodeNotification({ pokemon: -1, type: 'spawn' })).toBeUndefined();
    expect(decodeNotification({ pokemon: -7, type: 'spawn' })).toBeUndefined();
  });

  it('reads -7 as the super mega tier (tier 7 in the game), for a raid row only', () => {
    expect(decodeNotification({ pokemon: -7, type: 'raid' })).toEqual(tier('SuperMega'));
    expect(decodeNotification({ pokemon: -7, type: 'Both' })).toEqual(tier('SuperMega'));
    expect(encodeNotification(tier('SuperMega'), 'both')).toEqual({
      pokemon: -7,
      type: 'raid',
      ...NONE,
    });
  });

  it('returns undefined for values it does not know', () => {
    expect(decodeNotification({ pokemon: 0, type: 'both' })).toBeUndefined();
    expect(decodeNotification({ pokemon: -2, type: 'raid' })).toBeUndefined();
    expect(decodeNotification({ pokemon: -9, type: 'raid' })).toBeUndefined();
    expect(decodeNotification({ pokemon: -5, type: 'spawn' })).toBeUndefined();
    expect(decodeNotification({ pokemon: 1.5, type: 'both' })).toBeUndefined();
  });
});

describe('notification codec: writing', () => {
  it('stores a species as its Pokédex number with the scope asked for', () => {
    expect(encodeNotification({ kind: 'pokemon', dex: 150 }, 'raid')).toEqual({
      pokemon: 150,
      type: 'raid',
      ...NONE,
    });
    expect(() => encodeNotification({ kind: 'pokemon', dex: 0 }, 'both')).toThrow(RangeError);
    expect(() => encodeNotification({ kind: 'pokemon', dex: -6 }, 'both')).toThrow(RangeError);
  });

  it('keeps the legacy numbers for the legacy tiers', () => {
    expect(encodeNotification(tier('T1'), 'raid').pokemon).toBe(-1);
    expect(encodeNotification(tier('T3'), 'raid').pokemon).toBe(-3);
    expect(encodeNotification(tier('T5'), 'raid').pokemon).toBe(-5);
    expect(encodeNotification(tier('Mega'), 'raid').pokemon).toBe(-4);
    expect(encodeNotification(tier('MegaLegendary'), 'raid').pokemon).toBe(-6);
  });

  it('always stores IV targets as spawn and never stores a tier as spawn', () => {
    expect(encodeNotification({ kind: 'iv', iv: 'perfect' }, 'both')).toEqual({
      pokemon: -6,
      type: 'spawn',
      ...NONE,
    });
    expect(encodeNotification({ kind: 'iv', iv: 'zero' }, 'raid')).toEqual({
      pokemon: -8,
      type: 'spawn',
      ...NONE,
    });
    expect(encodeNotification(tier('MegaLegendary'), 'spawn')).toEqual({
      pokemon: -6,
      type: 'raid',
      ...NONE,
    });
  });

  it('stores every tier as raid whatever scope was asked for', () => {
    const tiers = [
      ...RAID_LEVELS.map((level) => tier(level)),
      ...SHADOW_RAID_LEVELS.map((level) => tier(level, true)),
    ];
    for (const target of tiers) {
      for (const scope of SCOPES) {
        expect(encodeNotification(target, scope).type).toBe('raid');
      }
    }
  });

  it('stores IV targets as spawn for each scope', () => {
    for (const iv of ['perfect', 'zero'] as const) {
      for (const scope of SCOPES) {
        expect(encodeNotification({ kind: 'iv', iv }, scope).type).toBe('spawn');
      }
    }
  });

  it('keeps the scope asked for on a species', () => {
    for (const scope of SCOPES) {
      expect(encodeNotification({ kind: 'pokemon', dex: 25 }, scope).type).toBe(scope);
    }
  });

  it('gives the new tiers numbers outside the legacy range', () => {
    const fresh = [tier('Elite'), tier('T1', true), tier('T3', true), tier('T5', true)];
    for (const target of fresh) {
      expect(encodeNotification(target, 'raid').pokemon).toBeLessThan(-8);
    }
  });

  it('refuses a shadow tier that does not exist', () => {
    expect(() => encodeNotification(tier('Mega', true), 'raid')).toThrow(RangeError);
  });

  it('round-trips every target for each scope, with distinct stored values', () => {
    const targets: NotificationTarget[] = [
      { kind: 'pokemon', dex: 1 },
      { kind: 'pokemon', dex: 1025 },
      { kind: 'iv', iv: 'perfect' },
      { kind: 'iv', iv: 'zero' },
      ...RAID_LEVELS.map((level) => tier(level)),
      ...SHADOW_RAID_LEVELS.map((level) => tier(level, true)),
    ];
    for (const scope of SCOPES) {
      const seen = new Set<string>();
      for (const target of targets) {
        const stored = encodeNotification(target, scope);
        expect(decodeNotification(stored), `${scope} ${JSON.stringify(target)}`).toEqual(target);
        seen.add(`${stored.pokemon}/${stored.type}`);
      }
      expect(seen.size, scope).toBe(targets.length);
    }
  });
});

describe('parseNotificationScope', () => {
  it('normalises the case and padding of a stored type', () => {
    expect(parseNotificationScope('Both')).toBe('both');
    expect(parseNotificationScope(' SPAWN ')).toBe('spawn');
    expect(parseNotificationScope('raid')).toBe('raid');
    expect(parseNotificationScope('x')).toBeUndefined();
    expect(parseNotificationScope('')).toBeUndefined();
  });
});

describe('notification codec: one form, and shadow raids', () => {
  const species = (dex: number) => pokemonTarget(dex);

  it('spells a Pokémon target one way: no form for none, no shadow for false', () => {
    expect(pokemonTarget(150)).toStrictEqual({ kind: 'pokemon', dex: 150 });
    expect(pokemonTarget(150, null, false)).toStrictEqual({ kind: 'pokemon', dex: 150 });
    expect(pokemonTarget(487, 'giratina_origin')).toStrictEqual({
      kind: 'pokemon',
      dex: 487,
      form: 'giratina_origin',
    });
    expect(pokemonTarget(645, undefined, true)).toStrictEqual({
      kind: 'pokemon',
      dex: 645,
      shadow: true,
    });
  });

  it('reads a row from before the columns, and one that has them empty, as the species', () => {
    expect(decodeNotification({ pokemon: 150, type: 'both' })).toStrictEqual(species(150));
    expect(decodeNotification({ pokemon: 150, type: 'both', ...NONE })).toStrictEqual(species(150));
    expect(decodeNotification({ pokemon: 150, type: 'both', form: '  ' })).toStrictEqual(
      species(150),
    );
  });

  it('reads a form as the key it holds, in lower case, and the shadow flag', () => {
    expect(decodeNotification({ pokemon: 487, type: 'raid', form: 'giratina_origin' })).toEqual(
      pokemonTarget(487, 'giratina_origin'),
    );
    expect(
      decodeNotification({ pokemon: 487, type: 'raid', form: ' Giratina_Origin ', shadow: false }),
    ).toStrictEqual(pokemonTarget(487, 'giratina_origin'));
    expect(decodeNotification({ pokemon: 645, type: 'raid', form: null, shadow: true })).toEqual(
      pokemonTarget(645, undefined, true),
    );
    expect(
      decodeNotification({ pokemon: 645, type: 'raid', form: 'landorus_therian', shadow: true }),
    ).toEqual(pokemonTarget(645, 'landorus_therian', true));
    // A key the game data has never had is a key all the same: the row is a want.
    expect(decodeNotification({ pokemon: 487, type: 'both', form: 'giratina_sky' })).toEqual(
      pokemonTarget(487, 'giratina_sky'),
    );
  });

  it.each(['Origin Forme', 'giratina-origin', 'a:b', 'é', 'a'.repeat(65)])(
    'does not read a row whose form %j cannot be a catalogue key',
    (form) => {
      expect(decodeNotification({ pokemon: 487, type: 'both', form })).toBeUndefined();
    },
  );

  it('reads a tier or IV row by its number alone, whatever the two columns hold', () => {
    const stray = { form: 'giratina_origin', shadow: true };
    expect(decodeNotification({ pokemon: -5, type: 'raid', ...stray })).toStrictEqual(tier('T5'));
    expect(decodeNotification({ pokemon: -8, type: 'spawn', ...stray })).toStrictEqual({
      kind: 'iv',
      iv: 'zero',
    });
    expect(decodeNotification({ pokemon: -6, type: 'both', form: 'not a key' })).toStrictEqual({
      kind: 'iv',
      iv: 'perfect',
    });
    expect(readNotification({ pokemon: -5, type: 'raid', ...stray })?.scope).toBe('raid');
  });

  it('writes the form and the flag for a Pokémon, and neither for a tier or an IV target', () => {
    expect(encodeNotification(pokemonTarget(487, 'giratina_origin'), 'spawn')).toEqual({
      pokemon: 487,
      type: 'spawn',
      form: 'giratina_origin',
      shadow: false,
    });
    expect(encodeNotification(species(487), 'both')).toEqual({
      pokemon: 487,
      type: 'both',
      ...NONE,
    });
    expect(encodeNotification(tier('T5', true), 'raid')).toMatchObject(NONE);
    expect(encodeNotification({ kind: 'iv', iv: 'zero' }, 'spawn')).toMatchObject(NONE);
    expect(() => encodeNotification(pokemonTarget(487, 'Origin Forme'), 'both')).toThrow(
      RangeError,
    );
  });

  it('stores a want for shadow raids as raid, whatever scope was asked for', () => {
    for (const scope of SCOPES) {
      expect(encodeNotification(pokemonTarget(645, undefined, true), scope)).toEqual({
        pokemon: 645,
        type: 'raid',
        form: null,
        shadow: true,
      });
      expect(encodeNotification(pokemonTarget(645, 'landorus_therian', true), scope)).toEqual({
        pokemon: 645,
        type: 'raid',
        form: 'landorus_therian',
        shadow: true,
      });
    }
  });

  it('gives a want for shadow raids the scope raid, whatever its row says', () => {
    for (const type of ['raid', 'spawn', 'both', 'Both']) {
      expect(readNotification({ pokemon: 645, type, form: null, shadow: true })).toEqual({
        target: pokemonTarget(645, undefined, true),
        scope: 'raid',
      });
    }
    expect(readNotification({ pokemon: 487, type: 'spawn', form: 'giratina_origin' })).toEqual({
      target: pokemonTarget(487, 'giratina_origin'),
      scope: 'spawn',
    });
  });

  it('round-trips a species, a form and the shadow raids of either, for each scope', () => {
    const targets = [
      species(487),
      pokemonTarget(487, 'giratina_origin'),
      pokemonTarget(487, undefined, true),
      pokemonTarget(487, 'giratina_origin', true),
    ];
    for (const scope of SCOPES) {
      const seen = new Set<string>();
      for (const target of targets) {
        const stored = encodeNotification(target, scope);
        expect(decodeNotification(stored)).toStrictEqual(target);
        seen.add(`${String(stored.form)}|${String(stored.shadow)}`);
      }
      expect(seen.size).toBe(targets.length);
    }
  });

  it('keeps a species, its forms and the shadow raids of each apart', () => {
    const all = [
      species(487),
      pokemonTarget(487, 'giratina_origin'),
      pokemonTarget(487, 'giratina_altered'),
      pokemonTarget(487, undefined, true),
      pokemonTarget(487, 'giratina_origin', true),
      species(488),
    ];
    for (const a of all) {
      for (const b of all) expect(sameNotificationTarget(a, b)).toBe(a === b);
    }
    expect(
      sameNotificationTarget(pokemonTarget(487, 'giratina_origin'), {
        kind: 'pokemon',
        dex: 487,
        form: 'giratina_origin',
      }),
    ).toBe(true);
  });
});

describe('tierCode and ivCode', () => {
  it('give the number the codec stores, for every tier that can be wanted', () => {
    for (const tier of notificationTiers()) {
      expect(tierCode(tier)).toBe(encodeNotification({ kind: 'tier', tier }, 'raid').pokemon);
    }
    expect(tierCode({ level: 'T5', shadow: false })).toBe(-5);
    expect(tierCode({ level: 'T5', shadow: true })).toBe(-35);
    expect(tierCode({ level: 'MegaLegendary', shadow: false })).toBe(-6);
    expect(tierCode({ level: 'Elite', shadow: false })).toBe(-20);
  });

  it('no longer knows the number the EX tier had: such a row is one it cannot read', () => {
    expect(notificationTiers().map((found) => tierCode(found))).not.toContain(-21);
    for (const type of ['raid', 'both', 'spawn']) {
      expect(decodeNotification({ pokemon: -21, type })).toBeUndefined();
      expect(readNotification({ pokemon: -21, type })).toBeUndefined();
    }
  });

  it('has no number, and does not throw, for a tier the codec has none for', () => {
    expect(tierCode({ level: 'Mega', shadow: true })).toBeUndefined();
    expect(tierCode({ level: 'Elite', shadow: true })).toBeUndefined();
  });

  it('gives the numbers of the IV targets', () => {
    expect(ivCode('perfect')).toBe(-6);
    expect(ivCode('zero')).toBe(-8);
    expect(ivCode('perfect')).toBe(
      encodeNotification({ kind: 'iv', iv: 'perfect' }, 'both').pokemon,
    );
  });
});
