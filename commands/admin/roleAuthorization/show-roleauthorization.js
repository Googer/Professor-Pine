"use strict";

const log = require('loglevel').getLogger('ShowRoleAuthorizationCommand'),
  Commando = require('discord.js-commando'),
  {CommandGroup} = require('../../../app/constants'),
  Discord = require('discord.js'),
  Helper = require('../../../app/helper'),
  RoleAuthorization = require('../../../app/role-authorization'),
  settings = require('../../../data/settings.json');

class ShowRoleAuthorizationCommand extends Commando.Command {
  constructor(client) {
    super(client, {
      name: 'show-role-authorization',
      group: CommandGroup.ADMIN,
      memberName: 'show-role-authorization',
      description: 'Shows role authorization configuration for a command.',
      examples: ['\t!show-role-authorization meetup'],
      aliases: ['show-role-auth', 'show-command-roles'],
      args: [
        {
          key: 'command',
          prompt: 'What command do you wish to view the role authorization information on?\n',
          type: 'command'
        }
      ],
      guildOnly: true
    });

    client.dispatcher.addInhibitor(message => {
      if (!!message.command && message.command.name === 'show-role-authorization') {
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
    const {command} = args,
      {roleRequired, roles} = RoleAuthorization.getAuthorizationInformation(message.channel.guild, command),
      rolesString = roles
        .map(roleId => message.guild.roles.cache.get(roleId))
        .map(role => role.toString())
        .join('\n'),
      embed = new Discord.MessageEmbed()
        .setDescription(`Role-based Authorization Configuration for **${command.name}**:`)
        .addField('Enabled', !!roleRequired ? 'Yes': 'No')
        .addField('Authorized roles', rolesString.length > 0 ?
          rolesString :
          '*None*')
        .setFooter('Bot owners can always execute a command, as can those with the admin or moderator role.');

    message.channel.send({embed})
      .catch(err => log.error(err));
  }
}

module.exports = ShowRoleAuthorizationCommand;
