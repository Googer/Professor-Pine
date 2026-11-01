import type { SlashCommandStringOption } from 'discord.js';
import type { AppContext } from '../app-context.js';
import { UserError } from '../discord/errors.js';
import type { PokemonEntry } from '../domain/pogo/game-master.js';
import { searchTokens } from '../domain/search/text.js';
import { plain, truncate } from '../render/text.js';
import { CHOICE_NAME, MAX_CHOICES, showsGuessed, type Choice } from './choices.js';

/**
 * The `pokemon` option of a command that takes any Pokémon of the game data: free text with
 * autocomplete (`pokemonChoices`), whose value is a catalogue key when a choice was picked.
 */
export function pokemonOption(description = 'The Pokémon', required = true) {
  return (option: SlashCommandStringOption): SlashCommandStringOption =>
    option
      .setName('pokemon')
      .setDescription(description)
      .setRequired(required)
      .setMaxLength(100)
      .setAutocomplete(true);
}

/** A choice of the list for a catalogue entry. */
export const entryChoice = (entry: PokemonEntry): Choice => ({
  name: truncate(entry.name, CHOICE_NAME),
  value: entry.key,
});

/**
 * The choices for typed text: what the search finds (`ctx.pokemon.find`), best first, a guess
 * only where the name shows the guessed word; nothing while nothing is typed. `filter` narrows
 * the Pokémon offered.
 */
export function pokemonChoices(
  ctx: AppContext,
  typed: string,
  filter?: (entry: PokemonEntry) => boolean,
): Choice[] {
  if (searchTokens(typed).length === 0) return [];
  return ctx.pokemon
    .find(typed, { limit: MAX_CHOICES, ...(filter ? { filter } : {}) })
    .filter((hit) => hit.match !== 'guess' || showsGuessed(hit.entry.name, hit.guessed))
    .map((hit) => entryChoice(hit.entry));
}

/**
 * The Pokémon a `pokemon` option names: a choice of the list (a catalogue key), or typed text
 * that names one outright (its name, key or a nickname no other Pokémon has:
 * `ctx.pokemon.exact`). Anything else is refused with what the text could be; nothing is
 * guessed.
 */
export function namedPokemon(ctx: AppContext, value: string): PokemonEntry {
  const text = value.trim();
  const entry = ctx.gameData.catalogue.byKey(text) ?? ctx.pokemon.exact(text);
  if (entry) return entry;
  const could = ctx.pokemon.search(text).slice(0, 3);
  throw new UserError(
    could.length === 0
      ? `I do not know a Pokémon called "${plain(truncate(text, 80))}". Pick one from the list.`
      : `"${plain(truncate(text, 80))}" is not the name of one Pokémon. Did you mean ` +
          `${could.map((one) => plain(one.name)).join(', ')}? Pick one from the list.`,
  );
}
