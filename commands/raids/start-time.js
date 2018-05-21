"use strict";

const log = require('loglevel').getLogger('StartTimeCommand'),
  Commando = require('discord.js-commando'),
  {CommandGroup, RaidStatus, TimeParameter} = require('../../app/constants'),
  Helper = require('../../app/helper'),
  moment = require('moment'),
  Raid = require('../../app/raid'),
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
        !Raid.validRaid(message.channel.id)) {
        return ['invalid-channel', message.reply('Set the meeting time for a raid from its raid channel!')];
      }
      return false;
    });
  }

  async run(message, args) {
    const start_time = args[TimeParameter.START],
      info = Raid.setRaidStartTime(message.channel.id, message.member.id, start_time);

    if (info.error) {
      message.reply(info.error)
        .catch(err => log.error(err));
      return;
    }

    message.react(Helper.getEmoji(settings.emoji.thumbs_up) || '👍')
      .catch(err => log.error(err));

    const group_id = info.raid.attendees[message.member.id].group,
      total_attendees = Raid.getAttendeeCount(info.raid, group_id),
      verb = total_attendees === 1 ?
        'is' :
        'are',
      noun = total_attendees === 1 ?
        'trainer' :
        'trainers',
      calendar_format = {
        sameDay: 'LT',
        sameElse: 'l LT'
      },
      formatted_start_time = moment(start_time).calendar(null, calendar_format),
      channel = await Raid.getChannel(info.raid.channel_id)
        .catch(err => log.error(err));

    // notify all attendees in same group that a time has been set
    Object.entries(info.raid.attendees)
      .filter(([attendee, attendee_status]) => attendee !== message.member.id &&
        attendee_status.status !== RaidStatus.COMPLETE)
      .filter(([attendee, attendee_status]) => attendee_status.group === group_id)
      .forEach(([attendee, attendee_status]) => {
        const member = Helper.getMemberForNotification(message.guild.id, attendee);

        member.send(`${message.member.displayName} set a meeting time of ${formatted_start_time} for ${channel.toString()}. ` +
          `There ${verb} currently **${total_attendees}** ${noun} attending!`)
          .catch(err => log.error(err));
      });

    Raid.refreshStatusMessages(info.raid);
  }
}

module.exports = StartTimeCommand;
