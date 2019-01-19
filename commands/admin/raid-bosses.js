"use strict";

const log = require('loglevel').getLogger('RaidBossesCommand'),
  Commando = require('discord.js-commando'),
  DB = require('../../app/db'),
  {MessageEmbed} = require('discord.js'),
  {CommandGroup} = require('../../app/constants'),
  Helper = require('../../app/helper'),
  Pokemon = require('../../app/pokemon'),
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
          return ['unauthorized', message.reply('You are not authorized to use this command.')];
        }
      }

      return false;
    });
  }

  async run(message, args) {
    const pokemon = await DB.DB('Pokemon').select(),
      header = 'Registered Raid Bosses & Rare Spawns',
      groups = {
        '1': [],
        '2': [],
        '3': [],
        '4': [],
        '5': [],
        'ex': [],
        'rare': []
      };

    pokemon.forEach(poke => {
      if (['1', '2', '3', '4', '5', 'ex'].indexOf(poke.name) !== -1) {
        return;
      }

      const name = poke.name.replace(/[_]/g, ' ').replace('alola', '(Alolan)'),
        parts = name.split(' ');

      parts.forEach((part, index) => {
        parts[index] = part.charAt(0).toUpperCase() + part.slice(1);
      });

      const formatted = parts.join(' ');

      if (poke.exclusive) {
        groups.ex.push(formatted);
      } else if (poke.tier === 7) {
        groups.rare.push(formatted);
      } else {
        groups[poke.tier].push(formatted);
      }
    });

    let embed = new MessageEmbed();

    for (let tier in groups) {
      const pokes = groups[tier];
      if (tier === 'ex' && pokes.length) {
        embed.addField('**EX Raids**', pokes.join(', ') + '\n\n');
      } else if (tier === 'rare' && pokes.length) {
        embed.addField('**Rare Spawns**', pokes.join(', '));
      } else if (pokes.length) {
        embed.addField(`**Tier ${tier}**`, pokes.join(', '));
      }
    };

    message.channel.send(header, {embed})
      .then(result => {
        message.react(Helper.getEmoji(settings.emoji.thumbsUp) || '👍');
      }).catch(err => log.error(err));
  }
}

module.exports = RaidBossesCommand;
