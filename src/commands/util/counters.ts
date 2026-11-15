import { zoneOf } from '../../discord/server-values.js';
import { TRAIN_KIND_WORDS } from '../../render/train-words.js';
import { randomBytes } from 'node:crypto';
import {
  InteractionContextType,
  MessageFlags,
  SlashCommandBuilder,
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
} from 'discord.js';
import type { AppContext } from '../../app-context.js';
import { BoundedMap } from '../../bounded-map.js';
import type { Guard, LocatedInteraction, SimpleCommand } from '../../discord/command.js';
import { encodeCustomId } from '../../discord/custom-id.js';
import { UserError } from '../../discord/errors.js';
import { partyOf } from '../../discord/guards.js';
import { v2Answer } from '../../discord/late-reply.js';
import type { V2Message } from '../../discord/party-gateway.js';
import type { Throttle } from '../../discord/throttle.js';
import { counterRows, pokebattlerNames, titleCase } from '../../domain/counters/counters.js';
import {
  ATTACKER_LEVEL_NAMES,
  ATTACKER_LEVELS,
  counterSiteLink,
  DEFAULT_ATTACKER_LEVEL,
  DEFAULT_FRIENDSHIP,
  DEFAULT_WEATHER,
  FRIENDSHIP_NAMES,
  FRIENDSHIPS,
  isAttackerLevel,
  isCounterWeather,
  isFriendship,
  pokebattlerBossIds,
  pokebattlerRaidLevel,
  WEATHER_NAMES,
  WEATHERS,
  type AttackerLevel,
  type CounterAttackers,
  type CounterWeather,
  type Friendship,
} from '../../domain/counters/options.js';
import type { BossMovesetCounters } from '../../domain/counters/pokebattler-answer.js';
import { MAX_ROLE_KEYS, MAX_ROLES } from '../../domain/counters/max-team.js';
import { bossOf, isMax, isRaid, isTrain, type Party } from '../../domain/party/party.js';
import { isMaxTier, MAX_TIERS, maxTierLabel, type MaxTier } from '../../domain/pogo/max-tier.js';
import type { PokemonCatalogue } from '../../domain/pogo/catalogue.js';
import type { Move, PokemonEntry } from '../../domain/pogo/game-master.js';
import { parseMoveset } from '../../domain/pogo/move-search.js';
import { pokemonPicture } from '../../domain/pogo/pokemon-icons.js';
import {
  bossStamina,
  isRaidLevel,
  RAID_LEVELS,
  raidTier,
  raidTierLabel,
  SHADOW_RAID_LEVELS,
  type RaidTier,
} from '../../domain/pogo/raid-tier.js';
import type { Boss } from '../../domain/pogo/raid-bosses.js';
import { renderCounters } from '../../render/counters.js';
import { plain, truncate } from '../../render/text.js';
import type { CounterOutcome } from '../../services/pokebattler-gateway.js';
import { CHOICE_NAME, MAX_CHOICES, type Choice } from '../choices.js';
import { kindOfText } from '../max/max-input.js';
import { namedPokemon, pokemonChoices } from '../pokemon-option.js';
import { troubleError } from './counters-words.js';
import { IN_SETTINGS } from '../../render/settings-words.js';
import {
  maxTeamMessage,
  readMaxPlan,
  simulateMax,
  type KeptMaxCounters,
  type MaxCounterPlan,
  type SimulatedTeam,
} from './max-counters.js';

/** An outside request: three in a minute (brief of plan 6B). */
export const COUNTERS_THROTTLE: Throttle = { uses: 3, perSeconds: 60 };

/** The `level` choice that uses the member's Pokébox on Pokebattler. */
export const POKEBOX = 'box';
/** The `moveset` value of the average of all the boss's movesets. */
export const AVERAGE_MOVESET = 'average';

/** The raid tiers as the `tier` option offers them: `T5`, `shadow:T5`; the max tiers after them. */
const TIER_CHOICES: readonly RaidTier[] = [
  ...RAID_LEVELS.map((level) => ({ level, shadow: false })),
  ...SHADOW_RAID_LEVELS.map((level) => ({ level, shadow: true })),
];
const tierValue = (tier: RaidTier): string => `${tier.shadow ? 'shadow:' : ''}${tier.level}`;

/** A raid tier (`T5`, `shadow:T5`) or a max tier (`D5`, `G`, plan 8X-6) of the `tier` option. */
function readTier(value: string): RaidTier | MaxTier {
  if (isMaxTier(value)) return value;
  const [first, second] = value.split(':');
  const shadow = first === 'shadow';
  const level = shadow ? second : first;
  const tier = level !== undefined && isRaidLevel(level) ? raidTier(level, shadow) : undefined;
  if (!tier) throw new UserError('Pick the tier from its list.');
  return tier;
}

/** Everything a use of `/counters` asks for, read before anything is sent. */
export interface CounterPlan {
  kind: 'raid';
  entry: PokemonEntry;
  tier: RaidTier;
  raidLevel: string;
  bosses: string[];
  attackers: CounterAttackers;
  weather: CounterWeather;
  friendship: Friendship;
  moveset: { fast: Move; charged: Move } | undefined;
  shadow: boolean;
  mega: boolean;
  single: boolean;
}

/**
 * The post of a party with a boss, where the boss and the tier need not be named: a raid, a
 * train, a max battle (plan 8X-6).
 */
export function bossParty(interaction: LocatedInteraction, ctx: AppContext): Party | undefined {
  if (!interaction.inGuild()) return undefined;
  const party = partyOf(interaction, ctx);
  return party && (isRaid(party) || isTrain(party) || isMax(party)) ? party : undefined;
}

