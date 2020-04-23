"use strict";

const log = require('loglevel').getLogger('AddRoleCommand'),
  Commando = require('discord.js-commando'),
  {CommandGroup} = require('../../../app/constants'),
  Helper = require('../../../app/helper'),
  RoleAuthorization = require('../../../app/role-authorization'),
  settings = require('../../../data/settings.json');

class AddRoleCommand extends Commando.Command {
  constructor(client) {
    super(client, {
      name: 'add-role',
      group: CommandGroup.ADMIN,
      memberName: 'add-role',
      description: 'Adds an authorized role to a command.',
      examples: ['\t!add-role meetup @Meetup'],
      args: [
        {
          key: 'command',
          prompt: 'What command are you adding an authorized role to?\n',
          type: 'command'
        },
        {
          key: 'role',
          prompt: 'What role are you authorizing for this command?',
          type: 'role'
        }
      ],
      guildOnly: true
    });

    client.dispatcher.addInhibitor(message => {
      if (!!message.command && message.command.name === 'add-role') {
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

    RoleAuthorization.addRole(message.channel.guild, command, role)
      .then(result => message.react(Helper.getEmoji(settings.emoji.thumbsUp) || '👍'))
      .catch(err => log.error(err));
  }
}

module.exports = AddRoleCommand;
