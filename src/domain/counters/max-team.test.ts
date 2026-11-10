import { describe, expect, it } from 'vitest';
import { catalogueFixture } from '../../../test/support/game-data.js';
import { recordedMaxTeam } from '../../../test/support/pokebattler.js';
import { MAX_TIERS } from '../pogo/max-tier.js';
import { ATTACKER_LEVELS, DEFAULT_ATTACKER_LEVEL } from './options.js';
import {
  DEFAULT_MAX_ROLE,
  DEFAULT_MAX_TEAM_LEVEL,
  gigantamaxDefenders,
  isMaxTeamLevel,
  MAX_TEAM_LEVELS,
  MAX_ROLE_KEYS,
  MAX_ROLES,
  maxTeamLink,
  maxTeamMember,
  maxRoleNamed,
  maxTeamPath,
  pokebattlerMaxDefenders,
  pokebattlerMaxLevel,
  readMaxTeam,
  slotRoleWords,
} from './max-team.js';

const catalogue = catalogueFixture();
const entry = (key: string) => {
  const found = catalogue.byKey(key);
  if (!found) throw new Error(`no ${key} in the fixture`);
  return found;
};

describe('MAX_ROLES', () => {
  it('has Pokebattler’s four trainer roles in its order, the Attacker first, each a team of three', () => {
    expect(MAX_ROLE_KEYS).toEqual(['attacker', 'defensive', 'healer', 'shielder']);
    expect(DEFAULT_MAX_ROLE).toBe('attacker');
    // attack / meterCharge / shield / heal / charge, as Pokebattler's Lobby defines them.
    expect(
      MAX_ROLE_KEYS.map((key) => {
        const { name, team, attack, meterCharge, shield, heal, charge } = MAX_ROLES[key];
        return [name, team, attack, meterCharge, shield, heal, charge];
      }),
    ).toEqual([
      ['Attacker', 'an attacker and two chargers', 1, 2, 0, 0, 0],
      ['Defensive', 'an attacker and two defenders', 1, 0, 0, 0, 2],
      ['Healer', 'a healer and two defenders', 0, 0, 0, 1, 2],
      ['Shielder', 'three shielders', 0, 0, 3, 0, 0],
    ]);
    // Pokebattler refuses a team that is not three Pokémon (400).
    for (const key of MAX_ROLE_KEYS) {
      const { attack, meterCharge, shield, heal, charge } = MAX_ROLES[key];
      expect(attack + meterCharge + shield + heal + charge).toBe(3);
    }
  });

  it('reads a role by its key, and the roles before 8X-I as the nearest of Pokebattler’s', () => {
    for (const key of MAX_ROLE_KEYS) expect(maxRoleNamed(key)).toBe(key);
    // A command not yet deployed again, or a dialog opened before, may still send these.
    expect(maxRoleNamed('charger')).toBe('attacker');
    expect(maxRoleNamed('balanced')).toBe('attacker');
    expect(maxRoleNamed('attackers')).toBe('attacker');
    expect(maxRoleNamed('nonsense')).toBeUndefined();
    expect(maxRoleNamed('toString')).toBeUndefined();
  });
});

describe('MAX_TEAM_LEVELS', () => {
  it('are the raid counters’ levels in steps of five, the same default, no best buddy', () => {
    expect(MAX_TEAM_LEVELS).toEqual(['20', '25', '30', '35', '40', '45', '50']);
    expect(
      MAX_TEAM_LEVELS.every((level) => (ATTACKER_LEVELS as readonly string[]).includes(level)),
    ).toBe(true);
    expect(DEFAULT_MAX_TEAM_LEVEL).toBe(DEFAULT_ATTACKER_LEVEL);
    expect(isMaxTeamLevel('41')).toBe(false);
    expect(isMaxTeamLevel('45')).toBe(true);
  });
});

describe('pokebattlerMaxLevel', () => {
  it('names every max tier as Pokebattler does', () => {
    expect(MAX_TIERS.map(pokebattlerMaxLevel)).toEqual([
      'RAID_LEVEL_1_MAX',
      'RAID_LEVEL_2_MAX',
      'RAID_LEVEL_3_MAX',
      'RAID_LEVEL_4_MAX',
      'RAID_LEVEL_5_MAX',
      'RAID_LEVEL_6_MAX',
    ]);
  });
});

