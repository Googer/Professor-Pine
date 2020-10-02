"use strict";

const Commando = require('discord.js-commando'),
  Pokemon = require('../app/pokemon'),
  settings = require('../data/settings');

class RankPokemonType extends Commando.ArgumentType {
  constructor(client) {
    super(client, 'rankpokemon');
  }

  validate(value, message, arg) {
    const terms = value.split(/[\s-]/)
        .filter(term => term.length > 0)
        .map(term => term.match(/(?:<:)?([\w*]+)(?::[0-9]+>)?/))
        .filter(term => !!term && term.length > 1)
        .map(term => term[1].toLowerCase()),
      pokemon = Pokemon.search(terms);

    if (!pokemon || pokemon.length === 0) {
      let errorMessage = 'No pokémon found.  Please try your search again, entering the text you want to search for.';
      if (!!arg) {
        errorMessage += `\n\n${arg.prompt}`;
      }

      return errorMessage;
    }

    const validPokemon = pokemon
      .find(pokemon => !!pokemon.stats);

    if (!validPokemon) {
      const name = pokemon[0].name ?
        `"${pokemon[0].name.charAt(0).toUpperCase()}${pokemon[0].name.slice(1)}"` :
        'Pokémon';

      let errorMessage = `${name} has no stats associated with it; hence rank cannot be calculated. ` +
        'Please try your search again, entering the text you want to search for.';

      if (!!arg) {
        errorMessage += `\n\n${arg.prompt}`;
      }

      return errorMessage;
    }

    return true;
  }

  parse(value, message, arg) {
    const terms = value.split(/[\s-]/)
      .filter(term => term.length > 0)
      .map(term => term.match(/(?:<:)?([\w*]+)(?::[0-9]+>)?/))
      .filter(term => !!term && term.length > 1)
      .map(term => term[1].toLowerCase());

    return Pokemon.search(terms)
      .find(pokemon => !!pokemon.stats);
  }
}

module.exports = RankPokemonType;
