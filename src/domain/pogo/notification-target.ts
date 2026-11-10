import { raidTier, type RaidLevel, type RaidTier } from './raid-tier.js';

/** What a member asked to be notified about. */
export type NotificationTarget =
  /** A Pokémon, in raids or as a spawn: a whole species, or one form of it. */
  | PokemonTarget
  /** Any raid of a tier, including eggs. */
  | { kind: 'tier'; tier: RaidTier }
  /** Reports of a wild Pokémon with perfect or zero IVs. */
  | { kind: 'iv'; iv: 'perfect' | 'zero' };

/**
 * A Pokémon as a member wants it. Without `form` the want is for every form of the species,
 * megas included, also forms the game adds later. `form` is the catalogue key of the one entry
 * that is wanted (`giratina_origin`, `rattata_alola`, `charizard_mega_y`): what `catalogue.byKey`
 * returned, with the `dex` of that entry. `shadow` is only ever `true`: the want is then for
 * shadow raids alone (of the species, or of that one form), and its scope is always `raid`; a
 * want without it is for shadow and ordinary raids alike. Both are left out when they say
 * nothing, so that two targets for the same thing are equal: build one with `pokemonTarget`.
 */
export interface PokemonTarget {
  kind: 'pokemon';
  dex: number;
  form?: string;
  shadow?: true;
}

/** A Pokémon target spelled the one way: no `form` for none, no `shadow` for false. */
export function pokemonTarget(dex: number, form?: string | null, shadow = false): PokemonTarget {
  return {
    kind: 'pokemon',
    dex,
    ...(form === undefined || form === null ? {} : { form }),
    ...(shadow ? { shadow: true as const } : {}),
  };
}

/**
 * The largest number a row, a token or a typed label may hold as a Pokédex number: six digits,
 * far above any the game has. The column would hold more; a row above the bound is not read.
 */
export const MAX_POKEDEX_NUMBER = 999_999;

/** Whether a number can be a Pokédex number: the one bound for rows, tokens and typed labels. */
export function isPokedexNumber(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= MAX_POKEDEX_NUMBER;
}

/**
 * What a form's key looks like: the letters of a catalogue key. A stored form that does not is
 * no key of any game data, old or new, and its row is not read.
 */
const FORM_KEY = /^[a-z0-9_]{1,64}$/;

/** Whether a text can be the key of a form, as a want stores it. */
export function isFormKey(text: string): boolean {
  return FORM_KEY.test(text);
}

/** The values `PokemonNotification.type` may hold, in lower case. */
export type NotificationScope = 'raid' | 'spawn' | 'both';

/** A row as the column holds it. The legacy bot saved the member's reply as typed. */
export interface StoredNotification {
  /** The `PokemonNotification.pokemon` column. */
  pokemon: number;
  /** The `PokemonNotification.type` column, in any letter case. */
  type: string;
  /** The `PokemonNotification.form` column; a row from before the column existed has none. */
  form?: string | null;
  /** The `PokemonNotification.shadow` column. */
  shadow?: boolean;
  /** The `PokemonNotification.costumed` column (plan 8R-4); a row from before has none. */
  costumed?: boolean;
}

/**
 * A row as this bot writes it: the type is always lower case, and the form and the shadow flag
 * are always said (null and false for a row that has none).
 */
export interface EncodedNotification {
  pokemon: number;
  type: NotificationScope;
  form: string | null;
  shadow: boolean;
  /**
   * Costumed only (plan 8R-4): only a Pokémon's row may be, and only when set; absent is plain,
   * which a writer writes as 0.
   */
  costumed?: true;
}

/** The scope a stored type means, ignoring letter case and padding; undefined if it is none. */
export function parseNotificationScope(value: string): NotificationScope | undefined {
  const scope = value.trim().toLowerCase();
  return scope === 'raid' || scope === 'spawn' || scope === 'both' ? scope : undefined;
}

