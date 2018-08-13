"use strict";

const log = require('loglevel').getLogger('AarCommand'),
  Commando = require('discord.js-commando'),
  {CommandGroup} = require('../../app/constants'),
  Helper = require('../../app/helper'),
  Role = require('../../app/role'),
  settings = require('../../data/settings');

class AarCommand extends Commando.Command {
  constructor(client) {
    super(client, {
      name: 'aar',
      group: CommandGroup.ADMIN,
      memberName: 'aar',
      description: 'Sets auto-assigned role or alias.',
      guildOnly: true
    });

    client.dispatcher.addInhibitor(message => {
      if (!!message.command && message.command.name === 'aar') {
        if (!Helper.isManagement(message)) {
          return ['unauthorized', message.reply('You are not authorized to use this command.')];
        }
      }

      return false;
    });
  }

  async run(message, args) {
    Role.setAutoAssignRole(message.guild, args)
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

module.exports = AarCommand;
