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
			this.field('tier');
			this.field('cp');

			const pokemon_data = require('../data/pokemon');

			this.pokemon = new Map(pokemon_data
				.map(pokemon => [pokemon.number, pokemon]));

			pokemon_data.forEach(function (pokemon) {
				const pokemonDocument = Object.create(null);

				pokemonDocument['object'] = JSON.stringify(pokemon);
				pokemonDocument['name'] = pokemon.name;
				pokemonDocument['nickname'] = (pokemon.nickname) ? pokemon.nickname.join(' ') : '';
				pokemonDocument['tier'] = pokemon.tier;
				pokemonDocument['cp'] = pokemon.cp;

				this.add(pokemonDocument);
			}, this);
		});

		log.info('Indexing pokemon complete');
	}

	internalSearch(terms, fields) {
		return terms
			.map(term => Search.singleTermSearch(term, this.index, fields))
			.find(results => results.length > 0);
	}

	search(terms) {
		// First try searching based on name and nickname
		let result = this.internalSearch(terms, ['name', 'nickname']);
		if (result !== undefined) {
			return JSON.parse(result[0].ref);
		}

		// Try CP
		result = this.internalSearch(terms, ['cp']);
		if (result !== undefined) {
			return JSON.parse(result[0].ref);
		}

		// Try tier
		result = this.internalSearch(terms
			.map(term => term.match(/(\d+)$/))
			.filter(match => !!match)
			.map(match => match[1]), ['tier'])
			.map(result => JSON.parse(result.ref))
			.filter(pokemon => pokemon.name === undefined);

		if (result !== undefined) {
			return result[0];
		}
	}
}

module.exports = new Pokemon();
