"use strict";

const log = require('loglevel').getLogger('MarkNotShinyCommand'),
  Commando = require('discord.js-commando'),
  {CommandGroup} = require('../../app/constants'),
  Helper = require('../../app/helper'),
  Pokemon = require('../../app/pokemon'),
  settings = require('../../data/settings');

class MarkNotShinyCommand extends Commando.Command {
  constructor(client) {
    super(client, {
      name: 'mark-not-shiny',
      group: CommandGroup.ADMIN,
      memberName: 'mark-shiny',
      description: 'Marks a raid boss as not potentially shiny.',
      examples: ['\t!mark-not-shiny lugia'],
      aliases: ['not-shiny'],
      args: [
        {
          key: 'pokemon',
          prompt: 'What pokémon are you marking as not potentially shiny?\nExample: `lugia`\n',
          type: 'pokemon'
        }
      ],
      guildOnly: true
    });

    client.dispatcher.addInhibitor(message => {
      if (!!message.command && message.command.name === 'mark-not-shiny') {
        if (!Helper.isBotManagement(message)) {
          return ['unauthorized', message.reply('You are not authorized to use this command.')];
        }
      }

      return false;
    });
  }

  async run(message, args) {
    const pokemon = args['pokemon'],
      tier = args['tier'];

    Pokemon.markShiny(pokemon.formName, false)
      .then(result => {
        message.react(Helper.getEmoji(settings.emoji.thumbsUp) || '👍');
        Pokemon.buildIndex();
      }).catch(err => log.error(err));
  }
}

module.exports = MarkNotShinyCommand;
