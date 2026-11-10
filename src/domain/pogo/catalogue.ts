import {
  cpMultiplierAt,
  maxCatchCp,
  raidCatchCp,
  type MaxCatchCp,
  type RaidCatchCp,
} from './cp.js';
import type { GameData, Move, PokemonEntry } from './game-master.js';
import { unlistedMega } from './unlisted-mega.js';
import {
  POKEMON_TYPES,
  WEATHER_CONDITIONS,
  type PokemonType,
  type TempEvolution,
  type Weather,
} from './types.js';

export interface Weakness {
  type: PokemonType;
  multiplier: number;
}

/**
 * Fused forms. Such a raid boss separates when it is beaten, and what is caught is the base
 * Pokémon (Kyurem, Necrozma, Calyrex), as with a mega.
 */
const FUSED_FORMS: ReadonlySet<string> = new Set([
  'kyurem_white',
  'kyurem_black',
  'necrozma_dusk_mane',
  'necrozma_dawn_wings',
  'calyrex_ice_rider',
  'calyrex_shadow_rider',
]);

/**
 * Forms that are only fought, never caught: beating Eternamax Eternatus catches plain Eternatus
 * (plan 8F-1, review F1).
 */
const BATTLE_ONLY_FORMS: ReadonlySet<string> = new Set(['eternatus_eternamax']);

/**
 * Crowned forms. Fought as a raid boss, but caught in the Hero of Many Battles form, the species'
 * entry, which a trainer crowns with an item later (the game master's `formChange`; Matt,
 * 2026-11-09).
 */
const CROWNED_FORMS: ReadonlySet<string> = new Set([
  'zacian_crowned_sword',
  'zamazenta_crowned_shield',
]);

/** Read-only lookups over the parsed game data. */
export class PokemonCatalogue {
  private readonly keys = new Map<string, PokemonEntry>();
  private readonly aliases: Map<string, string>;
  private readonly dexes = new Map<number, PokemonEntry[]>();
  private readonly moves = new Map<string, Move>();

  constructor(private readonly data: GameData) {
    for (const entry of data.pokemon) {
      this.keys.set(entry.key, entry);
      this.dexes.set(entry.dex, [...(this.dexes.get(entry.dex) ?? []), entry]);
    }
    this.aliases = new Map(Object.entries(data.aliases));
    for (const move of data.moves) this.moves.set(move.id, move);
  }

  get all(): readonly PokemonEntry[] {
    return this.data.pokemon;
  }

  /**
   * By catalogue key, e.g. `rattata_alola`, or by an alias of one (`GameData.aliases`): `landorus`
   * gives the entry `landorus_incarnate`. Case-insensitive. Use the `key` of the entry returned,
   * not the text looked up, as the Pokémon's identity.
   */
  byKey(key: string): PokemonEntry | undefined {
    const lower = key.toLowerCase();
    return this.keys.get(lower) ?? this.keys.get(this.aliases.get(lower) ?? lower);
  }

  /**
   * Other ids that stand for the entry with this key: the bare id of a species known by its
   * default form, costumes and appearance-only forms, in lower case.
   */
  aliasesOf(key: string): string[] {
    return [...this.aliases].filter(([, target]) => target === key).map(([alias]) => alias);
  }

  private costumeSet: Set<string> | undefined;

  /**
   * Whether a game master form id (any case) is a costume the game data knows (`GameData.costumes`:
   * `PIKACHU_PXP_2026`, `CORSOLA_SPRING_2026`); never an entry, nor `RAIKOU_S`.
   */
  isCostume(id: string): boolean {
    this.costumeSet ??= new Set(this.data.costumes);
    return this.costumeSet.has(id.toLowerCase());
  }

  /**
   * Whether the game data has a costume of any entry of this Pokédex number (Corsola's copies
   * Galarian Corsola): `/want`'s dialog asks about costumes for such a species.
   */
  hasCostume(dex: number): boolean {
    this.costumeDexes ??= new Set(
      this.data.costumes.flatMap((id) => {
        const entry = this.keys.get(this.aliases.get(id) ?? '');
        return entry ? [entry.dex] : [];
      }),
    );
    return this.costumeDexes.has(dex);
  }

  private costumeDexes: Set<number> | undefined;

  /** Every entry of a species: the species itself, its forms and its megas. */
  byDex(dex: number): readonly PokemonEntry[] {
    return this.dexes.get(dex) ?? [];
  }

  /**
   * A mega or primal the feeds name before the game master has it, by its name over a species of
   * this catalogue (`unlistedMega`); undefined for any other name, one the catalogue has, and
   * `Mega Charizard`, which leaves out which of its two megas.
   */
  unlistedMega(name: string): PokemonEntry | undefined {
    const mega = unlistedMega(name, (species) => {
      const wanted = species.toLowerCase();
      return this.all.find(
        (entry) => entry.kind === 'species' && entry.name.toLowerCase() === wanted,
      );
    });
    if (!mega) return undefined;
    const known = this.byDex(mega.dex).some(
      ({ key, tempEvolution }) =>
        key === mega.key || (mega.tempEvolution === 'MEGA' && tempEvolution?.startsWith('MEGA_')),
    );
    return known ? undefined : mega;
  }

