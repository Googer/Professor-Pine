"use strict";

const log = require('loglevel').getLogger('IAmNotCommand'),
  Commando = require('discord.js-commando'),
  {CommandGroup} = require('../../app/constants'),
  Helper = require('../../app/helper'),
  Role = require('../../app/role'),
  settings = require('../../data/settings');

class IAmNotCommand extends Commando.Command {
  constructor(client) {
    super(client, {
      name: 'iamnot',
      group: CommandGroup.ROLES,
      memberName: 'iamnot',
      aliases: ['unassign'],
      description: 'Unassign roles from yourself.',
      details: '?????',
      examples: ['\t!iamnot Mystic', '\t!unassign Valor'],
      guildOnly: true
    });

    client.dispatcher.addInhibitor(message => {
      if (!!message.command && message.command.name === 'iamnot' &&
        !Helper.isBotChannel(message)) {
        return ['invalid-channel', message.reply(Helper.getText('iamnot.warning', message))];
      }
      return false;
    });
  }

  async run(message, args) {
    Role.removeRole(message.member, args)
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

module.exports = IAmNotCommand;
