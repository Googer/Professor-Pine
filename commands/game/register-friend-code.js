"use strict";

const log = require('loglevel').getLogger('RegisterFriendCodeCommand'),
  Commando = require('discord.js-commando'),
  {CommandGroup} = require('../../app/constants'),
  Helper = require('../../app/helper'),
  settings = require('../../data/settings'),
  User = require('../../app/user');

class RegisterFriendCodeCommand extends Commando.Command {
  constructor(client) {
    super(client, {
      name: 'register-friend-code',
      group: CommandGroup.FRIENDS,
      memberName: 'register-friend-code',
      aliases: ['register-friend', 'register-code'],
      description: 'Register your Pokémon Go Friend Code.',
      details: 'Use this command to register your Pokémon Go friend code for reference based on Discord name.',
      examples: ['\t!register-friend-code 0110 1000 0110', '\t!register-code 1001 0010 0001'],
      args: [
        {
          key: 'code',
          label: 'friendcode',
          prompt: 'What is your Pokémon Go friend code?\n',
          type: 'friendcode'
        }
      ],
      argsPromptLimit: 3,
      guildOnly: true
    });

    client.dispatcher.addInhibitor(message => {
      if (!!message.command && message.command.name === 'auto' && !Helper.isBotChannel(message)) {
        return ['invalid-channel', message.reply(Helper.getText('register-friend-code.warning', message))];
      }
      return false;
    });
  }

  async run(message, args) {
    const code = args['code'];
    let formatted = '';

    for(let index = 0; index < 12; index++) {
      if (index === 4 || index === 8) {
        formatted += ' ';
      }

      formatted += code.charAt(index);
    }

    User.setFriendCode(message.member, formatted)
      .then(result => message.react(Helper.getEmoji(settings.emoji.thumbsUp) || '👍'))
      .catch(err => log.error(err));
  }
}

module.exports = RegisterFriendCodeCommand;
