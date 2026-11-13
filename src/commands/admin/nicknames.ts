import {
  MessageFlags,
  SlashCommandSubcommandBuilder,
  type AutocompleteInteraction,
} from 'discord.js';
import type { AppContext } from '../../app-context.js';
import type { SubcommandPart } from '../../discord/command-group.js';
import { UserError } from '../../discord/errors.js';
import { guildIdOf } from '../../discord/guards.js';
import { zoneOf } from '../../discord/server-values.js';
import type { PokemonEntry } from '../../domain/pogo/game-master.js';
import {
  NICKNAME_MAX,
  NICKNAME_MIN,
  tidyNickname,
  type NicknameProblem,
} from '../../domain/pogo/nickname-rules.js';
import { searchTokens } from '../../domain/search/text.js';
import { count, fitItems, fitMessages, plain, truncate } from '../../render/text.js';
import type { NicknameAdded } from '../../services/pokemon-search-service.js';
import { byName, CHOICE_NAME, MAX_CHOICES, type Choice } from '../choices.js';
import { pokemonChoices, pokemonOption } from '../pokemon-option.js';
import { chosenPokemon } from '../operator/boss-input.js';

/** The subcommand group of `/admin` the nicknames live under. */
export const NICKNAME_GROUP = 'nickname';
export const NICKNAME_DESCRIPTION = 'The nicknames members can find Pokémon by';

const PROBLEMS: Readonly<Record<NicknameProblem, string>> = {
  length: `A nickname has ${String(NICKNAME_MIN)} to ${String(NICKNAME_MAX)} characters.`,
  characters: 'A nickname has letters, digits, spaces and hyphens only.',
  'no-letter': 'A nickname needs a letter: digits alone are read as a Pokédex number.',
  reserved:
    'A nickname cannot be or have a word that the Pokémon options read as something else: a ' +
    'tier, `shadow`, `mega`, an egg, an IV target, `none`; nor begin with a tier (`3`, `t5`).',
};

/** The characters the legacy column holds for all nicknames of one Pokémon. */
const MAX_STORED = 255;

/** A nickname in a sentence. */
const shown = (nickname: string): string => `**${plain(nickname)}**`;

/** The Pokémon the `pokemon` option names; one the game data does not know has no nicknames. */
function chosenEntry(ctx: AppContext, serverId: string, value: string, zone: string): PokemonEntry {
  const { entry, label } = chosenPokemon(ctx, serverId, value, zone);
  if (!entry) throw new UserError(`${label} is not in the game data, so it has no nicknames yet.`);
  return entry;
}

/** The nicknames of a Pokémon, the server's staff's and the bot's own, on one line. */
function nicknamesLine(ctx: AppContext, serverId: string, entry: PokemonEntry): string {
  const stored = ctx.nicknames.stored(serverId).get(entry.key) ?? [];
  const curated = ctx.nicknames.curated(entry.key);
  const own =
    stored.length === 0 ? 'none added' : stored.map((nickname) => plain(nickname)).join(', ');
  const builtIn =
    curated.length === 0
      ? ''
      : ` (and the bot's own: ${curated.map((one) => plain(one)).join(', ')})`;
  return `${plain(entry.name)}: ${own}${builtIn}`;
}

/**
 * The choices of the `pokemon` option: with nothing typed, the Pokémon that have nicknames the
 * server's staff added; with text, what the server's search finds (a guess only where its name
 * shows the guessed word). Either starts the read of a server not read yet (`stored` as the
 * search), so that the next list has its nicknames.
 */
function nicknamePokemonChoices(ctx: AppContext, serverId: string, typed: string): Choice[] {
  const catalogue = ctx.gameData.catalogue;
  let choices: Choice[];
  if (searchTokens(typed).length === 0) {
    choices = [...ctx.nicknames.stored(serverId).keys()]
      .flatMap((key) => {
        const entry = catalogue.byKey(key);
        return entry ? [{ name: entry.name, value: entry.key }] : [];
      })
      .sort((a, b) => byName(a.name, b.name));
  } else {
    choices = pokemonChoices(ctx, serverId, typed);
  }
  return choices
    .slice(0, MAX_CHOICES)
    .map((choice) => ({ ...choice, name: truncate(choice.name, CHOICE_NAME) }));
}

