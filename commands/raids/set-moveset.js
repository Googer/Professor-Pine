"use strict";

const log = require('loglevel').getLogger('MovesetCommand'),
  Commando = require('discord.js-commando'),
  { CommandGroup, PartyType } = require('../../app/constants'),
  Helper = require('../../app/helper'),
  PartyManager = require('../../app/party-manager'),
  settings = require('../../data/settings');

class SetMovesetCommand extends Commando.Command {
  constructor(client) {
    super(client, {
      name: 'moveset',
      group: CommandGroup.RAID_CRUD,
      memberName: 'moveset',
      aliases: ['set-moveset', 'moves', 'move', 'charge', 'charged-move', 'fast', 'fast-move'],
      description: 'Changes the moveset for an existing raid, allows for proper counters to be planned for.',
      details: 'Use this command to set the moveset of the pokémon.',
      examples: ['\t!moveset crunch/stone edge'],
      args: [{
        key: 'moveset',
        prompt: 'What moveset does the pokémon have for this raid? Example: crunch/stone edge',
        type: 'moveset'
      }],
      argsPromptLimit: 3,
      guildOnly: true
    });

    client.dispatcher.addInhibitor(message => {
      if (!!message.command && message.command.name === 'moveset' &&
        !PartyManager.validParty(message.channel.id, [PartyType.RAID])) {
        return ['invalid-channel', message.reply('Set the pokémon\'s moveset of a raid from its raid channel.')];
      }
      return false;
    });
  }

  async run(message, args) {
    const moveset = args['moveset'],
      raid = PartyManager.getParty(message.channel.id),
      info = await raid.setMoveset(moveset);

    message.react(Helper.getEmoji(settings.emoji.thumbsUp) || '👍')
      .then(result => {
        Helper.client.emit('raidMovesetSet', raid, message.member.id);

        return true;
      })
      .catch(err => log.error(err));

    raid.refreshStatusMessages();
  }
}

module.exports = SetMovesetCommand;
