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
    const pokemonMetadata = require('../../data/pokemon');
    let promises = [];
    let names = [];
    pokemonMetadata.forEach(pokemon => {
      if (pokemon.backupExclusive) {
        names.push(pokemon.name || 'ex');
        promises.push(Pokemon.setRaidBoss(pokemon.name || 'ex', 'ex', pokemon.shiny || pokemon.backupShiny, pokemon.nickname || pokemon.backupNickname));
      } else if (pokemon.backupElite) {
        names.push(pokemon.name || 'elite');
        promises.push(Pokemon.setRaidBoss(pokemon.name || 'elite', 'elite', pokemon.shiny || pokemon.backupShiny, pokemon.nickname || pokemon.backupNickname));
      } else if (pokemon.backupMega) {
        names.push(pokemon.name || 'mega');
        promises.push(Pokemon.setRaidBoss(pokemon.name || 'mega', 'mega', pokemon.shiny || pokemon.backupShiny, pokemon.nickname || pokemon.backupNickname));
      } else if (pokemon.backupTier || pokemon.backupNickname) {
        names.push(pokemon.name || pokemon.backupTier + '');
        promises.push(Pokemon.setRaidBoss(pokemon.name || pokemon.backupTier + '', pokemon.backupTier + '', pokemon.shiny || pokemon.backupShiny, pokemon.nickname || pokemon.backupNickname));
      }
    });

    Promise.all(promises)
      .then(result => {
        log.debug('Added ' + names.join(', '));
        Pokemon.buildIndex();
        return message.react(Helper.getEmoji(settings.emoji.thumbsUp) || '👍');
      })
      .catch(err => log.error(err));
  }
}

module.exports = PopulateRaidBossesCommand;
