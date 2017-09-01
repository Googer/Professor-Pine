"use strict";

const Commando = require('discord.js-commando'),
	Raid = require('../../app/raid'),
	Utility = require('../../app/utility');

class StartTimeCommand extends Commando.Command {
	constructor(client) {
		super(client, {
			name: 'start-time',
			group: 'raids',
			memberName: 'start-time',
			aliases: ['start', 'starts'],
			description: 'Set the time the raid will begin.',
			details: 'Use this command to finalize plans for fighting a raid boss.  If possible, try to set times 20 minutes out and always try to arrive at least 5 minutes before the start time being set.',
			examples: ['\t!start-time 2:20pm', '\t!start \'30 minutes\''],
			args: [
				{
					key: 'start-time',
					label: 'start time',
					prompt: 'What time do you wish to begin this raid?\nExamples: `8:43`, `2:20pm`, `30 minutes`',
					type: 'time',
					min: 'absolute'
				}
			],
			guildOnly: true
		});

		client.dispatcher.addInhibitor(message => {
			if (message.command.name === 'start-time' && !Raid.validRaid(message.channel)) {
				message.reply('Set the start time of a raid from its raid channel!');
				return true;
			}
			return false;
		});
	}

	run(message, args) {
		const start_time = args['start-time'],
			info = Raid.setRaidStartTime(message.channel, start_time);

		message.react('👍')
			.catch(err => console.log(err));

		let total_attendees = Raid.getAttendeeCount({raid: info.raid});

		// notify all attendees that a time has been set
		for (let i = 0; i < info.raid.attendees.length; i++) {
			let member = info.raid.attendees[i];

			// no reason to spam the person who set the time, telling them the time being set haha
			if (member.id !== message.member.id) {
				member.send(`A start time has been set for **${info.raid.id}** @ **${info.raid.start_time}**. There are currently **${total_attendees}** Trainer(s) attending!`)
					.catch(err => console.log(err));
			}
		}

		Utility.cleanConversation(message);

		Raid.refreshStatusMessages(info.raid);
	}
}

module.exports = StartTimeCommand;
