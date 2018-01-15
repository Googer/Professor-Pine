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
		const terms = value.split(/[\s-]/)
			.filter(term => term.length > 0)
			.map(term => term.match(/(?:<:)?([\w*]+)(?::[0-9]+>)?/)[1])
			.map(term => term.toLowerCase());

		return Pokemon.search(terms);
	}
}

module.exports = PokemonType;