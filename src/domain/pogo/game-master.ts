import { displayName, speciesName, type FormKind } from './names.js';
import { pokebattlerId } from './pokebattler.js';
import {
  POKEMON_TYPES,
  WEATHER_CONDITIONS,
  parseType,
  parseWeather,
  type PokemonType,
  type TempEvolution,
  type Weather,
} from './types.js';

/**
 * What the game says a species is beyond an ordinary Pokémon (`pokemonSettings.pokemonClass`).
 * The game master spells mythical as `POKEMON_CLASS_MYTHIC`.
 */
export type PokemonClass = 'legendary' | 'mythical' | 'ultra-beast';

const POKEMON_CLASSES: Readonly<Record<string, PokemonClass>> = {
  POKEMON_CLASS_LEGENDARY: 'legendary',
  POKEMON_CLASS_MYTHIC: 'mythical',
  POKEMON_CLASS_ULTRA_BEAST: 'ultra-beast',
};

export interface PokemonEntry {
  /** Stable lower-case identifier, e.g. `venusaur`, `rattata_alola`, `charizard_mega_x`. */
  key: string;
  dex: number;
  /** Game-master species id, e.g. `VENUSAUR`, `NIDORAN_FEMALE`. */
  pokemonId: string;
  /**
   * Game-master form id, e.g. `RATTATA_ALOLA`; null for megas and for a species that has no
   * form of its own to be known by.
   */
  form: string | null;
  /**
   * `species` is the entry that stands for the species. For a species known by its default form
   * (Giratina, Landorus) that is the form's entry, so `form` is set and the name says the form.
   */
  kind: 'species' | 'regional' | 'form' | 'mega';
  tempEvolution: TempEvolution | null;
  /**
   * The class of the species, the same for every form and mega of it (a Galarian bird and a
   * fused Kyurem are legendary like their species); null for an ordinary Pokémon and for a
   * class this code does not know.
   */
  class: PokemonClass | null;
  /** English display name, e.g. `Alolan Rattata`, `Giratina (Origin Forme)`, `Mega Charizard X`. */
  name: string;
  types: PokemonType[];
  stats: { attack: number; defense: number; stamina: number };
  /** Move ids (see `Move.id`). */
  fastMoves: string[];
  chargedMoves: string[];
  eliteFastMoves: string[];
  eliteChargedMoves: string[];
  family: string;
  /**
   * Keys of the entries this one evolves into directly (`evolutionBranch`), without temporary
   * evolutions; empty for a mega. A target the game master does not have is left out.
   */
  evolutions: string[];
  /** Can appear as a shadow Pokémon. */
  shadow: boolean;
  /** Name Pokebattler uses for this Pokémon. */
  pokebattlerId: string;
}

export interface Move {
  /** Game-master move id, e.g. `FLAME_WHEEL`, `VINE_WHIP_FAST`. */
  id: string;
  number: number;
  name: string;
  type: PokemonType;
  fast: boolean;
  power: number;
  energyDelta: number;
  durationMs: number;
}

/**
 * Bump on ANY change to what `parseGameMaster` produces: the shape of `GameData`, or the rules
 * that decide its contents. A saved cache with another version is discarded.
 */
export const GAME_DATA_VERSION = 9;

/** The highest level the PvP ranks look at (a best buddy); the game master should list it. */
export const PVP_MAX_LEVEL = 51;

