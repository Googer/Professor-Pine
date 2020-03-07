"use strict";

const log = require('loglevel').getLogger('FindNicknameCommand'),
  Commando = require('discord.js-commando'),
  {CommandGroup} = require('../../app/constants'),
  Helper = require('../../app/helper'),
  settings = require('../../data/settings'),
  User = require('../../app/user');

class FindNicknameCommand extends Commando.Command {
  constructor(client) {
    super(client, {
      name: 'find-nickname',
      group: CommandGroup.FRIENDS,
      memberName: 'find-nickname',
      aliases: ['find-username', 'user'],
      description: 'Retrieve a a discord user based on their in-game username.',
      details: 'Use this command to retrieve a discord user based on their in-game username.',
      examples: ['\t!find-username kingkovifor', '\t!user kingkovifor'],
      args: [
        {
          key: 'user',
          label: 'user',
          prompt: 'What user are you looking up?\n',
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
          response: message.reply(Helper.getText('find-username.warning', message))
        };
      }
      return false;
    });
  }

  async run(message, args) {
    const member = args['user'].toLowerCase(),
      discordMember = await User.getDiscordNameFromUsername(member, message),
      header = discordMember ?
        message.member.toString() + ', that username belongs to ' + discordMember.toString() + '.' :
        message.member.toString() + ', that user has not been associated with a discord member.';

    message.channel.send(header)
      .then(message => message.delete({timeout: settings.messageCleanupDelayStatus}))
      .catch(err => log.error(err));
  }
}

module.exports = FindNicknameCommand;
