"use strict";

const lunr = require('lunr'),
	he = require('he'),
	Search = require('./search');

// Maps from regions (channel name) to gym ids within them
const region_gyms = new Map();

class GymSearch extends Search {
	constructor() {
		super();

		console.log('Indexing Gym Data...');

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

			const gymDatabase = require('./../data/gyms'),
				regions = require('./../data/regions');

			gymDatabase.forEach(function (gym) {
				// Gym document is a object with its reference and fields to collection of values
				const gymDocument = Object.create(null);

				// reference
				gymDocument['object'] = he.decode(JSON.stringify(gym));

				// static fields
				gymDocument['name'] = he.decode(gym.gymName);
				gymDocument['description'] = he.decode(gym.gymInfo.gymDescription);

				// Build a map of the geocoded information:
				//   key is the address component's type
				//   value is a set of that type's values across all address components
				const addressInfo = new Map();
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

				// Insert geocoded map info into map
				addressInfo.forEach(function (value, key) {
					gymDocument[key] = Array.from(value).join(' ');
				});

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

				// Actually add this gym to the Lunr db
				this.add(gymDocument);
			}, this);
		});

		console.log('Indexing Gym Data Complete');
	}

	search(channel_name, terms) {
		// lunr does an OR of its search terms and we really want AND, so we'll get there by doing individual searches
		// on everything and getting the intersection of the hits
		let results = super.search([terms[0]])
			.map(result => result.ref);

		for (let i = 1; i < terms.length; i++) {
			const termResults = super.search([terms[i]])
				.map(result => result.ref);

			results = results.filter(result => {
				return termResults.indexOf(result) !== -1;
			});

			if (results.length === 0) {
				// already no results, may as well stop
				break;
			}
		}

		// Now filter results based on what channel this request came from
		return results
			.map(result => JSON.parse(result))
			.filter(gym => {
				return region_gyms.get(channel_name).has(gym.gymId);
			});
	}
}

module.exports = new GymSearch();
