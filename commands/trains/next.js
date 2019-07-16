"use strict";

const log = require('loglevel').getLogger('NextCommand'),
  {MessageEmbed} = require('discord.js'),
  Commando = require('discord.js-commando'),
  {CommandGroup, PartyStatus, PartyType} = require('../../app/constants'),
  Helper = require('../../app/helper'),
  settings = require('../../data/settings'),
  PartyManager = require('../../app/party-manager');

class NextCommand extends Commando.Command {
  constructor(client) {
    super(client, {
      name: 'next',
      group: CommandGroup.TRAIN,
      memberName: 'next',
      aliases: ['next-gym'],
      description: 'Move the train to the next gym in the route.',
      details: 'Use this command to move the raid train to the next gym in the planned route.',
      examples: ['\t!next'],
      guildOnly: true
    });

    client.dispatcher.addInhibitor(message => {
      if (!!message.command && message.command.name === 'next' &&
        !PartyManager.validParty(message.channel.id, PartyType.RAID_TRAIN)) {
        return ['invalid-channel', message.reply('You can only move a raid train through the route within a train channel!')];
      }
      return false;
    });
  }

  async run(message) {
    const party = PartyManager.getParty(message.channel.id);

    await party.moveToNextGym();

    message.react(Helper.getEmoji(settings.emoji.thumbsUp) || '👍')
      .catch(err => log.error(err));

    party.refreshStatusMessages();
  }
}

module.exports = NextCommand;
