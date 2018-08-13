"use strict";

const log = require('loglevel').getLogger('Map'),
  fs = require('fs'),
  polyline = require('@mapbox/polyline'),
  privateSettings = require('../data/private-settings'),
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
    const uri = 'http://nominatim.openstreetmap.org/search/query?format=json&bounded=1&limit=5&polygon_geojson=1' +
      `&viewbox=${this.bounds.join(',')}&q=${querystring.escape(location)}`;

    return await request({
      uri,
      headers: {
        'User-Agent': 'Professor Pine Pokemon Go Raid Coordination Discord Bot/1.0'
      },
      json: true
    }).then(body => {
      const results = body
        .map(body => body.geojson);

      if (results.length === 0) {
        // No matches
        return {
          feature: null,
          regions: []
        };
      }

      if (results[0].type === 'LineString') {
        // Sort longest result to be first
        results.sort((a, b) => turf.length(b) - turf.length(a));
      } else {
        // Sort largest result to be first
        results.sort((a, b) => turf.area(b) - turf.area(a));
      }

      const searchedRegion = results[0];

      switch (searchedRegion.type) {
        case 'Polygon': {
          return {
            feature: searchedRegion,
            regions: this.findMatches(searchedRegion)
          };
        }

        case 'MultiPolygon': {
          const matchingRegions = new Set();

          searchedRegion.coordinates
            .map(coordinates => turf.polygon(coordinates))
            .forEach(polygon => {
              this.findMatches(polygon)
                .forEach(matchingRegion => matchingRegions.add(matchingRegion));
            });

          return {
            feature: searchedRegion,
            regions: Array.from(matchingRegions.values())
          };
        }

        case 'LineString': {
          const matchingRegions = new Set();
          searchedRegion.coordinates
            .map(coordinates => turf.point(coordinates))
            .forEach(point => {
              this.findMatch(point)
                .forEach(matchingRegion => matchingRegions.add(matchingRegion));
            });

          return {
            feature: searchedRegion,
            regions: Array.from(matchingRegions.values())
          };
        }

        case 'Point': {
          return {
            feature: searchedRegion,
            regions: this.findMatch(searchedRegion)
          };
        }
      }
    }).catch(err => log.error(err));
  }

  findMatches(polygon) {
    return this.regions
      .map(region => Object.create({
        region,
        intersection: turf.intersect(polygon, region)
      }))
      .filter(({region, intersection}) => intersection !== null)
      .sort((matchA, matchB) => turf.area(matchB.intersection) - turf.area(matchA.intersection))
      .map(({region, intersection}) => region.properties.name);
  }

  findMatch(point) {
    return this.regions
      .filter(region => turf.inside(point, region) === true)
      .map(region => region.properties.name);
  }

  encodePolygon(polygon) {
    const lineString = turf.polygonToLine(polygon);

    switch (lineString.geometry.type) {
      case 'LineString':
        return `path=fillcolor:0xAA000033%7Ccolor:red%7Cweight:2%7Cenc:${polyline.fromGeoJSON(lineString)}`;

      case 'MultiLineString':
        return lineString.geometry.coordinates
          .map(coordinates => turf.lineString(coordinates))
          .map(lineString => polyline.fromGeoJSON(lineString))
          .map(encodedPolyline => `path=fillcolor:0xAA000033%7Ccolor:red%7Cweight:2%7Cenc:${encodedPolyline}`)
          .join('&');

      default:
        return '';
    }
  }

  encodeLineString(lineString) {
    return `path=color:red%7Cweight:2%7Cenc:${polyline.fromGeoJSON(lineString)}`;
  }

  async getMapImage(feature) {
    let uri = 'https://maps.googleapis.com/maps/api/staticmap?' +
      'size=640x320&' +
      'scale=2&' +
      `key=${privateSettings.googleApiKey}&`;

    switch (feature.type) {
      case 'Polygon':
        uri += this.encodePolygon(feature);
        break;

      case 'MultiPolygon':
        uri += feature.coordinates
          .map(coordinates => turf.polygon(coordinates))
          .map(polygon => this.encodePolygon(polygon))
          .join('&');
        break;

      case 'LineString':
        uri += this.encodeLineString(feature);
        break;

      case 'Point':
        uri += `zoom=12&markers=color:red|${feature.coordinates[1]},${feature.coordinates[0]}`;
        break;
    }

    return await request(
      {
        uri,
        encoding: null
      })
      .catch(err => log.error(err));
  }
}

module.exports = new Map();