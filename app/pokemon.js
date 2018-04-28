"use strict";

const log = require('loglevel').getLogger('PokemonSearch'),
	lunr = require('lunr'),
	gameMaster = require('pokemongo-game-master'),
	Search = require('./search'),
	types = require('../data/types'),
	weather = require('../data/weather');

class Pokemon extends Search {
	constructor() {
		super();
	}

	async buildIndex() {
		log.info('Indexing pokemon...');

		const game_master = await gameMaster.getVersion('latest', 'json'),
			regex = new RegExp('^V[0-9]+_POKEMON_(.*)'),
			pokemon_metadata = require('../data/pokemon'),
			pokemon = game_master.itemTemplates
				.filter(item => regex.test(item.templateId))
				.map(item => Object.assign({},
					{
						name: item.pokemonSettings.pokemonId.toLowerCase(),
						number: parseInt(item.templateId.split('_')[0].slice(1), 10),
						stats: item.pokemonSettings.stats,
						type: [item.pokemonSettings.type.split('_')[2].toLowerCase(), item.pokemonSettings.type2 ?
							item.pokemonSettings.type2.split('_')[2].toLowerCase() :
							null]
							.filter(type => !!type)
					})),
			merged_pokemon = pokemon_metadata
				.map(poke => Object.assign({}, poke, pokemon.find(p => p.name === poke.name)));

		merged_pokemon.forEach(poke => {
			poke.weakness = Pokemon.calculateWeaknesses(poke.type);
			poke.boost_conditions = Pokemon.calculateBoostConditions(poke.type);
			poke.boss_cp = Pokemon.calculateBossCP(poke);
			poke.min_base_cp = Pokemon.calculateCP(poke, 20, 10, 10, 10);
			poke.max_base_cp = Pokemon.calculateCP(poke, 20, 15, 15, 15);
			poke.min_boosted_cp = Pokemon.calculateCP(poke, 25, 10, 10, 10);
			poke.max_boosted_cp = Pokemon.calculateCP(poke, 25, 15, 15, 15);
		});

		this.pokemon = merged_pokemon;

		this.index = lunr(function () {
			this.ref('object');
			this.field('name');
			this.field('nickname');
			this.field('tier');
			this.field('boss_cp');

			merged_pokemon.forEach(pokemon => {
				const pokemonDocument = Object.create(null);

				pokemonDocument['object'] = JSON.stringify(pokemon);
				pokemonDocument['name'] = pokemon.name;
				pokemonDocument['nickname'] = (pokemon.nickname) ? pokemon.nickname.join(' ') : '';
				pokemonDocument['tier'] = pokemon.tier;
				pokemonDocument['boss_cp'] = pokemon.boss_cp;

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
		result = this.internalSearch(terms, ['boss_cp']);
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

	static calculateBoostConditions(types) {
		if (!types) {
			return;
		}

		let all_conditions = ["sunny", "clear", "rain", "partlycloudy", "cloudy", "windy", "snow", "fog"],
			boosted_conditions = [];

		types.forEach(type => {
			boosted_conditions.push(...weather[type]);
		});

		boosted_conditions = [...new Set(boosted_conditions)];

		return {
			standard: all_conditions.filter(condition => !boosted_conditions.includes(condition)),
			boosted: boosted_conditions
		};
	}

	static calculateBossCP(pokemon) {
		if (!pokemon.stats) {
			return 0;
		}

		let stamina = 0;

		switch (pokemon.tier) {
			case 1:
				stamina = 600;
				break;

			case 2:
				stamina = 1800;
				break;

			case 3:
				stamina = 3000;
				break;

			case 4:
				stamina = 7500;
				break;

			case 5:
				stamina = 12500;
				break;
		}

		if (pokemon.exclusive) {
			stamina = 12500;
		}

		return Math.floor(((pokemon.stats.baseAttack + 15) * Math.sqrt(pokemon.stats.baseDefense + 15) *
			Math.sqrt(stamina)) / 10);
	}

	static calculateCP(pokemon, level, attack_iv, defense_iv, stamina_iv) {
		if (!pokemon.stats) {
			return 0;
		}

		let cpMultiplier;

		switch (level) {
			case 1:
				cpMultiplier = 0.094;
				break;

			case 1.5:
				cpMultiplier = 0.135137432;
				break;

			case 2:
				cpMultiplier = 0.16639787;
				break;

			case 2.5:
				cpMultiplier = 0.192650919;
				break;

			case 3:
				cpMultiplier = 0.21573247;
				break;

			case 3.5:
				cpMultiplier = 0.236572661;
				break;

			case 4:
				cpMultiplier = 0.25572005;
				break;

			case 4.5:
				cpMultiplier = 0.273530381;
				break;

			case 5:
				cpMultiplier = 0.29024988;
				break;

			case 5.5:
				cpMultiplier = 0.306057377;
				break;

			case 6:
				cpMultiplier = 0.3210876;
				break;

			case 6.5:
				cpMultiplier = 0.335445036;
				break;

			case 7:
				cpMultiplier = 0.34921268;
				break;

			case 7.5:
				cpMultiplier = 0.362457751;
				break;

			case 8:
				cpMultiplier = 0.37523559;
				break;

			case 8.5:
				cpMultiplier = 0.387592406;
				break;

			case 9:
				cpMultiplier = 0.39956728;
				break;

			case 9.5:
				cpMultiplier = 0.411193551;
				break;

			case 10:
				cpMultiplier = 0.42250001;
				break;

			case 10.5:
				cpMultiplier = 0.432926419;
				break;

			case 11:
				cpMultiplier = 0.44310755;
				break;

			case 11.5:
				cpMultiplier = 0.4530599578;
				break;

			case 12:
				cpMultiplier = 0.46279839;
				break;

			case 12.5:
				cpMultiplier = 0.472336083;
				break;

			case 13:
				cpMultiplier = 0.48168495;
				break;

			case 13.5:
				cpMultiplier = 0.4908558;
				break;

			case 14:
				cpMultiplier = 0.49985844;
				break;

			case 14.5:
				cpMultiplier = 0.508701765;
				break;

			case 15:
				cpMultiplier = 0.51739395;
				break;

			case 15.5:
				cpMultiplier = 0.525942511;
				break;

			case 16:
				cpMultiplier = 0.53435433;
				break;

			case 16.5:
				cpMultiplier = 0.542635767;
				break;

			case 17:
				cpMultiplier = 0.55079269;
				break;

			case 17.5:
				cpMultiplier = 0.558830576;
				break;

			case 18:
				cpMultiplier = 0.56675452;
				break;

			case 18.5:
				cpMultiplier = 0.574569153;
				break;

			case 19:
				cpMultiplier = 0.58227891;
				break;

			case 19.5:
				cpMultiplier = 0.589887917;
				break;

			case 20:
				cpMultiplier = 0.59740001;
				break;

			case 20.5:
				cpMultiplier = 0.604818814;
				break;

			case 21:
				cpMultiplier = 0.61215729;
				break;

			case 21.5:
				cpMultiplier = 0.619399365;
				break;

			case 22:
				cpMultiplier = 0.62656713;
				break;

			case 22.5:
				cpMultiplier = 0.633644533;
				break;

			case 23:
				cpMultiplier = 0.64065295;
				break;

			case 23.5:
				cpMultiplier = 0.647576426;
				break;

			case 24:
				cpMultiplier = 0.65443563;
				break;

			case 24.5:
				cpMultiplier = 0.661214806;
				break;

			case 25:
				cpMultiplier = 0.667934;
				break;

			case 25.5:
				cpMultiplier = 0.674577537;
				break;

			case 26:
				cpMultiplier = 0.68116492;
				break;

			case 26.5:
				cpMultiplier = 0.687680648;
				break;

			case 27:
				cpMultiplier = 0.69414365;
				break;

			case 27.5:
				cpMultiplier = 0.700538673;
				break;

			case 28:
				cpMultiplier = 0.70688421;
				break;

			case 28.5:
				cpMultiplier = 0.713164996;
				break;

			case 29:
				cpMultiplier = 0.71939909;
				break;

			case 29.5:
				cpMultiplier = 0.725571552;
				break;

			case 30:
				cpMultiplier = 0.7317;
				break;

			case 30.5:
				cpMultiplier = 0.734741009;
				break;

			case 31:
				cpMultiplier = 0.73776948;
				break;

			case 31.5:
				cpMultiplier = 0.740785574;
				break;

			case 32:
				cpMultiplier = 0.74378943;
				break;

			case 32.5:
				cpMultiplier = 0.746781211;
				break;

			case 33:
				cpMultiplier = 0.74976104;
				break;

			case 33.5:
				cpMultiplier = 0.752729087;
				break;

			case 34:
				cpMultiplier = 0.75568551;
				break;

			case 34.5:
				cpMultiplier = 0.758630378;
				break;

			case 35:
				cpMultiplier = 0.76156384;
				break;

			case 35.5:
				cpMultiplier = 0.764486065;
				break;

			case 36:
				cpMultiplier = 0.76739717;
				break;

			case 36.5:
				cpMultiplier = 0.770297266;
				break;

			case 37:
				cpMultiplier = 0.7731865;
				break;

			case 37.5:
				cpMultiplier = 0.776064962;
				break;

			case 38:
				cpMultiplier = 0.77893275;
				break;

			case 38.5:
				cpMultiplier = 0.781790055;
				break;

			case 39:
				cpMultiplier = 0.78463697;
				break;

			case 39.5:
				cpMultiplier = 0.787473578;
				break;

			case 40:
				cpMultiplier = 0.79030001;
				break;
		}

		return Math.floor((pokemon.stats.baseAttack + attack_iv) * Math.sqrt(pokemon.stats.baseDefense + defense_iv) *
			Math.sqrt(pokemon.stats.baseStamina + stamina_iv) * Math.pow(cpMultiplier, 2) / 10);
	}
}

module.exports = new Pokemon();
