"use strict";

const Commando = require('discord.js-commando');
const Raid = require('../../app/raid');

class StatusCommand extends Commando.Command {
	constructor(client) {
		super(client, {
			name: 'status',
			group: 'raids',
			memberName: 'status',
			description: 'Gets a single update on a raid, or lists all the raids in the channel',
			details: '?????',
			examples: [ '\t!status', '\t!status lugia-0' ],
			argsType: 'multiple'
		});
	}

	run(message, args) {
		var raid_id = args[0];
		var raid = {};

		if (!raid_id) {
			message.reply('Please enter a raid id which can be found on the raid post.  If you do not know the id you can ask for a list of raids in your area via `!status`.');
			return;
		}

		raid = Raid.getRaid(message.channel, raid_id);

		// post a new raid message and replace/forget old bot message
		message.channel.send(Raid.getFormattedMessage(raid)).then((bot_message) => {
			Raid.setMessage(message.channel, message.member, raid.id, bot_message);
		});
	}
}

module.exports = StatusCommand;
