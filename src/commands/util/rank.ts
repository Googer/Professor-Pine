import {
  InteractionContextType,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type MessageComponentInteraction,
  type SlashCommandIntegerOption,
} from 'discord.js';
import type { AppContext } from '../../app-context.js';
import type { ComponentHandler, SimpleCommand } from '../../discord/command.js';
import { UserError } from '../../discord/errors.js';
import { requirePvpContext } from '../../discord/guards.js';
import { answerPress, pressAnswer, v2Answer } from '../../discord/late-reply.js';
import { refusedPart, type V2Message } from '../../discord/party-gateway.js';
import { STALE_COMPONENT } from '../../discord/router.js';
import { MEMBER_READ_THROTTLE } from '../../discord/throttle.js';
import type { Ivs } from '../../domain/pogo/cp.js';
import { LEAGUE_ICON } from '../../domain/pogo/game-icons.js';
import { PVP_MAX_LEVEL, type PokemonEntry } from '../../domain/pogo/game-master.js';
import { pokemonPicture } from '../../domain/pogo/pokemon-icons.js';
import {
  cappedRanks,
  pvpMultipliers,
  pvpRank,
  IV_FLOOR_NAMES,
  IV_FLOOR_VALUE,
  IV_FLOORS,
  LEAGUE_CP,
  LEAGUE_NAMES,
  LEAGUES,
  MAX_IV,
  type CappedRanks,
  type IvFloor,
  type League,
} from '../../domain/pvp/rank.js';
import { autoFloor, rankedAsShadow } from '../../domain/pvp/floors.js';
import {
  floorValue,
  ivText,
  RANK_KIND,
  RANK_PICK,
  RANK_SHOW,
  renderRank,
  type FamilyMember,
  type FloorShown,
  type RankState,
} from '../../render/pvp-rank.js';
import { namedPokemon, pokemonChoices, pokemonOption } from '../pokemon-option.js';
import { SpreadMemo } from './spread-memo.js';

const isLeague = (value: string): value is League => (LEAGUES as readonly string[]).includes(value);
const isFloor = (value: string): value is IvFloor =>
  (IV_FLOORS as readonly string[]).includes(value);

function ivOption(name: keyof Ivs) {
  return (option: SlashCommandIntegerOption): SlashCommandIntegerOption =>
    option
      .setName(name)
      .setDescription(`The ${name} IV, 0 to 15`)
      .setRequired(true)
      .setMinValue(0)
      .setMaxValue(MAX_IV);
}

/** The rankings made so far, for as long as the bot runs. */
const rankings = new SpreadMemo();

/**
 * The rank of these IVs up to level 50 alone: a member of a hidden family, for the menu (one
 * ranking instead of one per level cap).
 */
function levelFiftyRank(
  ctx: AppContext,
  entry: PokemonEntry,
  ivs: Ivs,
  league: League,
  floor: number,
): CappedRanks {
  const { catalogue } = ctx.gameData;
  const multipliers = pvpMultipliers(catalogue.cpMultipliers, PVP_MAX_LEVEL);
  const options = { leagueCp: LEAGUE_CP[league], floor, levelCap: 50 };
  const spreads = rankings.ranking(catalogue, entry)(options, multipliers);
  return { level50: pvpRank(entry.stats, multipliers, ivs, options, spreads) };
}

/** The ranks of these IVs for one Pokémon in the league asked for. */
function ranksOf(
  ctx: AppContext,
  entry: PokemonEntry,
  ivs: Ivs,
  league: League,
  floor: number,
): CappedRanks {
  const { catalogue } = ctx.gameData;
  return cappedRanks(
    entry.stats,
    catalogue.cpMultipliers,
    ivs,
    {
      leagueCp: LEAGUE_CP[league],
      floor,
      superMegaLevels: catalogue.superMegaLevels(entry),
    },
    rankings.ranking(catalogue, entry),
  );
}

/** The options of `/rank` and of its short forms, which have no `league`: theirs is fixed. */
function rankData(name: string, description: string, league: boolean): SlashCommandBuilder {
  const builder = new SlashCommandBuilder()
    .setName(name)
    .setDescription(description)
    .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM);
  builder
    .addStringOption(pokemonOption())
    .addIntegerOption(ivOption('attack'))
    .addIntegerOption(ivOption('defense'))
    .addIntegerOption(ivOption('stamina'));
  if (league) {
    builder.addStringOption((option) =>
      option
        .setName('league')
        .setDescription('The league; Great League when not given')
        .addChoices(LEAGUES.map((each) => ({ name: LEAGUE_NAMES[each], value: each }))),
    );
  }
  builder
    .addStringOption((option) =>
      option
        .setName('filter')
        .setDescription(
          'How you got it: a trade, raid or lucky trade sets the lowest IVs it can have',
        )
        .addChoices(
          IV_FLOORS.map((floor) => ({
            name:
              floor === 'none'
                ? IV_FLOOR_NAMES[floor]
                : `${IV_FLOOR_NAMES[floor]} (IVs ${String(IV_FLOOR_VALUE[floor])} and up)`,
            value: floor,
          })),
        ),
    )
    .addBooleanOption((option) =>
      option
        .setName('evolutions')
        .setDescription('Also rank its family (what it evolves from and into, megas too)'),
    )
    .addBooleanOption((option) =>
      option
        .setName('shadow')
        .setDescription('A shadow Pokémon: a shadow legendary’s IVs start at 6'),
    );
  return builder;
}

