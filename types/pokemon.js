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

    const validPokemon = pokemon
      .find(pokemon => {
        if (!message.command || message.command.name === 'raid') {
          return pokemon.exclusive || (pokemon.tier && pokemon.tier < 7);
        }
        return pokemon.exclusive || pokemon.tier;
      });

    let allMonCommands = ['raid-boss', 'rare'];
    let requireValidation = !message.command || (message.command && allMonCommands.indexOf(message.command.name) === -1);

    console.log(requireValidation);
    console.log(pokemon);
    console.log(settings.roles.unown && settings.channels.unown);
    console.log(pokemon[0] && pokemon[0].name === 'unown' && settings.roles.unown && settings.channels.unown);
    console.log(message.command.name);
    console.log(message.command && ['notify', 'denotify'].indexOf(message.command.name) !== -1)

    if (requireValidation && (pokemon[0] && pokemon[0].name === 'unown' && settings.roles.unown && settings.channels.unown) && (message.command && ['want', 'unwant'].indexOf(message.command.name) !== -1)) {
      return true;
    }

    if (!validPokemon && requireValidation) {
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

    let pokemon;
    let allMonCommands = ['raid-boss', 'rare', 'want', 'unwant'];

    if (!message.command || (message.command && allMonCommands.indexOf(message.command.name) === -1)) {
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
