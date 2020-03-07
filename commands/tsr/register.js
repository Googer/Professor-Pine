"use strict";

const log = require('loglevel').getLogger('RegisterSilphCommand'),
  Commando = require('discord.js-commando'),
  {CommandGroup} = require('../../app/constants'),
  Helper = require('../../app/helper'),
  settings = require('../../data/settings'),
  User = require('../../app/user');

class RegisterSilphCommand extends Commando.Command {
  constructor(client) {
    super(client, {
      name: 'register-silph',
      group: CommandGroup.SILPH,
      memberName: 'register-silph',
      aliases: ['silph-username', 'silph-name'],
      description: 'Register your Silph Road Username.',
      details: 'Use this command to register your Silph Road username for reference based on Discord name.',
      examples: ['\t!register-silph kingkovifor', '\t!silph-username melgood711'],
      args: [
        {
          key: 'username',
          label: 'username',
          prompt: 'What is your Silph Road username?\n',
          type: 'string'
        }
      ],
      argsPromptLimit: 3,
      guildOnly: true
    });

    client.dispatcher.addInhibitor(message => {
      if (!!message.command && message.command.name === 'register-silph' && !Helper.isBotChannel(message)) {
        return {
          reason: 'invalid-channel',
          response: message.reply(Helper.getText('register-silph.warning', message))
        };
      }
      return false;
    });
  }

  async run(message, args) {
    const username = args['username'];

    User.setSilphUsername(message.member, username)
      .then(result => message.react(Helper.getEmoji(settings.emoji.thumbsUp) || '👍'))
      .catch(err => log.error(err));
  }
}

module.exports = RegisterSilphCommand;
