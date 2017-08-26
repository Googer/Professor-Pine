"use strict";

const Commando = require('discord.js-commando');
const Raid = require('../../app/raid');

class CheckOutCommand extends Commando.Command {
	constructor(client) {
		super(client, {
			name: 'check-out',
			group: 'raids',
			memberName: 'check-out',
			aliases: ['checkout'],
			description: 'Let others know you have gone to the wrong location.',
			details: 'Use this command in case you thought you were at the right location, but were not.',
			examples: ['\t!check-out lugia-0', '\t!checkout lugia-0'],
			argsType: 'multiple'
		});
	}

	run(message, args) {
		if (message.channel.type !== 'text') {
			message.reply('Please check out from a public channel.');
			return;
		}

		const raid = Raid.findRaid(message.channel, message.member, args);

		if (!raid.raid) {
			message.reply('Please enter a raid id which can be found on the raid post.  If you do not know the id you can ask for a list of raids in your area via `!status`.');
			return;
		}

		const info = Raid.setArrivalStatus(message.channel, message.member, raid.raid.id, false);

		message.react('👍');

		// get previous bot message & update
		Raid.getMessage(message.channel, message.member, info.raid.id)
			.edit(Raid.getFormattedMessage(info.raid));
	}
}

module.exports = CheckOutCommand;
