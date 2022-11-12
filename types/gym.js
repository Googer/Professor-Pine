"use strict";

const log = require('loglevel').getLogger('GymSearch'),
  Commando = require('discord.js-commando'),
  {GymParameter, PartyType} = require('../app/constants'),
  PartyManager = require('../app/party-manager'),
  Region = require('../app/region'),
  Gym = require('../app/gym');

class GymType extends Commando.ArgumentType {
  constructor(client) {
    super(client, 'gym');
  }

  async validate(value, message, arg) {
    try {
      const nameOnly = !!arg.isScreenshot,
        creationChannelId = await PartyManager.getCreationChannelId(message.channel.id),
        creationChannel = await PartyManager.getChannel(creationChannelId),
        channelName = creationChannel.ok ? creationChannel.channel.name : "",
        results = Gym.search(creationChannelId, value.split(/\s/g), nameOnly);
      if (!results || results.length === 0) {
        if (arg && !arg.isScreenshot) {
          return `"${value}" returned no gyms.\n\nPlease try your search again, entering the text you want to search for.\n\n${arg.prompt}`;
        } else {
          return false;
        }
      }

      const regions = await Region.getChannelsForGym(results[0].gym, message.channel.guild.id);
      const resultChannel = await PartyManager.getChannel(regions[0]["channelId"]);
      const resultChannelName = resultChannel.ok ? resultChannel.channel.name : "";

      const gym = results[0].gym,
        gymName = gym.nickname ?
          gym.nickname :
          gym.name;

      if (resultChannelName !== channelName) {
        const adjacentChannel = message.channel.guild.channels.cache
          .find(channel => channel.name === resultChannelName &&
            channel.permissionsFor(message.client.user).has('VIEW_CHANNEL'));

        if (adjacentChannel === undefined) {
          return `${gymName} was found in #${resultChannelName} but it doesn't exist or I can't access it.  Yell at the mods!`;
        }

        message.adjacent = {
          channel: adjacentChannel,
          gymName: gymName,
          gymId: gym.id
        };
      }

      const party = PartyManager.getParty(message.channel.id),
        isExclusive = (!!party && !!party.isExclusive) || !!message.isExclusive,
        isElite = (!!party && !!party.isElite) || !!message.isElite,
        raid = PartyManager.findRaid(gym.gymId, isExclusive, isElite);

      if (arg.key !== GymParameter.FAVORITE && !!raid && !!party && party.type === PartyType.RAID) {
        const raid = PartyManager.findRaid(gym.id, isExclusive, isElite),
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
      creationChannelId = await PartyManager.getCreationChannelId(message.channel.id),
      results = Gym.search(creationChannelId, value.split(/\s/g), nameOnly);

    return results[0].gym.id;
  }
}

module.exports = GymType;
