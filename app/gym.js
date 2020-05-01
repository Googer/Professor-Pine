"use strict";

const log = require('loglevel').getLogger('GymSearch'),
  dbhelper = require('./dbhelper'),
  lunr = require('lunr'),
  he = require('he'),
  Helper = require('./helper'),
  removeDiacritics = require('diacritics').remove,
  Region = require('./region'),
  Search = require('./search'),
  settings = require('../data/settings');

//This will serve as the object that contains gym indexes for each region
//Since lunr indexes are immutable, and it would be terribly inefficient to rebuild an index for all gyms in the server on every change
//Instead we will create individual indexes based on region - which will reindex only affected regions whenever a change is made
class GymCache {
  constructor() {
    lunr.Pipeline.registerFunction(Gym.blacklistWordFilter, 'blacklistWords');
    lunr.Pipeline.registerFunction(Search.stopWordFilter, 'customStopwords');
  }

  async buildIndexes() {
    log.info('Beginning indexing of all channels');

    this.channels = Object.create(null);
    this.indexing = true;

    let channels = await Region.getAllBoundedChannels();

    this.placesQueue = []; //Gyms that need geo updates
    this.indexQueue = []; //Channels that need reindexing

    let channelsProcessed = 0;
    for (const channel of channels) {
      log.info("Indexing channel: " + channel["channelId"]);
      await this.rebuildRegion(channel["channelId"]);
      channelsProcessed++;
      if (channelsProcessed === channels.length) {
        await this.rebuildMaster();
        this.indexing = false;
        log.info('Indexing of all channels completed!');
      }
    }
  }

  async rebuildIndexesForChannels() {
    const that = this;
    if (this.indexQueue.length > 0) {
      await this.rebuildMaster();
    }

    const removeIndex = this.indexQueue.slice(0);
    removeIndex.forEach(async channelId => {
      log.info(`Trying to rebuild region of channel: ${channelId}`);
      await that.rebuildRegion(channelId);
      let index = that.indexQueue.indexOf(channelId);
      if (index > -1) {
        that.indexQueue.splice(index, 1);
      }
    });
  }

  async rebuildRegion(channel) {
    const channels = this.channels;
    return new Promise(async (resolve, reject) => {
      //Get the polygon of the defined region assigned to this channel
      let region = channel ? await Region.getRegionsRaw(channel)
        .catch(error => null) : null;

      //Expand the polygon of this region outwards to include bordering gyms
      let regionObject = region ? Region.getCoordRegionFromText(region) : null;
      const expanded = region ? Region.enlargePolygonFromRegion(regionObject) : null;
      const expandedRegion = region ? Region.polygonStringFromRegion(expanded) : null;

      //Get gyms inside the enclosed polygon
      let channelGyms = await Region.getGyms(Region.polygonStringFromRegion(regionObject))
        .catch(error => log.error(err));
      let expandedGyms = await Region.getGyms(expandedRegion)
        .catch(error => log.error(err));

      if (!!channelGyms && !!expandedGyms) {
        let neighboringGyms = expandedGyms
          .filter(gym => !channelGyms
            .map(channelGym => channelGym.id).includes(gym.gymId));

        //Create lunr search indices for this channel and add it to the cache
        let localGymsIndex = new Gym(`${channel} [local]`, channelGyms);
        let neighboringGymsIndex = new Gym(`${channel} [neighbor]`, neighboringGyms);
        channels[channel] = {local: localGymsIndex, neighboring: neighboringGymsIndex};

        resolve(true);
      } else {
        reject(false);
      }
    })
  }

  async rebuildMaster() {
    const that = this;
    return new Promise(async (resolve, reject) => {
      //Get all gyms
      let allGyms = await Region.getAllGyms();
      if (!!allGyms) {
        //Create lunr search index for all gyms
        that.masterIndex = new Gym('master', allGyms);

        Helper.client.emit('gymsReindexed');

        resolve(true);
      } else {
        reject(false);
      }
    })
  }

  //Handle incoming searches and pass them to the proper search index based on channel
  search(channel, terms, nameOnly) {
    if (channel === null) {
      if (this.masterIndex) {
        return this.masterIndex.search(terms, nameOnly);
      } else {
        return false;
      }
    } else {
      if (!!this.channels[channel]) {
        const localResults = this.channels[channel].local.search(terms, nameOnly);
        return localResults.length > 0 ?
          localResults :
          this.channels[channel].neighboring.search(terms, nameOnly);
      } else {
        return false;
      }
    }
  }

  isValidChannel(channel) {
    return !!this.channels[channel.toString()];
  }

  async getGym(gymId) {
    for (const key in this.channels) {
      const cache = this.channels[key],
        gym = cache.local.getGym(gymId);
      if (!!gym) {
        return gym;
      }
    }

    const gymInfo = await dbhelper.query("SELECT * FROM Gym LEFT JOIN GymMeta ON Gym.id = GymMeta.gymId WHERE id = ?", [gymId])
      .catch(error => {
        log.error(error);
      });

    if (!gymInfo) {
      return null;
    }

    return gymInfo[0];
  }

