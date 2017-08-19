"use strict";

const Commando = require('discord.js-commando');
const Raid = require('../../app/raid');

class JoinCommand extends Commando.Command {
  constructor(client) {
    super(client, {
      name: 'join',
      group: 'raids',
      memberName: 'join',
      aliases: ['attend'],
      description: 'Join a raid!',
      details: '?????',
      examples: ['\t!join lugia', '\t!attend lugia', '\t!join lugia +3', '\t!attend lugia 3'],
      argsType: 'multiple'
    });
  }

  run(message, args) {
    if (message.channel.type !== 'text') {
      message.reply('Please join a raid from a public channel.');
      return;
    }

    const raid = Raid.findRaid(message.channel, message.member, args);

    if (!raid.raid) {
      message.reply('Please enter a raid id which can be found on the raid post.  If you do not know the id you can ask for a list of raids in your area via `!status`.');
      return;
    }

    const additional_attendees = parseInt(raid.args[0]) || 0;
    let total_attendees = 0;

    const info = Raid.addAttendee(message.channel, message.member, raid.raid.id, additional_attendees);

    if (info.error) {
      // message.member.sendMessage(info.error);
      message.channel.send(info.error);
    } else {
      total_attendees = Raid.getAttendeeCount({raid: info.raid});

      message.react('👍');
      // message.react('🤖');
      message.member.send(`You signed up for raid **${info.raid.id}**. There are now **${total_attendees}** potential Trainer(s) so far!`);
      // message.channel.send(Raid.getFormattedMessage(info.raid));

      // get previous bot message & update
      Raid.getMessage(message.channel, message.member, info.raid.id)
        .edit(Raid.getFormattedMessage(info.raid));
    }
  }
}

module.exports = JoinCommand;