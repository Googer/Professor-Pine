"use strict";

const log = require('loglevel').getLogger('SpawnCommand'),
  Commando = require('discord.js-commando'),
  {CommandGroup} = require('../../app/constants'),
  Gym = require('../../app/gym'),
  Helper = require('../../app/helper'),
  PartyManager = require('../../app/party-manager'),
  Pokemon = require('../../app/pokemon'),
  {MessageEmbed} = require('discord.js'),
  settings = require('../../data/settings');

class SpawnCommand extends Commando.Command {
  constructor(client) {
    super(client, {
      name: 'spawn',
      group: CommandGroup.RAID_CRUD,
      memberName: 'spawn',
      aliases: ['wild'],
      description: 'Announces a rare pokémon spawn.',
      details: 'Use this command to announce a rare pokémon spawn in a region.',
      examples: ['\t!spawn ditto At the St. Albert\'s Stop'],
      throttling: {
        usages: 15,
        duration: 900
      },
      args: [
        {
          key: 'pokemon',
          prompt: 'What pokémon has spawned?\nExample: `lugia`\n',
          type: 'raidpokemon',
        },
        {
          key: 'message',
          label: 'message',
          prompt: 'What spawn details can you provide?\nExample: `At the stop by the point`\n',
          type: 'string',
          wait: 60
        }
      ],
      argsPromptLimit: 3,
      guildOnly: true
    });

    client.dispatcher.addInhibitor(message => {
      if (!!message.command && message.command.name === 'spawn' && !Gym.isValidChannel(message.channel.id)) {
        return {
          reason: 'invalid-channel',
          response: message.reply(message.reply('Announce spawns from region channels!'))
        };
      }
      return false;
    });
  }

  async run(message, args) {
    const pokemon = args['pokemon'],
      spawnDetails = args['message'];

    if (pokemon.name === 'unown' && settings.channels.unown) {
      const unownChannel = Helper.getUnownChannel(message.guild),
        pokemonName = pokemon.name.charAt(0).toUpperCase() + pokemon.name.slice(1),
        regionChannel = (await PartyManager.getChannel(message.channel.id)).channel,
        reportingMember = (await PartyManager.getMember(regionChannel.id, message.member.id)).member,
        unownRole = Helper.guild.get(message.guild.id).roles.get('unown'),
        shiny = pokemon.shiny ?
          Helper.getEmoji(settings.emoji.shiny) || '✨' :
          '',
        mention = unownRole ? '(' + unownRole.toString() + ') ' : '',
        header = `A wild ${pokemonName}${shiny} ${mention}has been reported in #${regionChannel.name} by ${reportingMember.displayName}: ${spawnDetails}`,
        embed = new MessageEmbed();
      embed.setColor('GREEN');
      embed.setDescription('**Warning: Spawns are user-reported. There is no way to know exactly how long a Pokémon will be there. Most spawns are 30 min. Use your discretion when chasing them.**');

      if (pokemon.url) {
        embed.setThumbnail(pokemon.url);
      }

      unownChannel.send(header, {embed})
        .then(msg => message.react(Helper.getEmoji(settings.emoji.thumbsUp) || '👍'))
        .catch(err => log.error(err));
    } else if (pokemon.name === 'perfect' || pokemon.name === 'zero') {
      let terms = message.content.split(/[\s-]/);
      terms.shift();
      terms.shift();

      let messagePokemon;

      terms.forEach(term => {
        if (messagePokemon) {
          return;
        }

        let searchedPokemon = Pokemon.search([term]);

        if (searchedPokemon && searchedPokemon.length) {
          messagePokemon = searchedPokemon[0];
        }
      });

      Helper.client.emit('spawnReported', pokemon, message.member.id, spawnDetails, message, messagePokemon);
    } else {
      Helper.client.emit('spawnReported', pokemon, message.member.id, spawnDetails, message);
    }
  }
}

module.exports = SpawnCommand;