/**
 * The max boss a Pokémon is now (plan 8X-6), from the max boss list: the Pokémon itself, or for a
 * species one of its forms that is listed (Toxtricity for a listed Amped Toxtricity), which is
 * then the boss; of several the most stars, Gigantamax last (Gigantamax loses design conflicts
 * to Dynamax), and only Dynamax ones with `dynamaxOnly`. Undefined when it is no max boss now.
 */
export function currentMaxBoss(
  ctx: AppContext,
  entry: PokemonEntry,
  zone: string,
  dynamaxOnly = false,
): { entry: PokemonEntry; tier: MaxTier } | undefined {
  const rank = (tier: MaxTier): number => (tier === 'G' ? -1 : MAX_TIERS.indexOf(tier));
  const found = ctx.maxBosses
    .bosses(zone)
    .flatMap((boss) => {
      const listed = boss.entry;
      if (!listed || (dynamaxOnly && boss.tier === 'G')) return [];
      const same =
        listed.key === entry.key ||
        (entry.kind === 'species' && listed.dex === entry.dex && listed.kind !== 'mega');
      return same ? [{ entry: listed, tier: boss.tier }] : [];
    })
    .sort((a, b) => rank(b.tier) - rank(a.tier));
  return found[0];
}

/**
 * The Pokémon a name stands for: a catalogue key or a name (by the server's search, its nicknames
 * too), or a mega the game master does not have yet (`unlistedMega`). Undefined for anything
 * else.
 */
export function bossNamed(
  ctx: AppContext,
  serverId: string | null,
  name: string,
): PokemonEntry | undefined {
  return (
    ctx.gameData.catalogue.byKey(name) ??
    ctx.pokemon.of(serverId).exact(name) ??
    ctx.gameData.catalogue.unlistedMega(name)
  );
}

/**
 * Whether a row of the boss list is this Pokémon; by name for a mega the game master lacks. Of
 * anything else a row without an entry says nothing: its name and picture disagreed.
 */
const listsBoss = (boss: Readonly<Boss>, entry: PokemonEntry): boolean =>
  boss.entry ? boss.entry.key === entry.key : entry.kind === 'mega' && boss.name === entry.name;

/**
 * The tier a Pokémon is a boss of now, from the boss list members see; of several the hardest
 * (the most stamina), an ordinary raid before a shadow raid of the same level. Undefined when it
 * is no boss now.
 */
export function currentTier(
  ctx: AppContext,
  entry: PokemonEntry,
  zone: string,
): RaidTier | undefined {
  const tiers = ctx.raidBosses
    .bosses(zone)
    .filter((boss) => listsBoss(boss, entry))
    .map((boss) => boss.tier)
    .sort((a, b) => bossStamina(b) - bossStamina(a) || Number(a.shadow) - Number(b.shadow));
  return tiers[0];
}

/**
 * The boss and tier: the options, else the party of the post. `fromPost`: the tier is that of
 * the raid or max battle whose post this is, not one the member named. `ownBattle`: the boss and
 * tier are those of the max battle whose post this is (the post stands for the max boss list).
 */
