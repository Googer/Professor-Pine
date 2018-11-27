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
      let errorMessage = 'No pokémon found.  Please try your search again, entering the text you want to search for.';
      if (!!arg) {
        errorMessage += `\n\n${arg.prompt}`;
      }

      return errorMessage;
    }

    const validPokemon = pokemon
      .find(pokemon => pokemon.exclusive || pokemon.tier);

    if (!validPokemon && message.command.name !== 'raid-boss') {
      const name = pokemon[0].name ?
        `"${pokemon[0].name.charAt(0).toUpperCase()}${pokemon[0].name.slice(1)}"` :
        'Pokémon';

      let errorMessage = `${name} is not a valid raid boss.  Please try your search again, entering the text you want to search for.`;
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

    let pokemon;

    if (message.command.name !== 'raid-boss') {
      pokemon = Pokemon.search(terms)
        .find(pokemon => pokemon.exclusive || pokemon.tier);
    } else {
      pokemon = Pokemon.search(terms)[0];
    }

    message.isExclusive = !!pokemon.exclusive;

    return pokemon;
  }
}

module.exports = PokemonType;