/**
 * The lowest IV a rank of `entry` uses and what the answer says of it: a picked filter as it is;
 * otherwise the one worked out from the Pokémon (`autoFloor`), or none when the IVs are below it
 * (the Pokémon came some other way: a purified one, an event).
 */
function floorOf(ctx: AppContext, entry: PokemonEntry, state: RankState): FloorShown {
  if (state.floor !== 'auto') return { kind: 'picked', filter: state.floor };
  const worked = autoFloor(ctx.gameData.catalogue, entry, state.shadow);
  const { ivs } = state;
  if (worked.floor > 0 && Math.min(ivs.attack, ivs.defense, ivs.stamina) < worked.floor) {
    return { kind: 'fallback', assumed: worked.floor };
  }
  return { kind: 'auto', floor: worked.floor, reason: worked.reason };
}

/**
 * The answer of `/rank` for one Pokémon as `state` says: a use of the command and a press on the
 * controls of an answer rank with this, so they say the same. Refuses with a sentence what cannot
 * be ranked. `guildId` is where the leagues' emoji are looked for; `withIcons` false leaves them
 * out (Discord refused one: `sendRank`).
 */
function rankAnswer(
  ctx: AppContext,
  entry: PokemonEntry,
  state: RankState,
  guildId: string | null,
  withIcons = true,
): V2Message {
  const { catalogue } = ctx.gameData;
  if (catalogue.cpMultipliers.length < PVP_MAX_LEVEL) {
    throw new UserError(
      `The game data I have does not reach level ${String(PVP_MAX_LEVEL)}, so I cannot rank ` +
        'IVs just now.',
    );
  }
  const { ivs, league, floor } = state;
  if (floor !== 'auto' && Math.min(ivs.attack, ivs.defense, ivs.stamina) < IV_FLOOR_VALUE[floor]) {
    throw new UserError(
      `With the filter "${IV_FLOOR_NAMES[floor]}" every IV is ${String(IV_FLOOR_VALUE[floor])} ` +
        `or more, and ${ivText(ivs)} has one below that.`,
    );
  }
  const shown = floorOf(ctx, entry, state);
  const members: FamilyMember[] = catalogue.evolutionLine(entry).map((member) => {
    const own = floorValue(floorOf(ctx, member, state));
    return {
      entry: member,
      ranks: state.evolutions
        ? ranksOf(ctx, member, ivs, league, own)
        : levelFiftyRank(ctx, member, ivs, league, own),
      asShadow: rankedAsShadow(member, state.shadow),
      ...(state.evolutions ? { picture: pokemonPicture(undefined, member, ctx.gameData) } : {}),
    };
  });
  const leagueIcons = withIcons
    ? Object.fromEntries(
        LEAGUES.flatMap((each) => {
          const icon = ctx.emoji.find(LEAGUE_ICON[each], guildId);
          return icon === undefined ? [] : [[each, icon]];
        }),
      )
    : {};
  return renderRank({
    entry,
    ivs,
    league,
    filter: floor,
    shadow: state.shadow,
    asShadow: rankedAsShadow(entry, state.shadow),
    floor: shown,
    ranks:
      (state.evolutions
        ? members.find((member) => member.entry.key === entry.key)?.ranks
        : undefined) ?? ranksOf(ctx, entry, ivs, league, floorValue(shown)),
    family: {
      members,
      shown: state.evolutions,
      marked: catalogue.familyMember(entry).key,
    },
    picture: pokemonPicture(undefined, entry, ctx.gameData),
    sameDex: catalogue.byDex(entry.dex),
    leagueIcons,
  });
}

/**
 * Sends an answer of `/rank` with `send`, made by `answer`: with the leagues' emoji, and when
 * Discord refuses the message for an emoji (one deleted since the application's emoji were read),
 * once more in words, the emoji read anew (`EmojiFinder.refused`).
 */
