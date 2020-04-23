"use strict";

const log = require('loglevel').getLogger('RequireRoleCommand'),
  Commando = require('discord.js-commando'),
  {CommandGroup} = require('../../../app/constants'),
  Helper = require('../../../app/helper'),
  RoleAuthorization = require('../../../app/role-authorization'),
  settings = require('../../../data/settings.json');

class RequireRoleCommand extends Commando.Command {
  constructor(client) {
    super(client, {
      name: 'require-role',
      group: CommandGroup.ADMIN,
      memberName: 'require-role',
      description: 'Sets whether or not a command requires a role to be executed.',
      examples: ['\t!require-role meetup true'],
      args: [
        {
          key: 'command',
          prompt: 'What command are you setting whether or not role authorization is required?\n',
          type: 'command'
        },
        {
          key: 'roleRequired',
          prompt: 'Do you want role-based authorization enabled not?',
          type: 'boolean'
        }
      ],
      guildOnly: true
    });

    client.dispatcher.addInhibitor(message => {
      if (!!message.command && message.command.name === 'require-role') {
        if (!Helper.isBotManagement(message)) {
          return {
            reason: 'unauthorized',
            response: message.reply('You are not authorized to use this command.')
          };
        }
      }

      return false;
    });
  }

  async run(message, args) {
    const {command, roleRequired} = args;

    RoleAuthorization.setRequired(message.channel.guild, command, roleRequired)
      .then(result => message.react(Helper.getEmoji(settings.emoji.thumbsUp) || '👍'))
      .catch(err => log.error(err));
  }
}

module.exports = RequireRoleCommand;
