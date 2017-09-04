"use strict";

const lunr = require('lunr'),
	Search = require('./search');

class Pokemon extends Search {
	constructor() {
		super();
	}

	buildIndex() {
		console.log('Indexing pokemon...');

		this.index = lunr(function () {
			this.ref('object');
			this.field('name');
			this.field('nickname');

			const pokemon_data = require('./../data/pokemon');

			this.pokemon = new Map(pokemon_data
				.map(pokemon => [pokemon.number, pokemon]));

			pokemon_data.forEach(function (pokemon) {
				const pokemonDocument = Object.create(null);

				pokemonDocument['object'] = JSON.stringify(pokemon);
				pokemonDocument['name'] = pokemon.name;
				pokemonDocument['nickname'] = (pokemon.nickname) ? pokemon.nickname.join(' ') : '';

				this.add(pokemonDocument);
			}, this);
		});

		console.log('Indexing pokemon complete');
	}

	search(terms) {
		const lunr_results = super.search(terms)
			.map(result => JSON.parse(result.ref));

		if (lunr_results.length > 0) {
			return lunr_results[0];
		}
	}

	getPokemon(pokemon_id) {
		return this.pokemon.get(pokemon_id);
	}
}

module.exports = new Pokemon();
