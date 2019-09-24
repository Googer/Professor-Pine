"use strict";

const Commando = require('discord.js-commando'),
  Pokemon = require('../app/pokemon'),
  settings = require('../data/settings');

class PokemonType extends Commando.ArgumentType {
  constructor(client) {
    super(client, 'pokemon');
  }

  validate(value, message, arg) {
    const terms = value.split(/[\s-]/)
        .filter(term => term.length > 0)
        .map(term => term.match(/(?:<:)?([\w*]+)(?::[0-9]+>)?/)[1])
        .map(term => term.toLowerCase()),
      pokemon = Pokemon.search(terms);

    if (!pokemon || pokemon.length === 0) {
      let errorMessage = 'No pokémon found.  Please try your search again, entering the text you want to search for.';
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
      .map(term => term.match(/(?:<:)?([\w*]+)(?::[0-9]+>)?/)[1])
      .map(term => term.toLowerCase());

    let pokemon = Pokemon.search(terms)[0];

    return pokemon;
  }
}

module.exports = PokemonType;
