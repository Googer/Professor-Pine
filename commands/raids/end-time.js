"use strict";

const Commando = require('discord.js-commando'),
	Raid = require('../../app/raid'),
	Utility = require('../../app/utility'),
	Constants = require('../../app/constants');

class EndTimeCommand extends Commando.Command {
	constructor(client) {
		super(client, {
			name: 'end-time',
			group: 'raids',
			memberName: 'end-time',
			aliases: ['end', 'ends'],
			description: 'Set a time that the raid will no longer exist.',
			details: 'Use this command to set remaining time on a raid.',
			examples: ['\t!end-time 1:45 lugia-0', '\t!end 50 moltres-1'],
			args: [
				{
					key: 'time',
					prompt: 'How much time is remaining on the raid (use h:mm or mm format)?',
					type: 'time'
				},
				{
					key: 'raid',
					prompt: 'Which raid do you wish set the end time on?',
					type: 'raid',
					default: {id: Constants.CURRENT_RAID_ID}
				}
			],
			guildOnly: true
		});
	}

	run(message, args) {
		const raid = args['raid'],
			time = args['time'],
			info = Raid.setRaidEndTime(message.channel, message.member, raid.id, time);

		message.react('👍');

		Utility.cleanConversation(message);

		// post a new raid message and replace/forget old bot message
		Raid.getMessage(message.channel, message.member, info.raid.id)
			.edit(Raid.getFormattedMessage(info.raid));
	}
}

module.exports = EndTimeCommand;
