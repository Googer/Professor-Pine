import {
  ANY_LEADER,
  boxTarget,
  isCostumedTarget,
  sameTargetWant,
  type PokemonBoxKind,
  type TargetWant,
} from '../notify/target-wants.js';
import { parseRocketKey, rocketName } from '../rocket/lineups.js';
import type { PokemonCatalogue } from './catalogue.js';
import type { PokemonEntry } from './game-master.js';
import { pokemonWantName, speciesNameOf } from './wants.js';
import {
  isNotificationTier,
  pokemonTarget,
  sameNotificationTarget,
  type NotificationTarget,
  type Want,
} from './notification-target.js';
import { raidTier, type RaidLevel } from './raid-tier.js';

/*
 * The boxes of `/want`'s dialog (plan 8R-1; design 7, 9.1, Matt's answers 2 and 9): what a
 * member wants a Pokémon, a form or a raid tier for. They map onto rows of two tables: Raids and
 * Spawns are the scope of the `PokemonNotification` row (`raid`, `spawn`, `both`; `raid` means
 * raids only from now on), Shadow is its shadow row (shadow raids and, with plan 8R-2, Team GO
 * Rocket catches), Research, Dynamax and Gigantamax are `TargetWant` rows; a tier's two boxes are
 * its row and its shadow tier's. Pure.
 */

/** The boxes of a Pokémon or a form, in the dialog's order. */
export const POKEMON_BOXES = [
  'raids',
  'dynamax',
  'gigantamax',
  'spawns',
  'research',
  'shadow',
] as const;
export type PokemonBox = (typeof POKEMON_BOXES)[number];

/** The boxes of a raid tier. */
export const TIER_BOXES = ['raids', 'shadow-raids'] as const;
export type TierBox = (typeof TIER_BOXES)[number];

export type WantBox = PokemonBox | TierBox;

/** What a dialog is about: a Pokémon (a species, or one form: its catalogue key), or a tier. */
export type BoxSubject =
  { kind: 'pokemon'; dex: number; form?: string } | { kind: 'tier'; level: RaidLevel };

/** The boxes as members read them. */
export const BOX_WORDS: Readonly<Record<WantBox, string>> = {
  raids: 'Raids',
  dynamax: 'Dynamax',
  gigantamax: 'Gigantamax',
  spawns: 'Spawns',
  research: 'Research',
  shadow: 'Shadow',
  'shadow-raids': 'Shadow raids',
};

/**
 * What a box of a Pokémon says under its name in the dialog (the mockups of plan 8R-4), `{name}`
 * the Pokémon's; shown only in a dialog without a Which field.
 */
export const BOX_DESCRIPTIONS: Readonly<Record<PokemonBox, string>> = {
  raids: '{name} raids and their eggs',
  dynamax: 'Dynamax max battles',
  gigantamax: 'Gigantamax max battles',
  spawns: 'Wild {name} reported',
  research: 'Field research that rewards it',
  shadow: 'Shadow raids and Team GO Rocket catches',
};

/** The subject a want is part of: a Pokémon's or a tier's (its shadow want too); none for IVs. */
export function subjectOf(target: NotificationTarget): BoxSubject | undefined {
  if (target.kind === 'pokemon') {
    return target.form === undefined
      ? { kind: 'pokemon', dex: target.dex }
      : { kind: 'pokemon', dex: target.dex, form: target.form };
  }
  if (target.kind === 'tier') return { kind: 'tier', level: target.tier.level };
  return undefined;
}

/** The subject of a `TargetWant` that is a box of a Pokémon (Research, Dynamax, Gigantamax). */
export function subjectOfTarget(want: TargetWant): BoxSubject | undefined {
  if (want.kind === 'research-item' || want.kind === 'research-energy' || want.kind === 'rocket') {
    return undefined;
  }
  return want.form === undefined
    ? { kind: 'pokemon', dex: want.dex }
    : { kind: 'pokemon', dex: want.dex, form: want.form };
}

/** Whether two subjects are one. */
export function sameSubject(a: BoxSubject, b: BoxSubject): boolean {
  if (a.kind === 'tier') return b.kind === 'tier' && a.level === b.level;
  return b.kind === 'pokemon' && a.dex === b.dex && a.form === b.form;
}

