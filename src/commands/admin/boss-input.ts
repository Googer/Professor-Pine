import type {
  SlashCommandIntegerOption,
  SlashCommandStringOption,
  SlashCommandSubcommandBuilder,
} from 'discord.js';
import type { AppContext } from '../../app-context.js';
import { MAX_CHOICE_TEXT } from '../../discord/command.js';
import { UserError } from '../../discord/errors.js';
import type { PokemonEntry } from '../../domain/pogo/game-master.js';
import { namedFirst } from '../../domain/pogo/pokemon-search.js';
import { bossIdsOf, type BossIds } from '../../domain/pogo/raid-bosses.js';
import {
  isRaidLevel,
  RAID_LEVELS,
  raidTier,
  sameRaidTier,
  type RaidTier,
} from '../../domain/pogo/raid-tier.js';
import { isMaxTier, MAX_TIERS, type MaxTier } from '../../domain/pogo/max-tier.js';
import { bossTierLabel, bossTierValue } from '../../domain/pogo/tier-words.js';
import { searchTokens } from '../../domain/search/text.js';
import { plain, truncate } from '../../render/text.js';
import { CHOICE_NAME, MAX_CHOICES, showsGuessed, type Choice } from '../choices.js';
import { namedPokemon } from '../pokemon-option.js';

/** The subcommand group of `/admin` the boss list lives under. */
export const BOSS_GROUP = 'boss';
export const BOSS_DESCRIPTION =
  'The raid and max boss lists: what the feeds say, and your changes to them';

/** The longest `days` an override may be given; 0 is "for good". */
export const MAX_DAYS = 90;
/** How long an `add` or `autoset` lasts when no `days` is given. */
export const DEFAULT_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Every tier a boss can have, in the order of the levels, shadow after plain. */
export function allTiers(): RaidTier[] {
  return RAID_LEVELS.flatMap((level) =>
    [raidTier(level, false), raidTier(level, true)].filter(
      (tier): tier is RaidTier => tier !== undefined,
    ),
  );
}

/**
 * A tier of either boss list (plan 8X-2): a raid tier, or a max tier (`D1` to `D5`, `G`), which
 * is a string and so told apart by `isMaxBossTier`.
 */
export type BossTier = RaidTier | MaxTier;

export function isMaxBossTier(tier: BossTier): tier is MaxTier {
  return typeof tier === 'string';
}

export { bossTierLabel };

export function sameBossTier(a: BossTier, b: BossTier): boolean {
  if (isMaxBossTier(a) || isMaxBossTier(b)) return a === b;
  return sameRaidTier(a, b);
}

/** Tiers in words: `Dynamax 1★`, `T1 and T3`, `T1, T3 and Elite`. */
export function bossTiersText(tiers: readonly BossTier[]): string {
  const labels = tiers.map(bossTierLabel);
  const last = labels.pop() ?? '';
  return labels.length === 0 ? last : `${labels.join(', ')} and ${last}`;
}

/** Every tier an override can have: the raid tiers, then the max tiers. */
export function adminTiers(): BossTier[] {
  return [...allTiers(), ...MAX_TIERS];
}

/** The value of a tier among the choices of the `tier` option: `T5`, `T5:shadow`, `D2`, `G`. */
export const tierValue: (tier: BossTier) => string = bossTierValue;

/** The tier of a choice of the `tier` option; a `UserError` for anything else. */
export function readTier(value: string): BossTier {
  if (isMaxTier(value)) return value;
  return readRaidTier(value);
}

/** The raid tier of a choice of the `tier` option; a `UserError` for anything else. */
export function readRaidTier(value: string): RaidTier {
  if (isMaxTier(value)) {
    throw new UserError(
      'A max battle has no egg, so there is nothing to hatch as: `autoset` is for raid tiers.',
    );
  }
  const [level = '', shadow, ...rest] = value.split(':');
  const tier =
    isRaidLevel(level) && rest.length === 0 && (shadow === undefined || shadow === 'shadow')
      ? raidTier(level, shadow === 'shadow')
      : undefined;
  if (!tier) throw new UserError('That is not a raid tier. Pick one from the list.');
  return tier;
}

/**
 * The `tier` option: a choice of every tier the bot knows, the max tiers after the raid tiers
 * (16 of Discord's 25; `raidOnly` leaves them out, for `autoset`).
 */
export function tierOption(
  required: boolean,
  description = 'The raid or max battle tier',
  raidOnly = false,
) {
  const tiers: BossTier[] = raidOnly ? allTiers() : adminTiers();
  return (option: SlashCommandStringOption): SlashCommandStringOption =>
    option
      .setName('tier')
      .setDescription(description)
      .setRequired(required)
      .setMaxLength(MAX_CHOICE_TEXT)
      .addChoices(tiers.map((tier) => ({ name: bossTierLabel(tier), value: tierValue(tier) })));
}

/** The `days` option: how long an override lasts. */
export function daysOption(description: string) {
  return (option: SlashCommandIntegerOption): SlashCommandIntegerOption =>
    option.setName('days').setDescription(description).setMinValue(0).setMaxValue(MAX_DAYS);
}

