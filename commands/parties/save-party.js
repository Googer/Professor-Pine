"use strict";

const log = require('loglevel').getLogger('SavePartyCommand'),
  Commando = require('discord.js-commando'),
  {CommandGroup, PartyType} = require('../../app/constants'),
  Helper = require('../../app/helper'),
  settings = require('../../data/settings'),
  PartyManager = require('../../app/party-manager');

class SavePartyCommand extends Commando.Command {
  constructor(client) {
    super(client, {
      name: 'save-party',
      group: CommandGroup.ADMIN,
      memberName: 'save-party',
      aliases: ['save-train', 'save-raid', 'save-channel', 'do-not-delete'],
      description: 'Use this command to save a party\'s channel and prevent deletion.',
      details: 'Set this channel so that Pine will not automatically delete a channel.',
      examples: ['\t!save-party'],
      guildOnly: true
    });

    client.dispatcher.addInhibitor(message => {
      if (!!message.command && message.command.name === 'save-party') {
        if (!PartyManager.validParty(message.channel.id, [PartyType.RAID_TRAIN, PartyType.RAID])) {
          return {
            reason: 'invalid-channel',
            response: message.reply('You can only save a raid or train channel from deletion!')
          };
        }
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
    const party = PartyManager.getParty(message.channel.id);

    party.deletionTime = -1;
    await party.persist();

    party.sendSavedWarningMessage()
      .catch(err => log.error(err));

    message.react(Helper.getEmoji(settings.emoji.thumbsUp) || '👍')
      .catch(err => log.error(err));
  }
}

module.exports = SavePartyCommand;
