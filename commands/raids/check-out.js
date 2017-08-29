"use strict";

const Commando = require('discord.js-commando'),
	Raid = require('../../app/raid'),
	Utility = require('../../app/utility'),
	Constants = require('../../app/constants');

class CheckOutCommand extends Commando.Command {
	constructor(client) {
		super(client, {
			name: 'check-out',
			group: 'raids',
			memberName: 'check-out',
			aliases: ['checkout', 'depart'],
			description: 'Let others know you have gone to the wrong location.',
			details: 'Use this command in case you thought you were at the right location, but were not.',
			examples: ['\t!check-out lugia-0', '\t!checkout lugia-0'],
			args: [
				{
					key: 'raid',
					prompt: 'Which raid do you wish to check out of?\nExample: `lugia-0`',
					type: 'raid',
					default: {id: Constants.CURRENT_RAID_ID}
				}
			],
			argsPromptLimit: 3,
			guildOnly: true
		});
	}

	run(message, args) {
		const raid = args['raid'],
			info = Raid.setArrivalStatus(message.channel, message.member, raid.id, false);

		message.react('👍');

		Utility.cleanConversation(message);

		// get previous bot message & update
		Raid.getMessage(message.channel, message.member, info.raid.id)
			.edit(Raid.getFormattedMessage(info.raid));
	}
}

module.exports = CheckOutCommand;
