"use strict";

const log = require('loglevel').getLogger('Map'),
  fs = require('fs'),
  Helper = require('./helper'),
  main = require('../index'),
  polyline = require('@mapbox/polyline'),
  privateSettings = require('../data/private-settings'),
  querystring = require('querystring'),
  Region = require('./region'),
  request = require('request-promise'),
  Utility = require('./utility'),
  turf = require('@turf/turf');

class Map {
  constructor() {
  }

  async initialize(client) {
    this.client = client;

    await this.rebuildCache();

    Helper.client.on('regionsUpdated', async () =>
      await this.rebuildCache());
  }

  async rebuildCache() {
    log.debug('Rebuilding region map cache...');

    // wait for main initialization to be complete to be sure DB is set up
    while (!main.isInitialized) {
      await Utility.sleep(1000);
    }

    // TODO: make this guild-aware
    const regions = await Region.getAllRegions()
      .catch(err => log.error(err));

    this.regions = {};

    for (const region of regions) {
      const channelName = this.client.channels.cache.get(region.channelId).name,
        regionRaw = await Region.getRegionsRaw(region.channelId)
          .catch(error => null),
        regionObject = !!regionRaw ?
          Region.getCoordRegionFromText(regionRaw) :
          null;

      if (regionObject) {
        this.regions[channelName] = Region.getPolygonFromRegion(regionObject);
      }
    }

    this.bounds = turf.bbox(turf.featureCollection(Object.values(this.regions)));

    log.debug('Region map cache rebuilt');
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
    return Object.entries(this.regions)
      .map(([channelName, channelPolygon]) => Object.create({
        channelName,
        intersection: turf.intersect(polygon, channelPolygon)
      }))
      .filter(({channelName, intersection}) => intersection !== null)
      .sort((matchA, matchB) => turf.area(matchB.intersection) - turf.area(matchA.intersection))
      .map(({channelName, intersection}) => channelName);
  }

  findMatch(point) {
    return Object.entries(this.regions)
      .filter(([channelName, channelPolygon]) => turf.inside(point, channelPolygon) === true)
      .map(([channelName, channelPolygon]) => channelName);
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