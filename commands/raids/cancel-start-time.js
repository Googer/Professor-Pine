"use strict";

const log = require('loglevel').getLogger('CancelStartTimeCommand'),
  Commando = require('discord.js-commando'),
  {CommandGroup, PartyStatus} = require('../../app/constants'),
  Helper = require('../../app/helper'),
  PartyManager = require('../../app/party-manager'),
  {PartyType} = require('../../app/constants'),
  settings = require('../../data/settings');

class CancelStartTimeCommand extends Commando.Command {
  constructor(client) {
    super(client, {
      name: 'cancel-meet',
      group: CommandGroup.BASIC_RAID,
      memberName: 'cancel-meet',
      aliases: ['c-meet', 'cm', 'cancel-start', 'cs'],
      description: 'Cancels the planned meeting time for an existing raid.',
      details: 'Use this command to cancel when a raid group intends to do the raid.',
      examples: ['\t!cancel-meet'],
      guildOnly: true
    });

    client.dispatcher.addInhibitor(message => {
      if (!!message.command && message.command.name === 'cancel-meet' &&
        !PartyManager.validParty(message.channel.id, [PartyType.RAID])) {
        return ['invalid-channel', message.reply('Canceling a meeting time must be done from a raid channel.')];
      }
      return false;
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

    const groupId = raid.attendees[message.member.id].group,
      totalAttendees = raid.getAttendeeCount(groupId),
      verb = totalAttendees === 1 ?
        'is' :
        'are',
      noun = totalAttendees === 1 ?
        'trainer' :
        'trainers',
      channel = (await PartyManager.getChannel(raid.channelId)).channel;

    // notify all attendees in same group that a time has been set
    Object.entries(raid.attendees)
      .filter(([attendee, attendeeStatus]) => attendee !== message.member.id &&
        attendeeStatus.status !== PartyStatus.COMPLETE)
      .filter(([attendee, attendeeStatus]) => attendeeStatus.group === groupId)
      .forEach(([attendee, attendeeStatus]) => {
        Helper.sendMessage(message.guild.id, attendee, `${message.member.displayName} has canceled the meeting time for ${channel.toString()}. ` +
          `There ${verb} currently **${totalAttendees}** ${noun} attending!`)
          .catch(err => log.error(err));
      });

    raid.refreshStatusMessages()
      .catch(err => log.error(err));
  }
}

module.exports = CancelStartTimeCommand;
