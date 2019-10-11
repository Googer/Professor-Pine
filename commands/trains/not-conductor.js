"use strict";

const log = require('loglevel').getLogger('NotConductorCommand'),
  Commando = require('discord.js-commando'),
  {CommandGroup, PartyType} = require('../../app/constants'),
  Helper = require('../../app/helper'),
  settings = require('../../data/settings'),
  PartyManager = require('../../app/party-manager');

class NotConductorCommand extends Commando.Command {
  constructor(client) {
    super(client, {
      name: 'not-conductor',
      group: CommandGroup.TRAIN,
      memberName: 'not-conductor',
      aliases: ['remove-conductor'],
      description: 'Remove a train\'s conductor.',
      details: 'If a train has a conductor set, the the not-conductor command will remove them from being a conductor (useful when a train\'s conductor is no longer active.',
      examples: ['\t!not-conductor'],
      guildOnly: true
    });

    client.dispatcher.addInhibitor(message => {
      if (!!message.command && message.command.name === 'conductor' &&
        !PartyManager.validParty(message.channel.id, PartyType.RAID_TRAIN)) {
        return ['invalid-channel', message.reply('You can only remove the conductor of a train from the train\'s channel!')];
      }
      return false;
    });
  }

  async run(message, args) {
    const party = PartyManager.getParty(message.channel.id);

    await party.setConductor(null);

    message.react(Helper.getEmoji(settings.emoji.thumbsUp) || '👍')
      .catch(err => log.error(err));

    party.refreshStatusMessages()
      .catch(err => log.error(err));
  }
}

module.exports = NotConductorCommand;
