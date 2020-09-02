"use strict";

const Gym = require('./gym'),
  Helper = require('./helper'),
  Raid = require('./raid');

class RemoteRaidChannel {
  constructor() {
  }

  initialize() {
    Helper.client.on('raidCreated', async (raid, reportingMemberId) => raid.createRemoteRaidChannelMessage());
  }
}

module.exports = new RemoteRaidChannel();
