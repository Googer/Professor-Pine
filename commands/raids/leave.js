"use strict";

const Commando = require('discord.js-commando');
const Raid = require('../../app/raid');

class LeaveCommand extends Commando.Command {
  constructor(client) {
    super(client, {
      name: 'leave',
      group: 'raids',
      memberName: 'leave',
      aliases: ['part'],
      description: 'Can\'t make it to a raid? no problem, just leave it.',
      argsType: 'multiple'
    });
  }

  run(message, args) {
    if (message.channel.type !== 'text') {
      message.reply('Please leave a raid from a public channel.');
      return;
    }

    const raid = Raid.findRaid(message.channel, message.member, args);

    if (!raid.raid) {
      message.reply('Please enter a raid id which can be found on the raid post.  If you do not know the id you can ask for a list of raids in your area via `!status`.');
      return;
    }

    const info = Raid.removeAttendee(message.channel, message.member, raid.raid.id);

    if (!info.error) {
      message.react('👍');
      // message.member.send(`You have left raid **${info.raid.id}**.`);

      // get previous bot message & update
      Raid.getMessage(message.channel, message.member, info.raid.id)
        .edit(Raid.getFormattedMessage(info.raid));
    }
  }
}

module.exports = LeaveCommand;
