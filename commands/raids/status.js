"use strict";

const Commando = require('discord.js-commando'),
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
			if (message.command.name === 'check-in' && !Raid.validRaid(message.channel)) {
				message.reply('Check out of a raid from its raid channel!');
				return true;
			}
			return false;
		});
	}

	run(message, args) {
		if (!Raid.validRaid(message.channel)) {
			message.channel.send(Raid.getRaidsFormattedMessage(message.channel))
				.catch(err => console.log(err));
		} else {
			const info = Raid.getRaid(message.channel);

			// post a new raid message
			message.channel.send(Raid.getRaidSourceChannelMessage(info), Raid.getFormattedMessage(info))
				.then(status_message => {
					Raid.addMessage(info.channel, status_message);
				})
				.catch(err => console.log(err));
		}
	}
}

module.exports = StatusCommand;
