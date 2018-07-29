"use strict";

const log = require('loglevel').getLogger('NewGroupCommand'),
  Commando = require('discord.js-commando'),
  {CommandGroup, PartyStatus} = require('../../app/constants'),
  Helper = require('../../app/helper'),
  Notify = require('../../app/notify'),
  PartyManager = require('../../app/party-manager'),
  settings = require('../../data/settings');

class NewGroupCommand extends Commando.Command {
  constructor(client) {
    super(client, {
      name: 'new',
      group: CommandGroup.BASIC_RAID,
      memberName: 'new',
      aliases: ['new-group', 'create-group'],
      description: 'Creates a new group for a raid and sets your group to it.\n',
      details: 'Use this command to create a new group for a raid.',
      examples: ['\t!new'],
      guildOnly: true
    });

    client.dispatcher.addInhibitor(message => {
      if (!!message.command && message.command.name === 'new' &&
        !PartyManager.validParty(message.channel.id)) {
        return ['invalid-channel', message.reply('Create a new raid group for a raid from its raid channel!')];
      }
      return false;
    });
  }

  async run(message, args) {
    const raid = PartyManager.getParty(message.channel.id),
      info = raid.createGroup(message.member.id);

    if (!info.error) {
      message.react(Helper.getEmoji(settings.emoji.thumbsUp) || '👍')
        .catch(err => log.error(err));

      // notify all attendees of new group
      const attendees = Object.entries(info.raid.attendees)
        .filter(([attendee, attendeeStatus]) => attendee !== message.member.id &&
          attendeeStatus.status !== PartyStatus.COMPLETE)
        .map(([attendee, attendeeStatus]) => attendee);

      if (attendees.length > 0) {
        const members = await Promise.all(attendees
          .map(async attendee_id => await raid.getMember(attendee_id)))
          .catch(err => log.error(err));

        Notify.shout(message, members, `A new group has been created; if you wish to join it, type \`${this.client.commandPrefix}group ${info.group}\` !`);
      }

      info.raid.refreshStatusMessages();
    } else {
      message.reply(info.error)
        .catch(err => log.error(err));
    }
  }
}

module.exports = NewGroupCommand;
