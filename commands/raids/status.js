"use strict";

const log = require('loglevel').getLogger('StatusCommand'),
  Commando = require('discord.js-commando'),
  {CommandGroup} = require('../../app/constants'),
  Helper = require('../../app/helper'),
  Gym = require('../../app/gym'),
  Raid = require('../../app/raid');

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
        !Raid.validRaid(message.channel.id) &&
        !Gym.isValidChannel(message.channel.name)) {
        return ['invalid-channel', message.reply(Helper.getText('status.warning', message))];
      }
      return false;
    });
  }

  async run(message, args) {
    if (!Raid.validRaid(message.channel.id)) {
      const raids_message = await Raid.getRaidsFormattedMessage(message.channel.id);
      message.channel.send(raids_message)
        .then(message => message.delete({timeout: 60000}))
        .catch(err => log.error(err));
    } else {
      const raid = Raid.getRaid(message.channel.id),
        raid_source_channel_message = await Raid.getRaidSourceChannelMessage(raid),
        formatted_message = await Raid.getFormattedMessage(raid);

      // post a new raid message, deleting last one in channel if it exists
      message.channel.send(raid_source_channel_message, formatted_message)
        .then(status_message => {
          Raid.replaceLastMessage(raid.channel_id, status_message);
        })
        .catch(err => log.error(err));
    }
  }
}

module.exports = StatusCommand;