  markGymsForPlacesUpdates(gyms) {
    log.info(`Marking ${gyms} for places updates`);
    gyms.forEach(gymId => {
      if (this.placesQueue.indexOf(gymId) === -1) {
        this.placesQueue.push(gymId);
      }
    });
  }

  async markPlacesComplete(gym) {
    if (this.placesQueue.indexOf(gym) > -1) {
      this.placesQueue.splice(this.placesQueue.indexOf(gym), 1);
    }

    //Get channels that need to be re-indexed
    //Add to queue
    let affectedChannels = await Region.findAffectedChannels(gym);
    this.markChannelsForReindex(affectedChannels);
  }

  getPlacesQueue() {
    return this.placesQueue;
  }

  getIndexQueue() {
    return this.indexQueue;
  }

  getNextGymsForPlacesUpdate() {
    if (this.placesQueue.length > 10) {
      return this.placesQueue.splice(0, 10);
    } else {
      return this.placesQueue.splice(0, this.placesQueue.length);
    }
  }

  markChannelsForReindex(channelIds) {
    log.info(`Marking ${channelIds} for index updates`);
    channelIds.forEach(channelId => {
      if (this.indexQueue.indexOf(channelId) === -1) {
        this.indexQueue.push(channelId);
      }
    });
  }
}

class Gym extends Search {
  constructor(name, gyms) {
    super();
    this.name = name;
    this.gyms = gyms;
    this.buildIndex();
  }

  buildIndex() {
    if (!this.gyms) {
      return;
    }

    log.debug(`${this.name} - Splicing gym metadata and indexing gym data...`);

    const gyms = this.gyms;

    this.index = lunr(function () {
      // reference will be the entire gym object so we can grab whatever we need from it (GPS coordinates, name, etc.)
      this.ref('object');

      // static fields for gym name, nickname, and description
      this.field('id');
      this.field('name');
      this.field('nickname');
      this.field('description');
      this.field('keywords');
      this.field('notice');

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

      // replace default stop word filter with custom one
      this.pipeline.remove(lunr.stopWordFilter);
      this.pipeline.after(lunr.trimmer, Gym.blacklistWordFilter);
      this.pipeline.after(Gym.blacklistWordFilter, Search.stopWordFilter);

      gyms.forEach(gym => {
        // Gym document is a object with its reference and fields to collection of values
        const gymDocument = Object.create(null);

        gymDocument["id"] = gym.id;

        gym.name = he.decode(gym.name);
        if (gym.description) {
          gym.description = he.decode(gym.description);
        } else {
          gym.description = "";
        }

        // static fields
        gymDocument['name'] = removeDiacritics(gym.name).replace(/[^\w\s-]+/g, '');
        gymDocument['description'] = removeDiacritics(gym.description).replace(/[^\w\s-]+/g, '');

        if (gym.nickname) {
          gym.nickname = he.decode(gym.nickname);
          gymDocument['nickname'] = removeDiacritics(gym.nickname).replace(/[^\w\s-]+/g, '');
        }

        // keywords (formerly additionalTerms)
        if (gym.keywords) {
          gymDocument['keywords'] = removeDiacritics(gym.keywords);
        }

        if (!gym.geodata) {
          log.error('Gym "' + gym.name + '" has no geocode information!');
        } else {
          const geo = JSON.parse(gym.geodata);
          const addressComponents = geo["addressComponents"];

          for (const [key, value] of Object.entries(addressComponents)) {
            gymDocument[key] = removeDiacritics(value);
          }
        }

        if (gym.places) {
          gymDocument["places"] = removeDiacritics(gym.places);
        }

        // reference
        gymDocument['object'] = JSON.stringify(gym);

        // Actually add this gym to the Lunr db
        this.add(gymDocument);
      }, this);
    });

    log.debug(`${this.name} - Indexing gym data complete`);
  }

  internalSearch(terms, fields) {
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
      .filter(term => Search.stopWordFilter(term))
      .filter(term => Gym.blacklistWordFilter(term));

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
        result.gym = gym;

        return result;
      });
  }

  channelSearch(terms, nameOnly) {
    let results;

    if (nameOnly) {
      results = this.internalSearch(terms, ['name']);

      if (results.length === 0) {
        // That didn't return anything so try with keywords added as well (to accomodate gyms with cutoff names that
        // can be added as keywords, etc.)
        results = this.internalSearch(terms, ['name', 'keywords']);
      }
    } else {
      // First try against name/nickname only
      results = this.internalSearch(terms, ['name', 'nickname']);

      if (results.length === 0) {
        // That didn't return anything, so now try the with description & keywords as well
        results = this.internalSearch(terms, ['name', 'nickname', 'description', 'keywords']);
      }

      if (results.length === 0) {
        // That still didn't return anything, so now try with all fields
        results = this.internalSearch(terms);
      }
    }

    return results;
  }

  search(terms, nameOnly) {
    return this.channelSearch(terms, nameOnly);
  }

  getGym(gymId) {
    return this.gyms
      .find(g => g.id === gymId);
  }
}

Gym.blacklistWordFilter = lunr.generateStopWordFilter(settings.blacklistWords);

module.exports = new GymCache();
