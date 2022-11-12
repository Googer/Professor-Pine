"use strict";

const log = require('loglevel').getLogger('AutosetCommand'),
  Commando = require('discord.js-commando'),
  {CommandGroup} = require('../../app/constants'),
  Helper = require('../../app/helper'),
  Pokemon = require('../../app/pokemon'),
  settings = require('../../data/settings');

class AutosetCommand extends Commando.Command {
  constructor(client) {
    super(client, {
      name: 'auto-set',
      group: CommandGroup.ADMIN,
      memberName: 'auto-set',
      description: 'Sets the default boss for a tier to be automatically set when reported.',
      examples: ['\t!auto-set magnemite 1'],
      args: [
        {
          key: 'pokemon',
          prompt: 'What pokémon are you defaulting a tier to?\nExample: `lugia`\n',
          type: 'pokemon'
        },
        {
          key: 'tier',
          prompt: 'What tier are you defaulting? (`1`, `3`, `4`, `5`, `ex`, `elite`, `mega`, `mega-legendary`)',
          type: 'string',
          oneOf: ['1', '3', '4', '5', 'ex', 'elite', 'mega', 'mega-legendary']
        }
      ],
      guildOnly: true
    });

    client.dispatcher.addInhibitor(message => {
      if (!!message.command && message.command.name === 'auto-set') {
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
    let pokemon = args['pokemon'],
      tier = args['tier'];

    Pokemon.setDefaultTierBoss(pokemon.formName || tier, tier)
      .then(result => {
        message.react(Helper.getEmoji(settings.emoji.thumbsUp) || '👍');
      }).catch(err => log.error(err));
  }
}

module.exports = AutosetCommand;