describe('gigantamaxDefenders', () => {
  it('names a Pokémon that Gigantamaxes, and its forms that do', () => {
    expect(gigantamaxDefenders(entry('machamp'), catalogue)).toEqual(['MACHAMP_GIGANTAMAX']);
    // Pokebattler answers for the species and for the form (probed 2026-10-21).
    expect(gigantamaxDefenders(entry('toxtricity'), catalogue)).toEqual([
      'TOXTRICITY_GIGANTAMAX',
      'TOXTRICITY_AMPED_GIGANTAMAX',
      'TOXTRICITY_LOW_KEY_GIGANTAMAX',
    ]);
    // A species that does not, whose forms do: the forms.
    expect(gigantamaxDefenders(entry('urshifu'), catalogue)).toEqual([
      'URSHIFU_RAPID_STRIKE_GIGANTAMAX',
      'URSHIFU_SINGLE_STRIKE_GIGANTAMAX',
    ]);
  });

  it('has none for a Pokémon the game master never Gigantamaxes', () => {
    expect(gigantamaxDefenders(entry('uxie'), catalogue)).toEqual([]);
    expect(gigantamaxDefenders(entry('gengar_mega'), catalogue)).toEqual([]);
  });
});

describe('pokebattlerMaxDefenders', () => {
  it('is the Pokebattler name for a Dynamax boss, and its Gigantamax name for Gigantamax', () => {
    expect(pokebattlerMaxDefenders(entry('uxie'), 'D5')).toEqual(['UXIE']);
    expect(pokebattlerMaxDefenders(entry('machamp'), 'G')).toEqual(['MACHAMP_GIGANTAMAX']);
  });

  it('drops _FORM for a form’s Gigantamax name, as the feed writes it', () => {
    expect(pokebattlerMaxDefenders(entry('toxtricity_amped'), 'G')).toEqual([
      'TOXTRICITY_AMPED_GIGANTAMAX',
    ]);
    expect(pokebattlerMaxDefenders(entry('toxtricity'), 'D4')).toEqual(['TOXTRICITY']);
    // A species known by its default form also tries the bare species, as the raid counters do.
    expect(pokebattlerMaxDefenders(entry('zacian_hero'), 'D5')).toEqual([
      'ZACIAN_HERO_FORM',
      'ZACIAN',
    ]);
    expect(pokebattlerMaxDefenders(entry('zacian_hero'), 'G')).toEqual([
      'ZACIAN_HERO_GIGANTAMAX',
      'ZACIAN_GIGANTAMAX',
    ]);
  });

  it('has no name for a mega: it never battles in a max battle', () => {
    expect(pokebattlerMaxDefenders(entry('gengar_mega'), 'D5')).toEqual([]);
    expect(pokebattlerMaxDefenders(entry('gengar_mega'), 'G')).toEqual([]);
  });
});

describe('maxTeamLink', () => {
  it('is the boss’s Lobby on Pokebattler’s site, which builds the same suggested team', () => {
    expect(maxTeamLink('UXIE')).toBe('https://www.pokebattler.com/max/UXIE/PARTY');
    expect(maxTeamLink('MACHAMP_GIGANTAMAX')).toBe(
      'https://www.pokebattler.com/max/MACHAMP_GIGANTAMAX/PARTY',
    );
  });
});