async function sendRank(
  ctx: AppContext,
  answer: (withIcons: boolean) => V2Message,
  send: (message: V2Message) => Promise<void>,
): Promise<void> {
  try {
    await send(answer(true));
  } catch (err) {
    if (refusedPart(err) !== 'emoji') throw err;
    ctx.emoji.refused?.();
    ctx.log.warn({ err }, 'Discord refused an emoji of an answer of /rank; it is sent in words');
    await send(answer(false));
  }
}

/**
 * Answers a use of `/rank` or of one of its short forms: in `league` when that is fixed,
 * otherwise in the league the member picked (Great League when none). The answer is public.
 */
async function answerRank(
  interaction: ChatInputCommandInteraction,
  ctx: AppContext,
  league?: League,
): Promise<void> {
  const entry = namedPokemon(ctx, interaction.options.getString('pokemon', true));
  const ivs: Ivs = {
    attack: interaction.options.getInteger('attack', true),
    defense: interaction.options.getInteger('defense', true),
    stamina: interaction.options.getInteger('stamina', true),
  };
  if (Object.values(ivs).some((iv) => iv < 0 || iv > MAX_IV)) {
    throw new UserError('An IV is a number from 0 to 15.');
  }
  const leagueValue = league ?? interaction.options.getString('league') ?? 'great';
  const filter = interaction.options.getString('filter') ?? 'auto';
  if (!isLeague(leagueValue) || (filter !== 'auto' && !isFloor(filter))) {
    throw new UserError('Pick the league and the filter from their lists.');
  }
  const shadow = interaction.options.getBoolean('shadow') ?? false;
  // Only the command refuses: a press ranks a member that cannot be a shadow as it is.
  if (shadow && !rankedAsShadow(entry, true)) {
    throw new UserError(`${entry.name} has no shadow form in the game.`);
  }
  const state: RankState = {
    league: leagueValue,
    ivs,
    floor: filter,
    evolutions: interaction.options.getBoolean('evolutions') ?? false,
    shadow,
  };
  await sendRank(
    ctx,
    (withIcons) => rankAnswer(ctx, entry, state, interaction.guildId, withIcons),
    (message) => interaction.reply(v2Answer(message)).then(() => undefined),
  );
}

/** An IV of a custom id: `0` to `15`. */
function ivOf(text: string | undefined): number | undefined {
  if (text === undefined || !/^\d{1,2}$/.test(text)) return undefined;
  const iv = Number(text);
  return iv <= MAX_IV ? iv : undefined;
}

/**
 * What the custom id of a control under an answer says (`rankButtonId`, `rankPickId`), or
 * undefined. An id of the form before the shadow (2026-10-29: no shadow part) reads as no shadow,
 * its filter as picked (`none` is None), so a press on an old answer ranks as it showed.
 */
function stateOf(args: readonly string[]): RankState | undefined {
  const [league, ivPart, floor, evolutions, shadow, ...rest] = args;
  const [attack, defense, stamina] = (ivPart ?? '').split('-').map((part) => ivOf(part));
  if (
    rest.length > 0 ||
    league === undefined ||
    !isLeague(league) ||
    floor === undefined ||
    (floor !== 'auto' && !isFloor(floor)) ||
    (evolutions !== '0' && evolutions !== '1') ||
    (shadow !== undefined && shadow !== '0' && shadow !== '1') ||
    attack === undefined ||
    defense === undefined ||
    stamina === undefined ||
    (ivPart ?? '').split('-').length !== 3
  ) {
    return undefined;
  }
  return {
    league,
    ivs: { attack, defense, stamina },
    floor,
    evolutions: evolutions === '1',
    shadow: shadow === '1',
  };
}

/** Answers a press on an answer's control for `entry` as `state` says. */
async function answerControl(
  interaction: MessageComponentInteraction,
  ctx: AppContext,
  entry: PokemonEntry,
  state: RankState,
): Promise<void> {
  const how = pressAnswer(interaction);
  await sendRank(
    ctx,
    (withIcons) => rankAnswer(ctx, entry, state, interaction.guildId, withIcons),
    (message) => answerPress(interaction, how, message),
  );
}

/**
 * The controls under an answer of `/rank` (plan 8B-2, 2026-10-23): another league, the family
 * shown or hidden (buttons), another member of the family (the menu). Everything is in the custom
 * id (`rankButtonId`, `rankPickId`), nothing is kept: a press reads the Pokémon from the game data
 * anew and ranks as the command does. The member who asked changes the answer for everybody;
 * anybody else gets a private copy (`pressAnswer`). No guard of `requirePvpContext`: the answer
 * stands where the command was allowed. The throttle is the same limit as /rank
 * (MEMBER_READ_THROTTLE), counted in a window of its own.
 */
