"use strict";

const log = require('loglevel').getLogger('LeaveCommand'),
	Commando = require('discord.js-commando'),
	{CommandGroup} = require('../../app/constants'),
	Helper = require('../../app/helper'),
	Raid = require('../../app/raid');

class LeaveCommand extends Commando.Command {
	constructor(client) {
		super(client, {
			name: 'leave',
			group: CommandGroup.BASIC_RAID,
			memberName: 'leave',
			aliases: ['part', 'not-interested', 'uninterested', 'meh', 'bye'],
			description: 'Leaves an existing raid (completely removes you from its attendees list).\n',
			details: 'Use this command to leave a raid if you can no longer attend it.',
			examples: ['\t!leave', '\t!part'],
			guildOnly: true
		});

		client.dispatcher.addInhibitor(message => {
			if (!!message.command && message.command.name === 'leave' &&
				!Raid.validRaid(message.channel.id)) {
				return ['invalid-channel', message.reply('Leave a raid from its raid channel!')];
			}
			return false;
		});
	}

	async run(message, args) {
		const info = Raid.removeAttendee(message.channel.id, message.member.id);

		if (!info.error) {
			message.react(Helper.getEmoji('snorlaxthumbsup') || '👍')
				.catch(err => log.error(err));

			Raid.refreshStatusMessages(info.raid);
		} else {
			message.reply(info.error)
				.catch(err => log.error(err));
		}
	}
}

module.exports = LeaveCommand;
