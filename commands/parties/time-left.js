"use strict";

const log = require('loglevel').getLogger('TimeLeftCommand'),
  Commando = require('discord.js-commando'),
  {CommandGroup, PartyType, TimeParameter} = require('../../app/constants'),
  Helper = require('../../app/helper'),
  PartyManager = require('../../app/party-manager'),
  settings = require('../../data/settings');

class TimeRemainingCommand extends Commando.Command {
  constructor(client) {
    super(client, {
      name: 'left',
      group: CommandGroup.RAID_CRUD,
      memberName: 'left',
      aliases: ['time-left', 'time-remaining', 'remaining', 'time-remain', 'remain', 'end-time', 'end', 'ends', 'ending'],
      description: 'Sets the remaining time for an existing raid.',
      details: 'Use this command to set remaining time on a raid.',
      examples: ['\t!left 45', '\t!remain 50'],
      args: [
        {
          key: TimeParameter.END,
          label: 'time left',
          prompt: 'How much time is remaining (in minutes) until the raid ends or when is the train ending (absolute time)?\nExample: `43`\n\n*or*\n\nWhen does this raid end?\nExample: `6:12`\n',
          type: 'time'
        }
      ],
      argsPromptLimit: 3,
      guildOnly: true
    });

    client.dispatcher.addInhibitor(message => {
      if (!!message.command && message.command.name === 'left' &&
        !PartyManager.validParty(message.channel.id, [PartyType.RAID, PartyType.RAID_TRAIN])) {
        return ['invalid-channel', message.reply('Set the time remaining for a raid from its raid channel or the completion time for a raid train from its train channel!')];
      }
      return false;
    });
  }

  async run(message, args) {
    const time = args[TimeParameter.END],
      raid = PartyManager.getParty(message.channel.id),
      info = await raid.setEndTime(time);

    message.react(Helper.getEmoji(settings.emoji.thumbsUp) || '👍')
      .catch(err => log.error(err));

    raid.refreshStatusMessages()
      .catch(err => log.error(err));
  }
}

module.exports = TimeRemainingCommand;
