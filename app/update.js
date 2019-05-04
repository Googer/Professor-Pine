"use strict";

const log = require('loglevel').getLogger('IntervalUpdater'),
	moment = require('moment'),
	private_settings = require('../data/private-settings'),
	settings = require('../data/settings'),
	Discord = require('discord.js'),
	Helper = require('./helper'),
	Region = require('./region'),
	GymCache = require('./gym'),
	Meta = require('./geocode'),
	dbhelper = require('./dbhelper'),
	TimeType = require('../types/time');

class IntervalUpdater {
	constructor() {
		var that = this;

		// loop update gym indexes
		if (private_settings.updater.channelIndexUpdateIntervalSeconds && private_settings.updater.channelIndexUpdateIntervalSeconds > 0) {
      const milliseconds = private_settings.updater.channelIndexUpdateIntervalSeconds * 100;
      this.updateIndexes = setInterval(() => {
        that.runIndexUpdate();
      }, milliseconds);
		}

    // loop update gym geocode & places
		if (private_settings.updater.gymPlacesIndexUpdateIntervalSeconds && private_settings.updater.gymPlacesIndexUpdateIntervalSeconds > 0) {
      const milliseconds = private_settings.updater.gymPlacesIndexUpdateIntervalSeconds * 100;
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
