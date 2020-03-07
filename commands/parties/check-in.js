"use strict";

const log = require('loglevel').getLogger('CheckInCommand'),
  Commando = require('discord.js-commando'),
  {CommandGroup, PartyStatus} = require('../../app/constants'),
  Helper = require('../../app/helper'),
  moment = require('moment'),
  NaturalArgumentType = require('../../types/natural'),
  PartyManager = require('../../app/party-manager'),
  settings = require('../../data/settings'),
  Utility = require('../../app/utility');

class CheckInCommand extends Commando.Command {
  constructor(client) {
    super(client, {
      name: 'here',
      group: CommandGroup.BASIC_RAID,
      memberName: 'here',
      aliases: ['arrive', 'arrived', 'present', 'check-in', 'herre', 'herr'],
      description: 'Lets others know you have arrived at an active raid.',
      details: 'Use this command to tell everyone you are at the raid location and to ensure that no one is left behind.',
      examples: ['\t!here +1', '\t!arrived', '\t!present'],
      args: [
        {
          key: 'additionalAttendees',
          label: 'additional attendees',
          prompt: 'How many additional people are here with you?\nExample: `+1`\n\n*or*\n\nHow many people are here (including yourself)?\nExample: `2`\n',
          type: 'natural|raid-group',
          default: NaturalArgumentType.UNDEFINED_NUMBER
        }
      ],
      commandErrorMessage: (message, provided) =>
        `\`${provided[0]}\` is not a valid number of attendees!  If you intend to join a group, use the \`${client.commandPrefix}group\` command!`,
      argsPromptLimit: 3,
      guildOnly: true
    });

    client.dispatcher.addInhibitor(message => {
      if (!!message.command && message.command.name === 'here' &&
        !PartyManager.validParty(message.channel.id)) {
        return {
          reason: 'invalid-channel',
          response: message.reply('Check into a raid from its raid channel!')
        };
      }
      return false;
    });
  }

  async run(message, args) {
    const additionalAttendees = args['additionalAttendees'],
      groupId = typeof additionalAttendees === 'string' && additionalAttendees !== NaturalArgumentType.UNDEFINED_NUMBER ? additionalAttendees : false,
      raid = PartyManager.getParty(message.channel.id),
      currentStatus = raid.getMemberStatus(message.member.id),
      groupCount = raid.groups.length;

    let statusPromise;

    if (currentStatus === PartyStatus.NOT_INTERESTED && groupCount > 1) {
      const calendarFormat = {
        sameDay: 'LT',
        sameElse: 'l LT'
      };

      let prompt = 'Which group do you wish to join for this raid?\n\n';

      raid.groups.forEach(group => {
        const startTime = !!group.startTime ?
          moment(group.startTime) :
          '',
          totalAttendees = raid.getAttendeeCount(group.id);

        let groupLabel = `**${group.id}**`;

        if (!!group.label) {
          const truncatedLabel = group.label.length > 150 ?
            group.label.substring(0, 149).concat('…') :
            group.label;

          groupLabel += ` (${truncatedLabel})`;
        }

        if (!!group.startTime) {
          groupLabel += ` :: ${startTime.calendar(null, calendarFormat)}`;
        }

        prompt += groupLabel + ` :: ${totalAttendees} possible trainers\n`;
      });

      const groupCollector = new Commando.ArgumentCollector(this.client, [
        {
          key: 'group',
          label: 'group',
          prompt: prompt,
          type: 'raid-group'
        }
      ], 3);

      let groupId = raid.defaultGroupId;

      statusPromise = groupCollector.obtain(message)
        .then(async collectionResult => {
          Utility.cleanCollector(collectionResult);

          if (!collectionResult.cancelled) {
            groupId = collectionResult.values['group'];
          }

          await raid.setMemberGroup(message.member.id, groupId);
          return raid.setMemberStatus(message.member.id, PartyStatus.PRESENT, additionalAttendees);
        });
    } else if (groupId && currentStatus === PartyStatus.PRESENT) {
      statusPromise = Promise.all([
        await raid.setMemberGroup(message.member.id, groupId),
        await raid.setMemberStatus(message.member.id, PartyStatus.PRESENT)]);
    } else if (groupId && currentStatus !== PartyStatus.NOT_INTERESTED) {
      const attendee = await raid.getAttendee(message.member.id),
        additional = attendee.number - 1;
      statusPromise = Promise.all([
        await raid.setMemberGroup(message.member.id, groupId),
        await raid.setMemberStatus(message.member.id, PartyStatus.PRESENT, additional)]);
    } else {
      statusPromise = Promise.resolve(
        await raid.setMemberStatus(message.member.id, PartyStatus.PRESENT, groupId ? 0 : additionalAttendees));
    }

    statusPromise.then(info => {
      if (!info.error) {
        message.react(Helper.getEmoji(settings.emoji.thumbsUp) || '👍')
          .catch(err => log.error(err));

        raid.refreshStatusMessages()
          .catch(err => log.error(err));
      } else {
        message.reply(info.error)
          .catch(err => log.error(err));
      }
    });
  }
}

module.exports = CheckInCommand;