async function respondWithPokemon(
  interaction: AutocompleteInteraction,
  ctx: AppContext,
): Promise<void> {
  const focused = interaction.options.getFocused(true);
  const serverId = interaction.guildId;
  if (serverId === null) {
    await interaction.respond([]);
    return;
  }
  if (focused.name === 'pokemon') {
    await interaction.respond(nicknamePokemonChoices(ctx, serverId, String(focused.value)));
    return;
  }
  if (focused.name !== 'nickname') {
    await interaction.respond([]);
    return;
  }
  // The stored nicknames of the Pokémon picked so far; none while it names no Pokémon.
  const picked = interaction.options.getString('pokemon') ?? '';
  const entry =
    ctx.gameData.catalogue.byKey(picked.trim()) ?? ctx.pokemon.of(serverId).exact(picked);
  const typed = String(focused.value).trim().toLowerCase();
  const stored = entry ? (ctx.nicknames.stored(serverId).get(entry.key) ?? []) : [];
  await interaction.respond(
    stored
      // Discord refuses the whole list for a value over 100 characters, which a legacy row may
      // hold: such a nickname is left out (the option takes no more than 100 either).
      .filter((nickname) => nickname.length <= 100 && nickname.includes(typed))
      .slice(0, MAX_CHOICES)
      .map((nickname) => ({ name: truncate(nickname, CHOICE_NAME), value: nickname })),
  );
}

/** What `add` says of what came of it. */
export function addedText(entry: PokemonEntry, added: NicknameAdded): string {
  const name = plain(entry.name);
  switch (added.kind) {
    case 'added':
      return (
        `Members find ${name} by ${shown(added.nickname)} now. Its nicknames: ` +
        `${added.nicknames.map((one) => plain(one)).join(', ')}.`
      );
    case 'refused':
      return PROBLEMS[added.problem];
    case 'taken':
      return `${shown(added.nickname)} already finds ${fitItems(
        added.by.map((one) => plain(one.name)),
        300,
      )}. A nickname must name one Pokémon only: pick another.`;
    case 'already':
      return `${shown(added.nickname)} finds ${name} already.`;
    case 'full':
      return (
        `${name} has as many nicknames as the stored list holds (${String(MAX_STORED)} ` +
        `characters with their commas), so ${shown(added.nickname)} ` +
        'does not fit. Remove one first with `/admin nickname remove`.'
      );
  }
}

/** `/admin nickname add`. */
export const addNickname: SubcommandPart = {
  group: NICKNAME_GROUP,
  data: new SlashCommandSubcommandBuilder()
    .setName('add')
    .setDescription('Let members find a Pokémon by another name')
    .addStringOption(pokemonOption('The Pokémon'))
    .addStringOption((option) =>
      option
        .setName('nickname')
        .setDescription('The nickname')
        .setRequired(true)
        .setMinLength(NICKNAME_MIN)
        .setMaxLength(NICKNAME_MAX),
    ),
  help: {
    details:
      'The nickname works wherever members type a Pokémon (`/raid`, `/want`, `/wild`, …) from ' +
      `then on. It has ${String(NICKNAME_MIN)} to ${String(NICKNAME_MAX)} letters, digits, ` +
      'spaces or hyphens, and must not be the name or a nickname of another Pokémon.',
    examples: ['/admin nickname add pokemon:Dratini nickname:danger noodle'],
  },
  // The server's own (plan 19B-4): for its staff, by `/admin`'s guard.
  defer: 'ephemeral',
  async execute(interaction, ctx) {
    const serverId = guildIdOf(interaction);
    const entry = chosenEntry(
      ctx,
      serverId,
      interaction.options.getString('pokemon', true),
      zoneOf(interaction, ctx),
    );
    const added = await ctx.nicknames.add(
      serverId,
      entry,
      interaction.options.getString('nickname', true),
    );
    ctx.log.info(
      { by: interaction.user.id, server: serverId, pokemon: entry.key, outcome: added.kind },
      'a Pokémon nickname was asked for',
    );
    if (added.kind !== 'added') throw new UserError(addedText(entry, added));
    await interaction.editReply({ content: addedText(entry, added) });
  },
  autocomplete: respondWithPokemon,
};

