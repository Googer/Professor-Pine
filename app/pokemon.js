"use strict";

const log = require('loglevel').getLogger('PokemonSearch'),
	lunr = require('lunr'),
	Search = require('./search'),
	types = require('../data/types');

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

			pokemon_data.forEach(pokemon => {
				pokemon.weakness = Pokemon.calculateWeaknesses(pokemon.type);

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
			.map(match => match[1]), ['tier']);

		if (result !== undefined) {
			result = result.map(result => JSON.parse(result.ref))
				.filter(pokemon => pokemon.name === undefined);
		}

		if (result !== undefined) {
			return result[0];
		}
	}

	static calculateWeaknesses(pokemon_types) {
		if (!pokemon_types) {
			return [];
		}

		return Object.entries(types)
			.map(([type, chart]) => {
				let multiplier = 1.0;

				pokemon_types.forEach(pokemon_type => {
					if (chart.se.includes(pokemon_type)) {
						multiplier *= 1.400;
					} else if (chart.ne.includes(pokemon_type)) {
						multiplier *= 0.714;
					} else if (chart.im.includes(pokemon_type)) {
						multiplier *= 0.510;
					}
				});

				return {
					type: type,
					multiplier: multiplier
				}
			})
			.sort((type_a, type_b) => {
				const multiplier_difference = type_b.multiplier - type_a.multiplier;

				if (multiplier_difference === 0) {
					return type_a.type > type_b.type;
				}

				return multiplier_difference;
			})
			.filter(type => type.multiplier > 1.0);
	}
}

module.exports = new Pokemon();