describe('maxTeamPath', () => {
  it('asks for the role’s team at the level, weather and friendship, as the endpoint takes it', () => {
    expect(
      maxTeamPath({
        boss: 'MACHAMP_GIGANTAMAX',
        maxLevel: 'RAID_LEVEL_6_MAX',
        role: 'defensive',
        level: '30',
        weather: 'RAINY',
        friendship: '2',
      }),
    ).toBe(
      '/max/parties/suggested/defenders/MACHAMP_GIGANTAMAX/levels/RAID_LEVEL_6_MAX' +
        '?attack=1&heal=0&shield=0&charge=2&meterCharge=0&level=30&weatherCondition=RAINY&' +
        'friendLevel=FRIENDSHIP_LEVEL_2',
    );
  });

  it('asks for each role the counts Pokebattler’s Lobby asks for it', () => {
    const counts = (role: (typeof MAX_ROLE_KEYS)[number]) => {
      const path = maxTeamPath({
        boss: 'AZELF',
        maxLevel: 'RAID_LEVEL_5_MAX',
        role,
        level: '40',
        weather: 'NO_WEATHER',
        friendship: '4',
      });
      return path.slice(path.indexOf('?') + 1, path.indexOf('&level='));
    };
    // The Lobby's Attacker: `attack=1&heal=0&shield=0&meterCharge=2` in its ranking job.
    expect(counts('attacker')).toBe('attack=1&heal=0&shield=0&charge=0&meterCharge=2');
    expect(counts('defensive')).toBe('attack=1&heal=0&shield=0&charge=2&meterCharge=0');
    expect(counts('healer')).toBe('attack=0&heal=1&shield=0&charge=2&meterCharge=0');
    expect(counts('shielder')).toBe('attack=0&heal=0&shield=3&charge=0&meterCharge=0');
  });
});

describe('readMaxTeam', () => {
  it('reads the three slots of a recorded answer with their alternatives', () => {
    const team = readMaxTeam(recordedMaxTeam('gmax-machamp-2-0-1'));
    expect(team?.slots.map((slot) => [slot.role, slot.pick.pokemonId])).toEqual([
      ['ATTACK', 'ZACIAN_CROWNED_SWORD_FORM'],
      ['ATTACK', 'GALLADE'],
      ['SHIELD', 'ZAMAZENTA_CROWNED_SHIELD_FORM'],
    ]);
    const [first, , tank] = team?.slots ?? [];
    // No charged move is no charged move: the max moves are the point.
    expect(first?.pick).toEqual({
      pokemonId: 'ZACIAN_CROWNED_SWORD_FORM',
      fast: 'METAL_CLAW_FAST',
      charged: null,
      level: '40',
    });
    expect(tank?.pick.charged).toBe('MOONBLAST');
    expect(first?.alternatives).toHaveLength(10);
    expect(first?.alternatives[0]).toEqual({
      pokemonId: 'LATIOS',
      fast: 'ZEN_HEADBUTT_FAST',
      charged: 'LUSTER_PURGE',
      level: '40',
    });
    expect(first?.maxMoves).toEqual({ attack: 1, guard: 3, spirit: 3 });
  });

  it('reads every recorded role', () => {
    const roles = (name: Parameters<typeof recordedMaxTeam>[0]) =>
      readMaxTeam(recordedMaxTeam(name))?.slots.map((slot) => slot.role);
    expect(roles('uxie-d5-3-0-0')).toEqual(['ATTACK', 'ATTACK', 'ATTACK']);
    expect(roles('uxie-d5-2-0-1')).toEqual(['ATTACK', 'ATTACK', 'SHIELD']);
    expect(roles('uxie-d5-1-0-2')).toEqual(['ATTACK', 'SHIELD', 'SHIELD']);
    expect(roles('uxie-d5-1-2-0')).toEqual(['ATTACK', 'HEAL', 'HEAL']);
  });

  it('leaves out what does not fit and reads the rest; nothing of another shape', () => {
    const raw = recordedMaxTeam('uxie-d5-3-0-0') as {
      slots: Record<string, unknown>[];
    };
    const [one, two] = raw.slots;
    if (!one || !two) throw new Error('the recorded answer has no slots');
    delete one['pokemonId'];
    (two['alternatives'] as Record<string, unknown>[])[0] = { pokemonId: 7 };
    const team = readMaxTeam(raw);
    expect(team?.slots).toHaveLength(2);
    expect(team?.slots[0]?.alternatives).toHaveLength(9);
    // What was left out is counted, for the gateway's warning.
    expect(team?.dropped).toEqual({ slots: 1, alternatives: 1 });
    expect(readMaxTeam(recordedMaxTeam('uxie-d5-3-0-0'))?.dropped).toBeUndefined();
    expect(readMaxTeam({ status: '400', error: 'Bad Request' })).toBeUndefined();
    expect(readMaxTeam([])).toBeUndefined();
    expect(readMaxTeam({ slots: [] })).toEqual({ slots: [] });
  });

  it('reads an answer none of whose slots fit as unreadable, not as no team', () => {
    // A field renamed by Pokebattler: every slot fails, which is no empty team.
    const raw = recordedMaxTeam('uxie-d5-3-0-0') as { slots: Record<string, unknown>[] };
    for (const slot of raw.slots) {
      slot['pokemon'] = slot['pokemonId'];
      delete slot['pokemonId'];
    }
    expect(readMaxTeam(raw)).toBeUndefined();
  });

  it('keeps a team of three, the slots after them counted as left out', () => {
    const raw = recordedMaxTeam('uxie-d5-3-0-0') as { slots: unknown[] };
    raw.slots = [...raw.slots, ...raw.slots.slice(0, 2)];
    const team = readMaxTeam(raw);
    expect(team?.slots.map((slot) => slot.pick.pokemonId)).toEqual([
      'ZACIAN_CROWNED_SWORD_FORM',
      'HYDREIGON',
      'GENGAR_GIGANTAMAX',
    ]);
    expect(team?.dropped).toEqual({ slots: 2, alternatives: 0 });
  });

  it('takes a role only in Pokebattler’s words', () => {
    const raw = recordedMaxTeam('uxie-d5-3-0-0') as { slots: Record<string, unknown>[] };
    const [first] = raw.slots;
    if (!first) throw new Error('the recorded answer has no slots');
    first['role'] = 'ATTACK**';
    expect(readMaxTeam(raw)?.slots).toHaveLength(2);
  });
});

