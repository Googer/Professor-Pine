"use strict";

const log = require('loglevel').getLogger('CancelStartTimeCommand'),
  Commando = require('discord.js-commando'),
  {CommandGroup} = require('../../app/constants'),
  Helper = require('../../app/helper'),
  PartyManager = require('../../app/party-manager'),
  settings = require('../../data/settings');

class CancelStartTimeCommand extends Commando.Command {
  constructor(client) {
    super(client, {
      name: 'cancel-meet',
      group: CommandGroup.BASIC_RAID,
      memberName: 'cancel-meet',
      aliases: ['c-meet', 'cm'],
      description: 'Cancels the planned meeting time for an existing raid.',
      details: 'Use this command to cancel when a raid group intends to do the raid.',
      examples: ['\t!cancel-meet 2:20pm'],
      guildOnly: true
    });
  }

  async run(message, args) {
    const raid = PartyManager.getParty(message.channel.id),
      info = await raid.cancelMeetingTime(message.member.id);

    if (info.error) {
      message.reply(info.error)
        .catch(err => log.error(err));
      return;
    }

    message.react(Helper.getEmoji(settings.emoji.thumbsUp) || '👍')
      .catch(err => log.error(err));
    
    raid.refreshStatusMessages();
  }
}

module.exports = CancelStartTimeCommand;