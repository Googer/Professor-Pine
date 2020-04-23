"use strict";

const log = require('loglevel').getLogger('LocalCommand'),
  Commando = require('discord.js-commando'),
  {CommandGroup, PartyStatus} = require('../../app/constants'),
  Helper = require('../../app/helper'),
  moment = require('moment'),
  NaturalArgumentType = require('../../types/natural'),
  PartyManager = require('../../app/party-manager'),
  settings = require('../../data/settings'),
  Utility = require('../../app/utility');

class LocalCommand extends Commando.Command {
  constructor(client) {
    super(client, {
      name: 'local',
      group: CommandGroup.BASIC_RAID,
      memberName: 'local',
      aliases: ['in-person'],
      description: 'Sets your status for this raid as local.',
      details: 'Use this command to say you are doing this raid locally.',
      examples: ['\t!local', '\t!in-person'],
      args: [
        {
          key: 'additionalAttendees',
          label: 'additional attendees',
          prompt: 'How many additional people would come with you?\nExample: `+1`\n\n*or*\n\nHow many people would come (including yourself)?\nExample: `2`\n',
          type: 'natural|raid-group',
          default: NaturalArgumentType.UNDEFINED_NUMBER
        }
      ],
      commandErrorMessage: (message, provided) =>
        `\`${provided[0]}\` is not a valid number of attendees!  If you intend to join a group, use the \`${client.commandPrefix}group\` command!`,
      guildOnly: true
    });

    client.dispatcher.addInhibitor(message => {
      if (!!message.command && message.command.name === 'local' &&
        !PartyManager.validParty(message.channel.id)) {
        return {
          reason: 'invalid-channel',
          response: message.reply('Set yourself as doing a raid locally from its channel!')
        };
      }
      return false;
    });
  }

  async run(message, args) {
    const additionalAttendees = args['additionalAttendees'],
      groupId = typeof additionalAttendees === 'string' && additionalAttendees !== NaturalArgumentType.UNDEFINED_NUMBER ? additionalAttendees : false,
      raid = PartyManager.getParty(message.channel.id),
      groupCount = raid.groups.length;

    let currentStatus = raid.getMemberStatus(message.member.id),
      statusPromise;

    if (currentStatus === PartyStatus.NOT_INTERESTED && groupCount > 1 && groupId === false) {
      const calendarFormat = {
        sameDay: 'LT',
        sameElse: 'l LT'
      };

      let prompt = 'Which group do you wish to show interest in locally for this raid?\n\n';

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

          await raid.setMemberGroup(message.member.id, groupId);
          await raid.setMemberStatus(message.member.id, PartyStatus.INTERESTED);
          return await raid.setMemberRemote(message.member.id, false);
        });
    } else if (groupId && currentStatus === PartyStatus.NOT_INTERESTED) {
      statusPromise = Promise.all([
        await raid.setMemberGroup(message.member.id, groupId),
        await raid.setMemberStatus(message.member.id, PartyStatus.INTERESTED),
        await raid.setMemberRemote(message.member.id, false)]);
    } else if (groupId && currentStatus !== PartyStatus.NOT_INTERESTED) {
      const attendee = await raid.getAttendee(message.member.id),
        additional = attendee.number - 1;
      statusPromise = Promise.all([
        await raid.setMemberGroup(message.member.id, groupId),
        await raid.setMemberStatus(message.member.id, currentStatus, additional),
        await raid.setMemberRemote(message.member.id, false)]);
    } else {
      if (currentStatus === PartyStatus.NOT_INTERESTED) {
        currentStatus = PartyStatus.INTERESTED;
      }

      statusPromise = Promise.all([
        await raid.setMemberStatus(message.member.id, currentStatus, groupId ? 0 : additionalAttendees),
        await raid.setMemberRemote(message.member.id, false)]);
    }

    statusPromise
      .then(info => {
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

module.exports = LocalCommand;
