import { SlashCommandBuilder } from 'discord.js';
import type { AppContext } from '../../app-context.js';
import type { Guard, SimpleCommand } from '../../discord/command.js';
import { MAX_PLACE_TEXT, namedPlace, nearChoices, orList } from '../place-option.js';
import { UserError } from '../../discord/errors.js';
import { guildIdOf, isStaff, regionChannelOf, requireGuild } from '../../discord/guards.js';
import { memberInfo } from '../../discord/member-info.js';
import type { Throttle } from '../../discord/throttle.js';
import type { PokemonCatalogue } from '../../domain/pogo/catalogue.js';
import type { PokemonEntry } from '../../domain/pogo/game-master.js';
import { appearsInWild, wildExceptions, type WildExceptions } from '../../domain/pogo/wild.js';
import { searchTokens } from '../../domain/search/text.js';
import { SPAWN_MINUTES } from '../../render/spawn.js';
import { count, plain, truncate } from '../../render/text.js';
import { CHOICE_NAME, MAX_CHOICES, type Choice } from '../choices.js';
import { answer } from '../../discord/late-reply.js';
import { blockedAtPin } from '../max/max-report.js';
import { DISCORD_SPAWN_NAMES, reportSpawnAs } from './spawn-report.js';

/** Where `/wild` works, said wherever it does not. */
export const WILD_FROM_A_REGION =
  'Report a wild Pokémon from the channel of a region, its forum or a post there.';

/** The name `/wild` is used and counted under, and the map's reports with it (plan 8M-4S). */
export const WILD_COMMAND = 'wild';

/** What reading a report's Pokémon needs: the game data, the settings and the Pokémon search. */
export type WildReading = Pick<AppContext, 'gameData' | 'config' | 'log' | 'pokemon'>;

/**
 * Five reports in half an hour (Matt, 2026-10-13): the legacy bot allowed 15 in a quarter of an
 * hour, which let one member send every wanter of a Pokémon that many direct messages. From
 * Discord and from the live map together.
 */
export const WILD_THROTTLE: Throttle = { uses: 5, perSeconds: 1800 };

/** As much as a member may say about where it is. */
export const MAX_DETAILS = 200;

/** Said for details that are only blanks: a report that does not say where is of no use. */
export const SAY_WHERE = 'Say in `details` where the Pokémon is: a street corner, a park, a gym.';

/** The limit in words, for the help: `five reports in half an hour`. */
function limitWords(throttle: Throttle): string {
  const minutes = throttle.perSeconds / 60;
  const span = minutes === 30 ? 'half an hour' : count(minutes, 'minute', 'minutes');
  return `${count(throttle.uses, 'report', 'reports')} in ${span}`;
}

const IV_CHOICES = [
  { name: 'Perfect (100%)', value: 'perfect' },
  { name: 'Zero (0%)', value: 'zero' },
] as const;

/** As many Pokémon as a refusal suggests. */
const SUGGESTIONS = 5;

/** The settings' list read against a catalogue, kept while both are in use. */
const readExceptions = new WeakMap<PokemonCatalogue, WeakMap<readonly string[], WildExceptions>>();
/** What was said to be unknown already: each text is logged once in a run. */
const reportedUnknown = new Set<string>();
/**
 * The names of the exceptions as the game data has them, by the list of the settings they were
 * read from (its texts, joined): what the help says. The help is given the settings only, so
 * it takes the names from the last reading, which the start of the bot makes.
 */
const knownNames = new Map<string, readonly string[]>();

const listKey = (listed: readonly string[]): string => JSON.stringify(listed);

/**
 * The species that can be reported although they have a class: the settings'
 * `wildSpawnExceptions` read against the game data in use (`wildExceptions`). It is read when
 * the bot starts (`src/app.ts`), which is where a text the game data does not know is logged,
 * once, as a warning, and ignored; and again for a catalogue that was not read yet (the game
 * data is refreshed while the bot runs).
 */
