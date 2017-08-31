"use strict";

const lunr = require('lunr'),
	Search = require('./search');

class PokemonSearch extends Search {
	constructor() {
		super();

		console.log('Indexing pokemon...');

		this.index = lunr(function () {
			this.ref('object');
			this.field('name');
			this.field('nickname');

			const pokemonDatabase = require('./../data/pokemon');

			pokemonDatabase.forEach(function (pokemon) {
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
}

module.exports = new PokemonSearch();
