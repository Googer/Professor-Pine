"use strict";

const Commando = require('discord.js-commando');
const Raid = require('../../app/raid');

class StatusCommand extends Commando.Command {
	constructor(client) {
		super(client, {
			name: 'status',
			group: 'raids',
			memberName: 'status',
			description: 'Gets an update on a single raid, or lists all the raids available in the channel.',
			details: 'Use this command when trying to figure out what raids are available or the status of a raid being planned.  NOTE: This does not get all of the raids in the entire discord, it is channel specific.',
			examples: ['\t!status', '\t!status lugia-0'],
			argsType: 'multiple'
		});
	}

	run(message, args) {
		if (message.channel.type !== 'text') {
			message.reply('Please query status from a public channel.');
			return;
		}

		// if no arguements are given for status command, give a shorthand public message of all active raids
		if (!args.length) {
			const raids = Raid.getAllRaids(message.channel, message.member);

			if (raids) {
				message.channel.send(Raid.getShortFormattedMessage(raids));
			} else {
				message.channel.send('No raids currently available in this channel.');
			}
		} else {
			const info = Raid.findRaid(message.channel, message.member, args);

			if (info.error) {
				message.channel.send(info.error);
			} else {
				Raid.setUserRaidId(message.member, info.raid.id);

				// post a new raid message and replace/forget old bot message
				message.channel.send(Raid.getFormattedMessage(info.raid)).then((bot_message) => {
					Raid.setMessage(message.channel, message.member, info.raid.id, bot_message);
				});
			}
		}
	}
}

module.exports = StatusCommand;