function bossAndTier(
  interaction: ChatInputCommandInteraction,
  ctx: AppContext,
): { entry: PokemonEntry; tier: RaidTier | MaxTier; fromPost: boolean; ownBattle: boolean } {
  const zone = zoneOf(interaction, ctx);
  const typedBoss = interaction.options.getString('boss')?.trim() ?? '';
  const typedTier = interaction.options.getString('tier');
  const party = bossParty(interaction, ctx);
  // A train's kind says what its boss is (plan 8X-4): a raid train's a raid boss, no max battle
  // tier guessed; a Dynamax train's at its Dynamax tier, a Gigantamax train's at Gigantamax.
  const trainKind = party !== undefined && isTrain(party) ? party.train.kind : undefined;
  const inTrain = trainKind === 'raid';
  const named = (
    entry: PokemonEntry,
    fallback: RaidTier | MaxTier | undefined,
  ): { entry: PokemonEntry; tier: RaidTier | MaxTier } => {
    if (typedTier !== null) return { entry, tier: readTier(typedTier) };
    if (fallback !== undefined) return { entry, tier: fallback };
    if (trainKind === 'gigantamax') return { entry, tier: 'G' };
    if (trainKind === 'dynamax') {
      const listed = currentMaxBoss(ctx, entry, zone, true);
      if (listed) return listed;
      throw new UserError(
        `${plain(entry.name)} is not a Dynamax boss now. Say which tier to simulate with \`tier\`.`,
      );
    }
    const raid = currentTier(ctx, entry, zone);
    if (raid) return { entry, tier: raid };
    if (inTrain) {
      throw new UserError(
        `${plain(entry.name)} is not a raid boss now. Say which tier to simulate with \`tier\`.`,
      );
    }
    const max = currentMaxBoss(ctx, entry, zone);
    if (!max) {
      throw new UserError(
        `${plain(entry.name)} is not a raid or max battle boss now. Say which tier to simulate ` +
          'with `tier`.',
      );
    }
    return max;
  };
  // In the post of a raid or max battle its tier is what a boss named there is simulated in.
  const postTier =
    party && isRaid(party) ? party.raid.tier : party && isMax(party) ? party.max.tier : undefined;
  const fromPost = typedTier === null && postTier !== undefined;
  const postBoss = party && isMax(party) ? party.max : undefined;
  const ownBattle = (entry: PokemonEntry, tier: RaidTier | MaxTier): boolean =>
    postBoss !== undefined &&
    'key' in postBoss.boss &&
    postBoss.boss.key === entry.key &&
    postBoss.tier === tier;
  const result = (
    found: { entry: PokemonEntry; tier: RaidTier | MaxTier },
    tierFromPost: boolean,
  ) => ({ ...found, fromPost: tierFromPost, ownBattle: ownBattle(found.entry, found.tier) });
  if (typedBoss !== '') {
    const kind = kindOfText(typedBoss);
    const entry =
      (kind.gigantamax === undefined
        ? bossNamed(ctx, interaction.guildId, kind.rest)
        : undefined) ?? namedPokemon(ctx, interaction.guildId, kind.rest);
    if (kind.gigantamax === true) {
      // `Gigantamax Machamp` names its tier, as in `/max`.
      if (typedTier !== null && typedTier !== 'G') {
        throw new UserError(
          `Gigantamax ${plain(entry.name)} is a Gigantamax battle: leave \`tier\` out, or name ` +
            'Gigantamax.',
        );
      }
      return result({ entry, tier: 'G' }, false);
    }
    if (kind.gigantamax === false) {
      const dynamaxOf = (tier: RaidTier | MaxTier | undefined): MaxTier | undefined =>
        typeof tier === 'string' && tier !== 'G' ? tier : undefined;
      // As without the word: the listed boss, a species' listed form among them.
      const current = typedTier === null ? currentMaxBoss(ctx, entry, zone, true) : undefined;
      const tier =
        typedTier === null
          ? (dynamaxOf(postTier) ?? current?.tier)
          : dynamaxOf(readTier(typedTier));
      if (tier === undefined) {
        throw new UserError(
          `Dynamax ${plain(entry.name)} is a Dynamax battle: name a Dynamax tier with \`tier\`.`,
        );
      }
      const fromPostTier = typedTier === null && dynamaxOf(postTier) !== undefined;
      return result(
        { entry: fromPostTier || !current ? entry : current.entry, tier },
        fromPostTier,
      );
    }
    return result(named(entry, postTier), fromPost);
  }
  if (!party) {
    throw new UserError(
      'Say which boss with `boss`, or use this in the post of a raid or a max battle, where it ' +
        'is that battle’s.',
    );
  }
  const ref = bossOf(party);
  if (ref === null) {
    throw new UserError(
      isRaid(party)
        ? 'The boss of this raid is not known yet. Name it with `boss`.'
        : 'This train has no boss. Name one with `boss`.',
    );
  }
  const entry =
    'key' in ref
      ? ctx.gameData.catalogue.byKey(ref.key)
      : bossNamed(ctx, interaction.guildId, ref.name);
  if (!entry) {
    throw new UserError(
      `I cannot ask Pokebattler about ${'name' in ref ? plain(ref.name) : 'this boss'} yet: ` +
        'it is newer than the game data I have.',
    );
  }
  return result(named(entry, postTier), fromPost);
}

/**
 * The boss's movesets: each fast move with each charged move, its elite moves among them (a
 * raid boss can have one: Mewtwo with Psystrike), those without elite moves first.
 */
export function bossMovesets(
  catalogue: PokemonCatalogue,
  entry: PokemonEntry,
): { fast: Move; charged: Move }[] {
  const moves = (ids: readonly string[]): Move[] =>
    ids.map((id) => catalogue.move(id)).filter((move): move is Move => move !== undefined);
  const fastMoves = moves(entry.fastMoves);
  const chargedMoves = moves(entry.chargedMoves);
  const eliteFast = moves(entry.eliteFastMoves);
  const eliteCharged = moves(entry.eliteChargedMoves);
  const pairs = (fast: readonly Move[], charged: readonly Move[]) =>
    fast.flatMap((one) => charged.map((other) => ({ fast: one, charged: other })));
  return [
    ...pairs(fastMoves, chargedMoves),
    ...pairs(fastMoves, eliteCharged),
    ...pairs(eliteFast, [...chargedMoves, ...eliteCharged]),
  ];
}

/** `CONFUSION_FAST/PSYSTRIKE`: a boss moveset as a value of a list (the option's, the dialog's). */
export const movesetValue = (moveset: { fast: Move; charged: Move }): string =>
  `${moveset.fast.id}/${moveset.charged.id}`;

export const movesetName = (moveset: { fast: Move; charged: Move }): string =>
  `${moveset.fast.name} / ${moveset.charged.name}`;

/** The boss moveset asked for: a choice of the list (`FAST/CHARGED`), or the moves typed. */
function chosenMoveset(
  catalogue: PokemonCatalogue,
  entry: PokemonEntry,
  value: string | null,
): { fast: Move; charged: Move } | undefined {
  const text = value?.trim() ?? '';
  if (text === '' || text === AVERAGE_MOVESET) return undefined;
  // A value of the list: one of this boss's movesets, never another Pokémon's.
  const listed = bossMovesets(catalogue, entry).find((moveset) => movesetValue(moveset) === text);
  if (listed) return listed;
  const typed = parseMoveset(catalogue, entry, text);
  if (typed.fast && typed.charged && typed.unknown.length === 0) {
    return { fast: typed.fast, charged: typed.charged };
  }
  throw new UserError(
    `"${plain(truncate(text, 80))}" is not a moveset of ${plain(entry.name)}: name a fast and a ` +
      'charged move it has, or pick one from the list.',
  );
}

/** Where the attackers come from: a level, or the member's Pokébox. */
export async function attackersOf(
  level: string | null,
  userId: string,
  ctx: AppContext,
): Promise<CounterAttackers> {
  if (level === null) return { kind: 'level', level: DEFAULT_ATTACKER_LEVEL };
  if (level === POKEBOX) {
    const boxId = (await ctx.users.get(userId)).pokebattlerId;
    if (boxId === null) {
      throw new UserError(
        `You have no Pokebattler user id saved. Save it ${IN_SETTINGS}, or pick a level.`,
      );
    }
    return { kind: 'box', userId: boxId };
  }
  if (!isAttackerLevel(level)) throw new UserError('Pick the level from its list.');
  return { kind: 'level', level };
}

