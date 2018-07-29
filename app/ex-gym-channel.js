"use strict";

const Gym = require('./gym'),
  Helper = require('./helper'),
  Raid = require('./raid');

class ExGymChannel {
  constructor() {
  }

  initialize() {
    Helper.client.on('raidCreated', (raid, reporting_member_id) => {
      const gym = Gym.getGym(raid.gymId);

      if ((gym.is_ex || gym.is_park) && !raid.isExclusive) {
        return Raid.createPotentialExRaidMessage(raid);
      } else {
        return false;
      }
    });
  }
}

module.exports = new ExGymChannel();