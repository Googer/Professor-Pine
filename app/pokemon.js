"use strict";

const log = require('loglevel').getLogger('PokemonSearch'),
	lunr = require('lunr'),
	Search = require('./search');

class Pokemon extends Search {
	constructor() {
		super();
	}

	buildIndex() {
		log.info('Indexing pokemon...');

		this.index = lunr(function () {
			this.ref('object');
			this.field('name');
			this.field('nickname');

			const pokemon_data = require('../data/pokemon');

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

		log.info('Indexing pokemon complete');
	}

	search(term) {
		const lunr_results = this.index.search(Search.makeFuzzy(term))
			.map(result => JSON.parse(result.ref));

		if (lunr_results.length > 0) {
			return lunr_results[0];
		}
	}
}

module.exports = new Pokemon();
