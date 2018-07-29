"use strict";

const log = require('loglevel').getLogger('GroupCommand'),
  Commando = require('discord.js-commando'),
  {CommandGroup} = require('../../app/constants'),
  Helper = require('../../app/helper'),
  PartyManager = require('../../app/party-manager'),
  settings = require('../../data/settings'),
  Utility = require('../../app/utility');

class GroupCommand extends Commando.Command {
  constructor(client) {
    super(client, {
      name: 'group',
      group: CommandGroup.BASIC_RAID,
      memberName: 'group',
      aliases: ['set-group'],
      description: 'Sets your group for a raid.',
      details: 'Use this command to set the group you are joining for a raid.',
      examples: ['\t!group B'],
      guildOnly: true
    });

    client.dispatcher.addInhibitor(message => {
      if (!!message.command && message.command.name === 'group' &&
        !PartyManager.validParty(message.channel.id)) {
        return ['invalid-channel', message.reply('Set your group for a raid from its raid channel!')];
      }
      return false;
    });
  }

  async run(message, args) {
    const raid = PartyManager.getParty(message.channel.id),
      calendarFormat = {
        sameDay: 'LT',
        sameElse: 'l LT'
      },
      provided = message.constructor.parseArgs(args.trim(), 1, this.argsSingleQuotes);

    let prompt = 'Which group do you wish to join for this raid?\n\n';

    raid.groups.forEach(group => {
      const start_time = !!group.startTime ?
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
        groupLabel += ` :: ${start_time.calendar(null, calendarFormat)}`;
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

    return groupCollector.obtain(message, provided)
      .then(collectionResult => {
        Utility.cleanCollector(collectionResult);

        if (!collectionResult.cancelled) {
          const groupId = collectionResult.values['group'],
            info = raid.setMemberGroup(message.member.id, groupId);

          if (!info.error) {
            message.react(Helper.getEmoji(settings.emoji.thumbsUp) || '👍')
              .catch(err => log.error(err));

            info.raid.refreshStatusMessages();
          } else {
            return message.reply(info.error)
              .catch(err => log.error(err));
          }
        } else {
          return message.reply('Cancelled command.')
            .catch(err => log.error(err));
        }
      })
      .catch(err => log.error(err));
  }
}

module.exports = GroupCommand;
