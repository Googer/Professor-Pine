"use strict";

const log = require('loglevel').getLogger('DoneCommand'),
  Commando = require('discord.js-commando'),
  {CommandGroup} = require('../../app/constants'),
  Helper = require('../../app/helper'),
  PartyManager = require('../../app/party-manager'),
  settings = require('../../data/settings');

class DoneCommand extends Commando.Command {
  constructor(client) {
    super(client, {
      name: 'done',
      group: CommandGroup.BASIC_RAID,
      memberName: 'done',
      aliases: ['complete', 'finished', 'finish', 'caught-it', 'got-it'],
      description: 'Lets others know you have completed an existing raid.\n',
      details: 'Use this command to tell everyone you have completed this raid.',
      examples: ['\t!done', '\t!complete', '\t!caught-it'],
      guildOnly: true
    });

    client.dispatcher.addInhibitor(message => {
      if (!!message.command && message.command.name === 'done' &&
        !PartyManager.validParty(message.channel.id)) {
        return ['invalid-channel', message.reply('Say you have completed a raid from its raid channel!')];
      }
      return false;
    });
  }

  async run(message, args) {
    PartyManager.getParty(message.channel.id)
      .setPresentAttendeesToComplete(undefined, message.member.id)
      .catch(err => log.error(err));

    message.react(Helper.getEmoji(settings.emoji.thumbsUp) || '👍')
      .catch(err => log.error(err));
  }
}

module.exports = DoneCommand;
