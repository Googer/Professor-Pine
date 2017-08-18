"use strict";

const Commando = require('discord.js-commando');
const Raid = require('../../app/raid');

class SetTimeCommand extends Commando.Command {
	constructor(client) {
		super(client, {
			name: 'set-time',
			group: 'raids',
			memberName: 'set-time',
			aliases: [ 'settime' ],
			description: 'Set the time the raid will begin.',
			details: '?????',
			examples: [ '\t!set-time lugia-0 2:20pm' ],
			argsType: 'multiple'
		});
	}

	run(message, args) {
		var raid_id = args[0];
		var start_time = args[1];
		var total_attendees = 0;
		var info = {};

		if (!raid_id) {
			message.reply('Please enter a raid id which can be found on the raid post.  If you do not know the id you can ask for a list of raids in your area via `!status`.');
			return;
		}

		info = Raid.setRaidTime(message.channel, message.member, raid_id, start_time);
		total_attendees = Raid.getAttendeeCount({ raid: info.raid });

		for (let i=0; i<info.raid.attendees.length; i++) {
			let member = info.raid.attendees[i];

			// no reason to spam the person who set the time, telling them the time being set haha
			if (member.id !== message.member.id) {
				member.send(`A start time has been set for **${info.raid.id}** @ **${info.raid.start_time}**. There are currently **${total_attendees}** Trainer(s) attending!`);
			}
		}

		message.channel.send(Raid.getFormattedMessage(info.raid));
	}
}

module.exports = SetTimeCommand;
