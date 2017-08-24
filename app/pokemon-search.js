"use strict";

const lunr = require('lunr'),
	Search = require('./search');

class PokemonSearch extends Search {
	constructor() {
		super();

		console.log('Indexing Pokemon...');

		this.index = lunr(function () {
			this.ref('object');
			this.field('name');

			const pokemonDatabase = require('./../data/pokemon');

			pokemonDatabase.forEach(function (pokemon) {
				const pokemonDocument = Object.create(null);

				pokemonDocument['object'] = JSON.stringify(pokemon);
				pokemonDocument['name'] = pokemon.name;

				this.add(pokemonDocument);
			}, this);
		});

		console.log('Indexing Pokemon Complete');
	}

	search(terms) {
		const lunr_results = super.search(terms)
			.map(result => JSON.parse(result.ref));

		if (lunr_results.length > 0) {
			return lunr_results[0];
		}
	}
}

module.exports = new PokemonSearch();
