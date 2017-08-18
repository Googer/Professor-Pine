"use strict";

const Commando = require('discord.js-commando');
const Raid = require('../../app/raid');

class SetLocationCommand extends Commando.Command {
	constructor(client) {
		super(client, {
			name: 'set-location',
			group: 'raids',
			memberName: 'set-location',
			aliases: [ 'setlocation' ],
			description: 'Set the location of the raid.',
			details: '?????',
			examples: [ '\t!set-location lugia-0 https://www.google.com/maps/dir/Current+Location/40.53028537,-80.01068783' ],
			argsType: 'multiple'
		});
	}

	run(message, args) {
		var raid_id = args[0];
		var location = args[1];
		var info = {};

		if (!raid_id) {
			message.reply('Please enter a raid id which can be found on the raid post.  If you do not know the id you can ask for a list of raids in your area via `!status`.');
			return;
		}

		info = Raid.setRaidLocation(message.channel, message.member, raid_id, start_time);

		message.channel.send(Raid.getFormattedMessage(info.raid));
	}
}

module.exports = SetLocationCommand;