/**
 * What Pokebattler is asked about for a boss in a tier: its raid level and the names it may know
 * the boss by; refused with a sentence where it has none. `fromPost`: the tier was the post's.
 */
export function pokebattlerTarget(
  entry: PokemonEntry,
  tier: RaidTier,
  fromPost = false,
): { raidLevel: string; bosses: string[] } {
  const raidLevel = pokebattlerRaidLevel(tier);
  if (raidLevel === undefined) {
    throw new UserError(`Pokebattler simulates no ${raidTierLabel(tier)} raids.`);
  }
  const bosses = pokebattlerBossIds(entry, tier.shadow);
  if (bosses.length === 0) {
    throw new UserError(
      `${plain(entry.name)} is never the boss of a shadow raid.` +
        (fromPost
          ? ` I took the tier of this post (${raidTierLabel(tier)}): name another with \`tier\`.`
          : ''),
    );
  }
  return { raidLevel, bosses };
}

/** A plan of either kind: a raid simulation or a max battle team (plan 8X-6). */
export type AnyCounterPlan = CounterPlan | MaxCounterPlan;

export const isMaxPlan = (plan: AnyCounterPlan): plan is MaxCounterPlan => plan.kind === 'max';

async function readPlan(
  interaction: ChatInputCommandInteraction,
  ctx: AppContext,
): Promise<AnyCounterPlan> {
  const { entry, tier, fromPost, ownBattle } = bossAndTier(interaction, ctx);
  if (typeof tier === 'string') {
    // The post of a battle stands for the list only for its own boss (another named there is not).
    const listed =
      ownBattle ||
      ctx.maxBosses
        .bosses(zoneOf(interaction, ctx))
        .some((boss) => boss.tier === tier && boss.entry?.key === entry.key);
    return readMaxPlan(interaction, entry, tier, fromPost, ctx.gameData.catalogue, listed);
  }
  if (interaction.options.getString('role') !== null) {
    throw new UserError('`role` is for max battles: leave it out for a raid.');
  }
  const { raidLevel, bosses } = pokebattlerTarget(entry, tier, fromPost);
  const moveset = chosenMoveset(
    ctx.gameData.catalogue,
    entry,
    interaction.options.getString('moveset'),
  );
  const weather = interaction.options.getString('weather') ?? DEFAULT_WEATHER;
  const friendship = interaction.options.getString('friendship') ?? DEFAULT_FRIENDSHIP;
  if (!isCounterWeather(weather) || !isFriendship(friendship)) {
    throw new UserError('Pick the weather and the friendship from their lists.');
  }
  const attackers = await attackersOf(
    interaction.options.getString('level'),
    interaction.user.id,
    ctx,
  );
  return {
    kind: 'raid',
    entry,
    tier,
    raidLevel,
    bosses,
    attackers,
    weather,
    friendship,
    moveset,
    // A Pokébox is the member's own Pokémon: its shadows and megas are shown unless left out.
    shadow: interaction.options.getBoolean('shadow') ?? attackers.kind === 'box',
    mega: interaction.options.getBoolean('mega') ?? attackers.kind === 'box',
    single: interaction.options.getBoolean('single') ?? false,
  };
}

/**
 * What can be known before Pokebattler is asked is refused here, before the answer is deferred
 * and before the use counts against the three of a minute.
 */
const requireCounterPlan: Guard = async (interaction, ctx) => {
  if (interaction.isChatInputCommand()) await readPlan(interaction, ctx);
};

/**
 * What the member is told when Pokebattler gave nothing: in words of the boss when it knows no
 * such boss or lists no counters, else `troubleError` (the use given back where the failure is
 * not the member's; an answer too large with the boss's page on Pokebattler's site).
 */
function failureError(
  outcome: Extract<CounterOutcome, { ok: false }>,
  plan: CounterPlan,
): UserError {
  if (outcome.reason === 'unknown' || outcome.reason === 'empty') {
    return new UserError(failureText(outcome.reason, plan));
  }
  const fullResults = counterSiteLink({
    boss: plan.bosses[0] ?? plan.entry.key.toUpperCase(),
    raidLevel: plan.raidLevel,
    attackers: plan.attackers,
    weather: plan.weather,
    friendship: plan.friendship,
    shadow: plan.shadow,
    mega: plan.mega,
  });
  return troubleError(
    outcome,
    plan.entry.name,
    { words: 'full results on Pokebattler', link: fullResults },
    'Pokebattler gave no counters just now.',
  );
}

/** The words of Pokebattler knowing no such boss, or listing no counters against it. */
function failureText(reason: 'unknown' | 'empty', plan: CounterPlan): string {
  switch (reason) {
    // For a Pokébox, unknown is also one that Pokebattler will not show (401, 403).
    case 'unknown':
      return plan.attackers.kind === 'box'
        ? `Pokebattler will not show a Pokébox of user ${String(plan.attackers.userId)} ` +
            `(check the id you saved ${IN_SETTINGS}), or does not know ` +
            `${plain(plan.entry.name)} as a boss of ${raidTierLabel(plan.tier)} raids.`
        : `Pokebattler does not know ${plain(plan.entry.name)} as a boss of ` +
            `${raidTierLabel(plan.tier)} raids.`;
    case 'empty':
      return plan.attackers.kind === 'box'
        ? `Pokebattler found no Pokémon in the Pokébox of user ${String(plan.attackers.userId)} ` +
            'that can fight this boss: check that your Pokébox on Pokebattler is filled in.'
        : `Pokebattler lists no counters against ${plain(plan.entry.name)} in ` +
            `${raidTierLabel(plan.tier)} raids.`;
  }
}

