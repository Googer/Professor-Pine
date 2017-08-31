"use strict";

const Commando = require('discord.js-commando'),
	Raid = require('../../app/raid'),
	Utility = require('../../app/utility'),
	Constants = require('../../app/constants');

class LeaveCommand extends Commando.Command {
	constructor(client) {
		super(client, {
			name: 'leave',
			group: 'raids',
			memberName: 'leave',
			aliases: ['part'],
			description: 'Can\'t make it to a raid? no problem, just leave it.',
			details: 'Use this command to leave a raid if you can no longer attend.  Don\'t stress, these things happen!',
			examples: ['\t!leave', '\t!part'],
			guildOnly: true
		});

		client.dispatcher.addInhibitor(message => {
			if (message.command.name === 'leave' && !Raid.validRaid(message.channel)) {
				message.reply('Leave a raid from its raid channel!');
				return true;
			}
			return false;
		});
	}

	run(message, args) {
		const info = Raid.removeAttendee(message.channel, message.member);

		if (!info.error) {
			message.react('👍')
				.catch(err => console.log(err));

			Utility.cleanConversation(message);

			// get previous bot message & update
			Raid.refreshStatusMessages(info.raid);
		} else {
			message.reply(info.error)
				.catch(err => console.log(err));
		}
	}
}

module.exports = LeaveCommand;
