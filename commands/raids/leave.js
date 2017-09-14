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
			details: 'Use this command to leave a raid if you can no longer attend it.',
			examples: ['\t!leave', '\t!part'],
			guildOnly: true
		});

		client.dispatcher.addInhibitor(message => {
			if (message.command.name === 'leave' && !Raid.validRaid(message.channel.id)) {
				message.reply('Leave a raid from its raid channel!');
				return true;
			}
			return false;
		});
	}

	async run(message, args) {
		const info = Raid.removeAttendee(message.channel.id, message.member.id);

		if (!info.error) {
			message.react('👍')
				.catch(err => console.error(err));

			Utility.cleanConversation(message);

			Raid.refreshStatusMessages(info.raid);
		} else {
			message.reply(info.error)
				.catch(err => console.error(err));
		}
	}
}

module.exports = LeaveCommand;