/** `/admin nickname remove`. */
export const removeNickname: SubcommandPart = {
  group: NICKNAME_GROUP,
  data: new SlashCommandSubcommandBuilder()
    .setName('remove')
    .setDescription('Take back a nickname staff added for a Pokémon')
    .addStringOption(pokemonOption('The Pokémon'))
    .addStringOption((option) =>
      option
        .setName('nickname')
        .setDescription('The nickname')
        .setRequired(true)
        .setMaxLength(100)
        .setAutocomplete(true),
    ),
  help: {
    details:
      'Only nicknames staff added can be removed; my own always stay. Pick the Pokémon ' +
      'first: the list then offers its nicknames.',
    examples: ['/admin nickname remove pokemon:Dratini nickname:danger noodle'],
  },
  // The server's own (plan 19B-4): for its staff, by `/admin`'s guard.
  defer: 'ephemeral',
  async execute(interaction, ctx) {
    const serverId = guildIdOf(interaction);
    const entry = chosenEntry(
      ctx,
      serverId,
      interaction.options.getString('pokemon', true),
      zoneOf(interaction, ctx),
    );
    // As it is stored and compared: what was typed, tidied.
    const nickname = tidyNickname(interaction.options.getString('nickname', true));
    const removed = await ctx.nicknames.remove(serverId, entry, nickname);
    if (!removed) {
      const builtIn = ctx.nicknames.curated(entry.key).includes(nickname);
      throw new UserError(
        builtIn
          ? `${shown(nickname)} is one of the bot's own nicknames of ${plain(entry.name)}, and ` +
              "the bot's own (see `/admin nickname list`) cannot be removed."
          : `${plain(entry.name)} has no nickname ${shown(nickname)}. ` +
              nicknamesLine(ctx, serverId, entry),
      );
    }
    ctx.log.info(
      { by: interaction.user.id, server: serverId, pokemon: entry.key },
      'a Pokémon nickname was removed',
    );
    await interaction.editReply({
      content:
        `Members no longer find ${plain(entry.name)} by ${shown(nickname)}. ` +
        nicknamesLine(ctx, serverId, entry),
    });
  },
  autocomplete: respondWithPokemon,
};

/** `/admin nickname list`. */
export const listNicknames: SubcommandPart = {
  group: NICKNAME_GROUP,
  data: new SlashCommandSubcommandBuilder()
    .setName('list')
    .setDescription('Show the nicknames staff added, or every nickname of one Pokémon')
    .addStringOption((option) =>
      option
        .setName('pokemon')
        .setDescription("Only this Pokémon, with the bot's own nicknames too")
        .setMaxLength(100)
        .setAutocomplete(true),
    ),
  help: {
    details:
      'Without a Pokémon: every Pokémon with nicknames staff added. With one: its nicknames, ' +
      "staff's and my own.",
    examples: ['/admin nickname list', '/admin nickname list pokemon:Dratini'],
  },
  defer: 'ephemeral',
  async execute(interaction, ctx) {
    const serverId = guildIdOf(interaction);
    // The server's own, read first where they were not yet (a server that joined since the start).
    const own = await ctx.nicknames.readStored(serverId);
    const value = interaction.options.getString('pokemon');
    if (value !== null) {
      const entry = chosenEntry(ctx, serverId, value, zoneOf(interaction, ctx));
      await interaction.editReply({ content: nicknamesLine(ctx, serverId, entry) });
      return;
    }
    const catalogue = ctx.gameData.catalogue;
    const lines = [...own]
      .flatMap(([key, nicknames]) => {
        const entry = catalogue.byKey(key);
        return entry && nicknames.length > 0
          ? [
              {
                name: entry.name,
                text: `- ${plain(entry.name)}: ${nicknames.map((one) => plain(one)).join(', ')}`,
              },
            ]
          : [];
      })
      .sort((a, b) => byName(a.name, b.name))
      .map((line) => line.text);
    const [first = '', ...rest] = fitMessages(
      lines.length === 0
        ? ['Staff have added no nicknames. `/admin nickname add` adds one.']
        : [`**Nicknames staff added** (${count(lines.length, 'Pokémon', 'Pokémon')})`, ...lines],
    );
    await interaction.editReply({ content: first });
    for (const more of rest) {
      await interaction.followUp({ content: more, flags: MessageFlags.Ephemeral });
    }
  },
  autocomplete: respondWithPokemon,
};

export const nicknameParts: readonly SubcommandPart[] = [
  addNickname,
  removeNickname,
  listNicknames,
];
