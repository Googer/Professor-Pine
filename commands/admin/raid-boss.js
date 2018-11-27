"use strict";

const log = require('loglevel').getLogger('AddRaidBossCommand'),
  Commando = require('discord.js-commando'),
  {CommandGroup} = require('../../app/constants'),
  Helper = require('../../app/helper'),
  Role = require('../../app/role'),
  settings = require('../../data/settings');

class AddRaidBossCommand extends Commando.Command {
  constructor(client) {
    super(client, {
      name: 'raid-boss',
      group: CommandGroup.ADMIN,
      memberName: 'raid-boss',
      description: 'Adds a new raid boss.',
      examples: ['\t!raid-boss magnemite 1'],
      arguments: [
        {
          key: 'pokemon',
          prompt: 'What pokémon are you adding?\nExample: `lugia`\n',
          type: 'pokemon'
        },
        {
          key: 'tier',
          prompt: 'What tier is this pokémon? (`1`, `2`, `3`, `4`, `5`, `ex`)',
          type: 'string'
        }
      ],
      guildOnly: true
    });

    client.dispatcher.addInhibitor(message => {
      if (!!message.command && message.command.name === 'raid-boss') {
        if (!Helper.isBotManagement(message)) {
          return ['unauthorized', message.reply('You are not authorized to use this command.')];
        }
      }

      return false;
    });
  }

  async run(message, args) {
    // add to db.
  }
}

module.exports = AddRaidBossCommand;