/** Everything Pine derives from the game master and text file. JSON-serialisable. */
export interface GameData {
  pokemon: PokemonEntry[];
  /**
   * Lower-cased game-master ids that are not entries of their own, each with the key of the
   * entry it stands for: the id of a species known by its default form (`landorus` to
   * `landorus_incarnate`), and costumes and appearance-only forms (`pikachu_copy_2019` to
   * `pikachu`). `_NORMAL` form ids are not listed; `PokemonCatalogue.byGameMasterId` knows them.
   */
  aliases: Record<string, string>;
  /**
   * The aliases that are costumes, sorted (plan 8R-4, design 5): the flagged costumes that copy
   * an entry of their species (every Pikachu in a hat, `corsola_spring_2026` of Galarian
   * Corsola) and the appearance-only copies (`*_copy_2019`, `psyduck_swim_2025`); never the wild
   * legendaries of GO Tour: Johto (`raikou_s`, Matt's answer 1), nor a flagged costume with
   * stats of its own, which is a form (`mewtwo_a`).
   */
  costumes: string[];
  moves: Move[];
  /** typeChart[attacker][defender] = damage multiplier. */
  typeChart: Record<PokemonType, Record<PokemonType, number>>;
  weatherBoosts: Record<Weather, PokemonType[]>;
  /** CP multiplier per whole level; index 0 is level 1. */
  cpMultipliers: number[];
  /**
   * The catalogue keys of the Pokémon the game lets battle as Dynamax and as Gigantamax bosses,
   * each sorted (plan 8X-2): what may be typed as a max boss off the feed's lists. Read from the
   * modes of `pokemonExtendedSettings.breadOverrides` (`BREAD_MODE`, `BREAD_DOUGH_MODE` and
   * `BREAD_DOUGH_MODE_2`), which every such Pokémon has; `BREAD_POKEMON_SCALING_SETTINGS` lists
   * only the few with visuals of their own (70 species in October 2026, without Sneasel or
   * Abra), so it is not read. A costume counts as its species.
   */
  maxBattles: { dynamax: string[]; gigantamax: string[] };
  /**
   * The levels a Super Mega (mega level 4) adds to its Pokémon in battle, by the catalogue key of
   * each mega it applies to: `selfCpBoostAdditionalLevel` of the species' `megaEvoLevelSettings`,
   * to every mega of the species or the one its `tempEvoId` names (2 for the 11 species of
   * October 2026: Mega Malamar up to level 52, 53 as a best buddy). New ones come with the game
   * master, at events.
   */
  superMegas: Record<string, number>;
  /**
   * The catalogue keys of the entries the game does not let be traded, sorted: those whose game
   * master item has no `isTradable` (each form by its own item; a mega by its species' NORMAL
   * item, as megas are built from it). Every one is legendary or mythical in October 2026 (Mew,
   * Deoxys, Kyurem Black and White, Eternatus …). Empty, with a warning, for a game master that
   * marks no item tradable (the field renamed). `/rank`'s automatic floor reads it.
   */
  untradable: string[];
}

type Raw = Record<string, unknown>;

