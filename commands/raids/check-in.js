"use strict";

const Commando = require('discord.js-commando');
const Raid = require('../../app/raid');

class CheckInCommand extends Commando.Command {
	constructor(client) {
		super(client, {
			name: 'check-in',
			group: 'raids',
			memberName: 'check-in',
			aliases: [ 'checkin', 'arrive', 'arrived' ],
			description: 'Let others know you have arrived at the raid location.',
			details: '?????',
			examples: [ '\t!check-in lugia-0' ],
			argsType: 'multiple'
		});
	}

	run(message, args) {
		var raid_id = args[0];
		var info = {};

		if (!raid_id) {
			message.reply('Please enter a raid id which can be found on the raid post.  If you do not know the id you can ask for a list of raids in your area via `!status`.');
			return;
		}

		info = Raid.setArrivalStatus(message.channel, message.member, raid_id, true);

		message.react('👍');

		// get previous bot message & update
		Raid.getMessage(message.channel, message.member, info.raid.id)
			.edit(Raid.getFormattedMessage(info.raid));
	}
}

module.exports = CheckInCommand;
