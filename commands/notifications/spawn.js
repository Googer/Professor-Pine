"use strict";

const log = require('loglevel').getLogger('SpawnCommand'),
  Commando = require('discord.js-commando'),
  {CommandGroup} = require('../../app/constants'),
  Gym = require('../../app/gym'),
  Helper = require('../../app/helper'),
  Notify = require('../../app/notify'),
  settings = require('../../data/settings');

class SpawnCommand extends Commando.Command {
  constructor(client) {
    super(client, {
      name: 'spawn',
      group: CommandGroup.RAID_CRUD,
      memberName: 'spawn',
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
          prompt: 'What pokémon is spawning?\nExample: `lugia`\n',
          type: 'pokemon',
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
      if (!!message.command && message.command.name === 'spawn' && !Gym.isValidChannel(message.channel.name)) {
        return ['invalid-channel', message.reply('Announce spawns from region channels!')];
      }
      return false;
    });
  }

  async run(message, args) {
    const pokemon = args['pokemon'],
      spawnDetails = args['message']

    if (pokemon.name === 'unown' && settings.channels.unown) {
      console.log(Helper.client.channels);
    }

    Notify.notifyMembersOfSpawn(pokemon, message.member.id, spawnDetails, message);
    message.react(Helper.getEmoji(settings.emoji.thumbsUp) || '👍');
  }
}

module.exports = SpawnCommand;
