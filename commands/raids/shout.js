"use strict";

const log = require('loglevel').getLogger('ShoutCommand'),
	Commando = require('discord.js-commando'),
	{CommandGroup, RaidStatus} = require('../../app/constants'),
	Notify = require('../../app/notify'),
	Raid = require('../../app/raid');

class ShoutCommand extends Commando.Command {
	constructor(client) {
		super(client, {
			name: 'shout',
			group: CommandGroup.BASIC_RAID,
			memberName: 'shout',
			aliases: ['yell'],
			description: 'Sends a message mentioning other attendees to the raid.',
			details: 'Use this command to send a message mentioning other attendees to the raid.',
			examples: ['\t!shout Gridlock on Forbes - take side streets instead!'],
			throttling: {
				usages: 1,
				duration: 60
			},
			guildOnly: true
		});

		client.dispatcher.addInhibitor(message => {
			if (!!message.command && message.command.name === 'new' &&
				!Raid.validRaid(message.channel.id)) {
				return ['invalid-channel', message .reply('Create a new raid group for a raid from its raid channel!')];
			}
			return false;
		});
	}

	async run(message, text) {
		if (!text.length) {
			return;
		}

		const raid = Raid.getRaid(message.channel.id),
			attendees = Object.entries(raid.attendees)
			.filter(([attendee, attendee_status]) => attendee !== message.member.id &&
				attendee_status.status !== RaidStatus.COMPLETE)
			.map(([attendee, attendee_status]) => attendee);

		if (attendees.length > 0) {
			const members = await Promise.all(attendees
				.map(async attendee_id => await Raid.getMember(message.channel.id, attendee_id)))
				.catch(err => log.error(err)),
				text_without_command_prefix = message.cleanContent.substr(1).trim(),
				fully_clean_text = text_without_command_prefix.substr(text_without_command_prefix.indexOf(' ') + 1);

			Notify.shout(message, members, fully_clean_text, message.member);
		}
	}
}

module.exports = ShoutCommand;
