"use strict";

const log = require('loglevel').getLogger('ClearRouteCommand'),
  Commando = require('discord.js-commando'),
  {CommandGroup, PartyType} = require('../../app/constants'),
  Helper = require('../../app/helper'),
  PartyManager = require('../../app/party-manager'),
  settings = require('../../data/settings'),
  Gym = require('../../app/gym'),
  Utility = require('../../app/utility');

class ClearRouteCommand extends Commando.Command {
  constructor(client) {
    super(client, {
      name: 'route-clear',
      group: CommandGroup.ADMIN,
      memberName: 'route-clear',
      aliases: ['clear-route', 'clear-gyms', 'clear-locations', 'gyms-clear', 'locations-clear'],
      description: 'Clears a train\'s route.\n',
      details: 'Use this command to clear a train\'s route.',
      examples: ['\t!route-clear'],
      guildOnly: true
    });

    client.dispatcher.addInhibitor(message => {
      if (!!message.command && message.command.name === 'route-clear' &&
        !Helper.isBotManagement(message)) {
        return ['invalid-channel', message.reply('To clear a route, you must be a member of staff!')];
      }

      if (!!message.command && message.command.name === 'route-clear' &&
        !PartyManager.validParty(message.channel.id, [PartyType.RAID_TRAIN])) {
        return ['invalid-channel', message.reply('To clear a route, you must be in a train\'s channel!')];
      }

      return false;
    });
  }

  async run(message, args) {
    const party = PartyManager.getParty(message.channel.id);
    await party.clearRoute();

    message.react(Helper.getEmoji(settings.emoji.thumbsUp) || '👍')
      .catch(err => log.error(err));

    party.refreshStatusMessages();
  }
}

module.exports = ClearRouteCommand;