export function wildExceptionsOf(
  ctx: Pick<AppContext, 'gameData' | 'config' | 'log'>,
): WildExceptions {
  const { catalogue } = ctx.gameData;
  const listed = ctx.config.settings.wildSpawnExceptions;
  let byList = readExceptions.get(catalogue);
  if (!byList) readExceptions.set(catalogue, (byList = new WeakMap()));
  let read = byList.get(listed);
  if (!read) {
    read = wildExceptions(catalogue, listed);
    byList.set(listed, read);
    knownNames.set(listKey(listed), read.names);
    for (const text of read.unknown) {
      if (reportedUnknown.has(text)) continue;
      reportedUnknown.add(text);
      ctx.log.warn(
        { setting: 'wildSpawnExceptions', text },
        'the settings name a Pokémon the game data does not know; it is ignored',
      );
    }
  }
  return read;
}

/** Whether an entry can be reported in this bot: `appearsInWild` with the settings' exceptions. */
function wildIn(
  ctx: Pick<AppContext, 'gameData' | 'config' | 'log'>,
): (entry: PokemonEntry) => boolean {
  const { species } = wildExceptionsOf(ctx);
  return (entry) => appearsInWild(entry, species);
}

/**
 * Why a Pokémon cannot be reported: it is never met in the wild (`appearsInWild`: a mega or a
 * primal, and a legendary, a mythical Pokémon or an ultra beast that the settings do not
 * except).
 */
function notWild(entry: PokemonEntry): string {
  if (entry.kind !== 'mega') return `**${plain(entry.name)}** does not appear in the wild.`;
  const what = entry.tempEvolution === 'PRIMAL' ? 'a primal' : 'a mega';
  return `**${plain(entry.name)}** is ${what}: those are met in raids, not in the wild.`;
}

/**
 * What the help says of the exceptions: the species the game data knew among those the
 * settings name, by their names. Before anything read them (not in the running bot, which
 * reads them at its start) it does not guess at names.
 */
function exceptionsClause(listed: readonly string[]): string {
  const names = knownNames.get(listKey(listed));
  if (names === undefined) return listed.length === 0 ? '' : ', with few exceptions';
  return names.length === 0 ? '' : `, except ${andList(names.map((name) => plain(name)))}`;
}

/** "A, B and C". */
function andList(names: readonly string[]): string {
  const rest = [...names];
  const last = rest.pop() ?? '';
  return rest.length === 0 ? last : `${rest.join(', ')} and ${last}`;
}

/**
 * The Pokémon the `pokemon` option names: a choice of the list (the key of its entry), or text
 * that names one entry outright (`ctx.pokemon.exact`). Any Pokémon that appears in the wild can
 * be reported, a form as that form; one that does not is refused with a sentence, picked or
 * typed. Text that names nothing outright is never guessed at: what it may have meant is only
 * suggested. One letter is too little to act on, as for `/raid`: it names a form of Unown.
 */
export function wildPokemon(ctx: WildReading, value: string): PokemonEntry {
  const text = value.trim();
  const wild = wildIn(ctx);
  const picked = /^[a-z0-9_]+$/i.test(text)
    ? ctx.gameData.catalogue.byKey(text.toLowerCase())
    : undefined;
  const tooShort = searchTokens(text).join('').length < 2;
  const entry = picked ?? (tooShort ? undefined : ctx.pokemon.exact(text));
  if (entry && !wild(entry)) throw new UserError(notWild(entry));
  if (entry) return entry;
  const names = tooShort
    ? []
    : ctx.pokemon
        .search(text, { filter: wild, limit: SUGGESTIONS, plain: true })
        .map((found) => plain(found.name));
  throw new UserError(
    `I do not know "${plain(truncate(text, 80))}" as a Pokémon. ` +
      (names.length === 0 ? '' : `Did you mean ${orList(names)}? `) +
      'Pick one from the list that appears while you type.',
  );
}

