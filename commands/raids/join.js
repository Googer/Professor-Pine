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
      aliases: ['attend', 'omw', 'coming', 'going'],
      description: 'Joins an existing raid.',
      details: 'Use this command to join a raid.  If a time has yet to be determined, then when a time is determined, everyone who has joined will be notified of the official raid start time.',
      examples: ['\t!join', '\t!join +1', '\t!attend', '\t!attend 2'],
      args: [
        {
          key: 'additionalAttendees',
          label: 'additional attendees',
          prompt: 'How many additional people are coming with you?\nExample: `+1`\n\n*or*\n\nHow many people are coming (including yourself)?\nExample: `2`\n',
          type: 'natural',
          default: NaturalArgumentType.UNDEFINED_NUMBER
        }
      ],
      commandErrorMessage: (message, provided) =>
        `\`${provided[0]}\` is not a valid number of attendees!  If you intend to join a group, use the \`${client.commandPrefix}group\` command!`,
      argsPromptLimit: 0,
      guildOnly: true
    });

    client.dispatcher.addInhibitor(message => {
      if (!!message.command && message.command.name === 'join' &&
        !PartyManager.validParty(message.channel.id)) {
        return ['invalid-channel', message.reply('Join a raid from its raid channel!')];
      }
      return false;
    });
  }

  async run(message, args) {
    const additionalAttendees = args['additionalAttendees'],
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
          return await raid.setMemberStatus(message.member.id, PartyStatus.COMING, additionalAttendees);
        });
    } else {
      statusPromise = Promise.resolve(
        await raid.setMemberStatus(message.member.id, PartyStatus.COMING, additionalAttendees));
    }

    statusPromise.then(info => {
      if (!info.error) {
        message.react(Helper.getEmoji(settings.emoji.thumbsUp) || '👍')
          .catch(err => log.error(err));

        raid.refreshStatusMessages();
      } else {
        message.reply(info.error)
          .catch(err => log.error(err));
      }
    });
  }
}

module.exports = JoinCommand;
