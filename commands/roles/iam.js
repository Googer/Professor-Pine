"use strict";

const log = require('loglevel').getLogger('IAmCommand'),
  Commando = require('discord.js-commando'),
  {CommandGroup} = require('../../app/constants'),
  {MessageEmbed} = require('discord.js'),
  Helper = require('../../app/helper'),
  Role = require('../../app/role'),
  settings = require('../../data/settings');

class IAmCommand extends Commando.Command {
  constructor(client) {
    super(client, {
      name: 'iam',
      group: CommandGroup.ROLES,
      memberName: 'iam',
      aliases: ['assign', 'am'],
      description: 'Assign available roles to yourself.',
      details: '?????',
      examples: ['\t!iam Mystic', '\t!role Valor', '\t!assign Instinct'],
      guildOnly: true
    });

    // store a list of message id's spawned from this command, and the page they're on
    this.messages = new Map();

    // Map from guild id to number of self-assignable roles for it
    this.roleCounts = new Map();

    client.dispatcher.addInhibitor(message => {
      if (!!message.command && message.command.name === 'iam' &&
        !Helper.isBotChannel(message)) {
        return {
          reason: 'invalid-channel',
          response: message.reply(Helper.getText('iam.warning', message))
        };
      }
      return false;
    });

    client.on('messageReactionAdd', (reaction, user) => {
      this.navigatePage(reaction, user);
    });

    // clean up messages after 10 minutes of inactivity
    this.update = setInterval(() => {
      const then = Date.now() - 600000;

      this.messages.forEach((value, key, map) => {
        if (then > value.time) {
          value.message.delete()
            .catch(err => log.error(err));
          map.delete(key);
        }
      });
    }, settings.cleanupInterval);
  }

  navigatePage(reaction, user) {
    if (user.bot || !this.messages.has(reaction.message.id)) {
      return;
    }

    let current = this.messages.get(reaction.message.id).current;

    // if no page exists for message, then assume not the right message (as this is a global listener);
    if (isNaN(current)) {
      return;
    }

    if (reaction.emoji.name === '⬅') {
      if (current > 0) {
        current--;
        this.updatePage(reaction.message, current);
      }
    } else if (reaction.emoji.name === '➡') {
      if (current < Math.ceil(this.roleCounts.get(reaction.message.guild.id) / 5) - 1) {
        current++;
        this.updatePage(reaction.message, current);
      }
    }

    // remove reaction so that pagination makes a BIT more sense...
    reaction.users.remove(user)
      .catch(err => log.error(err));
  }

  updatePage(message, current) {
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

        const rolesArray = Array.from(roles.values())
            .sort((a, b) => a.roleName.localeCompare(b.roleName)),
          count = rolesArray.length,
          start = current * 5,
          end = start + 5;

        // making sure no one can go beyond the limits
        if (start > count - 1 || start < 0) {
          return;
        }

        const embed = new MessageEmbed();
        embed.setTitle(`There ${roles.size === 1 ? 'is' : 'are'} ${roles.size} self-assignable ${roles.size === 1 ? 'role' : 'roles'}:`);
        embed.setColor('GREEN');
        embed.setFooter(`Page ${current + 1} of ${Math.ceil(count / 5)}`);

        for (let i = start; i < end; i++) {
          if (!rolesArray[i]) {
            break;
          }

          embed.addField(rolesArray[i].roleName, rolesArray[i].roleDescription ?
            rolesArray[i].roleDescription :
            '…');
        }

        return message.edit('Type `!iam <name>` to add one of the following roles to your account.',
          {embed})
          .then(botMessage => {
            this.messages.set(botMessage.id, {time: Date.now(), current, message: botMessage});
          });
      })
      .catch(err => log.error(err));
  }

  async run(message, args) {
    if (!args.length) {
      // if no arguments were given, send the user a list of roles w/ optional descriptions
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

          const rolesArray = Array.from(roles.values())
              .sort((a, b) => a.roleName.localeCompare(b.roleName)),
            count = rolesArray.length;

          this.roleCounts.set(message.guild.id, count);

          const embed = new MessageEmbed();
          embed.setTitle(`There ${roles.size === 1 ? 'is' : 'are'} ${roles.size} self-assignable ${roles.size === 1 ? 'role' : 'roles'}:`);
          embed.setColor('GREEN');
          embed.setFooter(`Page 1 of ${Math.ceil(count / 5)}`);

          for (let i = 0; i < Math.min(count, 5); i++) {
            if (!rolesArray[i]) {
              break;
            }

            embed.addField(rolesArray[i].roleName, rolesArray[i].roleDescription ?
              rolesArray[i].roleDescription :
              '…');
          }

          return message.channel.send(`Type \`${message.client.commandPrefix}iam <name>\` to add one of the following roles to your account.`,
            {embed})
            .then(botMessage => {
              this.messages.set(botMessage.id, {time: Date.now(), current: 0, message: botMessage});

              return botMessage.react('⬅')
                .then(reaction => botMessage.react('➡'));
            });
        })
        .catch(err => {
          if (err && err.error) {
            message.reply(err.error)
              .catch(err => log.error(err));
          } else {
            log.error(err);
          }
        });
    } else {
      Role.assignRole(message.member, args)
        .then(() => message.react(Helper.getEmoji(settings.emoji.thumbsUp) || '👍'))
        .catch(err => {
          if (err && err.error) {
            message.reply(err.error)
              .catch(err => log.error(err));
          } else {
            log.error(err);
          }
        });
    }
  }
}

module.exports = IAmCommand;
