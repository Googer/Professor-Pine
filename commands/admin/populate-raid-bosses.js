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
    let promises = [];
    let names = [];
    pokemonMetadata.forEach(pokemon => {
      if (pokemon.backupExclusive) {
        names.push(pokemon.name || 'ex');
        promises.push(Pokemon.addRaidBoss(pokemon.name || 'ex', 'ex', pokemon.shiny));
      } else if (pokemon.backupTier) {
        names.push(pokemon.name || pokemon.backupTier + '');
        promises.push(Pokemon.addRaidBoss(pokemon.name || pokemon.backupTier + '', pokemon.backupTier + '', pokemon.shiny));
      }
    });

    Promise.all(promises).then(result => {
      Pokemon.buildIndex();
      message.react(Helper.getEmoji(settings.emoji.thumbsUp) || '👍');
      log.debug('Added ' + names.join(', '));
    }).catch(err => log.error(err));
  }
}

module.exports = PopulateRaidBossesCommand;
