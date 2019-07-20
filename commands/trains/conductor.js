"use strict";

const log = require('loglevel').getLogger('FriendCodeCommand'),
  Commando = require('discord.js-commando'),
  {CommandGroup, PartyType} = require('../../app/constants'),
  Helper = require('../../app/helper'),
  settings = require('../../data/settings'),
  PartyManager = require('../../app/party-manager');

class FriendCodeCommand extends Commando.Command {
  constructor(client) {
    super(client, {
      name: 'conductor',
      group: CommandGroup.TRAIN,
      memberName: 'conductor',
      aliases: ['train-leader', 'leader'],
      description: 'Mark yourself as the train\'s conductor (or leader responsible for `!next`).',
      details: 'If a train has a conductor set, the route movement commands will only respond to them to prevent accidental route movement.',
      examples: ['\t!conductor'],
      guildOnly: true
    });

    client.dispatcher.addInhibitor(message => {
      if (!!message.command && message.command.name === 'conductor' &&
        !PartyManager.validParty(message.channel.id, PartyType.RAID_TRAIN)) {
        return ['invalid-channel', message.reply('You can only become the conductor of a train from the train\'s channel!')];
      }
      return false;
    });
  }

  async run(message, args) {
    const party = PartyManager.getParty(message.channel.id);

    await party.setConductor(message.author);

    message.react(Helper.getEmoji(settings.emoji.thumbsUp) || '👍')
      .catch(err => log.error(err));

    party.refreshStatusMessages();
  }
}

module.exports = FriendCodeCommand;
