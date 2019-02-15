"use strict";

const log = require('loglevel').getLogger('PokemonCommand'),
  Commando = require('discord.js-commando'),
  {CommandGroup, PartyType} = require('../../app/constants'),
  Helper = require('../../app/helper'),
  PartyManager = require('../../app/party-manager'),
  settings = require('../../data/settings');

class SetPokemonCommand extends Commando.Command {
  constructor(client) {
    super(client, {
      name: 'boss',
      group: CommandGroup.RAID_CRUD,
      memberName: 'boss',
      aliases: ['set-pokemon', 'set-pokémon', 'set-poke', 'pokemon', 'pokémon', 'poke', 'poké', 'set-boss', 'against', 'tier', 'level'],
      description: 'Changes the pokémon for an existing raid, usually to specify the actual raid boss for a now-hatched egg.',
      details: 'Use this command to set the pokémon of a raid.',
      examples: ['\t!boss lugia', '\t!pokemon molty', '\t!poke zapdos'],
      args: [
        {
          key: 'pokemon',
          prompt: 'What pokémon (or tier if unhatched) is this raid?\nExample: `lugia`\n',
          type: 'pokemon',
        }
      ],
      argsPromptLimit: 3,
      guildOnly: true
    });

    client.dispatcher.addInhibitor(message => {
      if (!!message.command && message.command.name === 'boss' &&
        !PartyManager.validParty(message.channel.id, [PartyType.RAID])) {
        return ['invalid-channel', message.reply('Set the pokémon of a raid from its raid channel!')];
      }
      return false;
    });
  }

  async run(message, args) {
    const pokemon = args['pokemon'],
      raid = PartyManager.getParty(message.channel.id),
      egg = !!raid.pokemon && raid.pokemon.egg,
      originalPokemon = raid.pokemon,
      info = await raid.setPokemon(pokemon);

    message.react(Helper.getEmoji(settings.emoji.thumbsUp) || '👍')
      .then(result => {
        if (pokemon.name !== originalPokemon.name) {
          Helper.client.emit('raidPokemonSet', raid, message.member.id, egg);
        }

        return true;
      })
      .catch(err => log.error(err));

    raid.refreshStatusMessages();
  }
}

module.exports = SetPokemonCommand;