/** The subject's own want: the Pokémon or form in raids and spawns, or the tier's. */
export function baseTarget(subject: BoxSubject): NotificationTarget {
  if (subject.kind === 'pokemon') return pokemonTarget(subject.dex, subject.form);
  const tier = raidTier(subject.level, false);
  if (!tier) throw new Error(`no tier ${subject.level}`);
  return { kind: 'tier', tier };
}

/** The subject's shadow want; undefined for a tier without shadow raids. */
export function shadowTarget(subject: BoxSubject): NotificationTarget | undefined {
  if (subject.kind === 'pokemon') return pokemonTarget(subject.dex, subject.form, true);
  const tier = raidTier(subject.level, true);
  return tier && isNotificationTier(tier) ? { kind: 'tier', tier } : undefined;
}

const TARGET_BOXES: readonly [PokemonBox, PokemonBoxKind][] = [
  ['research', 'research-pokemon'],
  ['dynamax', 'dynamax'],
  ['gigantamax', 'gigantamax'],
];

/** The `TargetWant` rows of a Pokémon's boxes, by box. */
export function targetWantsOf(subject: BoxSubject): [PokemonBox, TargetWant][] {
  if (subject.kind !== 'pokemon') return [];
  return TARGET_BOXES.map(([box, kind]) => [box, boxTarget(kind, subject.dex, subject.form)]);
}

/** The boxes a member has ticked, as their rows say: what pre-ticks the dialog. */
export function heldBoxes(
  subject: BoxSubject,
  wants: readonly Want[],
  targets: readonly TargetWant[],
): Set<WantBox> {
  const held = new Set<WantBox>();
  const base = wants.find((want) => sameNotificationTarget(want.target, baseTarget(subject)));
  const shadow = shadowTarget(subject);
  const shadowHeld =
    shadow !== undefined && wants.some((want) => sameNotificationTarget(want.target, shadow));
  if (base?.scope === 'raid' || base?.scope === 'both') held.add('raids');
  if (subject.kind === 'tier') {
    if (shadowHeld) held.add('shadow-raids');
    return held;
  }
  if (base?.scope === 'spawn' || base?.scope === 'both') held.add('spawns');
  if (shadowHeld) held.add('shadow');
  for (const [box, want] of targetWantsOf(subject)) {
    if (targets.some((one) => sameTargetWant(one, want))) held.add(box);
  }
  return held;
}

/** What decides which boxes a Pokémon's dialog shows. */
export interface BoxFacts {
  /** The subject's entries: every entry of a species, the one of a form. */
  entries: readonly Pick<PokemonEntry, 'kind' | 'shadow' | 'key'>[];
  /** Whether an entry is met in the wild (`appearsInWild` with the settings' exceptions). */
  wild: (entry: Pick<PokemonEntry, 'kind' | 'shadow' | 'key'>) => boolean;
  /** Whether the game master says it can Dynamax / Gigantamax (`catalogue.canDynamax`). */
  canDynamax: (entry: Pick<PokemonEntry, 'key'>) => boolean;
  canGigantamax: (entry: Pick<PokemonEntry, 'key'>) => boolean;
  /** Whether the max boss list has it at a Dynamax tier, at G. */
  dynamaxListed: boolean;
  gigantamaxListed: boolean;
  /** Whether it is a shadow raid boss now. */
  shadowBoss: boolean;
  /** Whether it can be caught from Team GO Rocket today (plan 8R-2: the lineups' catches). */
  rocketCatch?: boolean;
}

/**
 * The boxes a Pokémon's dialog shows (design 7: only what can happen): Raids always; Dynamax
 * and Gigantamax where the game master has it so or the max boss list does; Spawns where it is
 * met in the wild; Research for anything but a mega; Shadow where the game master says it can be
 * a shadow, it is a shadow raid boss now, or it is in today's Rocket lineups (plan 8R-2: new
 * shadows of a Takeover are listed before the game master may have them). A mega: Raids only.
 */
