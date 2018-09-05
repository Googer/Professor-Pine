"use strict";

const log = require('loglevel').getLogger('StatusCommand'),
  Commando = require('discord.js-commando'),
  {CommandGroup} = require('../../app/constants'),
  Helper = require('../../app/helper'),
  Gym = require('../../app/gym'),
  PartyManager = require('../../app/party-manager'),
  Raid = require('../../app/raid'),
  settings = require('../../data/settings');

class StatusCommand extends Commando.Command {
  constructor(client) {
    super(client, {
      name: 'status',
      group: CommandGroup.BASIC_RAID,
      memberName: 'status',
      description: 'Gets an update on a single raid, or lists all the raids available in the channel (context-sensitive).',
      details: 'Use this command when trying to figure out what raids are available or the status of a raid being planned.  NOTE: This does not get all of the raids in the entire discord, it is channel specific.',
      examples: ['\t!status'],
      guildOnly: true,
      argsType: 'multiple'
    });

    client.dispatcher.addInhibitor(message => {
      if (!!message.command && message.command.name === 'status' &&
        !PartyManager.validParty(message.channel.id) &&
        !Gym.isValidChannel(message.channel.name)) {
        return ['invalid-channel', message.reply(Helper.getText('status.warning', message))];
      }
      return false;
    });
  }

  async run(message, args) {
    if (!PartyManager.validParty(message.channel.id)) {
      const raidsMessage = await Raid.getRaidsFormattedMessage(message.channel.id);
      message.channel.send(raidsMessage)
        .then(message => message.delete({timeout: settings.messageCleanupDelayStatus}))
        .catch(err => log.error(err));
    } else {
      const raid = PartyManager.getParty(message.channel.id),
        sourceChannelMessageHeader = await raid.getSourceChannelMessageHeader(),
        fullStatusMessage = await raid.getFullStatusMessage();

      // post a new raid message, deleting last one in channel if it exists
      message.channel.send(sourceChannelMessageHeader, fullStatusMessage)
        .then(statusMessage => {
          raid.replaceLastMessage(statusMessage);
        })
        .catch(err => log.error(err));
    }
  }
}

module.exports = StatusCommand;
