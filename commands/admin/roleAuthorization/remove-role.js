"use strict";

const log = require('loglevel').getLogger('RemoveRoleCommand'),
  Commando = require('discord.js-commando'),
  {CommandGroup} = require('../../../app/constants'),
  Helper = require('../../../app/helper'),
  RoleAuthorization = require('../../../app/role-authorization'),
  settings = require('../../../data/settings.json');

class RemoveRoleCommand extends Commando.Command {
  constructor(client) {
    super(client, {
      name: 'remove-role',
      group: CommandGroup.ADMIN,
      memberName: 'remove-role',
      description: 'Removes an authorized role from a command.',
      examples: ['\t!remove-role meetup @Meetup'],
      aliases: ['delete-role'],
      args: [
        {
          key: 'command',
          prompt: 'What command are you removing an authorized role from?\n',
          type: 'command'
        },
        {
          key: 'role',
          prompt: 'What role are you removing from authorization for this command?',
          type: 'role'
        }
      ],
      guildOnly: true
    });

    client.dispatcher.addInhibitor(message => {
      if (!!message.command && message.command.name === 'remove-role') {
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
    const {command, role} = args;

    RoleAuthorization.removeRole(message.channel.guild, command, role)
      .then(result => message.react(Helper.getEmoji(settings.emoji.thumbsUp) || '👍'))
      .catch(err => log.error(err));
  }
}

module.exports = RemoveRoleCommand;