/** Adds the `days` option to a subcommand. */
export function withDays(
  data: SlashCommandSubcommandBuilder,
  description: string,
): SlashCommandSubcommandBuilder {
  return data.addIntegerOption(daysOption(description));
}

/**
 * When an override given `days` ends: `days` from now, never for 0, and `fallback` days (null:
 * never) when none was given.
 */
export function expiryOf(days: number | null, fallback: number | null, now: number): number | null {
  const chosen = days ?? fallback;
  return chosen === null || chosen === 0 ? null : now + chosen * DAY_MS;
}

/** A choice's value for a boss the game master does not know: its feed ids. */
const IDS_CHOICE = /^ids:([A-Z][A-Z0-9_]{0,63})(?::([A-Z][A-Z0-9_]{0,63}))?$/;

function idsValue(ids: BossIds): string {
  return `ids:${ids.pokemonId}${ids.form === null ? '' : `:${ids.form}`}`;
}

/** What the `pokemon` option names: the ids an override is stored with, and how to call it. */
export interface ChosenPokemon {
  ids: BossIds;
  /** Undefined for a boss of the feed the game master does not know. */
  entry: PokemonEntry | undefined;
  /** As a sentence names it, made plain. */
  label: string;
}

/**
 * The choices of the `pokemon` option: with nothing typed, the bosses of the list; with text,
 * what the text names in full, then the bosses it finds by their name, then any Pokémon the
 * search finds (a guess only where the name shows the guessed word). A boss of the feed the game
 * master does not know is offered under the feed's name with its ids (`ids:<id>[:<form>]`);
 * every other choice's value is a catalogue key.
 */
export function bossPokemonChoices(ctx: AppContext, typed: string): Choice[] {
  const words = searchTokens(typed);
  const bosses = [...ctx.raidBosses.bosses(), ...ctx.maxBosses.bosses()];
  const unknown = bosses
    .filter((boss) => !boss.entry)
    .map((boss) => ({
      name: `${boss.name} (not in the game data: ${boss.form ?? boss.pokemonId})`,
      value: idsValue(boss),
    }));
  const known = new Map(
    bosses.flatMap((boss) => (boss.entry ? [[boss.entry.key, boss.entry] as const] : [])),
  );
  const entryChoice = (entry: PokemonEntry): Choice => ({ name: entry.name, value: entry.key });
  let choices: Choice[];
  if (words.length === 0) {
    choices = [...[...known.values()].map(entryChoice), ...unknown];
  } else {
    const hits = ctx.pokemon.find(typed, { limit: MAX_CHOICES * 4 });
    const named = ctx.pokemon
      .find(typed, { filter: (entry) => known.has(entry.key) })
      .filter(namedFirst(hits));
    const [first] = hits;
    const begun = (name: string): boolean => {
      const own = searchTokens(name);
      return words.every((word) => own.some((part) => part.startsWith(word)));
    };
    choices = [
      ...(first?.match === 'exact' ? [entryChoice(first.entry)] : []),
      ...named.map((hit) => entryChoice(hit.entry)),
      ...unknown.filter((choice) => begun(choice.name)),
      ...hits
        .filter((hit) => hit.match !== 'guess' || showsGuessed(hit.entry.name, hit.guessed))
        .map((hit) => entryChoice(hit.entry)),
    ];
  }
  const listed = new Set<string>();
  return choices
    .filter((choice) => {
      if (choice.value.length > 100 || listed.has(choice.value)) return false;
      listed.add(choice.value);
      return true;
    })
    .slice(0, MAX_CHOICES)
    .map((choice) => ({ ...choice, name: truncate(choice.name, CHOICE_NAME) }));
}

/**
 * The Pokémon the `pokemon` option names: a choice of the list, or typed text that names one
 * outright (its name, key or a nickname no other Pokémon has). Anything else is refused with
 * what the text could be.
 */
export function chosenPokemon(ctx: AppContext, value: string): ChosenPokemon {
  const text = value.trim();
  const ids = IDS_CHOICE.exec(text);
  if (ids?.[1]) {
    const pokemonId = ids[1];
    const form = ids[2] ?? null;
    const same = (one: BossIds): boolean => one.pokemonId === pokemonId && one.form === form;
    const max = ctx.maxBossAdmin;
    const feed: { name: string } | undefined =
      ctx.raidBossAdmin.feedBosses().find(same) ?? max.feedBosses().find(same);
    const override = ctx.raidBossAdmin.overrides().find(same) ?? max.overrides().find(same);
    if (!feed && !override) {
      throw new UserError('That boss is no longer in the feed. Pick again from the list.');
    }
    const entry = ctx.gameData.catalogue.byGameMasterId(pokemonId, form);
    return {
      ids: { pokemonId, form },
      entry,
      label: plain(entry?.name ?? feed?.name ?? form ?? pokemonId),
    };
  }
  const entry = namedPokemon(ctx, text);
  return { ids: bossIdsOf(entry), entry, label: plain(entry.name) };
}
