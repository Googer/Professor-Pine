"use strict";

const log = require('loglevel').getLogger('GymSearch'),
  lunr = require('lunr'),
  he = require('he'),
  removeDiacritics = require('diacritics').remove,
  Search = require('./search');

class Gym extends Search {
  constructor() {
    super();
  }

  buildIndex() {
    log.info('Splicing gym metadata and indexing gym data...');

    const gymsBase = require('PgP-Data/data/gyms'),
      gymsMetadata = require('PgP-Data/data/gyms-metadata'),
      parkGyms = require('PgP-Data/data/park-gyms'),
      mergedGyms = gymsBase
        .map(gym => Object.assign({}, gym, gymsMetadata[gym.gymId])),
      stopwordFilter = this.stopWordFilter;

    mergedGyms
      .filter(gym => parkGyms.includes(gym.gymId))
      .forEach(parkGym => parkGym.is_park = true);

    lunr.Pipeline.registerFunction(stopwordFilter, 'customStopwords');

    this.gyms = new Map(mergedGyms
      .map(gym => [gym.gymId, gym]));

    this.regionMap = require('PgP-Data/data/region-map');
    this.regionGraph = require('PgP-Data/data/region-graph');

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

      // replace default stop word filter with custom one
      this.pipeline.remove(lunr.stopWordFilter);
      this.pipeline.after(lunr.trimmer, stopwordFilter);

      mergedGyms.forEach(gym => {
        // Gym document is a object with its reference and fields to collection of values
        const gymDocument = Object.create(null);

        gym.gymName = he.decode(gym.gymName);
        gym.gymInfo.gymDescription = he.decode(gym.gymInfo.gymDescription);

        // static fields
        gymDocument['name'] = removeDiacritics(gym.gymName).replace(/[^\w\s-]+/g, '');
        gymDocument['description'] = removeDiacritics(gym.gymInfo.gymDescription).replace(/[^\w\s-]+/g, '');

        if (gym.nickname) {
          gym.nickname = he.decode(gym.nickname);
          gymDocument['nickname'] = removeDiacritics(gym.nickname).replace(/[^\w\s-]+/g, '');
        }

        // Build a map of the geocoded information:
        //   key is the address component's type
        //   value is a set of that type's values across all address components
        const addressInfo = new Map();
        if (!gym.gymInfo.addressComponents) {
          log.warn('Gym "' + gym.gymName + '" has no geocode information!');
        } else {
          gym.gymInfo.addressComponents.forEach(addressComponent => {
            addressComponent.addressComponents.forEach(addComp => {
              addComp.types.forEach(type => {
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
        addressInfo.forEach((value, key) => {
          gymDocument[key] = removeDiacritics(Array.from(value).join(' '));
        });

        // Add places into library
        if (gym.gymInfo.places) {
          gymDocument['places'] = removeDiacritics(he.decode(gym.gymInfo.places.join(' ')));
        }

        // merge in additional info from supplementary metadata file
        if (gym.additional_terms) {
          gymDocument['additional_terms'] = removeDiacritics(gym.additional_terms);
        }

        // reference
        gymDocument['object'] = JSON.stringify(gym);

        // Actually add this gym to the Lunr db
        this.add(gymDocument);
      }, this);
    });

    this.gymMap = Object.create(null);

    Object.entries(this.regionMap)
      .forEach(([region, gyms]) => {
        gyms.forEach(gym => this.gymMap[gym] = region);
      });

    log.info('Indexing gym data complete');
  }

  internalSearch(channelNames, terms, fields) {
    // lunr does an OR of its search terms and we really want AND, so we'll get there by doing individual searches
    // on everything and getting the intersection of the hits

    // first filter out stop words from the search terms; lunr does this itself so our hacky way of AND'ing will
    // return nothing if they have any in their search terms list since they'll never match anything
    const splitTerms = [].concat(...terms
      .map(term => term.split('-')));

    const filteredTerms = splitTerms
      .map(term => removeDiacritics(term))
      .map(term => term.replace(/[^\w\s*]+/g, ''))
      .map(term => term.toLowerCase())
      .filter(term => this.stopWordFilter(term));

    if (filteredTerms.length === 0) {
      return [];
    }

    let results = Search.singleTermSearch(filteredTerms[0], this.index, fields);

    for (let i = 1; i < filteredTerms.length; i++) {
      const termResults = Search.singleTermSearch(filteredTerms[i], this.index, fields);

      results = results
        .map(result => {
          const matchingResult = termResults.find(termResult => termResult.ref === result.ref);

          if (matchingResult) {
            // Multiply scores together for reordering later
            result.score *= matchingResult.score;
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
    results.sort((resultA, resultB) => resultB.score - resultA.score);

    // Filter results based on what channel names this request is for
    return results
      .map(result => JSON.parse(result.ref))
      .map(gym => {
        const result = Object.create(null);
        result.channelName = this.gymMap[gym.gymId];
        result.gym = gym;

        return result;
      })
      .filter(({channelName, gym}) => channelNames.indexOf(channelName) >= 0);
  }

  channelSearch(channelNames, terms, nameOnly) {
    let results;

    if (nameOnly) {
      results = this.internalSearch(channelNames, terms, ['name']);
    } else {
      // First try against name/nickname only
      results = this.internalSearch(channelNames, terms, ['name', 'nickname']);

      if (results.length === 0) {
        // That didn't return anything, so now try the with description & additional terms as well
        results = this.internalSearch(channelNames, terms, ['name', 'nickname', 'description', 'additional_terms']);
      }

      if (results.length === 0) {
        // That still didn't return anything, so now try with all fields
        results = this.internalSearch(channelNames, terms);
      }
    }

    return results;
  }

  async search(channelName, terms, nameOnly) {
    let results = this.channelSearch([channelName], terms, nameOnly);

    if (results.length === 0) {
      results = this.channelSearch(this.regionGraph[channelName], terms, nameOnly);
    }

    return results;
  }

  isValidChannel(channelName) {
    return !!this.regionMap[channelName];
  }

  getGym(gymId) {
    return this.gyms.get(gymId);
  }

  filterRegions(gymIds) {
    return Object.entries(this.regionMap)
      .map(([region, gyms]) => [region, gymIds.filter(x => gyms.includes(x))])
      .filter(([region, gyms]) => gyms.length > 0)
      .sort(([regionA, gymsA], [regionB, gymsB]) => regionA.localeCompare(regionB));
  }
}

module.exports = new Gym();