export function pokemonBoxes(facts: BoxFacts): PokemonBox[] {
  const { entries } = facts;
  if (entries.length > 0 && entries.every((entry) => entry.kind === 'mega')) return ['raids'];
  const any = (test: (entry: BoxFacts['entries'][number]) => boolean): boolean =>
    entries.some(test);
  const shown = new Set<PokemonBox>(['raids']);
  if (facts.dynamaxListed || any(facts.canDynamax)) shown.add('dynamax');
  if (facts.gigantamaxListed || any(facts.canGigantamax)) shown.add('gigantamax');
  if (any(facts.wild)) shown.add('spawns');
  if (any((entry) => entry.kind !== 'mega')) shown.add('research');
  if (
    facts.shadowBoss ||
    facts.rocketCatch === true ||
    any((entry) => entry.kind !== 'mega' && entry.shadow)
  ) {
    shown.add('shadow');
  }
  return POKEMON_BOXES.filter((box) => shown.has(box));
}

/** An item's name made of its key, where the list does not name it: `rare-candy` is Rare Candy. */
export function itemNameOf(key: string): string {
  return key
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * What a `TargetWant` is called in a list, an answer and a direct message: `Dratini (research)`,
 * `Rare Candy (research)`, `Charizard Mega Energy (research)`, `Dynamax Machamp`, `Gigantamax
 * Machamp`; a Pokémon as `pokemonWantName` names it (`(every form)` for a species of several),
 * `Costumed` before a costumed one (`Costumed Pikachu (research)`, plan 8R-4). `items` names an
 * item as the task list does (else `itemNameOf`). Not made plain here.
 */
export function targetWantLabel(
  catalogue: PokemonCatalogue,
  want: TargetWant,
  items: ReadonlyMap<string, string> = new Map(),
): string {
  const label = plainTargetLabel(catalogue, want, items);
  return isCostumedTarget(want) ? `Costumed ${label}` : label;
}

function plainTargetLabel(
  catalogue: PokemonCatalogue,
  want: TargetWant,
  items: ReadonlyMap<string, string>,
): string {
  switch (want.kind) {
    case 'research-item':
      return `${items.get(want.item) ?? itemNameOf(want.item)} (research)`;
    case 'research-energy':
      return `${speciesNameOf(catalogue, want.dex) ?? `Pokémon #${String(want.dex)}`} Mega Energy (research)`;
    case 'research-pokemon':
      return `${pokemonWantName(catalogue, pokemonTarget(want.dex, want.form), { everyForm: true })} (research)`;
    case 'dynamax':
      return `Dynamax ${pokemonWantName(catalogue, pokemonTarget(want.dex, want.form))}`;
    case 'gigantamax':
      return `Gigantamax ${pokemonWantName(catalogue, pokemonTarget(want.dex, want.form))}`;
    case 'rocket':
      return rocketTargetLabel(want.who);
  }
}

/**
 * What a `TargetWant` is called as the reason of a direct message (plan 8R-6, the 8R staging's
 * finding 1): an item or Mega Energy in the shape of a Pokémon's reason, `Rare Candy · Research`,
 * `Charizard Mega Energy · Research` (`Gible · Research`, `changeOf`); any other as
 * `targetWantLabel` names it. Not made plain here.
 */
export function targetReasonLabel(catalogue: PokemonCatalogue, want: TargetWant): string {
  switch (want.kind) {
    case 'research-item':
      return `${itemNameOf(want.item)} · Research`;
    case 'research-energy':
      return `${speciesNameOf(catalogue, want.dex) ?? `Pokémon #${String(want.dex)}`} Mega Energy · Research`;
    default:
      return targetWantLabel(catalogue, want);
  }
}

/**
 * What a Rocket target is called (plan 8R-2): `Water-type grunt`, `Grunt (no type)`, `Decoy
 * grunt`, `Arlo (Team GO Rocket leader)`, `Any Team GO Rocket leader`, `Giovanni (Team GO
 * Rocket boss)`.
 */
export function rocketTargetLabel(who: string): string {
  if (who === ANY_LEADER) return 'Any Team GO Rocket leader';
  const parsed = parseRocketKey(who);
  if (!parsed) return who;
  const name = rocketName(parsed);
  if (parsed.kind === 'leader') return `${name} (Team GO Rocket leader)`;
  if (parsed.kind === 'giovanni') return `${name} (Team GO Rocket boss)`;
  return name;
}

/** The boxes a tier's dialog shows: Raids, and Shadow raids where the tier has shadow raids. */
export function tierBoxes(level: RaidLevel): TierBox[] {
  const shadow = raidTier(level, true);
  return shadow && isNotificationTier(shadow) ? ['raids', 'shadow-raids'] : ['raids'];
}
