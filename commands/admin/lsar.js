"use strict";

const log = require('loglevel').getLogger('LsarCommand'),
  Commando = require('discord.js-commando'),
  {CommandGroup} = require('../../app/constants'),
  {MessageEmbed} = require('discord.js'),
  Helper = require('../../app/helper'),
  Role = require('../../app/role');

class LsarCommand extends Commando.Command {
  constructor(client) {
    super(client, {
      name: 'lsar',
      group: CommandGroup.ADMIN,
      memberName: 'lsar',
      aliases: ['roles'],
      description: 'List self assignable roles.',
      argsType: 'multiple',
      guildOnly: true
    });

    client.dispatcher.addInhibitor(message => {
      if (!!message.command && message.command.name === 'lsar') {
        if (!Helper.isManagement(message)) {
          return ['unauthorized', message.reply('You are not authorized to use this command.')];
        }
      }

      return false;
    });
  }

  async run(message, args) {
    Role.getRoles(message.guild)
      .then(rows => {
        const roles = new Map();

        rows.forEach(row => {
          let role;

          if (!roles.has(row.roleId)) {
            role = Object.assign({}, {
              roleName: row.roleName,
              roleDescription: row.roleDescription,
              aliases: []
            });
            roles.set(row.roleId, role);
          } else {
            role = roles.get(row.roleId);
          }

          if (row.aliasName) {
            role.aliases.push(row.aliasName);
          }
        });

        const string = Array.from(roles.values())
          .sort((a, b) => a.roleName.localeCompare(b.roleName))
          .map(role => {
            let result = role.roleName;

            if (role.aliases.length > 0) {
              result += ' [' + role.aliases
                .sort()
                .join(', ') + ']';
            }

            if (role.roleDescription) {
              result += ` :: ${role.roleDescription}`;
            }

            return result;
          })
          .join('\n');

        const embed = new MessageEmbed();
        embed.setTitle(`There ${roles.size === 1 ? 'is' : 'are'} ${roles.size} self-assignable ${roles.size === 1 ? 'role' : 'roles'}:`);
        embed.setDescription(string);
        embed.setColor('GREEN');

        return message.channel.send({embed});
      }).catch(err => {
      if (err && err.error) {
        message.reply(err.error)
          .catch(err => log.error(err));
      } else {
        log.error(err);
      }
    });
  }
}

module.exports = LsarCommand;