/** The counters against the boss moveset asked for, or a sentence when the answer has none. */
function countersFor(
  outcome: Extract<CounterOutcome, { ok: true }>,
  plan: CounterPlan,
  catalogue: PokemonCatalogue,
): BossMovesetCounters {
  const { moveset, entry } = plan;
  if (!moveset) {
    if (outcome.answer.average) return outcome.answer.average;
    throw new UserError(
      'Pokebattler gave no average of all movesets this time: pick a moveset with `moveset`.',
    );
  }
  const found = outcome.answer.byMoveset.find(
    (set) => set.fast === moveset.fast.id && set.charged === moveset.charged.id,
  );
  if (found) return found;
  const simulated = outcome.answer.byMoveset.map(
    (set) =>
      `${catalogue.move(set.fast ?? '')?.name ?? titleCase(set.fast ?? '')} / ` +
      `${catalogue.move(set.charged ?? '')?.name ?? titleCase(set.charged ?? '')}`,
  );
  throw new UserError(
    `Pokebattler has no results for ${plain(entry.name)} with ${plain(movesetName(moveset))}.` +
      simulatedSentence(simulated),
  );
}

/** At most so many simulated movesets are named in the refusal (Mew has some 100: plan 8X-H). */
export const SIMULATED_NAMED = 10;

/** ` It simulates A, B, and 20 more.`, or nothing when the answer simulates none. */
function simulatedSentence(simulated: readonly string[]): string {
  if (simulated.length === 0) return '';
  const named = plain(simulated.slice(0, SIMULATED_NAMED).join(', '));
  const more = simulated.length - SIMULATED_NAMED;
  return more > 0 ? ` It simulates ${named}, and ${String(more)} more.` : ` It simulates ${named}.`;
}

const names = new WeakMap<PokemonCatalogue, (pokemonId: string) => string>();
function namesOf(catalogue: PokemonCatalogue): (pokemonId: string) => string {
  let found = names.get(catalogue);
  if (!found) {
    found = pokebattlerNames(catalogue.all);
    names.set(catalogue, found);
  }
  return found;
}

/** The boss's movesets for the `moveset` option: the average first, then what fits the text. */
function movesetChoices(ctx: AppContext, entry: PokemonEntry | undefined, typed: string): Choice[] {
  const words = typed
    .toLowerCase()
    .split(/[\s/]+/)
    .filter((word) => word !== '');
  const fits = (name: string): boolean => words.every((word) => name.toLowerCase().includes(word));
  const average: Choice = { name: 'Average of all movesets', value: AVERAGE_MOVESET };
  const own = entry
    ? bossMovesets(ctx.gameData.catalogue, entry).map((moveset) => ({
        name: truncate(movesetName(moveset), CHOICE_NAME),
        value: movesetValue(moveset),
      }))
    : [];
  return [average, ...own].filter((choice) => fits(choice.name)).slice(0, MAX_CHOICES);
}

/** The boss the `moveset` list is for, while the member types: the option, or the post's. */
function bossWhileTyping(
  interaction: AutocompleteInteraction,
  ctx: AppContext,
): PokemonEntry | undefined {
  const typed = interaction.options.getString('boss')?.trim() ?? '';
  if (typed !== '') return bossNamed(ctx, interaction.guildId, typed);
  const party = bossParty(interaction, ctx);
  const ref = party && bossOf(party);
  if (!ref) return undefined;
  return 'key' in ref
    ? ctx.gameData.catalogue.byKey(ref.key)
    : bossNamed(ctx, interaction.guildId, ref.name);
}

/** The bosses of the list the game master lacks but a mega's name tells, that fit what is typed. */
function unlistedMegaChoices(
  ctx: AppContext,
  serverId: string | null,
  typed: string,
  zone: string,
): Choice[] {
  const words = typed.toLowerCase().split(/\s+/u).filter(Boolean);
  if (words.length === 0) return [];
  const names = ctx.raidBosses
    .bosses(zone)
    .filter(
      (boss) =>
        !boss.entry &&
        words.every((word) => boss.name.toLowerCase().includes(word)) &&
        bossNamed(ctx, serverId, boss.name) !== undefined,
    )
    .map((boss) => boss.name);
  return [...new Set(names)].map((name) => ({ name, value: name }));
}

/**
 * Whether the member is asking about a max battle while typing (a max tier, `Gigantamax` or
 * `Dynamax` before the boss, the post of a max battle without a raid tier, or a boss without a
 * tier that is no raid boss now and is a max boss): its team takes no boss moves, so none are
 * offered.
 */
function forMaxBattle(interaction: AutocompleteInteraction, ctx: AppContext): boolean {
  const tier = interaction.options.getString('tier');
  if (tier !== null) return isMaxTier(tier);
  const typed = interaction.options.getString('boss')?.trim() ?? '';
  if (kindOfText(typed).gigantamax !== undefined) return true;
  const party = bossParty(interaction, ctx);
  // A raid's post gives a boss named there its tier, a max battle's its own; a train's boss is
  // what its kind says (plan 8X-4): a raid train's a raid boss, a max train's a max boss.
  if (party && (isRaid(party) || (isTrain(party) && party.train.kind === 'raid'))) return false;
  if (party && (isMax(party) || isTrain(party))) return true;
  // A boss that is no raid boss now and is a max boss is asked about as a max battle.
  const entry = bossWhileTyping(interaction, ctx);
  const zone = zoneOf(interaction, ctx);
  return (
    entry !== undefined &&
    currentTier(ctx, entry, zone) === undefined &&
    currentMaxBoss(ctx, entry, zone) !== undefined
  );
}

