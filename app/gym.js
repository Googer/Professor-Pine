"use strict";

const lunr = require('lunr'),
	he = require('he'),
	Search = require('./search');

// Maps from regions (channel name) to gym ids within them
const region_gyms = new Map();

class Gym extends Search {
	constructor() {
		super();
	}

	buildIndex() {
		console.log('Splicing gym metadata and indexing gym data...');

		const gyms_base = require('../data/gyms'),
			gyms_metadata = require('../data/gyms-metadata'),
			merged_gyms = gyms_base
				.map(gym => Object.assign({}, gym, gyms_metadata[gym.gymId]));

		this.gyms = new Map(merged_gyms
			.map(gym => [gym.gymId, gym]));

		this.index = lunr(function () {
			// reference will be the entire gym object so we can grab whatever we need from it (GPS coordinates, name, etc.)
			this.ref('object');

			// static fields for gym name and description
			this.field('name');
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
			this.field('nickname');
			this.field('additional_terms');

			const regions = require('../data/regions');

			merged_gyms.forEach(function (gym) {
				// Gym document is a object with its reference and fields to collection of values
				const gymDocument = Object.create(null);

				gym.gymName = he.decode(gym.gymName);
				gym.gymInfo.gymDescriptino = he.decode(gym.gymInfo.gymDescription);

				if (gym.nickname) {
					gym.nickname = he.decode(gym.nickname);
				}

				// static fields
				gymDocument['name'] = gym.gymName;
				gymDocument['description'] = gym.gymInfo.gymDescription;

				// Build a map of the geocoded information:
				//   key is the address component's type
				//   value is a set of that type's values across all address components
				const addressInfo = new Map();
				if (!gym.gymInfo.addressComponents) {
					console.log('Gym "' + gym.gymName + '" has no geocode information!');
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

				if (!addressInfo.has('postal_code')) {
					console.log('Gym "' + gym.gymName + '" has no postal code information!');
				} else {
					// Add gym to appropriate regions (based on zipcodes to which it belongs)
					addressInfo.get('postal_code').forEach(zipcode => {
						const zipcode_regions = regions[zipcode];

						if (zipcode_regions) {
							zipcode_regions.forEach(region => {
								let current_region_gyms = region_gyms.get(region);

								if (!current_region_gyms) {
									current_region_gyms = new Set();
									region_gyms.set(region, current_region_gyms);
								}

								current_region_gyms.add(gym.gymId);
							});
						}
					});
				}

				// merge in additional info from supplementary metadata file
				// Index nickname as well
				if (gym.nickname) {
					gymDocument['nickname'] = gym.nickname;
				}

				gymDocument['additional_terms'] = gym.additional_terms;

				// reference
				gymDocument['object'] = JSON.stringify(gym);

				// Actually add this gym to the Lunr db
				this.add(gymDocument);
			}, this);
		});

		console.log('Indexing gym data complete');
	}

	search(channel_id, terms) {
		// lunr does an OR of its search terms and we really want AND, so we'll get there by doing individual searches
		// on everything and getting the intersection of the hits

		// first filter out stop words from the search terms; lunr does this itself so our hacky way of AND'ing will
		// return nothing if they have any in their search terms list since they'll never match anything
		const filtered_terms = terms
			.filter(term => lunr.stopWordFilter(term))
			.map(term => term.replace(/^\W+/, '').replace(/\W+$/, ''));

		let results = super.search([filtered_terms[0]])
			.map(result => result.ref);

		for (let i = 1; i < filtered_terms.length; i++) {
			const termResults = super.search([filtered_terms[i]])
				.map(result => result.ref);

			results = results.filter(result => {
				return termResults.indexOf(result) !== -1;
			});

			if (results.length === 0) {
				// already no results, may as well stop
				break;
			}
		}

		const channel_name = require('./raid').getCreationChannelName(channel_id);

		// Now filter results based on what channel this request came from
		return results
			.map(result => JSON.parse(result))
			.filter(gym => {
				return region_gyms.get(channel_name).has(gym.gymId);
			});
	}

	isValidChannel(channel_name) {
		return region_gyms.has(channel_name);
	}

	getGym(gym_id) {
		return this.gyms.get(gym_id);
	}
}

module.exports = new Gym();
