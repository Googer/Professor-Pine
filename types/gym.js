"use strict";

const log = require('loglevel').getLogger('GymSearch'),
  Commando = require('discord.js-commando'),
  {GymParameter} = require('../app/constants'),
  PartyManager = require('../app/party-manager'),
  Gym = require('../app/gym');

class GymType extends Commando.ArgumentType {
  constructor(client) {
    super(client, 'gym');
  }

  async validate(value, message, arg) {
    try {
      const nameOnly = !!arg.isScreenshot,
        gyms = await Gym.search(message.channel.id, value.split(/\s/g), nameOnly);

      if (!gyms || gyms.length === 0) {
        const adjacentGyms = await Gym.adjacentRegionsSearch(message.channel.id, value.split(/\s/g), nameOnly);

        if (!adjacentGyms) {
          if (arg && !arg.isScreenshot) {
            return `"${value}" returned no gyms.\n\nPlease try your search again, entering the text you want to search for.\n\n${arg.prompt}`;
          } else {
            return false;
          }
        }

        const adjacentGymName = adjacentGyms.gyms[0].nickname ?
          adjacentGyms.gyms[0].nickname :
          adjacentGyms.gyms[0].gymName,
          adjacentChannel = message.channel.guild.channels
            .find(channel => channel.name === adjacentGyms.channel);

        if (arg && !arg.isScreenshot) {
          return `"${value}" returned no gyms; did you mean "${adjacentGymName}" over in ${adjacentChannel.toString()}?  ` +
            `If so please cancel and use ${adjacentChannel.toString()} to try again.\n\n` +
            `Please try your search again, entering only the text you want to search for.\n\n${arg.prompt}`;
        } else {
          return `"${value}" returned no gyms; if the gym name was "${adjacentGymName}", try uploading your screenshot to the ${adjacentChannel.toString()} channel instead.`;
        }
      }

      const gymId = gyms[0].gymId;

      if (arg.key !== GymParameter.FAVORITE && PartyManager.raidExistsForGym(gymId)) {
        const raid = PartyManager.findRaid(gymId),
          gymName = gyms[0].nickname ?
            gyms[0].nickname :
            gyms[0].gymName,
          channel = (await PartyManager.getChannel(raid.channelId)).channel;

        if (arg && !arg.isScreenshot) {
          return `"${gymName}" already has an active raid - ${channel.toString()}.\n\n` +
            `If this is the raid you are referring to please cancel and use ${channel.toString()}; ` +
            `otherwise try your search again, entering the text you want to search for.\n\n${arg.prompt}`;
        } else {
          return `"${gymName}" already has an active raid - ${channel.toString()}.`;
        }
      }

      return true;
    } catch (err) {
      log.error(err);
      if (arg && !arg.isScreenshot) {
        return `Invalid search terms entered.\n\nPlease try your search again, entering the text you want to search for.\n\n${arg.prompt}`;
      } else {
        return false;
      }
    }
  }

  async parse(value, message, arg) {
    const nameOnly = arg ?
      arg.isScreenshot :
      false,
      gyms = await Gym.search(message.channel.id, value.split(/\s/g), nameOnly);

    return gyms[0].gymId;
  }
}

module.exports = GymType;