/**
 * A report's Pokémon and details as `/wild` and the live map read them, before anything is
 * posted or counted: the Pokémon (`wildPokemon`), then the details, which must say something
 * (`SAY_WHERE`; trimmed, cut to `MAX_DETAILS`). A refusal is thrown as a `UserError`.
 */
export function readSpawn(
  ctx: WildReading,
  pokemon: string,
  details: string | null,
): { entry: PokemonEntry; details: string } {
  const entry = wildPokemon(ctx, pokemon);
  const said = (details ?? '').trim();
  if (said === '') throw new UserError(SAY_WHERE);
  return { entry, details: truncate(said, MAX_DETAILS) };
}

/**
 * The choices for the `pokemon` option: what the search finds of what appears in the wild.
 * Nothing when the text names outright a Pokémon that does not: near misses of `Mewtwo` are
 * not what its typist meant, and sending it says why it is refused. In the order of the search
 * without its preference for legendaries (`plain`), here and in the suggestions of a refusal:
 * of those only the exceptions of the settings are left, and they are not what is likelier met.
 */
export function wildChoices(ctx: WildReading, typed: string): Choice[] {
  if (typed.trim() === '') return [];
  const wild = wildIn(ctx);
  const named = ctx.pokemon.exact(typed);
  if (named && !wild(named)) return [];
  return ctx.pokemon
    .search(typed, { filter: wild, limit: MAX_CHOICES, plain: true })
    .map((entry) => ({ name: truncate(entry.name, CHOICE_NAME), value: entry.key }));
}

/**
 * What `/wild` says to a member blocked from meetups who names a pin (plan 8Z, `blockedAtPin`):
 * a known place is still theirs to report at, and nobody else's pin is checked.
 */
export const WILD_PIN_BLOCKED =
  'You are blocked from making meetups in this server, so you cannot report a wild Pokémon at a ' +
  'pin. Pick a place from the list, or leave `near` out. To appeal the block, use `/meetup` and ' +
  'press "Appeal…".';

/**
 * What can be known before anything is posted is refused here, so that a use that came to
 * nothing does not count against the limit: the place, the Pokémon, details that say nothing,
 * a `near` that names no place of the server's regions, and a pin of a member blocked from
 * meetups.
 */
const requireSpawnReport: Guard = async (interaction, ctx) => {
  if (regionChannelOf(interaction, ctx) === undefined) throw new UserError(WILD_FROM_A_REGION);
  if (interaction.isChatInputCommand()) {
    // `details` is not asked for as required: a client with the definition from before the
    // option was required may send none, and that use is answered with the sentence like any
    // other.
    readSpawn(
      ctx,
      interaction.options.getString('pokemon', true),
      interaction.options.getString('details'),
    );
    const place = await namedPlace(interaction, ctx, interaction.options.getString('near'));
    if (
      place !== undefined &&
      (await blockedAtPin(
        ctx,
        guildIdOf(interaction),
        interaction.user.id,
        isStaff(interaction, ctx),
        place,
      ))
    ) {
      throw new UserError(WILD_PIN_BLOCKED);
    }
  }
};

/**
 * `/wild` (spec 4.2, there still `/spawn`; the legacy `!spawn`, `!wild`): reports a wild
 * Pokémon in the region the command is used in. The report is a public message in the region's
 * text channel, also when the command is used in the region's forum or a post there, which is
 * deleted after half an hour; who wants that Pokémon is told by direct message where
 * notifications are on. `details` is required (Matt, 2026-10-13): while it was optional, text
 * typed after the Pokémon without selecting the option was dropped by the client, and a report
 * said nothing of where.
 */