describe('maxTeamMember', () => {
  it('names a Pokémon of the team as the max boss feed is mapped, Gigantamax too', () => {
    expect(maxTeamMember('ZACIAN_CROWNED_SWORD_FORM', catalogue)).toMatchObject({
      name: entry('zacian_crowned_sword').name,
      gigantamax: false,
    });
    expect(maxTeamMember('RILLABOOM_GIGANTAMAX', catalogue)).toMatchObject({
      name: 'Gigantamax Rillaboom',
      entry: { key: 'rillaboom' },
      gigantamax: true,
    });
  });

  it('names one the game data does not know by Pokebattler’s name in words', () => {
    expect(maxTeamMember('NEWMON', catalogue)).toEqual({ name: 'Newmon', gigantamax: false });
    expect(maxTeamMember('NEWMON_GIGANTAMAX', catalogue)).toEqual({
      name: 'Gigantamax Newmon',
      gigantamax: true,
    });
  });
});

describe('slotRoleWords', () => {
  it('says the roles of the slots as Pokebattler’s Lobby names and describes them', () => {
    expect(slotRoleWords('ATTACK')).toEqual({
      one: 'Attacker',
      others: 'Other attackers',
      does: 'max phase only',
    });
    expect(slotRoleWords('METER_CHARGE')).toEqual({
      one: 'Charger',
      others: 'Other chargers',
      does: 'fills the Max Meter',
    });
    expect(slotRoleWords('SHIELD')).toEqual({
      one: 'Shielder',
      others: 'Other shielders',
      does: 'shields and taunts',
    });
    expect(slotRoleWords('HEAL')).toEqual({
      one: 'Healer',
      others: 'Other healers',
      does: 'heals the team',
    });
    // Pokebattler's Lobby calls CHARGE a defender; no role of Pine's asks for one.
    expect(slotRoleWords('CHARGE')).toEqual({
      one: 'Defender',
      others: 'Other defenders',
      does: 'charges the meter, takes hits',
    });
    // A role Pine does not know: no description, its alternatives just others.
    expect(slotRoleWords('SOMETHING_NEW')).toEqual({ one: 'Something New', others: 'Others' });
  });

  // Plan 8Z-2: the role is a word of Pokebattler's answer.
  it('reads a role named as something every object has as a role it does not know', () => {
    expect(slotRoleWords('constructor')).toEqual({ one: 'Constructor', others: 'Others' });
    for (const role of ['toString', '__proto__', 'hasOwnProperty']) {
      const words = slotRoleWords(role);
      expect(typeof words.one, role).toBe('string');
      expect(words.others, role).toBe('Others');
      expect(words.does, role).toBeUndefined();
    }
  });
});