/**
 * Integers in `PokemonNotification.pokemon`.
 *
 * The legacy bot stored a Pokédex number for a species, or the negated legacy tier (-1, -3, -5;
 * -4 mega; -6 mega legendary), or -6 for "perfect" and -8 for "zero". The type column holds
 * `raid`, `spawn` or `both` in any letter case, because the bot saved the reply as typed.
 *
 * -6 is ambiguous. A 2019 legacy migration (`app/db/20190226-bugfix.js`) created -6 and -8
 * rows by copying the type of an older row, whose default was `both`; every `(-6, both)` row in
 * production has a matching `(-8, both)` row for the same member, and as of 2026-10 there are no
 * `(-6, raid)` rows at all. So -6 is the perfect-IV target when the scope is `spawn` or `both`,
 * and the mega legendary tier only when the scope is `raid`. -8 is the zero-IV target whatever
 * the scope. This codec stores tiers as `raid` and IV targets as `spawn`, so its own rows never
 * collide.
 *
 * In the legacy bot a -5 want also fired for an elite raid whose boss was known and for shadow
 * tier 5 raids (it had no shadow concept). The codec reads -5 as
 * tier 5 only; widening the match for existing rows is a decision for the notification matcher.
 *
 * A super mega raid is tier 7 in the game, so it is -7. In the legacy bot 7 was the "rare"
 * marker of a Pokémon, not a raid tier, and -7 was the IV code before the 2019 migration split it
 * into -6 and -8; production has one stray `(-7, spawn)` row, which stays unreadable like every
 * tier typed `spawn`. As of 2026-10 production has no -7 row typed `raid` or `both`.
 *
 * Elite and shadow tiers had no legacy number. They get the values below (-20, -31, -33, -35),
 * which never match in the legacy bot's raid or spawn lookups. A row holding one does break the
 * legacy `!wants` listing for that member, so a rollback must first remove the rows with
 * `pokemon < -8` and the rows with `pokemon = -7` typed `raid`.
 *
 * -21 was the EX tier until plan 4F removed that tier (Matt, 2026-10-13). Migration
 * `2026_10_13_009` made every such want an elite want, so no row should hold it; one that does
 * (written by an older version of this bot after a rollback) is a code the codec does not
 * know, skipped and counted like any other. The number is not given to another tier.
 *
 * The columns `form` and `shadow` (plan 4A, task 7) narrow a row with a Pokédex number: `form`
 * holds the catalogue key of the one form that is wanted (NULL: every form of the species),
 * and `shadow` = 1 means shadow raids only. The legacy bot knows neither column: until cutover
 * it treats such a row as a want for the whole species, in ordinary and shadow raids alike, so
 * a member with a want for one form is told about the others by the legacy bot too. After a
 * rollback the same holds for good, unless the rows with a `form` or with `shadow` = 1 are
 * removed first. While both bots run, the legacy commands also change such rows: `!want
 * <pokemon>` finds the member's FIRST row with that number, whatever its form or shadow flag,
 * and changes its type and its server (so a form want or a shadow want can be retyped, or moved
 * to another server, by a want for the species typed there); `!unwant <pokemon>` deletes every
 * row of that number in the server, the species, its forms and its shadow raids alike. On a
 * tier or IV row the two columns mean nothing: they are written NULL and 0, and a row that has
 * them set all the same is read by its number alone.
 *
 * A want for a mega is about raids only (a mega is never met in the wild); that is known from
 * the game data, not from the row, so it is `readWant` in `wants.ts` that reads such a row as
 * `raid` whatever its type says.
 */
const TIER_CODES: ReadonlyArray<readonly [number, RaidLevel, boolean]> = [
  [-1, 'T1', false],
  [-3, 'T3', false],
  [-5, 'T5', false],
  [-4, 'Mega', false],
  [-6, 'MegaLegendary', false],
  [-7, 'SuperMega', false],
  [-20, 'Elite', false],
  [-31, 'T1', true],
  [-33, 'T3', true],
  [-35, 'T5', true],
];
const PERFECT_CODE = -6;
const ZERO_CODE = -8;

/**
 * The row values for a target. The scope is corrected where the encoding depends on it: IV
 * targets are always `spawn` and a tier is always `raid`, because a tier has no spawn meaning
 * and `(-6, both)` would read as a perfect-IV want. A Pokémon keeps the scope asked for, unless
 * the want is for its shadow raids: that is always `raid`, like a tier.
 */
export function encodeNotification(
  target: NotificationTarget,
  scope: NotificationScope,
  costumed = false,
): EncodedNotification {
  if (target.kind === 'pokemon') {
    if (!isPokedexNumber(target.dex)) {
      throw new RangeError(`Not a Pokédex number: ${target.dex}`);
    }
    if (target.form !== undefined && !isFormKey(target.form)) {
      throw new RangeError(`Not the key of a form: ${target.form}`);
    }
    const shadow = target.shadow === true;
    return {
      pokemon: target.dex,
      type: shadow ? 'raid' : scope,
      form: target.form ?? null,
      shadow,
      ...(costumed ? { costumed: true as const } : {}),
    };
  }
  const plain = { form: null, shadow: false };
  if (target.kind === 'iv') {
    return { pokemon: ivCode(target.iv), type: 'spawn', ...plain };
  }
  const code = tierCode(target.tier);
  if (code === undefined) {
    throw new RangeError(
      `No notification code for ${target.tier.shadow ? 'shadow ' : ''}${target.tier.level}`,
    );
  }
  return { pokemon: code, type: 'raid', ...plain };
}

/**
 * The number a want for this tier is stored under; undefined for a tier that has none (a shadow
 * raid of a level that has no shadow raids). Never throws: for whoever looks rows up by what
 * was reported, where a tier without a code simply has no rows.
 */