function isRecord(value: unknown): value is Raw {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function record(value: unknown): Raw {
  return isRecord(value) ? value : {};
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** A number the data cannot do without; anything else is a game master Pine does not understand. */
function required(value: unknown, what: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Game master has a non-numeric ${what}`);
  }
  return value;
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}

function number(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

const REGIONS = ['ALOLA', 'GALARIAN', 'HISUIAN', 'PALDEA'];
/**
 * Appearance-only forms that are costumes, though the game master does not flag them (plan 8R-4):
 * the copies of 2019 and Psyduck in its swimming ring.
 */
const UNFLAGGED_COSTUMES: ReadonlySet<string> = new Set([
  'VENUSAUR_COPY_2019',
  'CHARIZARD_COPY_2019',
  'BLASTOISE_COPY_2019',
  'PIKACHU_COPY_2019',
  'PSYDUCK_SWIM_2025',
]);
/**
 * Forms that only change appearance but are not flagged as costumes in the game master: the
 * unflagged costumes, and the wild legendaries of GO Tour: Johto (`RAIKOU_S`), which are no
 * costumes (Matt, 2026-10-22).
 */
const COSMETIC_FORMS = new Set([
  ...UNFLAGGED_COSTUMES,
  'RAIKOU_S',
  'ENTEI_S',
  'SUICUNE_S',
  'LUGIA_S',
  'HO_OH_S',
  'LATIAS_S',
  'LATIOS_S',
]);
/**
 * The default form of species whose formless item copies no single form, so the data cannot say
 * which form the bare species is: Zacian's and Zamazenta's formless items have the Hero stats
 * with the Crowned types, Meloetta's has the Aria stats and types with the Pirouette moves, and
 * Wormadam's has only Struggle.
 */
const DEFAULT_FORMS: Readonly<Record<string, string>> = {
  WORMADAM: 'WORMADAM_PLANT',
  MELOETTA: 'MELOETTA_ARIA',
  ZACIAN: 'ZACIAN_HERO',
  ZAMAZENTA: 'ZAMAZENTA_HERO',
};
/**
 * Species whose bare item is knowingly kept beside forms that differ, because no form is the
 * obvious default: Urshifu's bare item is neither style, Minior's is the Meteor form, and
 * Zygarde's copies both 50% formes.
 */
const NO_DEFAULT_FORM: ReadonlySet<string> = new Set(['URSHIFU', 'MINIOR', 'ZYGARDE']);
const TEMP_EVOLUTIONS: Record<string, TempEvolution> = {
  TEMP_EVOLUTION_MEGA: 'MEGA',
  TEMP_EVOLUTION_MEGA_X: 'MEGA_X',
  TEMP_EVOLUTION_MEGA_Y: 'MEGA_Y',
  TEMP_EVOLUTION_PRIMAL: 'PRIMAL',
};

interface RawPokemon {
  dex: number;
  pokemonId: string;
  form: string | null;
  settings: Raw;
}

function parseStats(raw: unknown): PokemonEntry['stats'] {
  const stats = record(raw);
  return {
    attack: number(stats['baseAttack']),
    defense: number(stats['baseDefense']),
    stamina: number(stats['baseStamina']),
  };
}

/** An evolution as `evolutionBranch` names it. */
interface EvolutionTarget {
  pokemonId: string;
  form: string | null;
}

/** The evolutions of an item; a branch that is only a temporary evolution (a mega) is none. */
function evolutionsIn(settings: Raw): EvolutionTarget[] {
  return list(settings['evolutionBranch'])
    .map(record)
    .flatMap((branch) => {
      const pokemonId = text(branch['evolution']);
      return pokemonId === undefined ? [] : [{ pokemonId, form: text(branch['form']) ?? null }];
    });
}

function parseTypes(first: unknown, second: unknown): PokemonType[] {
  return [parseType(first), parseType(second)].filter((t): t is PokemonType => t !== undefined);
}

function sameStatsAndTypes(a: Raw, b: Raw): boolean {
  return (
    JSON.stringify(parseStats(a['stats'])) === JSON.stringify(parseStats(b['stats'])) &&
    JSON.stringify(parseTypes(a['type'], a['type2'])) ===
      JSON.stringify(parseTypes(b['type'], b['type2']))
  );
}

/** Whether two entries are the same Pokémon in everything but name. */
function sameData(a: PokemonEntry, b: PokemonEntry): boolean {
  const data = (entry: PokemonEntry): string =>
    JSON.stringify([
      entry.stats,
      entry.types,
      entry.fastMoves,
      entry.chargedMoves,
      entry.eliteFastMoves,
      entry.eliteChargedMoves,
    ]);
  return data(a) === data(b);
}

function parseMoves(items: Raw[], texts: Map<string, string>): Move[] {
  const moves: Move[] = [];
  for (const item of items) {
    const match = /^V(\d{4})_MOVE_(.+)$/.exec(text(item['templateId']) ?? '');
    const settings = record(record(item['data'])['moveSettings']);
    const type = parseType(settings['pokemonType']);
    if (!match?.[1] || !match[2] || !type) continue;
    const id = match[2];
    const fallback = id
      .replace(/_FAST$/, '')
      .toLowerCase()
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
    moves.push({
      id,
      number: Number(match[1]),
      name: texts.get(`move_name_${match[1]}`) ?? fallback,
      type,
      fast: id.endsWith('_FAST'),
      power: number(settings['power']),
      energyDelta: number(settings['energyDelta']),
      durationMs: number(settings['durationMs']),
    });
  }
  return moves.sort((a, b) => a.number - b.number);
}

function parseTypeChart(items: Raw[]): GameData['typeChart'] {
  const chart = {} as GameData['typeChart'];
  for (const item of items) {
    const effective = record(record(item['data'])['typeEffective']);
    const attacker = parseType(effective['attackType']);
    const scalars = list(effective['attackScalar']);
    if (!attacker || scalars.length !== POKEMON_TYPES.length) continue;
    const row = {} as Record<PokemonType, number>;
    POKEMON_TYPES.forEach((defender, index) => {
      row[defender] = required(
        scalars[index],
        `type effectiveness for ${attacker} against ${defender}`,
      );
    });
    chart[attacker] = row;
  }
  const missing = POKEMON_TYPES.filter((type) => !(type in chart));
  if (missing.length > 0) {
    throw new Error(`Game master has no type effectiveness for: ${missing.join(', ')}`);
  }
  return chart;
}

function parseWeatherBoosts(items: Raw[]): GameData['weatherBoosts'] {
  const boosts = Object.fromEntries(
    WEATHER_CONDITIONS.map((weather) => [weather, [] as PokemonType[]]),
  ) as GameData['weatherBoosts'];
  for (const item of items) {
    const affinity = record(record(item['data'])['weatherAffinities']);
    const weather = parseWeather(affinity['weatherCondition']);
    if (!weather) continue;
    boosts[weather] = list(affinity['pokemonType'])
      .map(parseType)
      .filter((t): t is PokemonType => t !== undefined);
  }
  return boosts;
}

/**
 * Turns the raw game master (an array of `{ templateId, data }`) and the parsed English text
 * file into the data Pine uses. Unknown or malformed items are skipped, and `onWarning` hears
 * about the ones that cost data (a mega this code does not know, a move that does not resolve, a
 * species it cannot build, a duplicate entry), each distinct message once. A game master without
 * any Pokémon, moves, form settings, weather, type chart or CP multipliers, or with a non-numeric
 * type chart or CP value, is rejected.
 */
export function parseGameMaster(
  raw: unknown,
  texts: Map<string, string>,
  report: (message: string) => void = () => undefined,
): GameData {
  // One warning per distinct cause: a systematic change must not flood the caller's log.
  const warned = new Set<string>();
  const onWarning = (message: string): void => {
    if (warned.has(message)) return;
    warned.add(message);
    report(message);
  };
  const items = list(raw).filter(isRecord);
  const withData = (kind: string): Raw[] =>
    items.filter((item) => isRecord(record(item['data'])[kind]));

  const moves = parseMoves(withData('moveSettings'), texts);
  const moveByNumber = new Map(moves.map((move) => [move.number, move.id]));
  const moveIds = new Set(moves.map((move) => move.id));
  /** Move references are ids, or occasionally the move's number. */
  const moveRefs = (value: unknown): string[] => {
    const resolved: string[] = [];
    for (const ref of list(value)) {
      const id = typeof ref === 'number' ? moveByNumber.get(ref) : text(ref);
      if (id !== undefined && moveIds.has(id)) resolved.push(id);
      else onWarning(`Unknown move ${String(ref)}: dropped from every Pokémon that lists it`);
    }
    return resolved;
  };

  const formSettingsItems = withData('formSettings');
  const costumes = new Set<string>();
  for (const item of formSettingsItems) {
    const settings = record(record(item['data'])['formSettings']);
    for (const form of list(settings['forms']).map(record)) {
      if (form['isCostume'] === true)
        costumes.add(`${String(settings['pokemon'])}|${String(form['form'])}`);
    }
  }

  const rawPokemon: RawPokemon[] = [];
  for (const item of withData('pokemonSettings')) {
    const dex = /^V(\d{4})_POKEMON_/.exec(text(item['templateId']) ?? '')?.[1];
    const settings = record(record(item['data'])['pokemonSettings']);
    const pokemonId = text(settings['pokemonId']);
    if (!dex || !pokemonId) continue;
    const form = settings['form'];
    if (form !== undefined && typeof form !== 'string') {
      onWarning(
        `Skipped ${pokemonId} item ${String(item['templateId'])}: its form is not a string`,
      );
      continue;
    }
    rawPokemon.push({ dex: Number(dex), pokemonId, form: text(form) ?? null, settings });
  }

  if (rawPokemon.length === 0) throw new Error('Game master contains no Pokémon');
  // Checked before any entry is built: otherwise every move reference would warn first.
  if (moves.length === 0) throw new Error('Game master contains no moves');

  const bySpecies = new Map<string, RawPokemon[]>();
  for (const pokemon of rawPokemon) {
    bySpecies.set(pokemon.pokemonId, [...(bySpecies.get(pokemon.pokemonId) ?? []), pokemon]);
  }

  const entries: PokemonEntry[] = [];
  const keys = new Set<string>();
  const add = (entry: PokemonEntry): void => {
    if (keys.has(entry.key)) {
      onWarning(`Duplicate entry ${entry.key}: the first one is kept`);
      return;
    }
    keys.add(entry.key);
    entries.push(entry);
  };
  const aliases = new Map<string, string>();
  const alias = (id: string, key: string): void => {
    aliases.set(id.toLowerCase(), key);
  };
  /** The aliases that are costumes (`GameData.costumes`). */
  const costumeAliases = new Set<string>();
  /** What each entry evolves into, as the game master names it; resolved once all are built. */
  const evolutionTargets = new Map<PokemonEntry, EvolutionTarget[]>();
  /** The entries built from an item without `isTradable`, and whether any item had it. */
  const untradableEntries = new Set<PokemonEntry>();
  let anyTradable = false;
  for (const [pokemonId, forms] of bySpecies) {
    const suffixOf = (form: string): string =>
      form.startsWith(`${pokemonId}_`)
        ? form.slice(pokemonId.length + 1)
        : form.replace(/^[A-Z]+_/, '');
    // The "_NORMAL" form is the species as it normally appears; prefer its data where it exists.
    const formless = forms.find((pokemon) => pokemon.form === null);
    const normalForm = forms.find((p) => p.form !== null && suffixOf(p.form) === 'NORMAL');
    const normal = normalForm ?? formless;
    if (!normal) {
      onWarning(`Skipped ${pokemonId}: it has neither a formless item nor a NORMAL form`);
      continue;
    }
    const base = formless ?? normal;
    const species = speciesName(pokemonId, base.dex, texts);
    // Said on every item of a species alike; the first that says it speaks for all.
    const classId = forms.map((pokemon) => text(pokemon.settings['pokemonClass'])).find(Boolean);
    const pokemonClass = POKEMON_CLASSES[classId ?? ''] ?? null;
    if (classId !== undefined && pokemonClass === null) {
      onWarning(`Unknown Pokémon class ${classId}: its species count as ordinary`);
    }

    const build = (
      source: Raw,
      identity: Pick<PokemonEntry, 'key' | 'form' | 'kind' | 'tempEvolution'>,
      formKind: FormKind,
      suffix: string | null,
      overrides: { stats?: unknown; types?: PokemonType[] } = {},
    ): PokemonEntry => {
      const built = assemble(source, identity, formKind, suffix, overrides);
      if (source['isTradable'] === true) anyTradable = true;
      else untradableEntries.add(built);
      // A mega is built from the species' item, whose branches are the species' own.
      if (identity.kind !== 'mega') evolutionTargets.set(built, evolutionsIn(source));
      return built;
    };
    const assemble = (
      source: Raw,
      identity: Pick<PokemonEntry, 'key' | 'form' | 'kind' | 'tempEvolution'>,
      formKind: FormKind,
      suffix: string | null,
      overrides: { stats?: unknown; types?: PokemonType[] },
    ): PokemonEntry => ({
      ...identity,
      dex: base.dex,
      pokemonId,
      class: pokemonClass,
      name: displayName({
        pokemonId,
        dex: base.dex,
        species,
        kind: formKind,
        suffix,
        form: identity.form,
        tempEvolution: identity.tempEvolution,
        texts,
      }),
      types: overrides.types?.length
        ? overrides.types
        : parseTypes(source['type'], source['type2']),
      stats: parseStats(overrides.stats ?? source['stats']),
      fastMoves: moveRefs(source['quickMoves']),
      chargedMoves: moveRefs(source['cinematicMoves']),
      eliteFastMoves: moveRefs(source['eliteQuickMove']),
      // Moves that cannot be taught by TM (Dragon Ascent) count as elite charged moves.
      eliteChargedMoves: [
        ...new Set([
          ...moveRefs(source['eliteCinematicMove']),
          ...moveRefs(source['nonTmCinematicMoves']),
        ]),
      ],
      family: (text(source['familyId']) ?? pokemonId).replace(/^FAMILY_/, ''),
      evolutions: [],
      shadow: identity.kind !== 'mega' && isRecord(source['shadow']),
      pokebattlerId: pokebattlerId(pokemonId, identity.form, identity.tempEvolution),
    });

    const isCostume = (pokemon: RawPokemon): boolean =>
      pokemon.form !== null && costumes.has(`${pokemonId}|${pokemon.form}`);
    const real: { pokemon: RawPokemon; form: string; suffix: string }[] = [];
    /** Costumes and appearance-only forms, each with the item it looks like. */
    const copies: { form: string; of: RawPokemon | undefined; costume: boolean }[] = [];
    for (const pokemon of forms) {
      if (pokemon.form === null) continue;
      const suffix = suffixOf(pokemon.form);
      if (suffix === 'NORMAL') continue;
      if (COSMETIC_FORMS.has(pokemon.form)) {
        copies.push({
          form: pokemon.form,
          of: undefined,
          costume: UNFLAGGED_COSTUMES.has(pokemon.form),
        });
        continue;
      }
      // A flagged costume that copies any real item of its species is not an entry; one with its
      // own stats or types is a real form (Armored Mewtwo).
      const original = isCostume(pokemon)
        ? forms.find(
            (other) =>
              other !== pokemon &&
              !isCostume(other) &&
              sameStatsAndTypes(pokemon.settings, other.settings),
          )
        : undefined;
      if (original) copies.push({ form: pokemon.form, of: original, costume: true });
      else real.push({ pokemon, form: pokemon.form, suffix });
    }

    const plain = build(
      normal.settings,
      { key: pokemonId.toLowerCase(), form: null, kind: 'species', tempEvolution: null },
      'species',
      null,
    );
    const formEntries = real.map(({ pokemon, form, suffix }) => {
      const kind = REGIONS.includes(suffix.split('_')[0] ?? '') ? 'regional' : 'form';
      return build(
        pokemon.settings,
        { key: form.toLowerCase(), form, kind, tempEvolution: null },
        kind,
        suffix,
      );
    });

    // One identity per form: a species with no NORMAL form whose bare item is a copy of exactly
    // one of its forms (Giratina and its Altered Forme) is known by that form, and the species
    // id becomes an alias of it. Species whose forms are all alike (Unown, Vivillon) keep the
    // bare entry.
    let standIn: PokemonEntry | undefined;
    if (!normalForm) {
      const identical = formEntries.filter((entry) => sameData(entry, plain));
      standIn =
        formEntries.find((entry) => entry.form === DEFAULT_FORMS[pokemonId]) ??
        (identical.length === 1 ? identical[0] : undefined);
    }
    const first = formEntries[0];
    if (
      !normalForm &&
      !standIn &&
      first &&
      formEntries.some((entry) => !sameData(entry, first)) &&
      !NO_DEFAULT_FORM.has(pokemonId)
    ) {
      onWarning(
        `${pokemonId} has forms that differ but its bare item copies none or several of them, so it keeps a bare entry: add it to DEFAULT_FORMS or NO_DEFAULT_FORM`,
      );
    }
    if (standIn) {
      standIn.kind = 'species';
      standIn.shadow ||= plain.shadow;
      alias(pokemonId, standIn.key);
    } else {
      add(plain);
    }
    for (const entry of formEntries) add(entry);

    const speciesKey = standIn?.key ?? plain.key;
    for (const copy of copies) {
      const original = copy.of?.form;
      const isEntry = formEntries.some((entry) => entry.form === original);
      alias(copy.form, original && isEntry ? original.toLowerCase() : speciesKey);
      if (copy.costume) costumeAliases.add(copy.form.toLowerCase());
    }

    for (const override of list(base.settings['tempEvoOverrides']).map(record)) {
      // Elements without stats are camera-only stubs.
      if (!isRecord(override['stats'])) continue;
      const tempEvoId = text(override['tempEvoId']);
      const tempEvolution = TEMP_EVOLUTIONS[tempEvoId ?? ''];
      if (!tempEvolution) {
        onWarning(
          `Skipped a temporary evolution of ${pokemonId} with an unknown id: ${tempEvoId ?? '(none)'}`,
        );
        continue;
      }
      add(
        build(
          normal.settings,
          {
            key: `${pokemonId}_${tempEvolution}`.toLowerCase(),
            form: null,
            kind: 'mega',
            tempEvolution,
          },
          'mega',
          null,
          {
            stats: override['stats'],
            types: parseTypes(override['typeOverride1'], override['typeOverride2']),
          },
        ),
      );
    }
  }
  if (entries.length === 0) throw new Error('Game master contains no Pokémon');
  // An evolution into a Pokémon the game master does not have (yet) is left out without a
  // warning: the game master announces evolutions before their species at times.
  const keyOf = (id: string): string | undefined => {
    const lower = id.toLowerCase();
    if (keys.has(lower)) return lower;
    const aliased = aliases.get(lower);
    return aliased !== undefined && keys.has(aliased) ? aliased : undefined;
  };
  for (const [built, targets] of evolutionTargets) {
    const resolved = targets.flatMap(({ pokemonId: target, form }) => {
      const key =
        (form !== null && !form.endsWith('_NORMAL') ? keyOf(form) : undefined) ?? keyOf(target);
      return key === undefined || key === built.key ? [] : [key];
    });
    built.evolutions = [...new Set(resolved)];
  }
  // A species whose own item names no evolution while its forms do (Deerling, whose season
  // forms each evolve into that season's Sawsbuck) evolves into what its forms evolve into,
  // named by the species of each.
  for (const built of entries) {
    if (built.kind !== 'species' || built.evolutions.length > 0) continue;
    const ofForms = entries
      .filter((other) => other.pokemonId === built.pokemonId && other.kind === 'form')
      .flatMap((form) => evolutionTargets.get(form) ?? [])
      .flatMap(({ pokemonId: target }) => {
        const key = keyOf(target);
        return key === undefined || key === built.key ? [] : [key];
      });
    built.evolutions = [...new Set(ofForms)];
  }
  if (formSettingsItems.length === 0) throw new Error('Game master contains no form settings');
  const weatherItems = withData('weatherAffinities');
  if (weatherItems.length === 0) throw new Error('Game master contains no weather');

  const playerLevel = withData('playerLevel')[0];
  const cpMultipliers = list(record(record(playerLevel?.['data'])['playerLevel'])['cpMultiplier'])
    .map((value) => required(value, 'CP multiplier'))
    .filter((multiplier) => multiplier > 0);
  if (cpMultipliers.length === 0) throw new Error('Game master contains no CP multipliers');
  if (cpMultipliers.length < PVP_MAX_LEVEL) {
    onWarning(
      `The game master lists CP multipliers up to level ${String(cpMultipliers.length)} only: ` +
        `PvP ranks need level ${String(PVP_MAX_LEVEL)}`,
    );
  }

  const maxBattles = parseMaxBattles(withData('pokemonExtendedSettings'), keyOf);
  // Every game master since max battles lists dozens: none at all is a renamed field or mode.
  if (maxBattles.dynamax.length === 0) {
    onWarning(
      'The game master names no Pokémon that can Dynamax ' +
        '(breadMode BREAD_MODE in pokemonExtendedSettings.breadOverrides): ' +
        'every typed max boss is taken as one the game data does not list',
    );
  }

  const superMegas = parseSuperMegas(withData('megaEvoLevelSettings'), entries);
  // Every game master since trading lists most Pokémon tradable: none at all is a renamed field,
  // and then none is taken as untradable (never every mythical given the floor of 10).
  if (!anyTradable) {
    onWarning(
      'The game master marks no Pokémon tradable (isTradable in pokemonSettings): every Pokémon ' +
        'is taken as tradable',
    );
  }
  const untradable = anyTradable
    ? entries
        .filter((entry) => untradableEntries.has(entry))
        .map((entry) => entry.key)
        .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    : [];

  // An id that is also an entry is not an alias; neither is one whose entry was dropped.
  const keptAliases = [...aliases]
    .filter(([id, key]) => !keys.has(id) && keys.has(key))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return {
    // A plain code-unit comparison keeps the order the same on every host.
    pokemon: entries.sort((a, b) => a.dex - b.dex || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)),
    aliases: Object.fromEntries(keptAliases),
    costumes: keptAliases.flatMap(([id]) => (costumeAliases.has(id) ? [id] : [])),
    moves,
    typeChart: parseTypeChart(withData('typeEffective')),
    weatherBoosts: parseWeatherBoosts(weatherItems),
    cpMultipliers,
    maxBattles,
    superMegas,
    untradable,
  };
}

/** `GameData.superMegas` from the mega levels' settings: sorted by key. */
function parseSuperMegas(items: Raw[], entries: readonly PokemonEntry[]): Record<string, number> {
  const levels = new Map<string, number>();
  for (const item of items) {
    const settings = record(record(item['data'])['megaEvoLevelSettings']);
    const added = record(settings['effects'])['selfCpBoostAdditionalLevel'];
    const pokemonId = text(settings['pokemonId']);
    if (typeof added !== 'number' || added <= 0 || pokemonId === undefined) continue;
    const only = TEMP_EVOLUTIONS[text(settings['tempEvoId']) ?? ''];
    for (const entry of entries) {
      if (entry.kind !== 'mega' || entry.pokemonId !== pokemonId) continue;
      if (only !== undefined && entry.tempEvolution !== only) continue;
      levels.set(entry.key, Math.max(added, levels.get(entry.key) ?? 0));
    }
  }
  return Object.fromEntries([...levels].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

/** The modes of a Pokémon's max battles: Dynamax, and the two of Gigantamax. */
const MAX_MODES: Readonly<Record<string, keyof GameData['maxBattles']>> = {
  BREAD_MODE: 'dynamax',
  BREAD_DOUGH_MODE: 'gigantamax',
  BREAD_DOUGH_MODE_2: 'gigantamax',
};

/**
 * `GameData.maxBattles` from the extended settings: a form the catalogue knows (or a costume, an
 * alias of its species) by its key, `<id>_NORMAL` or no form by the species. A form the catalogue
 * does not know is left out rather than taken for its species. Eternamax (`BREAD_SPECIAL_MODE`)
 * and modes this code does not know are left out.
 */
function parseMaxBattles(
  items: readonly Raw[],
  keyOf: (id: string) => string | undefined,
): GameData['maxBattles'] {
  const found = { dynamax: new Set<string>(), gigantamax: new Set<string>() };
  for (const item of items) {
    const settings = record(record(item['data'])['pokemonExtendedSettings']);
    const species = text(settings['uniqueId']);
    const form = text(settings['form']);
    if (species === undefined) continue;
    const key = form !== undefined && !form.endsWith('_NORMAL') ? keyOf(form) : keyOf(species);
    if (key === undefined) continue;
    for (const override of list(settings['breadOverrides']).map(record)) {
      const mode = MAX_MODES[text(override['breadMode']) ?? ''];
      if (mode) found[mode].add(key);
    }
  }
  const sorted = (keys: Set<string>): string[] =>
    [...keys].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return { dynamax: sorted(found.dynamax), gigantamax: sorted(found.gigantamax) };
}