/** The server whose emoji an answer may show, by the interaction's own id; none in a DM. */
export const serverOf = (interaction: LocatedInteraction): string | null =>
  interaction.inGuild() ? interaction.guildId : null;

/** What Pokebattler answered for a plan: the counters against the boss moveset asked for. */
interface Simulated {
  set: BossMovesetCounters;
  /** The page of the full results on pokebattler.com. */
  link: string;
}

/**
 * Asks Pokebattler for a plan; a failure, or an answer without the boss moveset asked for, is
 * refused with a sentence (`failureText`). The command and the dialog of an answer both run it.
 */
export async function simulate(ctx: AppContext, plan: CounterPlan): Promise<Simulated> {
  const outcome = await ctx.pokebattler.counters({
    bosses: plan.bosses,
    raidLevel: plan.raidLevel,
    attackers: plan.attackers,
    weather: plan.weather,
    friendship: plan.friendship,
    shadow: plan.shadow,
    mega: plan.mega,
  });
  if (!outcome.ok) throw failureError(outcome, plan);
  return {
    set: countersFor(outcome, plan, ctx.gameData.catalogue),
    link: counterSiteLink(outcome.query),
  };
}

/** The custom-id kind of "Change options…" under an answer and of its dialog. */
export const COUNTERS_KIND = 'counters';
/** `counters:<token>:options` opens the dialog, which is `counters:<token>:dialog`. */
export const COUNTERS_ACTIONS = { options: 'options', dialog: 'dialog' } as const;

/** How long the options of an answer are kept for its "Change options…": a day (Matt). */
export const COUNTERS_KEEP_MS = 24 * 60 * 60_000;
/**
 * At most so many answers' options are kept, the oldest going first: a few hundred bytes each,
 * a few megabytes in all, far more answers than a day brings.
 */
export const COUNTERS_KEPT_MAX = 5_000;

/**
 * The options of an answer, kept for its dialog: everything its plan was made of but the
 * member's Pokébox number (read anew when the dialog is sent with the Pokébox), who asked, and
 * the party whose post a public answer stands in.
 */
export interface KeptCounters {
  kind: 'raid';
  bossKey: string;
  /** For a boss the game master lacks, whose key the catalogue does not know (`bossNamed`). */
  bossName: string;
  tier: RaidTier;
  attackers: { kind: 'level'; level: AttackerLevel } | { kind: 'box' };
  weather: CounterWeather;
  friendship: Friendship;
  /** The boss moveset's move ids; null for the average of all. */
  moveset: { fast: string; charged: string } | null;
  shadow: boolean;
  mega: boolean;
  single: boolean;
  askerId: string;
  /** The party of the post a public answer stands in; null for a private answer. */
  partyId: string | null;
}

/** The kept options of a raid answer or of a max battle answer (plan 8X-6, `kind: 'max'`). */
export type KeptAnswer = KeptCounters | KeptMaxCounters;

export const isKeptMax = (kept: KeptAnswer): kept is KeptMaxCounters => kept.kind === 'max';

/**
 * The options of answers by the token of their custom ids, for a day and at most `max` of them
 * (`BoundedMap`, oldest out); kept in memory only, so a restart forgets them. Each is of the
 * server of its answer (null in a DM; plan 19B-4): asked from anywhere else it is as if it were
 * not kept. Only an answer keeps options: the dialog of Change options… names its answer's token
 * and the member who opened it in its custom id, and keeps nothing.
 */
export class KeptCounterOptions {
  private readonly kept: BoundedMap<
    string,
    { value: KeptAnswer; expires: number; serverId: string | null }
  >;

  constructor(private readonly options: { ttlMs?: number; max?: number; now?: () => number } = {}) {
    this.kept = new BoundedMap(options.max ?? COUNTERS_KEPT_MAX);
  }

  private now(): number {
    return this.options.now?.() ?? Date.now();
  }

  /** How many options are kept, those of a day not yet dropped included. */
  get size(): number {
    return this.kept.size;
  }

  /** Keeps the options of an answer given in a server (null: a DM), and gives their token. */
  keep(value: KeptAnswer, serverId: string | null): string {
    const now = this.now();
    this.kept.dropWhile((entry) => entry.expires <= now);
    const token = randomBytes(8).toString('hex');
    this.kept.set(token, {
      value,
      expires: now + (this.options.ttlMs ?? COUNTERS_KEEP_MS),
      serverId,
    });
    return token;
  }

  /**
   * The options kept under a token, asked from a server (null: a DM); undefined once they are gone
   * (a day, a restart), and for options of another server (or a DM's asked in a server, and the
   * other way round).
   */
  of(token: string, where: { readonly guildId: string | null }): KeptAnswer | undefined {
    const entry = this.kept.get(token);
    if (!entry || entry.expires <= this.now() || entry.serverId !== where.guildId) return undefined;
    return entry.value;
  }
}

/** The options of the answers of this process. */
export const keptCounters = new KeptCounterOptions();

/** Where an answer goes: the server (for its emoji), who asked, its post. */
export interface AnswerPlace {
  guildId: string | null;
  askerId: string;
  /** The party whose post a public answer stands in; null for a private answer. */
  partyId: string | null;
}

/**
 * The answer for a plan that Pokebattler simulated: the boss's picture, the counters with their
 * moves' types as emoji where the server or the application has them, and
 * "Change options…", whose options are kept (`keptCounters`) under a new token.
 */
