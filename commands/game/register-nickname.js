"use strict";

const log = require('loglevel').getLogger('RegisterNicknameCommand'),
  Commando = require('discord.js-commando'),
  {CommandGroup} = require('../../app/constants'),
  Helper = require('../../app/helper'),
  settings = require('../../data/settings'),
  User = require('../../app/user');

class RegisterNicknameCommand extends Commando.Command {
  constructor(client) {
    super(client, {
      name: 'register-nickname',
      group: CommandGroup.FRIENDS,
      memberName: 'register-nickname',
      aliases: ['register-nick', 'register-name'],
      description: 'Register your Pokémon Go nickname.',
      details: 'Use this command to register your Pokémon Go nickname for reference based on Discord name.',
      examples: ['\t!register-nickname kingkovifor', '\t!register-code ShiggihS'],
      args: [
        {
          key: 'username',
          label: 'username',
          prompt: 'What is your Pokémon Go nickname?\n',
          type: 'string'
        }
      ],
      argsPromptLimit: 3,
      guildOnly: true
    });

    client.dispatcher.addInhibitor(message => {
      if (!!message.command && message.command.name === 'auto' && !Helper.isBotChannel(message)) {
        return {
          reason: 'invalid-channel',
          response: message.reply(Helper.getText('register-nickname.warning', message))
        };
      }
      return false;
    });
  }

  async run(message, args) {
    const nickname = args['username'];

    User.setNickname(message.member, nickname.toLowerCase())
      .then(result => message.react(Helper.getEmoji(settings.emoji.thumbsUp) || '👍'))
      .catch(err => log.error(err));
  }
}

module.exports = RegisterNicknameCommand;
