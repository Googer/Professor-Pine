"use strict";

const log = require('loglevel').getLogger('Map'),
	fs = require('fs'),
	querystring = require('querystring'),
	request = require('request-promise'),
	ToGeoJSON = require('togeojson-with-extended-style'),
	turf = require('@turf/turf'),
	DOMParser = require('xmldom').DOMParser;

class Map {
	constructor() {
		const map = fs.readFileSync(require.resolve('PgP-Data/data/map.kml'), 'utf8'),
			kml = new DOMParser().parseFromString(map);

		this.regions = ToGeoJSON.kml(kml).features
			.filter(feature => feature.geometry.type === 'Polygon');

		// flip order of coordinates so they're in the right order according to what turf expects
		this.regions.forEach(region => {
			region.geometry.coordinates[0].reverse();
		});

		this.bounds = turf.bbox(turf.featureCollection(this.regions));
	}

	async getRegions(location) {
		const uri = 'http://nominatim.openstreetmap.org/search/query?format=json&bounded=1&limit=1&polygon_geojson=1' +
			`&viewbox=${this.bounds.join(',')}&q=${querystring.escape(location)}`;

		return await request({
			uri,
			json: true
		}).then(body => {
			if (body.length === 0) {
				// No matches
				return [];
			}
			const searched_region = body[0].geojson;

			return this.regions
				.filter(region => turf.intersect(region, searched_region) !== null)
				.map(region => region.properties.name);
		}).catch(err => log.error(err));
	}
}

module.exports = new Map();