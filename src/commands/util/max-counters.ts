import {
  ComponentType,
  type APIModalInteractionResponseCallbackData,
  type APISelectMenuOption,
  type ChatInputCommandInteraction,
  type ModalSubmitInteraction,
} from 'discord.js';
import type { AppContext } from '../../app-context.js';
import { UserError } from '../../discord/errors.js';
import type { V2Message } from '../../discord/party-gateway.js';
import { titleCase } from '../../domain/counters/counters.js';
import {
  DEFAULT_MAX_ROLE,
  DEFAULT_MAX_TEAM_LEVEL,
  isMaxTeamLevel,
  MAX_ROLE_KEYS,
  MAX_ROLES,
  MAX_TEAM_LEVELS,
  maxRoleNamed,
  maxTeamLink,
  maxTeamMember,
  gigantamaxDefenders,
  pokebattlerMaxDefenders,
  pokebattlerMaxLevel,
  type MaxRole,
  type MaxTeamAnswer,
  type MaxTeamLevel,
} from '../../domain/counters/max-team.js';
import {
  ATTACKER_LEVEL_NAMES,
  DEFAULT_FRIENDSHIP,
  DEFAULT_WEATHER,
  FRIENDSHIP_NAMES,
  FRIENDSHIPS,
  isCounterWeather,
  isFriendship,
  WEATHER_NAMES,
  WEATHERS,
  type CounterWeather,
  type Friendship,
} from '../../domain/counters/options.js';
import type { PokemonCatalogue } from '../../domain/pogo/catalogue.js';
import type { PokemonEntry } from '../../domain/pogo/game-master.js';
import { maxBossTitle, maxTierLabel, type MaxTier } from '../../domain/pogo/max-tier.js';
import { iconAddress, maxBossPicture } from '../../domain/pogo/pokemon-icons.js';
import { MAX_TEAM_LINK_WORDS, renderMaxTeam, type ShownTeamMember } from '../../render/max-team.js';
import { cutText } from '../../render/party-post.js';
import { plain } from '../../render/text.js';
import { troubleError } from './counters-words.js';

/*
 * `/counters` for max battles (plan 8X-6; design section 8): Pokebattler's suggested team of
 * three for the member's role, at a level, in the counters' message form. `counters.ts` reads
 * the boss and the tier and hands a max tier here; its dialog ("Change options…") asks the role
 * and the level. Nothing here imports `counters.ts`, which imports this.
 */

/** The `level` choice of `/counters` that uses the member's Pokébox (the raid counters' only). */
const POKEBOX = 'box';

/** Everything a use of `/counters` for a max battle asks for, read before anything is sent. */
export interface MaxCounterPlan {
  kind: 'max';
  entry: PokemonEntry;
  tier: MaxTier;
  /** Pokebattler's level of the tier (`RAID_LEVEL_5_MAX`). */
  maxLevel: string;
  /** The names Pokebattler may know the boss by, in this order. */
  bosses: string[];
  role: MaxRole;
  level: MaxTeamLevel;
  weather: CounterWeather;
  friendship: Friendship;
}

/** The options of a max battle answer, kept for its dialog as a raid answer's are. */
export interface KeptMaxCounters {
  kind: 'max';
  bossKey: string;
  tier: MaxTier;
  role: MaxRole;
  level: MaxTeamLevel;
  weather: CounterWeather;
  friendship: Friendship;
  askerId: string;
  /** The party of the post a public answer stands in; null for a private answer. */
  partyId: string | null;
}

/**
 * The options of `/counters` that only a raid simulation takes, as the member sees them (the
 * team takes weather and friendship, probed live on 2026-10-21; nothing else).
 */
const RAID_ONLY_STRINGS = ['moveset'] as const;
const RAID_ONLY_BOOLEANS = ['shadow', 'mega', 'single'] as const;

/** `a`, `a or b`, `a, b or c`. */
function orList(words: readonly string[]): string {
  if (words.length <= 1) return words.join('');
  return `${words.slice(0, -1).join(', ')} or ${words[words.length - 1] ?? ''}`;
}

