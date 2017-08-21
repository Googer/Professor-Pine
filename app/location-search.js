"use strict";

const lunr = require('lunr'),
	he = require('he');

class LocationSearch {
	constructor() {
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

			let gymDatabase = require('./../data/gyms');
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
				// Actually add this gym to the Lunr db
				this.add(gymDocument);
			}, this);
		});

		console.log('Indexing Gym Data Complete');
	}

	search(terms) {
		const query = terms
			.map(LocationSearch.makeFuzzy)
			.join(' ');

		// This is a hacky way of doing an AND - it checks that a given match in fact matched
		// all terms in the query
		return this.index.search(query)
			.filter(result => {
				return Object.keys(result.matchData.metadata).length === terms.length;
			})
			.map(result => JSON.parse(result.ref));
	}

	static makeFuzzy(term) {
		// Let's arbitrarily decide that every ~4.5 characters of length increases the amount
		// of fuzziness by 1; in practice this seems about right to account for typos, etc.
		const fuzzyAmount = Math.floor(term.length / 4.5);

		return fuzzyAmount > 0 ?
			term + '~' + fuzzyAmount :
			term;
	}
}

module.exports = new LocationSearch();