export function tierCode(tier: RaidTier): number | undefined {
  return TIER_CODES.find(
    ([, level, shadow]) => level === tier.level && shadow === tier.shadow,
  )?.[0];
}

/** The number a want for perfect or zero IVs is stored under. */
export function ivCode(iv: 'perfect' | 'zero'): number {
  return iv === 'perfect' ? PERFECT_CODE : ZERO_CODE;
}

/**
 * The target a stored row means; undefined for a value this bot does not know (an unknown type
 * or code, a number above `MAX_POKEDEX_NUMBER`, a form that cannot be a catalogue key). Callers must skip an undefined result, never
 * delete the row or fail on it. A form is read in lower case, as the catalogue spells its keys;
 * whether the game data still has it is not asked here: a row whose form it has lost is a want
 * all the same, which its member can see and remove.
 */
export function decodeNotification(stored: StoredNotification): NotificationTarget | undefined {
  const { pokemon } = stored;
  const scope = parseNotificationScope(stored.type);
  if (!scope || !Number.isInteger(pokemon) || pokemon === 0) return undefined;
  if (pokemon > 0) {
    if (!isPokedexNumber(pokemon)) return undefined;
    const form = stored.form?.trim().toLowerCase() ?? '';
    if (form !== '' && !isFormKey(form)) return undefined;
    return pokemonTarget(pokemon, form === '' ? undefined : form, stored.shadow === true);
  }
  if (pokemon === ZERO_CODE) return { kind: 'iv', iv: 'zero' };
  if (pokemon === PERFECT_CODE && scope !== 'raid') return { kind: 'iv', iv: 'perfect' };
  if (scope === 'spawn') return undefined;
  const code = TIER_CODES.find(([value]) => value === pokemon);
  const tier = code ? raidTier(code[1], code[2]) : undefined;
  return tier ? { kind: 'tier', tier } : undefined;
}

/** A want as a member has it: what it is for, and where it applies. */
export interface Want {
  target: NotificationTarget;
  /**
   * The scope in effect, which is not always the stored one: a tier is always `raid` and an IV
   * target always `spawn` (a legacy `(-6, both)` row is a perfect-IV want for spawns); a Pokémon
   * has the scope its row holds, unless the want is for its shadow raids, which is `raid`.
   */
  scope: NotificationScope;
  /**
   * Costumed only (plan 8R-4, design 2): a property of the row, like the scope, never part of
   * what the want is for. Only a Pokémon's want may be; absent is plain, which also fits a
   * costumed sighting.
   */
  costumed?: true;
}

/**
 * A stored row as the want it means, with the scope in effect; undefined for a row this bot
 * cannot read (see `decodeNotification`): skip such a row, never delete it or fail on it.
 */
export function readNotification(stored: StoredNotification): Want | undefined {
  const target = decodeNotification(stored);
  if (!target) return undefined;
  if (target.kind === 'tier') return { target, scope: 'raid' };
  if (target.kind === 'iv') return { target, scope: 'spawn' };
  const costumed = stored.costumed === true ? { costumed: true as const } : {};
  if (target.shadow) return { target, scope: 'raid', ...costumed };
  // `decodeNotification` has read the type already, so it is one of the three.
  return { target, scope: parseNotificationScope(stored.type) ?? 'both', ...costumed };
}

/**
 * The tiers a want can be for (those the codec has a code for), in the order a list offers
 * them: the ordinary ones, then elite, then the shadow tiers.
 */
export function notificationTiers(): RaidTier[] {
  return TIER_CODES.flatMap(([, level, shadow]) => {
    const tier = raidTier(level, shadow);
    return tier ? [tier] : [];
  });
}

/** Whether a tier can be wanted: whether the codec has a code for it. */
export function isNotificationTier(tier: RaidTier): boolean {
  return TIER_CODES.some(([, level, shadow]) => level === tier.level && shadow === tier.shadow);
}

/**
 * Whether two targets are the same thing to be notified about. A species, one of its forms and
 * the shadow raids of either are different things: a member may want each beside the others.
 */
export function sameNotificationTarget(a: NotificationTarget, b: NotificationTarget): boolean {
  if (a.kind === 'pokemon') {
    return (
      b.kind === 'pokemon' &&
      a.dex === b.dex &&
      a.form === b.form &&
      (a.shadow === true) === (b.shadow === true)
    );
  }
  if (a.kind === 'iv') return b.kind === 'iv' && a.iv === b.iv;
  return b.kind === 'tier' && a.tier.level === b.tier.level && a.tier.shadow === b.tier.shadow;
}

/** The scope that covers both of two scopes: `raid` and `spawn` together are `both`. */
export function widerScope(a: NotificationScope, b: NotificationScope): NotificationScope {
  return a === b ? a : 'both';
}
