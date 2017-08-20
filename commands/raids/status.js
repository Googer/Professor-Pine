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
			message.channel.send(Raid.getShortFormattedMessage(raids));
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
