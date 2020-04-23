"use strict";

const log = require('loglevel').getLogger('ShowRoleAuthorizationsCommand'),
  Commando = require('discord.js-commando'),
  {CommandGroup} = require('../../../app/constants'),
  Discord = require('discord.js'),
  Helper = require('../../../app/helper'),
  RoleAuthorization = require('../../../app/role-authorization'),
  settings = require('../../../data/settings.json');

class ShowRoleAuthorizationsCommand extends Commando.Command {
  constructor(client) {
    super(client, {
      name: 'show-role-authorizations',
      group: CommandGroup.ADMIN,
      memberName: 'show-role-authorizations',
      description: 'Shows all commands for which role-based authorization is enabled.\n',
      examples: ['\t!show-role-authorizations'],
      aliases: ['show-role-commands'],
      guildOnly: true
    });

    client.dispatcher.addInhibitor(message => {
      if (!!message.command && message.command.name === 'show-role-authorizations') {
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
    const roleInformation = RoleAuthorization.getAllInformation(message.channel.guild),
      commandsString = Array.from(roleInformation)
        .filter(([command, {roleRequired, roles}]) => !!roleRequired)
        .map(([command, {roleRequired, roles}]) => command)
        .join('\n'),
    embed = new Discord.MessageEmbed()
        .setDescription(`Role-based Authorization Configuration:`)
        .addField('Enabled Commands', commandsString.length > 0 ?
          commandsString :
          '*None*')
        .setFooter('Bot owners can always execute a command, as can those with the admin or moderator role.');

    message.channel.send({embed})
      .catch(err => log.error(err));
  }
}

module.exports = ShowRoleAuthorizationsCommand;