/** The sentence for a level the team does not take. */
const LEVEL_REFUSAL = `A max battle team is simulated at level ${orList(MAX_TEAM_LEVELS)}: pick one of those.`;

/** The level of a team as `/counters` or its dialog names it: 40 when left out. */
export function maxTeamLevelOf(level: string | null): MaxTeamLevel {
  if (level === null) return DEFAULT_MAX_TEAM_LEVEL;
  if (level === POKEBOX) {
    throw new UserError(
      'Pokebattler’s max battle teams cannot use your Pokébox: pick a level, or leave `level` out.',
    );
  }
  if (!isMaxTeamLevel(level)) throw new UserError(LEVEL_REFUSAL);
  return level;
}

/**
 * The weather and friendship as `/counters` or its dialog names them: as the raid counters'
 * (no weather and best friends when left out).
 */
function weatherAndFriendship(
  weather: string | null,
  friendship: string | null,
): { weather: CounterWeather; friendship: Friendship } {
  const chosen = {
    weather: weather ?? DEFAULT_WEATHER,
    friendship: friendship ?? DEFAULT_FRIENDSHIP,
  };
  if (!isCounterWeather(chosen.weather) || !isFriendship(chosen.friendship)) {
    throw new UserError('Pick the weather and the friendship from their lists.');
  }
  return { weather: chosen.weather, friendship: chosen.friendship };
}

/**
 * The role as `/counters` or its dialog names it: Attacker when left out, a role before plan
 * 8X-I as the nearest of Pokebattler's (`maxRoleNamed`).
 */
export function maxRoleOf(role: string | null): MaxRole {
  if (role === null) return DEFAULT_MAX_ROLE;
  const named = maxRoleNamed(role);
  if (named === undefined) throw new UserError('Pick the role from its list.');
  return named;
}

/**
 * What Pokebattler is asked about for a boss in a max tier: its level and the names it may know
 * the boss by; refused with a sentence for a mega, and for Gigantamax where the game master has
 * neither the Pokémon nor its forms so (`gigantamaxDefenders`), unless it is a Gigantamax boss of
 * the list (`listed`: Pokebattler's feed has it, or the post is of its Gigantamax battle), when
 * its own Gigantamax name is asked. A Dynamax boss is asked anyway: Pokebattler may simulate a
 * boss newer than the game data. `fromPost`: the tier was the post's.
 */
export function maxTarget(
  entry: PokemonEntry,
  tier: MaxTier,
  catalogue: Pick<PokemonCatalogue, 'canGigantamax' | 'byDex'>,
  fromPost = false,
  listed = false,
): { maxLevel: string; bosses: string[] } {
  const own = pokebattlerMaxDefenders(entry, tier);
  if (own.length === 0) {
    throw new UserError(
      `${plain(entry.name)} never battles in a max battle.` +
        (fromPost
          ? ` I took the tier of this post (${maxTierLabel(tier)}): name another with \`tier\`.`
          : ''),
    );
  }
  const forms = tier === 'G' ? gigantamaxDefenders(entry, catalogue) : own;
  const bosses = forms.length === 0 && listed ? own : forms;
  if (bosses.length === 0) {
    throw new UserError(
      `${plain(entry.name)} has no Gigantamax battle in the game: name a Dynamax tier with \`tier\`.`,
    );
  }
  return { maxLevel: pokebattlerMaxLevel(tier), bosses };
}

/**
 * The plan of `/counters` for a boss in a max tier: the role, level, weather and friendship of
 * the options; the raid counters' other options (boss moves, what else to list, a Pokébox) are
 * refused in words, since Pokebattler's teams take none of them (explored 2026-10-21).
 */
