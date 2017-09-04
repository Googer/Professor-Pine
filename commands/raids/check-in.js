"use strict";

const Commando = require('discord.js-commando'),
	Raid = require('../../app/raid'),
	Utility = require('../../app/utility');

class CheckInCommand extends Commando.Command {
	constructor(client) {
		super(client, {
			name: 'check-in',
			group: 'raids',
			memberName: 'check-in',
			aliases: ['arrive', 'arrived', 'present', 'here'],
			description: 'Let others know you have arrived at the raid location and are ready to fight the raid boss!',
			details: 'Use this command to tell everyone you are at the raid location and to ensure that no one is left behind.',
			examples: ['\t!check-in', '\t!arrived', '\t!present'],
			guildOnly: true
		});

		client.dispatcher.addInhibitor(message => {
			if (message.command.name === 'check-in' && !Raid.validRaid(message.channel.id)) {
				message.reply('Check into a raid from its raid channel!');
				return true;
			}
			return false;
		});
	}

	async run(message, args) {
		const info = Raid.setArrivalStatus(message.channel.id, message.member.id, true);

		message.react('👍')
			.catch(err => console.log(err));

		Utility.cleanConversation(message);

		// get previous bot messages & update
		await Raid.refreshStatusMessages(info.raid);
	}
}

module.exports = CheckInCommand;
