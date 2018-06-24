"use strict";

const Commando = require('discord.js-commando'),
  Pokemon = require('../app/pokemon');

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
      let error_message = 'No pokémon found.  Please try your search again, entering the text you want to search for.';
      if (!!arg) {
        error_message += `\n\n${arg.prompt}`;
      }

      return error_message;
    }

    const valid_pokemon = pokemon
      .find(pokemon => pokemon.exclusive || pokemon.tier);

    if (!valid_pokemon) {
      const name = pokemon[0].name ?
        `"${pokemon[0].name.charAt(0).toUpperCase()}${pokemon[0].name.slice(1)}"` :
        'Pokémon';

      let error_message = `${name} is not a valid raid boss.  Please try your search again, entering the text you want to search for.`;
      if (!!arg) {
        error_message += `\n\n${arg.prompt}`;
      }

      return error_message;
    }

    return true;
  }

  parse(value, message, arg) {
    const terms = value.split(/[\s-]/)
      .filter(term => term.length > 0)
      .map(term => term.match(/(?:<:)?([\w*]+)(?::[0-9]+>)?/)[1])
      .map(term => term.toLowerCase());

    return Pokemon.search(terms)
      .find(pokemon => pokemon.exclusive || pokemon.tier);
  }
}

module.exports = PokemonType;