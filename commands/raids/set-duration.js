"use strict";

const log = require('loglevel').getLogger('DurationTimeCommand'),
  Commando = require('discord.js-commando'),
  {CommandGroup, PartyType, TimeParameter} = require('../../app/constants'),
  Helper = require('../../app/helper'),
  PartyManager = require('../../app/party-manager'),
  settings = require('../../data/settings');

class DurationTimeCommand extends Commando.Command {
  constructor(client) {
    super(client, {
      name: 'duration',
      group: CommandGroup.RAID_CRUD,
      memberName: 'duration',
      aliases: ['raid-duration', 'set-duration', 'length'],
      description: 'Sets the duration for an existing raid.',
      details: 'Use this command to set the duration for a raid.',
      examples: ['\t!duration 60'],
      args: [
        {
          key: 'duration',
          label: 'duration',
          prompt: 'How many minutes long is this raid?\nExample: `60`\n',
          type: 'duration',
          min: 1,
          max: 180
        }
      ],
      argsPromptLimit: 3,
      guildOnly: true
    });

    client.dispatcher.addInhibitor(message => {
      if (!!message.command && message.command.name === 'duration' &&
        !PartyManager.validParty(message.channel.id, PartyType.RAID)) {
        return {
          reason: 'invalid-channel',
          response: message.reply('Set the duration for a raid from its raid channel!')
        };
      }
      return false;
    });
  }

  async run(message, args) {
    const {duration} = args,
      raid = PartyManager.getParty(message.channel.id),
      info = await raid.setDuration(duration);

    message.react(Helper.getEmoji(settings.emoji.thumbsUp) || '👍')
      .catch(err => log.error(err));

    raid.refreshStatusMessages()
      .catch(err => log.error(err));
  }
}

module.exports = DurationTimeCommand;
