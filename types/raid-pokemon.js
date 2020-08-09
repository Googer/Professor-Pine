"use strict";

const Commando = require('discord.js-commando'),
  Pokemon = require('../app/pokemon'),
  settings = require('../data/settings');

class RaidPokemonType extends Commando.ArgumentType {
  constructor(client) {
    super(client, 'raidpokemon');
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
      .find(pokemon => {
        if (!message.command || message.command.name === 'raid' || message.command.name === 'boss') {
          return pokemon.exclusive || (pokemon.tier && pokemon.tier < 7);
        }
        return pokemon.exclusive || pokemon.tier || (pokemon.name.toLocaleLowerCase().startsWith('unown') && settings.roles.unown && settings.channels.unown);
      });

    if (!validPokemon) {
      const name = pokemon[0].name ?
        `"${pokemon[0].name.charAt(0).toUpperCase()}${pokemon[0].name.slice(1)}"` :
        'Pokémon';


      let type = message.command && message.command.name === 'spawn' ? 'rare spawn' : 'raid boss';
      let errorMessage = `${name} is not a valid ${type}.`;

      if (message.command && message.command.name !== 'boss-tier') {
        errorMessage += '  Please try your search again, entering the text you want to search for.';
      }

      if (!!arg && (message.command && message.command.name !== 'boss-tier')) {
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

    let pokemon = Pokemon.search(terms)
      .find(pokemon => pokemon.exclusive || pokemon.tier || (pokemon.name.toLocaleLowerCase().startsWith('unown') && settings.roles.unown && settings.channels.unown));

    message.isExclusive = !!pokemon.exclusive;

    return pokemon;
  }
}

module.exports = RaidPokemonType;
z