  /** The entry of exactly this name, whatever its case; none is a nickname's. */
  entryNamed(name: string): PokemonEntry | undefined {
    const wanted = name.toLowerCase();
    return this.all.find((entry) => entry.name.toLowerCase() === wanted);
  }

  /** The entry that stands for a Pokédex number: the species, or the form it is known by. */
  species(dex: number): PokemonEntry | undefined {
    return this.byDex(dex).find((entry) => entry.kind === 'species');
  }

  /**
   * By game-master ids: the species, one of its forms, or one of its temporary evolutions. The
   * raid feed sends a mega either as a temporary evolution or as a form string such as
   * `BLASTOISE_MEGA`; both work. A form id
   * ending in `_NORMAL` means the species itself (`MEWTWO_NORMAL`, and `NIDORAN_NORMAL` for
   * `NIDORAN_FEMALE`, whose form id does not repeat its pokemon id). The id of a costume or an
   * appearance-only form gives the entry it copies, and the id of a species known by its
   * default form gives that form's entry (see `GameData.aliases`).
   *
   * A form newer than the game master returns undefined. A caller that wants the nearest thing
   * falls back to `byGameMasterId(pokemonId)`.
   */
  byGameMasterId(
    pokemonId: string,
    form: string | null = null,
    tempEvolution: TempEvolution | null = null,
  ): PokemonEntry | undefined {
    const normal = form?.endsWith('_NORMAL') ?? false;
    const id = tempEvolution
      ? `${pokemonId}_${tempEvolution}`
      : normal
        ? pokemonId
        : (form ?? pokemonId);
    const entry = this.byKey(id);
    return entry?.pokemonId === pokemonId ? entry : undefined;
  }

  /**
   * The evolution line of an entry, its family: its first stage, then what that evolves into, and
   * so on, each entry once (depth first, in the order of the game master's branches), a species
   * followed by its megas. A mega's line is its species'. A regional form's line is its own
   * (Galarian Meowth's has Perrserker, not Persian), as the game master's branches go. A form that
   * only changes the look is folded into its species (`familyMember`; Matt, 2026-10-23): Burmy's
   * cloaks are Burmy, so every member of a family has the same family.
   */
  evolutionLine(entry: PokemonEntry): PokemonEntry[] {
    const { children } = this.familyLinks();
    const line: PokemonEntry[] = [];
    const seen = new Set<string>();
    const visit = (one: PokemonEntry): void => {
      if (seen.has(one.key)) return;
      seen.add(one.key);
      line.push(one);
      for (const next of children.get(one.key) ?? []) visit(next);
      if (one.kind === 'species') {
        for (const mega of this.byDex(one.dex)) {
          if (mega.kind === 'mega' && mega.pokemonId === one.pokemonId) visit(mega);
        }
      }
    };
    const start =
      entry.kind === 'mega'
        ? (this.byDex(entry.dex).find(
            (one) => one.kind === 'species' && one.pokemonId === entry.pokemonId,
          ) ?? entry)
        : this.familyMember(entry);
    for (const first of this.firstStages(start)) visit(first);
    return line;
  }

  /**
   * The member of its family that stands for an entry: for a form that only changes the look
   * (kind `form`, the stats and types of its species' entry) its species, else the entry itself.
   */
  familyMember(entry: PokemonEntry): PokemonEntry {
    if (entry.kind !== 'form') return entry;
    const species = this.species(entry.dex);
    const same =
      species !== undefined &&
      JSON.stringify(species.stats) === JSON.stringify(entry.stats) &&
      species.types.join('/') === entry.types.join('/');
    return same ? species : entry;
  }

  /** The family's links, by key, look-only forms folded: what each evolves from and into. */
  private links:
    { parents: Map<string, PokemonEntry[]>; children: Map<string, PokemonEntry[]> } | undefined;

  private familyLinks(): {
    parents: Map<string, PokemonEntry[]>;
    children: Map<string, PokemonEntry[]>;
  } {
    if (this.links) return this.links;
    const parents = new Map<string, PokemonEntry[]>();
    const children = new Map<string, PokemonEntry[]>();
    const link = (map: Map<string, PokemonEntry[]>, key: string, one: PokemonEntry): void => {
      const known = map.get(key) ?? [];
      if (!known.includes(one)) map.set(key, [...known, one]);
    };
    for (const one of this.data.pokemon) {
      const from = this.familyMember(one);
      for (const key of one.evolutions) {
        const target = this.keys.get(key);
        if (!target) continue;
        const into = this.familyMember(target);
        if (into === from) continue;
        link(children, from.key, into);
        link(parents, into.key, from);
      }
    }
    this.links = { parents, children };
    return this.links;
  }

