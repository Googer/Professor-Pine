"use strict";

const log = require('loglevel').getLogger('CheckOutCommand'),
  Commando = require('discord.js-commando'),
  {CommandGroup, PartyStatus} = require('../../app/constants'),
  Helper = require('../../app/helper'),
  PartyManager = require('../../app/party-manager'),
  settings = require('../../data/settings');

class CheckOutCommand extends Commando.Command {
  constructor(client) {
    super(client, {
      name: 'not-here',
      group: CommandGroup.BASIC_RAID,
      memberName: 'not-here',
      aliases: ['check-out', 'depart'],
      description: 'Lets others know you have gone to the wrong location for an existing raid.',
      details: 'Use this command in case you thought you were at the right location, but were not.',
      examples: ['\t!not-here', '\t!checkout'],
      guildOnly: true
    });

    client.dispatcher.addInhibitor(message => {
      if (!!message.command && message.command.name === 'not-here' &&
        !PartyManager.validParty(message.channel.id)) {
        return {
          reason: 'invalid-channel',
          response: message.reply('Check out of a raid from its raid channel!')
        };
      }
      return false;
    });
  }

  async run(message, args) {
    const raid = PartyManager.getParty(message.channel.id),
      info = await raid.setMemberStatus(message.member.id, PartyStatus.INTERESTED);

    if (!info.error) {
      message.react(Helper.getEmoji(settings.emoji.thumbsUp) || '👍')
        .catch(err => log.error(err));

      raid.refreshStatusMessages()
        .catch(err => log.error(err));
    } else {
      message.reply(info.error)
        .catch(err => log.error(err));
    }
  }
}

module.exports = CheckOutCommand;