export const rankControls: ComponentHandler = {
  kind: RANK_KIND,
  throttle: MEMBER_READ_THROTTLE,
  async button(interaction, id, ctx) {
    const state = id.action === RANK_SHOW ? stateOf(id.args) : undefined;
    if (!state) throw new UserError(STALE_COMPONENT);
    const entry = ctx.gameData.catalogue.byKey(id.id);
    if (!entry) {
      throw new UserError('I no longer know that Pokémon. Use `/rank` again.');
    }
    await answerControl(interaction, ctx, entry, state);
  },
  async select(interaction, id, ctx) {
    const state = id.action === RANK_PICK ? stateOf(id.args) : undefined;
    if (!state) throw new UserError(STALE_COMPONENT);
    const { catalogue } = ctx.gameData;
    const shown = catalogue.byKey(id.id);
    if (!shown) {
      throw new UserError('I no longer know that Pokémon. Use `/rank` again.');
    }
    // One value, a member of the family of the Pokémon shown: anything else is no menu of ours.
    const [value, ...more] = interaction.values;
    const picked = catalogue
      .evolutionLine(shown)
      .find((member) => value !== undefined && member.key === value);
    if (!picked || more.length > 0) throw new UserError(STALE_COMPONENT);
    await answerControl(interaction, ctx, picked, state);
  },
};

async function pokemonAutocomplete(
  interaction: Parameters<NonNullable<SimpleCommand['autocomplete']>>[0],
  ctx: AppContext,
): Promise<void> {
  const focused = interaction.options.getFocused(true);
  await interaction.respond(
    focused.name === 'pokemon' ? pokemonChoices(ctx, String(focused.value)) : [],
  );
}

/** What `/help` says of `/rank`, and below the line that names a short form of it. */
function rankDetails(): string {
  return (
    'Shows where a Pokémon with these IVs stands among all 4,096 combinations in a league: ' +
    'its rank by stat product, how close it comes to the best, the CP and level it can ' +
    'reach, and the best combination. Up to level 50, and up to 51 (a best buddy) where that ' +
    'differs; a Super Mega also up to the levels it adds.\n\nIts family and a link to each ' +
    'ranking on pvpivs.com come with it. `filter` ranks only the combinations a trade, a ' +
    'raid or a lucky trade can give; without it, a legendary or mythical Pokémon that cannot ' +
    'be traded starts at IVs of 10, and a shadow legendary (`shadow`) at 6.\n\n' +
    "Use it in a channel under the server's PvP category, or in a DM with me."
  );
}

/**
 * `/rank` (spec 4.2, the legacy `!rank`, `!great`, `!ultra`, `!master`, `!little` and their
 * `-evo` forms): where a Pokémon with these IVs stands among all combinations in a league of
 * Go Battle League, up to level 50 and, where that differs, 51. Used under the PvP category or
 * in a DM with the bot; the answer is public there, as the legacy bot's was.
 */
export const rank: SimpleCommand = {
  data: rankData('rank', 'The PvP rank of a Pokémon with these IVs in a league', true),
  help: {
    category: 'util',
    details: () =>
      `${rankDetails()}\n\n\`/little\`, \`/great\`, \`/ultra\` and \`/master\` are ` +
      '`/rank` in that league.',
    examples: [
      '/rank pokemon:Medicham attack:0 defense:15 stamina:15',
      '/rank pokemon:Mewtwo attack:10 defense:12 stamina:13 league:master filter:raid',
      '/rank pokemon:Ralts attack:1 defense:14 stamina:15 evolutions:True',
    ],
  },
  guards: [requirePvpContext],
  throttle: MEMBER_READ_THROTTLE,
  execute: (interaction, ctx) => answerRank(interaction, ctx),
  autocomplete: pokemonAutocomplete,
};

/**
 * `/little`, `/great`, `/ultra`, `/master`: `/rank` in that league (the legacy bot had them as
 * commands of their own). Their uses count as uses of `/rank`.
 */
function leagueRank(league: League): SimpleCommand {
  return {
    data: rankData(
      league,
      `The PvP rank of a Pokémon with these IVs in the ${LEAGUE_NAMES[league]}`,
      false,
    ),
    help: {
      category: 'util',
      details: () =>
        `\`/${league}\` is \`/rank\` in the ${LEAGUE_NAMES[league]}.\n\n${rankDetails()}`,
      examples: [`/${league} pokemon:Medicham attack:0 defense:15 stamina:15`],
    },
    formOf: 'rank',
    guards: [requirePvpContext],
    throttle: MEMBER_READ_THROTTLE,
    execute: (interaction, ctx) => answerRank(interaction, ctx, league),
    autocomplete: pokemonAutocomplete,
  };
}

export const leagueRanks: readonly SimpleCommand[] = LEAGUES.map(leagueRank);
