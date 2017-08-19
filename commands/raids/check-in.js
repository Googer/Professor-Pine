"use strict";

const Commando = require('discord.js-commando');
const Raid = require('../../app/raid');

class CheckInCommand extends Commando.Command {
  constructor(client) {
    super(client, {
      name: 'check-in',
      group: 'raids',
      memberName: 'check-in',
      aliases: ['checkin', 'arrive', 'arrived', 'present'],
      description: 'Let others know you have arrived at the raid location.',
      details: '?????',
      examples: ['\t!check-in lugia-0'],
      argsType: 'multiple'
    });
  }

  run(message, args) {
    if (message.channel.type !== 'text') {
      message.reply('Please check in from a public channel.');
      return;
    }

    const raid = Raid.findRaid(message.channel, message.member, args);

    if (!raid.raid) {
      message.reply('Please enter a raid id which can be found on the raid post.  If you do not know the id you can ask for a list of raids in your area via `!status`.');
      return;
    }

    const info = Raid.setArrivalStatus(message.channel, message.member, raid.raid.id, true);

    message.react('👍');

    // get previous bot message & update
    Raid.getMessage(message.channel, message.member, info.raid.id)
      .edit(Raid.getFormattedMessage(info.raid));
  }
}

module.exports = CheckInCommand;
