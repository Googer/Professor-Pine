"use strict";

const Commando = require('discord.js-commando'),
	Pokemon = require('../app/pokemon');

class PokemonType extends Commando.ArgumentType {
	constructor(client) {
		super(client, 'pokemon');
	}

	validate(value, message, arg) {
		const pokemon_to_lookup = value.match(/^(?:<:)?([A-Za-z*]+)(?::\d+>)?$/);

		if (!pokemon_to_lookup || !pokemon_to_lookup.length) {
			const result = value.match(/^(?:(?:\w+)\s?)?([1-5])$/);
			if (!result) {
				return 'Invalid tier specified.  Please try your search again, entering the text you want to search for.\n';
			}

			return true;
		}

		const pokemon = Pokemon.search(pokemon_to_lookup[1].toLowerCase());

		if (!pokemon) {
			return 'No pokémon found.  Please try your search again, entering the text you want to search for.\n';
		}

		if (!pokemon.exclusive && !pokemon.tier) {
			const name = pokemon.name ?
				`"${pokemon.name.charAt(0).toUpperCase()}${pokemon.name.slice(1)}"` :
				'Pokémon';

			return `${name} is not a valid raid boss.  Please try your search again, entering the text you want to search for.\n`;
		}

		return true;
	}

	parse(value, message, arg) {
		const pokemon_to_lookup = value.match(/^(?:<:)?([A-Za-z*]+)(?::\d+>)?$/);

		if (!pokemon_to_lookup || !pokemon_to_lookup.length) {
			const pokemon_level = value.match(/^(?:(?:\w+)\s?)?([1-5])$/);
			return {
				tier: Number.parseInt(pokemon_level[1])
			}
		}

		return Pokemon.search(pokemon_to_lookup[1].toLowerCase());
	}
}

module.exports = PokemonType;