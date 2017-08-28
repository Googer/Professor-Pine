"use strict";

const Commando = require('discord.js-commando'),
	Raid = require('../../app/raid'),
	Constants = require('../../app/constants'),
	Utility = require('../../app/utility');

class CheckInCommand extends Commando.Command {
	constructor(client) {
		super(client, {
			name: 'check-in',
			group: 'raids',
			memberName: 'check-in',
			aliases: ['checkin', 'arrive', 'arrived', 'present'],
			description: 'Let others know you have arrived at the raid location and are ready to fight the raid boss!',
			details: 'Use this command to tell everyone you are at the raid location and to ensure that no one is left behind.',
			examples: ['\t!check-in lugia-0', '\t!arrived lugia-0', '\t!present lugia-0'],
			args: [
				{
					key: 'raid',
					prompt: 'Which raid do you wish to check into?',
					type: 'raid',
					default: {id: Constants.CURRENT_RAID_ID}
				}
			],
			guildOnly: true
		});
	}

	run(message, args) {
		const raid = args['raid'],
			info = Raid.setArrivalStatus(message.channel, message.member, raid.id, true);

		message.react('👍');

		Utility.cleanConversation(message);

		// get previous bot message & update
		Raid.getMessage(message.channel, message.member, info.raid.id)
			.edit(Raid.getFormattedMessage(info.raid));
	}
}

module.exports = CheckInCommand;
