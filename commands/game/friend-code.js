"use strict";

const log = require('loglevel').getLogger('FriendCodeCommand'),
  Commando = require('discord.js-commando'),
  {CommandGroup} = require('../../app/constants'),
  Helper = require('../../app/helper'),
  settings = require('../../data/settings'),
  User = require('../../app/user');

class FriendCodeCommand extends Commando.Command {
  constructor(client) {
    super(client, {
      name: 'friend-code',
      group: CommandGroup.FRIENDS,
      memberName: 'friend-code',
      aliases: ['friend'],
      description: 'Retrieve a user\'s friend code.',
      details: 'Use this command to retrieve a discord user\'s friend code.',
      examples: ['\t!friend-code @KingKovifor'],
      args: [
        {
          key: 'user',
          label: 'user',
          prompt: 'What user are you looking up?\n',
          type: 'member'
        }
      ],
      argsPromptLimit: 3,
      guildOnly: true
    });

    client.dispatcher.addInhibitor(message => {
      if (!!message.command && message.command.name === 'auto' && !Helper.isBotChannel(message)) {
        return ['invalid-channel', message.reply(Helper.getText('friend-code.warning', message))];
      }
      return false;
    });
  }

  async run(message, args) {
    const member = args['user'],
      friendCode = await User.getFriendCode(member.user.id),
      header = friendCode ?
        message.member.toString() + ', that user\'s friend code is ' + friendCode + '.' :
        message.member.toString() + ', that user has not registered their friend code.';

    message.channel.send(header)
      .then(message => {
        message.delete({timeout: settings.messageCleanupDelayStatus})
          .catch(err => log.error(err));
      })
      .catch(err => log.error(err));
  }
}

module.exports = FriendCodeCommand;
