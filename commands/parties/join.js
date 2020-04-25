"use strict";

const log = require('loglevel').getLogger('JoinCommand'),
  Commando = require('discord.js-commando'),
  {CommandGroup, PartyStatus} = require('../../app/constants'),
  Helper = require('../../app/helper'),
  moment = require('moment'),
  NaturalArgumentType = require('../../types/natural'),
  PartyManager = require('../../app/party-manager'),
  settings = require('../../data/settings'),
  Utility = require('../../app/utility');

class JoinCommand extends Commando.Command {
  constructor(client) {
    super(client, {
      name: 'join',
      group: CommandGroup.BASIC_RAID,
      memberName: 'join',
      aliases: ['attend', 'omw', 'coming', 'going', 'cominf'],
      description: 'Joins an existing raid.',
      details: 'Use this command to join a raid.  If a time has yet to be determined, then when a time is determined, everyone who has joined will be notified of the official raid start time.',
      examples: ['\t!join', '\t!join +1', '\t!attend', '\t!attend 2'],
      args: [
        {
          key: 'additionalAttendees',
          label: 'additional attendees',
          prompt: 'How many additional people are coming with you?\nExample: `+1`\n\n*or*\n\nHow many people are coming (including yourself)?\nExample: `2`\n',
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
      if (!!message.command && message.command.name === 'join' &&
        !PartyManager.validParty(message.channel.id)) {
        return {
          reason: 'invalid-channel',
          response: message.reply('Join a raid from its raid channel!')
        };
      }
      return false;
    });
  }

  async run(message, args) {
    const {additionalAttendees, isReaction, reactionMemberId} = args,
      memberId = reactionMemberId || message.member.id,
      groupId = typeof additionalAttendees === 'string' && additionalAttendees !== NaturalArgumentType.UNDEFINED_NUMBER ? additionalAttendees : false,
      raid = PartyManager.getParty(message.channel.id),
      currentStatus = raid.getMemberStatus(memberId),
      groupCount = raid.groups.length;

    let statusPromise;

    if (currentStatus === PartyStatus.NOT_INTERESTED && groupCount > 1 && groupId === false) {
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

        if (!!startTime) {
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

          await raid.setMemberGroup(memberId, groupId);
          return await raid.setMemberStatus(memberId, PartyStatus.COMING, groupId ? 0 : additionalAttendees);
        });
    } else if (groupId && currentStatus === PartyStatus.NOT_INTERESTED) {
      statusPromise = Promise.all([
        await raid.setMemberGroup(memberId, groupId),
        await raid.setMemberStatus(memberId, PartyStatus.COMING)]);
    } else if (groupId && currentStatus !== PartyStatus.NOT_INTERESTED) {
      const attendee = await raid.getAttendee(memberId),
        additional = attendee.number - 1;
      statusPromise = Promise.all([
        await raid.setMemberGroup(memberId, groupId),
        await raid.setMemberStatus(memberId, PartyStatus.COMING, additional)]);
    } else {
      statusPromise = Promise.resolve(
        await raid.setMemberStatus(memberId, PartyStatus.COMING, groupId ? 0 : additionalAttendees));
    }

    statusPromise.then(info => {
      if (!info.error) {
        if (!isReaction) {
          message.react(Helper.getEmoji(settings.emoji.thumbsUp) || '👍')
            .catch(err => log.error(err));
        }

        raid.refreshStatusMessages()
          .catch(err => log.error(err));
      } else if (!isReaction) {
        message.reply(info.error)
          .catch(err => log.error(err));
      }
    });
  }
}

module.exports = JoinCommand;
