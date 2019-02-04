"use strict";

const log = require('loglevel').getLogger('AddNickNameCommand'),
  Commando = require('discord.js-commando'),
  {CommandGroup} = require('../../app/constants'),
  Helper = require('../../app/helper'),
  Pokemon = require('../../app/pokemon'),
  settings = require('../../data/settings');

class AddNickNameCommand extends Commando.Command {
  constructor(client) {
    super(client, {
      name: 'add-pokemon-nickname',
      group: CommandGroup.ADMIN,
      memberName: 'add-pokemon-nickname',
      description: 'Adds a Pokemon Nickname.',
      examples: ['\t!pokemon-nickname bidoof god'],
      aliases: ['pokemon-nickname'],
      args: [
        {
          key: 'pokemon',
          prompt: 'What pokémon are you adding a nickname for?\nExample: `bidoof`\n',
          type: 'pokemon'
        },
        {
          key: 'nickname',
          prompt: 'What nickname are you adding?\nExample: `god`\n',
          type: 'string'
        }
      ],
      guildOnly: true
    });

    client.dispatcher.addInhibitor(message => {
      if (!!message.command && message.command.name === 'add-pokemon-nickname') {
        if (!Helper.isBotManagement(message)) {
          return ['unauthorized', message.reply('You are not authorized to use this command.')];
        }
      }

      return false;
    });
  }

  async run(message, args) {
    const pokemon = args['pokemon'],
      nickname = args['nickname'];

    Pokemon.addNickname(pokemon.formName, nickname)
      .then(result => {
        message.react(Helper.getEmoji(settings.emoji.thumbsUp) || '👍');
        Pokemon.buildIndex();
      }).catch(err => log.error(err));
  }
}

module.exports = AddNickNameCommand;
