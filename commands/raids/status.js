"use strict";

const log = require('loglevel').getLogger('StatusCommand'),
	Commando = require('discord.js-commando'),
	Gym = require('../../app/gym'),
	Raid = require('../../app/raid');

class StatusCommand extends Commando.Command {
	constructor(client) {
		super(client, {
			name: 'status',
			group: 'raids',
			memberName: 'status',
			description: 'Gets an update on a single raid, or lists all the raids available in the channel (context-sensitive).',
			details: 'Use this command when trying to figure out what raids are available or the status of a raid being planned.  NOTE: This does not get all of the raids in the entire discord, it is channel specific.',
			examples: ['\t!status'],
			guildOnly: true,
			argsType: 'multiple'
		});

		client.dispatcher.addInhibitor(message => {
			if (message.command.name === 'status' &&
				!Raid.validRaid(message.channel.id) &&
				!Gym.isValidChannel(message.channel.name)) {
				message.reply('Check status of a raid from its raid channel or raids from a regional channel!');
				return true;
			}
			return false;
		});
	}

	async run(message, args) {
		if (!Raid.validRaid(args[0])) {
			const raids_message = await Raid.getRaidsFormattedMessage(message.channel.id);
			message.channel.send(raids_message)
				.catch(err => log.error(err));
		} else {
			const raid = Raid.getRaid(args[0]),
				source_channel_message = await Raid.getRaidIdMessage(raid),
				formatted_message = await Raid.getFormattedMessage(raid);

			// post a new raid message
			message.channel.send(source_channel_message, formatted_message)
				.then(status_message => {
					Raid.addMessage(raid_id, status_message);
				})
				.catch(err => log.error(err));
		}
	}
}

module.exports = StatusCommand;
