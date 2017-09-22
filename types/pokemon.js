"use strict";

const Commando = require('discord.js-commando'),
	Pokemon = require('../app/pokemon'),
	Utility = require('../app/utility');

class PokemonType extends Commando.ArgumentType {
	constructor(client) {
		super(client, 'pokemon');
	}

	validate(value, message, arg) {
		const extra_error_message = Utility.isOneLiner(message) ?
			'  Do **not** re-enter the `' + message.command.name + '` command.' :
			'',

			pokemon_to_lookup = value.match(/^(?:<:)?([A-Za-z]+)(?::\d+>)?$/);

		if (!pokemon_to_lookup || !pokemon_to_lookup.length) {
			const result = value.match(/^(?:(?:\w+)\s?)?([1-5])$/);
			if (!result) {
				return 'Invalid tier specified.' + extra_error_message;
			}

			return true;
		}

		const pokemon = Pokemon.search(pokemon_to_lookup[1]);

		if (!pokemon) {
			return 'No pokemon found.' + extra_error_message;
		}

		if (!pokemon.exclusive && !pokemon.tier) {
			return 'Pokemon is not a valid raid boss.' + extra_error_message;
		}

		return true;
	}

	parse(value, message, arg) {
		const pokemon_to_lookup = value.match(/^(?:<:)?([A-Za-z]+)(?::\d+>)?$/);

		if (!pokemon_to_lookup || !pokemon_to_lookup.length) {
			const pokemon_level = value.match(/^(?:(?:\w+)\s?)?([1-5])$/);
			return {
				tier: Number.parseInt(pokemon_level[1])
			}
		}

		return Pokemon.search(pokemon_to_lookup[1]);
	}
}

module.exports = PokemonType;