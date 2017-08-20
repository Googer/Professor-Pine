"use strict";

const Commando = require('discord.js-commando');
const Raid = require('../../app/raid');

class SetTimeCommand extends Commando.Command {
	constructor(client) {
		super(client, {
			name: 'set-time',
			group: 'raids',
			memberName: 'set-time',
			aliases: ['settime', 'time'],
			description: 'Set the time the raid will begin.',
			details: '?????',
			examples: ['\t!set-time lugia-0 2:20pm'],
			argsType: 'multiple'
		});
	}

	run(message, args) {
		if (message.channel.type !== 'text') {
			message.reply('Please set time for a raid from a public channel.');
			return;
		}

		const raid = Raid.findRaid(message.channel, message.member, args);

		if (!raid.raid) {
			message.reply('Please enter a raid id which can be found on the raid post.  If you do not know the id you can ask for a list of raids in your area via `!status`.');
			return;
		}

		const start_time = raid.args[0];

		const info = Raid.setRaidTime(message.channel, message.member, raid.raid.id, start_time);
		let total_attendees = Raid.getAttendeeCount({raid: info.raid});

		for (let i = 0; i < info.raid.attendees.length; i++) {
			let member = info.raid.attendees[i];

			// no reason to spam the person who set the time, telling them the time being set haha
			if (member.id !== message.member.id) {
				member.send(`A start time has been set for **${info.raid.id}** @ **${info.raid.start_time}**. There are currently **${total_attendees}** Trainer(s) attending!`);
			}
		}

		// post a new raid message and replace/forget old bot message
		message.channel.send(Raid.getFormattedMessage(info.raid)).then((bot_message) => {
			Raid.setMessage(message.channel, message.member, info.raid.id, bot_message);
		});
	}
}

module.exports = SetTimeCommand;
