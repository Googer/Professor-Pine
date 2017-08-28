"use strict";

const Commando = require('discord.js-commando'),
	Raid = require('../../app/raid'),
	Utility = require('../../app/utility');

class LeaveCommand extends Commando.Command {
	constructor(client) {
		super(client, {
			name: 'leave',
			group: 'raids',
			memberName: 'leave',
			aliases: ['part'],
			description: 'Can\'t make it to a raid? no problem, just leave it.',
			details: 'Use this command to leave a raid if you can no longer attend.  Don\'t stress, these things happen!',
			examples: ['\t!leave lugia-0', '\t!part lugia-0'],
			args: [
				{
					key: 'raid',
					prompt: 'Which raid do you wish to leave?',
					type: 'raid',
					default: {id: 'current'}
				}
			],
			guildOnly: true
		});
	}

	run(message, args) {
		const raid = args['raid'],
			info = Raid.removeAttendee(message.channel, message.member, raid.raid);

		if (!info.error) {
			message.react('👍');

			Utility.cleanConversation(message);

			// get previous bot message & update
			Raid.getMessage(message.channel, message.member, info.raid.id)
				.edit(Raid.getFormattedMessage(info.raid));
		}
	}
}

module.exports = LeaveCommand;
