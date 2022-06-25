"use strict";

const log = require('loglevel').getLogger('RaidBossesCommand'),
  {CommandGroup} = require('../../app/constants'),
  Commando = require('discord.js-commando'),
  {MessageEmbed} = require('discord.js'),
  Pokemon = require('../../app/pokemon'),
  Helper = require('../../app/helper'),
  settings = require('../../data/settings');

class RaidBossesCommand extends Commando.Command {
  constructor(client) {
    super(client, {
      name: 'raid-bosses',
      group: CommandGroup.ADMIN,
      memberName: 'raid-bosses',
      description: 'Lists registered raid bosses and rare spawns.',
      examples: ['\t!raid-bosses'],
      guildOnly: true
    });

    client.dispatcher.addInhibitor(message => {
      if (!!message.command && message.command.name === 'raid-bosses') {
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
    const groups = {
        '1': [],
        '2': [],
        '3': [],
        '4': [],
        '5': [],
        'ex': [],
        'mega': [],
        'mega-legendary': [],
        'rare': []
      },
      fields = [];

    let header = 'Registered Raid Bosses & Rare Spawns';

    Pokemon.pokemon
      .filter(pokemon => !!pokemon.name)
      .filter(pokemon => !!pokemon.tier || !!pokemon.mega || !!pokemon.exclusive)
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach(pokemon => {
        if (['1', '2', '3', '4', '5', 'ex', 'mega'].indexOf(pokemon.name) !== -1) {
          return;
        }

        const name = pokemon.name.replace(/[_]/g, ' ')
            .replace('alola', '(Alolan)')
            .replace('galarian', '(Galarian)'),
          parts = name.split(' ');

        parts.forEach((part, index) => {
          parts[index] = part.charAt(0).toUpperCase() + part.slice(1);
        });

        const formatted = parts.join(' '),
          shiny = pokemon.shiny ? '*' : '';

        if (pokemon.exclusive) {
          groups.ex.push(shiny + formatted + shiny);
        } else if (pokemon.tier === 6) {
          groups['mega-legendary'].push(shiny + formatted + shiny);
        } else if (pokemon.mega) {
          groups.mega.push(shiny + formatted + shiny);
        } else if (pokemon.tier === 7) {
          groups.rare.push(shiny + formatted + shiny);
        } else if (pokemon.tier !== 0) {
          groups[pokemon.tier].push(shiny + formatted + shiny);
        }
      });

    for (const tier in groups) {
      const groupPokemon = groups[tier];
      if (tier === 'ex' && groupPokemon.length) {
        RaidBossesCommand.addField(fields, 'EX Raids', groupPokemon);
      } else if (tier === 'mega' && groupPokemon.length) {
        RaidBossesCommand.addField(fields, 'Mega Raids', groupPokemon);
      } else if (tier === 'mega-legendary' && groupPokemon.length) {
        RaidBossesCommand.addField(fields, 'Mega Legendary Raids', groupPokemon);
      } else if (tier === 'rare' && groupPokemon.length) {
        RaidBossesCommand.addField(fields, 'Rare Spawns', groupPokemon);
      } else if (groupPokemon.length) {
        RaidBossesCommand.addField(fields, `Tier ${tier}`, groupPokemon);
      }
    }

    let embed = new MessageEmbed();
    embed.setColor('GREEN');

    for (const {fieldName, fieldContents} of fields) {
      embed.addField(fieldName, fieldContents);

      if (embed.length > 6000) {
        embed.spliceFields(embed.fields.length - 1, 1);
        embed.setFooter('');

        message.channel.send(header, {embed})
          .catch(err => log.error(err));

        if (header.indexOf(' (continued)') === -1) {
          header = header + ' (continued)';
        }

        embed = new MessageEmbed();
        embed.setColor('GREEN');
        embed.addField(fieldName, fieldContents);
      }
    }

    message.channel.send(header, {embed})
      .catch(err => log.error(err));
  }

  static addField(fields, name, pokemonList) {
    let fieldName = `**${name}**`,
      fieldContents = '';

    for (const pokemon of pokemonList) {
      if (fieldContents.length + pokemon.length + 2 > 1024) {
        fields.push({fieldName, fieldContents});
        if (fieldName.indexOf(' (continued)') === -1) {
          fieldName = fieldName + ' (continued)';
        }
        fieldContents = pokemon;
      } else {
        if (fieldContents.length === 0) {
          fieldContents = pokemon;
        } else {
          fieldContents += ', ' + pokemon;
        }
      }
    }

    if (fieldContents.length > 0) {
      fields.push({fieldName, fieldContents});
    }
  }
}

module.exports = RaidBossesCommand;
