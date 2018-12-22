"use strict";

const log = require('loglevel').getLogger('PopulateRaidBossesCommand'),
  Commando = require('discord.js-commando'),
  {CommandGroup} = require('../../app/constants'),
  Helper = require('../../app/helper'),
  Pokemon = require('../../app/pokemon'),
  settings = require('../../data/settings');

class PopulateRaidBossesCommand extends Commando.Command {
  constructor(client) {
    super(client, {
      name: 'populate-raid-bosses',
      group: CommandGroup.ADMIN,
      memberName: 'populate-raid-bosses',
      description: 'Populates the database with all the pre-defined raid bosses.',
      examples: ['\t!populate-raid-bosses'],
      guildOnly: true
    });

    client.dispatcher.addInhibitor(message => {
      if (!!message.command && message.command.name === 'populate-raid-bosses') {
        if (!Helper.isBotManagement(message)) {
          return ['unauthorized', message.reply('You are not authorized to use this command.')];
        }
      }

      return false;
    });
  }

  async run(message, args) {
    const pokemonMetadata = require('../../data/pokemon');

    pokemonMetadata.forEach(pokemon => {
      if (pokemon.backupExclusive) {
        Pokemon.addRaidBoss(pokemon.name || 'ex', 'ex')
          .then(result => {
            console.log('Added ' + pokemon.name);
          }).catch(err => log.error(err));
      } else if (pokemon.backupTier) {
        Pokemon.addRaidBoss(pokemon.name || pokemon.backupTier + '', pokemon.backupTier + '')
          .then(result => {
            console.log('Added ' + pokemon.name);
          }).catch(err => log.error(err));
      }
    });

    setTimeout(() => {
      Pokemon.buildIndex();
      message.react(Helper.getEmoji(settings.emoji.thumbsUp) || '👍');
    }, 1000); // wait a second to populate the index to allow DB calls to fully finish since we're out of the asyncronous aspect.
  }
}

module.exports = PopulateRaidBossesCommand;
