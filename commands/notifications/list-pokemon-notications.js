"use strict";

const log = require('loglevel').getLogger('PokemonNotificationsCommand'),
  Commando = require('discord.js-commando'),
  {CommandGroup} = require('../../app/constants'),
  {MessageEmbed} = require('discord.js'),
  Helper = require('../../app/helper'),
  Notify = require('../../app/notify'),
  Pokemon = require('../../app/pokemon');

class PokemonNotificationsCommand extends Commando.Command {
  constructor(client) {
    super(client, {
      name: 'wants',
      group: CommandGroup.NOTIFICATIONS,
      memberName: 'wants',
      aliases: ['notifications', 'list-notifications', 'show-notifications', 'list-wants', 'show-wants'],
      description: 'Shows currently active notifications for raid bosses.',
      details: 'Use this command to get your currently active raid boss notifications.',
      examples: ['\t!wants'],
      guildOnly: true
    });

    client.dispatcher.addInhibitor(message => {
      if (!!message.command && message.command.name === 'wants' && !Helper.isBotChannel(message)) {
        return ['invalid-channel', message.reply(Helper.getText('notifications.warning', message))];
      }
      return false;
    });
  }

  async run(message, args) {
    return Notify.getPokemonNotifications(message.member)
      .then(async results => {
        const embed = new MessageEmbed(),
          pokemonData = Pokemon.pokemon;

        embed.setTitle('Currently assigned Pokémon notifications:');
        embed.setColor(4437377);

        const pokemonList = results
          .map(poke => {
            let pokemon = pokemonData.find(pokemon => (Number.parseInt(pokemon.number) === Number.parseInt(poke.pokemon)) ||
              (pokemon.tier === -poke.pokemon));

            return {
              type: poke.type,
              pokemon: pokemon.name ?
                pokemon.name.charAt(0).toUpperCase() + pokemon.name.slice(1) :
                `Level ${pokemon.tier}`
            };
          });

        log.log(pokemonList);

        const both = pokemonList.filter(notification => notification.type === 'both'),
          spawn = pokemonList.filter(notification => notification.type === 'spawn'),
          raid = pokemonList.filter(notification => notification.type === 'raid');

        if (both.length) {
          const bothList = both.map(notification => notification.pokemon).sort().join('\n');
          embed.addField('**Both Spawn and Raid**', bothList)
        }

        if (spawn.length) {
          const spawnList = spawn.map(notification => notification.pokemon).sort().join('\n');
          embed.addField('**Spawn**', spawnList)
        }

        if (raid.length) {
          const raidList = raid.map(notification => notification.pokemon).sort().join('\n');
          embed.addField('**Raid**', raidList)
        }

        const messages = [];
        try {
          messages.push(await message.direct({embed}));
          messages.push(await message.reply('Sent you a DM with current raid boss notifications.'));
        } catch (err) {
          messages.push(await message.reply('Unable to send you the notifications list DM. You probably have DMs disabled.'));
        }
        return messages;
      })
      .catch(err => log.error(err));
  }
}

module.exports = PokemonNotificationsCommand;