export function readMaxPlan(
  interaction: ChatInputCommandInteraction,
  entry: PokemonEntry,
  tier: MaxTier,
  fromPost: boolean,
  catalogue: Pick<PokemonCatalogue, 'canGigantamax' | 'byDex'>,
  listed: boolean,
): MaxCounterPlan {
  const { maxLevel, bosses } = maxTarget(entry, tier, catalogue, fromPost, listed);
  const given = [
    ...RAID_ONLY_STRINGS.filter((name) => interaction.options.getString(name) !== null),
    ...RAID_ONLY_BOOLEANS.filter((name) => interaction.options.getBoolean(name) !== null),
  ];
  if (given.length > 0) {
    throw new UserError(
      `Pokebattler’s max battle teams take no ${orList(given.map((name) => `\`${name}\``))}: ` +
        `leave ${given.length === 1 ? 'it' : 'them'} out.`,
    );
  }
  return {
    kind: 'max',
    entry,
    tier,
    maxLevel,
    bosses,
    level: maxTeamLevelOf(interaction.options.getString('level')),
    role: maxRoleOf(interaction.options.getString('role')),
    ...weatherAndFriendship(
      interaction.options.getString('weather'),
      interaction.options.getString('friendship'),
    ),
  };
}

/** The boss as the answer and its refusals name it: `Dynamax Uxie (5★)`, `Gigantamax Machamp`. */
const titleOf = (plan: MaxCounterPlan): string => plain(maxBossTitle(plan.entry.name, plan.tier));

/** What Pokebattler answered for a plan: the team, and the boss's Lobby on its site. */
export interface SimulatedTeam {
  team: MaxTeamAnswer;
  link: string;
}

/**
 * Asks Pokebattler for the team of a plan; a failure is refused with a sentence. The command and
 * the dialog of an answer both run it.
 */
export async function simulateMax(ctx: AppContext, plan: MaxCounterPlan): Promise<SimulatedTeam> {
  const outcome = await ctx.pokebattler.maxTeam({
    bosses: plan.bosses,
    maxLevel: plan.maxLevel,
    role: plan.role,
    level: plan.level,
    weather: plan.weather,
    friendship: plan.friendship,
  });
  if (outcome.ok) {
    // The boss's Lobby under the name Pokebattler knew it by.
    return { team: outcome.answer, link: maxTeamLink(outcome.query.boss) };
  }
  if (outcome.reason === 'unknown') {
    throw new UserError(`Pokebattler does not know ${titleOf(plan)} as a max battle boss.`);
  }
  if (outcome.reason === 'empty') {
    throw new UserError(`Pokebattler suggests no team against ${titleOf(plan)}.`);
  }
  throw troubleError(
    outcome,
    maxBossTitle(plan.entry.name, plan.tier),
    {
      words: MAX_TEAM_LINK_WORDS,
      link: maxTeamLink(plan.bosses[0] ?? plan.entry.key.toUpperCase()),
    },
    'Pokebattler gave no team just now.',
  );
}

/**
 * The answer for a team Pokebattler gave: the boss's picture (Gigantamax where the icons have
 * it) and types, each Pokémon of the team with its picture and moves (their types as emoji
 * where the server or the application has them), its alternatives, and "Change options…"
 * (`optionsId`) beside the boss's Lobby on Pokebattler's site. A Pokémon the game data does not
 * know is named by Pokebattler's name and logged.
 */
export function maxTeamMessage(
  ctx: AppContext,
  plan: MaxCounterPlan,
  { team, link }: SimulatedTeam,
  place: { guildId: string | null; optionsId: string },
): V2Message {
  const { catalogue } = ctx.gameData;
  const unknown = new Set<string>();
  const shown = (pick: ShownTeamMember['pick']): ShownTeamMember => {
    const member = maxTeamMember(pick.pokemonId, catalogue);
    if (!member.entry) unknown.add(pick.pokemonId);
    const picture =
      member.entry &&
      (member.gigantamax
        ? maxBossPicture(member.entry, 'G', ctx.gameData)
        : iconAddress(member.entry, ctx.gameData));
    return { name: member.name, picture, pick };
  };
  const slots = team.slots.map((slot) => ({
    role: slot.role,
    member: shown(slot.pick),
    alternatives: slot.alternatives.map(shown),
  }));
  if (unknown.size > 0) {
    ctx.log.info(
      { pokemonIds: [...unknown], boss: plan.bosses[0] },
      'Pokebattler named Pokémon the game data does not know',
    );
  }
  const [first] = team.slots;
  return renderMaxTeam({
    bossName: plan.entry.name,
    tier: plan.tier,
    bossTypes: plan.entry.types,
    picture: maxBossPicture(plan.entry, plan.tier, ctx.gameData),
    role: plan.role,
    slots,
    level: first?.pick.level ?? null,
    weather: plan.weather,
    friendship: plan.friendship,
    maxMoves: first?.maxMoves,
    move: (id) => {
      const move = catalogue.move(id);
      return { name: move?.name ?? titleCase(id), type: move?.type };
    },
    icon: (name) => ctx.emoji.find(name, place.guildId),
    link,
    optionsId: place.optionsId,
  });
}

/** The custom ids of the inputs of the max battle dialog. */
const INPUTS = {
  role: 'role',
  level: 'level',
  weather: 'weather',
  friendship: 'friendship',
} as const;

const TITLE_ROOM = 45;

const option = (
  label: string,
  value: string,
  selected: boolean,
  description?: string,
): APISelectMenuOption => ({
  label,
  value,
  ...(description === undefined ? {} : { description }),
  ...(selected ? { default: true } : {}),
});

/**
 * The dialog of "Change options…" under a max battle answer: the member's role (each with its
 * team in words), the level of their Pokémon, the weather and the friendship, as the answer had
 * them. The boss and the tier
 * never change. `customId` is the dialog's (`counters:<token>:dialog`).
 */
export function maxCountersDialog(
  customId: string,
  kept: KeptMaxCounters,
  entry: PokemonEntry,
): APIModalInteractionResponseCallbackData {
  return {
    custom_id: customId,
    title: cutText(`Team against ${maxBossTitle(entry.name, kept.tier)}`, TITLE_ROOM),
    components: [
      {
        type: ComponentType.Label,
        label: 'Your role',
        component: {
          type: ComponentType.StringSelect,
          custom_id: INPUTS.role,
          options: MAX_ROLE_KEYS.map((role) =>
            option(MAX_ROLES[role].name, role, role === kept.role, MAX_ROLES[role].team),
          ),
        },
      },
      {
        type: ComponentType.Label,
        label: 'Level of your Pokémon',
        component: {
          type: ComponentType.StringSelect,
          custom_id: INPUTS.level,
          options: MAX_TEAM_LEVELS.map((level) =>
            option(ATTACKER_LEVEL_NAMES[level], level, level === kept.level),
          ),
        },
      },
      {
        type: ComponentType.Label,
        label: 'Weather',
        component: {
          type: ComponentType.StringSelect,
          custom_id: INPUTS.weather,
          options: WEATHERS.map((each) => option(WEATHER_NAMES[each], each, each === kept.weather)),
        },
      },
      {
        type: ComponentType.Label,
        label: 'Friendship',
        component: {
          type: ComponentType.StringSelect,
          custom_id: INPUTS.friendship,
          options: FRIENDSHIPS.map((each) =>
            option(FRIENDSHIP_NAMES[each], each, each === kept.friendship),
          ),
        },
      },
    ],
  };
}

/**
 * The plan a submitted max battle dialog asks for: the boss and the tier of the answer, the role
 * and level as the dialog says; refused as the command refuses what does not fit.
 */
export function maxDialogPlan(
  interaction: ModalSubmitInteraction,
  entry: PokemonEntry,
  kept: KeptMaxCounters,
  catalogue: Pick<PokemonCatalogue, 'canGigantamax' | 'byDex'>,
): MaxCounterPlan {
  const [role] = interaction.fields.getStringSelectValues(INPUTS.role);
  const [level] = interaction.fields.getStringSelectValues(INPUTS.level);
  const [weather] = interaction.fields.getStringSelectValues(INPUTS.weather);
  const [friendship] = interaction.fields.getStringSelectValues(INPUTS.friendship);
  return {
    kind: 'max',
    entry,
    tier: kept.tier,
    // Its answer was given: the boss was asked for in this tier already.
    ...maxTarget(entry, kept.tier, catalogue, false, true),
    role: maxRoleOf(role ?? null),
    level: maxTeamLevelOf(level ?? null),
    ...weatherAndFriendship(weather ?? null, friendship ?? null),
  };
}