export function countersMessage(
  ctx: AppContext,
  plan: CounterPlan,
  simulated: Simulated,
  place: AnswerPlace,
): V2Message {
  const token = keptCounters.keep(
    {
      kind: 'raid',
      bossKey: plan.entry.key,
      bossName: plan.entry.name,
      tier: plan.tier,
      attackers:
        plan.attackers.kind === 'box'
          ? { kind: 'box' }
          : { kind: 'level', level: plan.attackers.level },
      weather: plan.weather,
      friendship: plan.friendship,
      moveset: plan.moveset
        ? { fast: plan.moveset.fast.id, charged: plan.moveset.charged.id }
        : null,
      shadow: plan.shadow,
      mega: plan.mega,
      single: plan.single,
      askerId: place.askerId,
      partyId: place.partyId,
    },
    place.guildId,
  );
  const optionsId = encodeCustomId({
    kind: COUNTERS_KIND,
    id: token,
    action: COUNTERS_ACTIONS.options,
  });
  const { guildId } = place;
  const catalogue = ctx.gameData.catalogue;
  const feedImage = ctx.raidBosses
    .bosses(zoneOf(place, ctx))
    .find((boss) => listsBoss(boss, plan.entry))?.image;
  return renderCounters({
    bossName: plan.entry.name,
    tier: plan.tier,
    link: simulated.link,
    picture: pokemonPicture(feedImage, plan.entry, ctx.gameData),
    attackers: plan.attackers,
    weather: plan.weather,
    friendship: plan.friendship,
    bossMoves: plan.moveset ? movesetName(plan.moveset) : undefined,
    rows: counterRows(simulated.set, plan),
    pokemonName: namesOf(catalogue),
    move: (id) => {
      const move = catalogue.move(id);
      return { name: move?.name ?? titleCase(id), type: move?.type };
    },
    icon: (name) => ctx.emoji.find(name, guildId),
    shadow: plan.shadow,
    mega: plan.mega,
    single: plan.single,
    optionsId,
  });
}

/** What Pokebattler answered for a plan of either kind. */
export type Answered =
  { plan: CounterPlan; simulated: Simulated } | { plan: MaxCounterPlan; team: SimulatedTeam };

/**
 * Asks Pokebattler for a plan: the raid's counters (`simulate`) or the max battle's team
 * (`simulateMax`); a failure is refused with a sentence. The command and the dialog run it.
 */
export async function askPokebattler(ctx: AppContext, plan: AnyCounterPlan): Promise<Answered> {
  if (isMaxPlan(plan)) return { plan, team: await simulateMax(ctx, plan) };
  return { plan, simulated: await simulate(ctx, plan) };
}

/**
 * The answer for what Pokebattler answered, its options kept (`keptCounters`) under a new token
 * for "Change options…".
 */
export function answeredMessage(
  ctx: AppContext,
  answered: Answered,
  place: AnswerPlace,
): V2Message {
  if (!('team' in answered)) return countersMessage(ctx, answered.plan, answered.simulated, place);
  const { plan } = answered;
  const token = keptCounters.keep(
    {
      kind: 'max',
      bossKey: plan.entry.key,
      tier: plan.tier,
      role: plan.role,
      level: plan.level,
      weather: plan.weather,
      friendship: plan.friendship,
      askerId: place.askerId,
      partyId: place.partyId,
    },
    place.guildId,
  );
  return maxTeamMessage(ctx, plan, answered.team, {
    guildId: place.guildId,
    optionsId: encodeCustomId({ kind: COUNTERS_KIND, id: token, action: COUNTERS_ACTIONS.options }),
  });
}

/**
 * `/counters` (spec row 199, the legacy `!counters`): the best counters against a raid boss, as
 * Pokebattler simulates the raid, with the trainers each takes; for a max battle (plan 8X-6) the
 * team Pokebattler suggests for the member's role (`max-counters.ts`). In the post of a raid the boss
 * and tier are the raid's and the answer is public (the group sees it); elsewhere the boss is
 * named and the tier is the one it is a boss of now, and the answer is the member's alone, as
 * is every answer for a Pokébox. In servers and in a DM with the bot.
 */
