"use strict";

const log = require('loglevel').getLogger('IntervalUpdater'),
  settings = require('../data/settings'),
  GymCache = require('./gym'),
  Meta = require('./geocode');

class IntervalUpdater {
  constructor() {
    const that = this;

    // loop update gym indexes
    if (settings.updater.channelIndexUpdateIntervalSeconds && settings.updater.channelIndexUpdateIntervalSeconds > 0) {
      const milliseconds = settings.updater.channelIndexUpdateIntervalSeconds * 1000;
      this.updateIndexes = setInterval(() => {
        that.runIndexUpdate();
      }, milliseconds);
    }

    // loop update gym geocode & places
    if (settings.updater.gymPlacesIndexUpdateIntervalSeconds && settings.updater.gymPlacesIndexUpdateIntervalSeconds > 0) {
      const milliseconds = settings.updater.gymPlacesIndexUpdateIntervalSeconds * 1000;
      this.updatePlaces = setInterval(() => {
        that.runPlacesUpdate();
      }, milliseconds);
    }
  }

  setClient(client) {
    this.client = client;
  }

  async runIndexUpdate() {
    log.info('Running Channel Index Updater...');
    GymCache.rebuildIndexesForChannels(); //This reindexes all channels in the current queue
  }

  async runPlacesUpdate() {
    log.info('Running Nearby Places Updater...');
    Meta.updatePlaces(GymCache); //This will update nearby places for next 10 gyms in queue
  }
}

module.exports = new IntervalUpdater();