  /** The entries an entry's evolutions start from: itself when nothing evolves into it. */
  private firstStages(entry: PokemonEntry): PokemonEntry[] {
    const { parents } = this.familyLinks();
    const firsts: PokemonEntry[] = [];
    const seen = new Set<string>();
    const climb = (one: PokemonEntry): void => {
      if (seen.has(one.key)) return;
      seen.add(one.key);
      const above = parents.get(one.key) ?? [];
      if (above.length === 0) firsts.push(one);
      for (const parent of above) climb(parent);
    };
    climb(entry);
    return firsts;
  }

  /** Whether the game lets this entry be traded (`GameData.untradable`). */
  isTradable(entry: PokemonEntry): boolean {
    this.untradableKeys ??= new Set(this.data.untradable);
    return !this.untradableKeys.has(entry.key);
  }

  private untradableKeys: Set<string> | undefined;

  /** The levels a Super Mega adds to this mega in battle (`GameData.superMegas`); 0 for others. */
  superMegaLevels(entry: PokemonEntry): number {
    return this.data.superMegas[entry.key] ?? 0;
  }

  /** Whether the game has this Pokémon as a Dynamax boss (`GameData.maxBattles`). */
  canDynamax(entry: PokemonEntry): boolean {
    return this.maxKeys().dynamax.has(entry.key);
  }

  /** Whether the game has this Pokémon as a Gigantamax boss. */
  canGigantamax(entry: PokemonEntry): boolean {
    return this.maxKeys().gigantamax.has(entry.key);
  }

  /** The Pokémon that can be Dynamax bosses, in catalogue order. */
  dynamaxEntries(): PokemonEntry[] {
    return this.all.filter((entry) => this.canDynamax(entry));
  }

  /** The Pokémon that can be Gigantamax bosses, in catalogue order. */
  gigantamaxEntries(): PokemonEntry[] {
    return this.all.filter((entry) => this.canGigantamax(entry));
  }

  private maxSets: { dynamax: Set<string>; gigantamax: Set<string> } | undefined;

  private maxKeys(): { dynamax: Set<string>; gigantamax: Set<string> } {
    this.maxSets ??= {
      dynamax: new Set(this.data.maxBattles.dynamax),
      gigantamax: new Set(this.data.maxBattles.gigantamax),
    };
    return this.maxSets;
  }

  /** The CP multiplier of every whole level the game master lists; index 0 is level 1. */
  get cpMultipliers(): readonly number[] {
    return this.data.cpMultipliers;
  }

  move(id: string): Move | undefined {
    return this.moves.get(id);
  }

  /** Damage multiplier of an attacking type against a Pokémon with these types. */
  effectiveness(attacker: PokemonType, defenders: readonly PokemonType[]): number {
    return defenders.reduce(
      (multiplier, defender) => multiplier * this.data.typeChart[attacker][defender],
      1,
    );
  }

  /**
   * Attacking types that do extra damage, strongest first; ties keep the usual type order. A
   * mega is judged by its own types: this is what the raid boss is.
   */
  weaknesses(entry: PokemonEntry): Weakness[] {
    return POKEMON_TYPES.map((type) => ({
      type,
      multiplier: this.effectiveness(type, entry.types),
    }))
      .filter((weakness) => weakness.multiplier > 1)
      .sort((a, b) => b.multiplier - a.multiplier);
  }

  /**
   * Weather that boosts at least one of the types of the Pokémon you catch. For a mega, a
   * fused or a crowned form that is the base species.
   */
  boostedIn(entry: PokemonEntry): Weather[] {
    const { types } = this.caught(entry);
    return WEATHER_CONDITIONS.filter((weather) =>
      this.data.weatherBoosts[weather].some((type) => types.includes(type)),
    );
  }

  /** CP multiplier for a level, including half levels. */
  cpMultiplier(level: number): number {
    return cpMultiplierAt(this.data.cpMultipliers, level);
  }

  /**
   * CP range of the Pokémon you catch from a raid. For a mega, a fused or a
   * crowned form that is the base species. A shadow raid has a lower minimum.
   */
  raidCatchCp(entry: PokemonEntry, shadow = false): RaidCatchCp {
    return raidCatchCp(this.caught(entry).stats, this.data.cpMultipliers, shadow);
  }

  /**
   * CP range of the Pokémon you catch from a max battle (plan 8F-1), never boosted. Dynamax and
   * Gigantamax are key sets over ordinary entries, so the entry is the species' or form's own.
   */
  maxCatchCp(entry: PokemonEntry): MaxCatchCp {
    return maxCatchCp(this.caught(entry).stats, this.data.cpMultipliers);
  }

  /**
   * What a battle against this entry gives you: the species for a mega, a fused form, a
   * battle-only form (Eternamax Eternatus) or a crowned form (Zacian and Zamazenta Hero).
   */
  private caught(entry: PokemonEntry): PokemonEntry {
    const base =
      entry.kind === 'mega' ||
      FUSED_FORMS.has(entry.key) ||
      BATTLE_ONLY_FORMS.has(entry.key) ||
      CROWNED_FORMS.has(entry.key);
    return base ? (this.species(entry.dex) ?? entry) : entry;
  }
}