export const counters: SimpleCommand = {
  data: new SlashCommandBuilder()
    .setName('counters')
    .setDescription(
      'The best counters against a raid boss, or a team for a max battle, from Pokebattler',
    )
    .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM)
    .addStringOption((option) =>
      option
        .setName('boss')
        .setDescription(
          'The boss; in the post of a raid or max battle, that battle’s when left out',
        )
        .setMaxLength(100)
        .setAutocomplete(true),
    )
    .addStringOption((option) =>
      option
        .setName('tier')
        .setDescription(
          'The tier; when left out, that of the raid or max battle whose post this is, else the boss’s now',
        )
        .addChoices(
          ...TIER_CHOICES.map((tier) => ({ name: raidTierLabel(tier), value: tierValue(tier) })),
          ...MAX_TIERS.map((tier) => ({ name: maxTierLabel(tier), value: tier })),
        ),
    )
    .addStringOption((option) =>
      option
        .setName('role')
        .setDescription(
          'For a max battle: your role as Pokebattler defines it; Attacker when left out',
        )
        .addChoices(
          MAX_ROLE_KEYS.map((role) => ({
            name: `${MAX_ROLES[role].name} (${MAX_ROLES[role].team})`,
            value: role,
          })),
        ),
    )
    .addStringOption((option) =>
      option
        .setName('level')
        .setDescription(
          'The level of the counters (a max team: 20 to 50), or your Pokébox; 40 when left out',
        )
        .addChoices(
          ...ATTACKER_LEVELS.map((level) => ({ name: ATTACKER_LEVEL_NAMES[level], value: level })),
          { name: 'My Pokébox on Pokebattler', value: POKEBOX },
        ),
    )
    .addStringOption((option) =>
      option
        .setName('weather')
        .setDescription('The weather; none when left out')
        .addChoices(WEATHERS.map((weather) => ({ name: WEATHER_NAMES[weather], value: weather }))),
    )
    .addStringOption((option) =>
      option
        .setName('friendship')
        .setDescription('Friendship with the others in the battle; best friends when left out')
        .addChoices(
          FRIENDSHIPS.map((friendship) => ({
            name: FRIENDSHIP_NAMES[friendship],
            value: friendship,
          })),
        ),
    )
    .addStringOption((option) =>
      option
        .setName('moveset')
        .setDescription('The boss’s moves; the average of all its movesets when left out')
        .setMaxLength(100)
        .setAutocomplete(true),
    )
    .addBooleanOption((option) =>
      option
        .setName('shadow')
        .setDescription('List shadow Pokémon as counters (a Pokébox lists them unless False)'),
    )
    .addBooleanOption((option) =>
      option
        .setName('mega')
        .setDescription('List megas as counters (a Pokébox lists them unless False)'),
    )
    .addBooleanOption((option) =>
      option
        .setName('single')
        .setDescription('Every moveset of a counter a line of its own, not only its best'),
    ),
  help: {
    category: 'util',
    details:
      'Shows the twelve best counters against a raid boss, as Pokebattler simulates the raid: the ' +
      'time to win, how often a counter faints, and how many trainers it takes, with a link ' +
      'to the full results.\n\nIn the post of a raid the boss and tier are that raid’s and ' +
      'everybody there sees the answer; elsewhere name the boss, and only you see it. A boss ' +
      'you name in the post of a raid is simulated in that raid’s tier unless you name ' +
      'another with `tier`.\n\nUnless you say otherwise, it assumes counters at level 40, no weather and best ' +
      'friends, and leaves out shadow Pokémon and megas.\n\n`level` can also be your own Pokébox ' +
      'on Pokebattler (save your user id in `/settings`); that answer is ' +
      'always for you alone. A Pokébox lists its shadow Pokémon and megas too, unless ' +
      '`shadow` or `mega` is False.\n\n"Change options…" under an answer opens a dialog with ' +
      'its attackers, weather, friendship, boss moves and what else to list: the member who ' +
      'asked changes the answer for everybody, anybody else gets an answer of their own. The ' +
      'options of an answer are kept for a day.\n\nWith a max battle tier, in the post of a max ' +
      `battle, or in the post of a ${TRAIN_KIND_WORDS.dynamax} (the boss at its Dynamax tier) or ` +
      `${TRAIN_KIND_WORDS.gigantamax}, it shows the team of three Pokebattler suggests for your ` +
      '`role` as Pokebattler defines it.\n\nThe role is Attacker (an attacker and two chargers) ' +
      'unless you name another: Defensive, Healer or Shielder. Each Pokémon comes with its ' +
      'moves and a few others that would do, at levels 20 to 50 in steps of five, with the ' +
      'weather and friendship you name.\n\nA link leads to Pokebattler’s Lobby, where it builds ' +
      'such teams; boss moves, shadow Pokémon, megas and a Pokébox do not apply there. A boss you name ' +
      'that is no raid boss now is taken in the max battle tier it is a boss of.',
    examples: [
      '/counters',
      '/counters boss:Mewtwo',
      '/counters boss:Rayquaza tier:T5 level:Level 50 weather:Windy',
      '/counters level:My Pokébox on Pokebattler',
      '/counters boss:Uxie tier:Dynamax 5★ role:Shielder (three shielders)',
    ],
  },
  guards: [requireCounterPlan],
  defer: (interaction, ctx) =>
    interaction.options.getString('level') !== POKEBOX && bossParty(interaction, ctx)
      ? 'public'
      : 'ephemeral',
  throttle: COUNTERS_THROTTLE,
  async execute(interaction, ctx) {
    const party = bossParty(interaction, ctx);
    const plan = await readPlan(interaction, ctx);
    const answered = await askPokebattler(ctx, plan);
    // The answer in a post is public; the party may have ended while Pokebattler was asked, and
    // anything sent or edited in its archived post would open it again: the answer is then the
    // member's alone, after the public "thinking…" is deleted (as the router does for an error).
    const postGone =
      interaction.ephemeral === false && (!party || ctx.parties.get(party.id) === undefined);
    const message = answeredMessage(ctx, answered, {
      guildId: serverOf(interaction),
      askerId: interaction.user.id,
      partyId: interaction.ephemeral === false && !postGone && party ? party.id : null,
    });
    if (postGone) {
      await interaction.deleteReply();
      await interaction.followUp({
        ...v2Answer(message),
        flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
      });
      return;
    }
    await interaction.editReply(v2Answer(message));
  },
  async autocomplete(interaction, ctx) {
    const focused = interaction.options.getFocused(true);
    const typed = String(focused.value);
    await interaction.respond(
      focused.name === 'boss'
        ? [
            ...unlistedMegaChoices(ctx, interaction.guildId, typed, zoneOf(interaction, ctx)),
            ...pokemonChoices(ctx, interaction.guildId, typed),
          ].slice(0, MAX_CHOICES)
        : focused.name === 'moveset' && !forMaxBattle(interaction, ctx)
          ? movesetChoices(ctx, bossWhileTyping(interaction, ctx), typed)
          : [],
    );
  },
};
