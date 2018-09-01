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
        channelName = await PartyManager.getCreationChannelName(message.channel.id),
        results = await Gym.search(channelName, value.split(/\s/g), nameOnly);

      if (results.length === 0) {
        if (arg && !arg.isScreenshot) {
          return `"${value}" returned no gyms.\n\nPlease try your search again, entering the text you want to search for.\n\n${arg.prompt}`;
        } else {
          return false;
        }
      }

      const resultChannelName = results[0].channelName,
        gym = results[0].gym,
        gymName = gym.nickname ?
          gym.nickname :
          gym.gymName;

      if (resultChannelName !== channelName) {
          const adjacentChannel = message.channel.guild.channels
            .find(channel => channel.name === resultChannelName &&
              channel.permissionsFor(message.client.user).has('VIEW_CHANNEL'));

        if (adjacentChannel === undefined) {
          return `${gymName} was found in #${adjacentChannel.toString()} but it doesn't exist or I can't access it.  Yell at the mods!`;
        }

        message.adjacent = {
          channel: adjacentChannel,
          gymName: gymName,
          gymId: gym.gymId
        };
      }

      if (arg.key !== GymParameter.FAVORITE && PartyManager.raidExistsForGym(gym.gymId)) {
        const raid = PartyManager.findRaid(gym.gymId),
          channel = (await PartyManager.getChannel(raid.channelId)).channel;

        if (arg && !arg.isScreenshot) {
          return `"${gymName}" already has an active raid - ${channel.toString()}.\n\n` +
            `If this is the raid you are referring to please cancel and use ${channel.toString()}; ` +
            `otherwise try your search again, entering the text you want to search for.\n\n${arg.prompt}`;
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
    if (!!message.adjacent) {
      // Validator already found gym in an adjacent channel
      return message.adjacent.gymId;
    }

    const nameOnly = arg ?
      arg.isScreenshot :
      false,
      channelName = await PartyManager.getCreationChannelName(message.channel.id),
      results = await Gym.search(channelName, value.split(/\s/g), nameOnly);

    return results[0].gym.gymId;
  }
}

module.exports = GymType;
