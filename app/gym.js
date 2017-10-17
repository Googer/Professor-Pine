"use strict";

const log = require('loglevel').getLogger('GymSearch'),
	lunr = require('lunr'),
	he = require('he'),
	Search = require('./search');

class Gym extends Search {
	constructor() {
		super();
	}

	buildIndex() {
		log.info('Splicing gym metadata and indexing gym data...');

		const gyms_base = require('PgP-Data/data/gyms'),
			gyms_metadata = require('PgP-Data/data/gyms-metadata'),
			merged_gyms = gyms_base
				.map(gym => Object.assign({}, gym, gyms_metadata[gym.gymId]));

		this.gyms = new Map(merged_gyms
			.map(gym => [gym.gymId, gym]));

		this.region_map = require('PgP-Data/data/region-map');
		this.region_graph = require('PgP-Data/data/region-graph');

		this.index = lunr(function () {
			// reference will be the entire gym object so we can grab whatever we need from it (GPS coordinates, name, etc.)
			this.ref('object');

			// static fields for gym name, nickname, and description
			this.field('name');
			this.field('nickname');
			this.field('description');

			// fields from geocoding data, can add more if / when needed
			this.field('intersection');
			this.field('route');
			this.field('neighborhood');
			this.field('colloquial_area');
			this.field('locality');
			this.field('premise');
			this.field('natural_feature');
			this.field('postal_code');
			this.field('bus_station');
			this.field('establishment');
			this.field('point_of_interest');
			this.field('transit_station');

			// field for places
			this.field('places');

			// field from supplementary metadata
			this.field('additional_terms');

			merged_gyms.forEach(function (gym) {
				// Gym document is a object with its reference and fields to collection of values
				const gymDocument = Object.create(null);

				gym.gymName = he.decode(gym.gymName);
				gym.gymInfo.gymDescription = he.decode(gym.gymInfo.gymDescription);

				if (gym.nickname) {
					gym.nickname = he.decode(gym.nickname);
				}

				// static fields
				gymDocument['name'] = gym.gymName.replace(/[^\w\s-]+/g, '');
				gymDocument['description'] = gym.gymInfo.gymDescription.replace(/[^\w\s-]+/g, '');

				if (gym.nickname) {
					gym.nickname = he.decode(gym.nickname);
					gymDocument['nickname'] = gym.nickname.replace(/[^\w\s-]+/g, '');
				}

				// Build a map of the geocoded information:
				//   key is the address component's type
				//   value is a set of that type's values across all address components
				const addressInfo = new Map();
				if (!gym.gymInfo.addressComponents) {
					log.warn('Gym "' + gym.gymName + '" has no geocode information!');
				} else {
					gym.gymInfo.addressComponents.forEach(function (addressComponent) {
						addressComponent.addressComponents.forEach(function (addComp) {
							addComp.types.forEach(function (type) {
								const typeKey = type.toLowerCase();
								let values = addressInfo.get(typeKey);

								if (!values) {
									values = new Set();
									addressInfo.set(typeKey, values);
								}
								values.add(addComp.shortName);
							});
						});
					});
				}

				// Insert geocoded map info into map
				addressInfo.forEach(function (value, key) {
					gymDocument[key] = Array.from(value).join(' ');
				});

				// Add places into library
				if (gym.gymInfo.places) {
					gymDocument['places'] = he.decode(gym.gymInfo.places.join(' '));
				}

				// merge in additional info from supplementary metadata file
				gymDocument['additional_terms'] = gym.additional_terms;

				// reference
				gymDocument['object'] = JSON.stringify(gym);

				// Actually add this gym to the Lunr db
				this.add(gymDocument);
			}, this);
		});

		log.info('Indexing gym data complete');
	}

	internalSearch(channel_name, terms, fields) {
		// lunr does an OR of its search terms and we really want AND, so we'll get there by doing individual searches
		// on everything and getting the intersection of the hits

		// first filter out stop words from the search terms; lunr does this itself so our hacky way of AND'ing will
		// return nothing if they have any in their search terms list since they'll never match anything
		const split_terms = [].concat(...terms
			.map(term => term.split('-')));

		const filtered_terms = split_terms
			.map(term => term.replace(/[^\w\s*]+/g, ''))
			.map(term => term.toLowerCase())
			.filter(term => lunr.stopWordFilter(term));

		let results = Search.singleTermSearch(filtered_terms[0], this.index, fields);

		for (let i = 1; i < filtered_terms.length; i++) {
			const term_results = Search.singleTermSearch(filtered_terms[i], this.index, fields);

			results = results
				.map(result => {
					const matching_result = term_results.find(term_result => term_result.ref === result.ref);

					if (matching_result) {
						// Multiply scores together for reordering later
						result.score *= matching_result.score;
					} else {
						// No match, so set score to -1 so this result gets filtered out
						result.score = -1;
					}

					return result;
				})
				.filter(result => result.score !== -1);

			if (results.length === 0) {
				// already no results, may as well stop
				break;
			}
		}

		// Reorder results by composite score
		results.sort((result_1, result_2) => result_2.score - result_1.score);

		// Filter results based on what channel this request came from
		return results
			.map(result => JSON.parse(result.ref))
			.filter(gym => {
				return this.region_map[channel_name].indexOf(gym.gymId) >= 0;
			});
	}

	channelSearch(channel_name, terms) {
		// First try against name/nickname only
		let results = this.internalSearch(channel_name, terms, ['name', 'nickname']);

		if (results.length === 0) {
			// That didn't return anything, so now try the with description & additional terms as well
			results = this.internalSearch(channel_name, terms, ['name', 'nickname', 'description', 'additional_terms']);
		}

		if (results.length === 0) {
			// That still didn't return anything, so now try with all fields
			results = this.internalSearch(channel_name, terms);
		}

		return results;
	}

	async search(channel_id, terms) {
		const channel_name = await require('./raid').getCreationChannelName(channel_id);

		return this.channelSearch(channel_name, terms);
	}

	async adjacentRegionsSearch(channel_id, terms) {
		const channel_name = await require('./raid').getCreationChannelName(channel_id),
			adjacent_regions = this.region_graph[channel_name],
			matching_region = adjacent_regions
			.find(adjacent_region => {
				return this.channelSearch(adjacent_region, terms).length > 0;
			});

		if (matching_region) {
			return {
				'channel': matching_region,
				'gyms': this.channelSearch(matching_region, terms)
			};
		}
	}

	isValidChannel(channel_name) {
		return !!this.region_map[channel_name];
	}

	getGym(gym_id) {
		return this.gyms.get(gym_id);
	}
}

module.exports = new Gym();
