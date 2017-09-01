"use strict";

const Commando = require('discord.js-commando'),
	PokemonSearch = require('../app/pokemon-search'),
	Utility = require('../app/utility');

class PokemonType extends Commando.ArgumentType {
	constructor(client) {
		super(client, 'pokemon');
	}

	validate(value, message, arg) {
		const extra_error_message = Utility.isOneLiner(message, value) ?
			'  Do **not** re-enter the `' + arg.command.name + '` command.' :
			'',

			pokemon_to_lookup = value.match(/^(?:<:)?([A-Za-z]+)(?::\d+>)?$/);

		if (!pokemon_to_lookup || !pokemon_to_lookup.length) {
			const result = value.match(/^(?:(?:\w+)\s?)?([1-5])$/);
			if (!result) {
				message.reply('Invalid tier specified.' + extra_error_message);
				return false;
			}

			return true;
		}

		const pokemon = PokemonSearch.search([pokemon_to_lookup[1]]);

		if (!pokemon) {
			message.reply('No pokemon found.' + extra_error_message);
			return false;
		}

		if (!pokemon.tier) {
			message.reply('Pokemon is not a valid raid boss.' + extra_error_message);
			return false;
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

		return PokemonSearch.search([pokemon_to_lookup[1]]);
	}
}

module.exports = PokemonType;