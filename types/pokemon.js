"use strict";

const Commando = require('discord.js-commando'),
	PokemonSearch = require('../app/pokemon-search');

class PokemonType extends Commando.ArgumentType {
	constructor(client) {
		super(client, 'pokemon');
	}

	validate(value, message, arg) {
        const pokemon_to_lookup = value.match(/^(?:<:)?([A-Za-z]+)(?::\d+>)?$/);

        if (!pokemon_to_lookup || !pokemon_to_lookup.length) {
            return value.match(/^(?:(?:\w+)\s?)?([1-5])$/);
		}

        const pokemon = PokemonSearch.search([pokemon_to_lookup[1]]);

		return pokemon && pokemon.tier;
	}

	parse(value, message, arg) {
        const pokemon_to_lookup = value.match(/^(?:<:)?([A-Za-z]+)(?::\d+>)?$/);

        if (!pokemon_to_lookup || !pokemon_to_lookup.length) {
            const pokemon_level = value.match(/^(?:(?:\w+)\s?)?([1-5])$/);
            return {
                tier: Number.parseInt(pokemon_level[1])
            }
        }

        return PokemonSearch.search([pokemon_to_lookup[1]]);
	}
}

module.exports = PokemonType;