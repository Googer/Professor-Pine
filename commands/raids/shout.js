"use strict";

const log = require('loglevel').getLogger('ShoutCommand'),
	Commando = require('discord.js-commando'),
	{CommandGroup, RaidStatus} = require('../../app/constants'),
	Helper = require('../../app/helper'),
	Notify = require('../../app/notify'),
	Raid = require('../../app/raid'),
	settings = require('../../data/settings');

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
			args: [
				{
					key: 'message',
					label: 'message',
					prompt: 'What do you wish to shout to this raid?',
					type: 'string'
				}
			],
			argsPromptLimit: 3,
			guildOnly: true
		});

		client.dispatcher.addInhibitor(message => {
			if (!!message.command && message.command.name === 'new' &&
				!Raid.validRaid(message.channel.id)) {
				return ['invalid-channel', message.reply('Create a new raid group for a raid from its raid channel!')];
			}
			return false;
		});
	}

	async run(message, args) {
		const text = args['message'],
			raid = Raid.getRaid(message.channel.id),
			attendees = Object.entries(raid.attendees)
			.filter(([attendee, attendee_status]) => attendee !== message.member.id &&
				attendee_status.status !== RaidStatus.COMPLETE)
			.map(([attendee, attendee_status]) => attendee);

		if (attendees.length > 0) {
			const members = await Promise.all(attendees
				.map(async attendee_id => await Raid.getMember(message.channel.id, attendee_id)))
				.catch(err => log.error(err));

			Notify.shout(message, members, text, message.member);
		}
	}
}

module.exports = ShoutCommand;
