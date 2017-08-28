"use strict";

const Commando = require('discord.js-commando'),
	PokemonSearch = require('../app/pokemon-search');

class PokemonType extends Commando.ArgumentType {
	constructor(client) {
		super(client, 'pokemon');
	}

	validate(value, message, arg) {
		const pokemon_to_lookup = value.match(/(<:)?([A-Za-z]+)(:\d+>)?/);

		if (!pokemon_to_lookup && !pokemon_to_lookup.length) {
			return false;
		}

		const pokemon = PokemonSearch.search([pokemon_to_lookup[2]]);

		return pokemon && pokemon.tier;
	}

	parse(value, message, arg) {
		const pokemon_to_lookup = value.match(/(<:)?([A-Za-z]+)(:\d+>)?/);

		return PokemonSearch.search([pokemon_to_lookup[2]]);
	}
}

module.exports = PokemonType;