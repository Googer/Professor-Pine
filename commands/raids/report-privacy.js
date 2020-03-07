"use strict";

const log = require('loglevel').getLogger('PrivacyCommand'),
  Commando = require('discord.js-commando'),
  {CommandGroup} = require('../../app/constants'),
  Helper = require('../../app/helper'),
  settings = require('../../data/settings'),
  Privacy = require('../../app/privacy');

class PrivacyCommand extends Commando.Command {
  constructor(client) {
    super(client, {
      name: 'privacy',
      group: CommandGroup.RAID_CRUD,
      memberName: 'privacy',
      aliases: ['report-privacy'],
      description: 'Changes the visibility of your username when reporting a raid.\n',
      details: 'Use this command to change the visibility of your name when reporting a new raid.',
      examples: ['\t!privacy hidden', '\t!privacy shown'],
      args: [
        {
          key: 'privacy',
          label: 'privacy',
          prompt: 'What what level of privacy do you want when reporting raids (visible, hidden)?\n',
          type: 'privacy'
        }
      ],
      argsPromptLimit: 3,
      guildOnly: true
    });

    client.dispatcher.addInhibitor(message => {
      if (!!message.command && message.command.name === 'privacy' && !Helper.isBotChannel(message)) {
        return {
          reason: 'invalid-channel',
          response: message.reply(Helper.getText('auto-status.warning', message))
        };
      }
      return false;
    });
  }

  async run(message, args) {
    const privacyChoice = args['privacy'];

    Privacy.setPrivacyStatus(message.member, privacyChoice)
      .then(result => message.react(Helper.getEmoji(settings.emoji.thumbsUp) || '👍'))
      .catch(err => log.error(err));
  }
}

module.exports = PrivacyCommand;
