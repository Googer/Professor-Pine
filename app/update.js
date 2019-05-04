"use strict";

const log = require('loglevel').getLogger('IntervalUpdater'),
  privateSettings = require('../data/private-settings'),
  GymCache = require('./gym'),
  Meta = require('./geocode');

class IntervalUpdater {
  constructor() {
    const that = this;

    // loop update gym indexes
    if (privateSettings.updater.channelIndexUpdateIntervalSeconds && privateSettings.updater.channelIndexUpdateIntervalSeconds > 0) {
      const milliseconds = privateSettings.updater.channelIndexUpdateIntervalSeconds * 100;
      this.updateIndexes = setInterval(() => {
        that.runIndexUpdate();
      }, milliseconds);
    }

    // loop update gym geocode & places
    if (privateSettings.updater.gymPlacesIndexUpdateIntervalSeconds && privateSettings.updater.gymPlacesIndexUpdateIntervalSeconds > 0) {
      const milliseconds = privateSettings.updater.gymPlacesIndexUpdateIntervalSeconds * 100;
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
