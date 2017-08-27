"use strict";

const Commando = require('discord.js-commando');
const Raid = require('../../app/raid');
const LocationSearch = require('../../app/location-search');

class SetLocationCommand extends Commando.Command {
	constructor(client) {
		super(client, {
			name: 'set-location',
			group: 'raids',
			memberName: 'set-location',
			aliases: ['setlocation', 'location'],
			description: 'Set a location for a specific raid.  This can be a link or a name of a gym.',
			details: 'Use this command to set the location of a raid.  This command is channel sensitive, meaning it only finds gyms associated with the proper channel.',
			examples: ['\t!set-location lugia-0 Unicorn', '\t!location lugia-0 Bellevue Park', '\t!location zapdos-1 squirrel'],
			argsType: 'multiple'
		});
	}

	run(message, args) {
		if (message.channel.type !== 'text') {
			message.reply('Please set location for a raid from a public channel.');
			return;
		}

		const raid = Raid.findRaid(message.channel, message.member, args);

		if (!raid.raid) {
			message.reply('Please enter a raid id which can be found on the raid post.  If you do not know the id you can ask for a list of raids in your area via `!status`.');
			return;
		}

		const location = raid.args;

		if (!location) {
			message.reply('Please enter some search terms to look for a valid gym.');
			return;
		}

		try {
			const gyms = LocationSearch.search(message.channel.name, location),
				top_gym = gyms[0];

			if (!top_gym) {
				throw 'Search terms entered yielded no valid gyms.  Please try again.';
			}

				// TODO: Consider making this list something like the top 5-10 gyms to the user and let them pick the best match
			const info = Raid.setRaidLocation(message.channel, message.member, raid.raid.id, top_gym);

			// post a new raid message and replace/forget old bot message
			message.channel.send(Raid.getFormattedMessage(info.raid)).then((bot_message) => {
				Raid.setMessage(message.channel, message.member, info.raid.id, bot_message);
			});
		} catch (err) {
			message.reply('Search terms entered yielded no valid gyms.  Please try again.');
		}
	}
}

module.exports = SetLocationCommand;
