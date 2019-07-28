"use strict";

const log = require('loglevel').getLogger('RareCommand'),
  Commando = require('discord.js-commando'),
  {CommandGroup} = require('../../app/constants'),
  Helper = require('../../app/helper'),
  Pokemon = require('../../app/pokemon'),
  settings = require('../../data/settings');

class RareCommand extends Commando.Command {
  constructor(client) {
    super(client, {
      name: 'rare',
      group: CommandGroup.ADMIN,
      memberName: 'rare',
      description: 'Sets a pokemon as rare.',
      examples: ['\t!rare on ditto'],
      args: [
        {
          key: 'rare',
          label: 'boolean',
          prompt: 'Turn on the rarity indicator for a pokemon? yes / no',
          type: 'boolean'
        },
        {
          key: 'pokemon',
          prompt: 'What pokémon are you adding?\nExample: `lugia`\n',
          type: 'pokemon'
        }
      ],
      guildOnly: true
    });

    client.dispatcher.addInhibitor(message => {
      if (!!message.command && message.command.name === 'rare') {
        if (!Helper.isBotManagement(message)) {
          return ['unauthorized', message.reply('You are not authorized to use this command.')];
        }
      }

      return false;
    });
  }

  async run(message, args) {
    const pokemon = args['pokemon'],
      rare = args['rare'];

    Pokemon.setRaidBoss(pokemon.formName, rare ? "7" : "0")
      .then(result => {
        message.react(Helper.getEmoji(settings.emoji.thumbsUp) || '👍');
        Pokemon.buildIndex();
      }).catch(err => log.error(err));
  }
}

module.exports = RareCommand;
