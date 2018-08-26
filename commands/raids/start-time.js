"use strict";

const log = require('loglevel').getLogger('StartTimeCommand'),
  Commando = require('discord.js-commando'),
  {CommandGroup, PartyStatus, PartyType, TimeParameter} = require('../../app/constants'),
  Helper = require('../../app/helper'),
  moment = require('moment'),
  PartyManager = require('../../app/party-manager'),
  settings = require('../../data/settings');

class StartTimeCommand extends Commando.Command {
  constructor(client) {
    super(client, {
      name: 'meet',
      group: CommandGroup.BASIC_RAID,
      memberName: 'meet',
      aliases: ['start', 'start-time', 'starts'],
      description: 'Sets the planned meeting time for an existing raid.',
      details: 'Use this command to set when a raid group intends to do the raid.  If possible, try to set times 20 minutes out and always try to arrive at least 5 minutes before the meeting time being set.',
      examples: ['\t!meet 2:20pm'],
      args: [
        {
          key: TimeParameter.START,
          label: 'meeting time',
          prompt: 'When do you wish to meet for this raid?\nExamples: `8:43`, `2:20pm`\n\n*or*\n\nIn how long (in minutes) do you wish to meet for this raid?\nExample: `15`\n',
          type: 'time'
        }
      ],
      argsPromptLimit: 3,
      guildOnly: true
    });

    client.dispatcher.addInhibitor(message => {
      if (!!message.command && message.command.name === 'meet' &&
        !PartyManager.validParty(message.channel.id, [PartyType.RAID])) {
        return ['invalid-channel', message.reply('Set the meeting time for a raid from its raid channel!')];
      }
      return false;
    });
  }

  async run(message, args) {
    const startTime = args[TimeParameter.START],
      raid = PartyManager.getParty(message.channel.id),
      info = await raid.setMeetingTime(message.member.id, startTime);

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
      calendarFormat = {
        sameDay: 'LT',
        sameElse: 'l LT'
      },
      formattedStartTime = moment(startTime).calendar(null, calendarFormat),
      channel = (await PartyManager.getChannel(raid.channelId)).channel;

    // notify all attendees in same group that a time has been set
    Object.entries(raid.attendees)
      .filter(([attendee, attendeeStatus]) => attendee !== message.member.id &&
        attendeeStatus.status !== PartyStatus.COMPLETE)
      .filter(([attendee, attendeeStatus]) => attendeeStatus.group === groupId)
      .forEach(([attendee, attendeeStatus]) => {
        const member = Helper.getMemberForNotification(message.guild.id, attendee);

        member.send(`${message.member.displayName} set a meeting time of ${formattedStartTime} for ${channel.toString()}. ` +
          `There ${verb} currently **${totalAttendees}** ${noun} attending!`)
          .catch(err => log.error(err));
      });

    raid.refreshStatusMessages();
  }
}

module.exports = StartTimeCommand;