export const wildCommand: SimpleCommand = {
  data: new SlashCommandBuilder()
    .setName(WILD_COMMAND)
    .setDescription('Report a wild Pokémon in this region')
    .addStringOption((option) =>
      option
        .setName('pokemon')
        .setDescription('The Pokémon: pick from the list that appears while you type')
        .setRequired(true)
        .setMaxLength(100)
        .setAutocomplete(true),
    )
    .addStringOption((option) =>
      option
        .setName('details')
        .setDescription('Where it is: a street corner, a park, a gym nearby')
        .setRequired(true)
        .setMinLength(1)
        .setMaxLength(MAX_DETAILS),
    )
    .addStringOption((option) =>
      option
        .setName('near')
        .setDescription(
          'A gym, PokéStop or Power Spot it is near (pick from the list), or a maps link',
        )
        .setMaxLength(MAX_PLACE_TEXT)
        .setAutocomplete(true),
    )
    .addStringOption((option) =>
      option
        .setName('iv')
        .setDescription('Only if you checked: its IVs are perfect or zero')
        .addChoices(IV_CHOICES.map(({ name, value }) => ({ name, value }))),
    ),
  help: {
    category: 'notifications',
    // `/want` and the direct messages exist only where the server has notifications.
    details: (settings) =>
      'Tells the region about a Pokémon you met in the wild. Use it in the channel of a ' +
      'region (or in its forum or a post there): the report goes into the region’s channel ' +
      `and is removed after ${String(SPAWN_MINUTES)} minutes, because spawns do not last.\n\n` +
      (settings.features.notifications
        ? 'Members who put that Pokémon on their list with `/want` get a direct message.\n\n'
        : '') +
      'Any Pokémon that appears in the wild can be reported, a form as that form (`Alolan ' +
      'Rattata`); megas, legendary and mythical Pokémon and ultra beasts do not' +
      exceptionsClause(settings.wildSpawnExceptions) +
      '.\n\n`details` says where it is and is needed: a report is of no use ' +
      'without it.\n\n`near` names a gym, PokéStop or Power Spot it is near: pick one from the ' +
      'list that appears while you type (your region’s first; each says its street or the gym ' +
      'nearest to it), or paste a link to the place from a maps app, or its coordinates ' +
      '(`40.4406, -79.9959`): the report shows it with a map link.\n\n`iv` says that you checked it ' +
      'and its IVs are perfect or zero' +
      (settings.features.notifications
        ? ', which also tells the members who asked for those.\n\n'
        : '.\n\n') +
      `You can make ${limitWords(WILD_THROTTLE)}.`,
    examples: [
      '/wild pokemon:Dratini details:by the fountain on Market Street',
      '/wild pokemon:Larvitar details:Riverside Park iv:Perfect (100%)',
      '/wild pokemon:Pikachu details:by the bench near:Fountain Square',
    ],
  },
  guards: [requireGuild, requireSpawnReport],
  defer: 'late',
  throttle: WILD_THROTTLE,

  async execute(interaction, ctx) {
    const regionChannelId = regionChannelOf(interaction, ctx);
    if (regionChannelId === undefined) throw new UserError(WILD_FROM_A_REGION);
    const read = readSpawn(
      ctx,
      interaction.options.getString('pokemon', true),
      interaction.options.getString('details'),
    );
    const picked = interaction.options.getString('iv');
    const iv = IV_CHOICES.find((choice) => choice.value === picked)?.value;
    const place = await namedPlace(interaction, ctx, interaction.options.getString('near'));
    const content = await reportSpawnAs(
      ctx,
      {
        guildId: guildIdOf(interaction),
        regionChannelId,
        read,
        iv,
        reporter: { id: interaction.user.id, name: memberInfo(interaction).name },
        near: place,
      },
      DISCORD_SPAWN_NAMES,
    );
    await answer(interaction, { content });
  },

  async autocomplete(interaction, ctx) {
    const focused = interaction.options.getFocused(true);
    await interaction.respond(
      focused.name === 'near'
        ? await nearChoices(interaction, ctx, focused.value)
        : wildChoices(ctx, focused.value),
    );
  },
};
