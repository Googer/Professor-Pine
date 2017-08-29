"use strict";

const Commando = require('discord.js-commando'),
	Raid = require('../../app/raid'),
	Utility = require('../../app/utility'),
	Constants = require('../../app/constants');

class SetLocationCommand extends Commando.Command {
	constructor(client) {
		super(client, {
			name: 'set-location',
			group: 'raids',
			memberName: 'set-location',
			aliases: ['setlocation', 'location', 'set-gym', 'setgym', 'gym'],
			description: 'Set a location for a specific raid.  This is a smart search on gym names and their locations.',
			details: 'Use this command to set the location of a raid.  This command is channel sensitive, meaning it only finds gyms associated with the proper channel.',
			examples: ['\t!set-location lugia-0 Unicorn', '\t!location lugia-0 Bellevue Park', '\t!location zapdos-1 squirrel'],
			args: [
				{
					key: 'raid',
					prompt: 'Which raid do you wish to set the location for?',
					type: 'raid',
					default: {id: Constants.CURRENT_RAID_ID}
				},
				{
					key: 'gym',
					prompt: 'Where is the raid taking place?',
					type: 'gym'
				}
			],
			guildOnly: true
		});
	}

	run(message, args) {
		const raid = args['raid'],
			gym = args['gym'],
			info = Raid.setRaidLocation(message.channel, message.member, raid.id, gym);

		message.react('👍');

		Utility.cleanConversation(message);

		// post a new raid message and replace/forget old bot message
		Raid.getMessage(message.channel, message.member, info.raid.id)
			.edit(Raid.getFormattedMessage(info.raid));
	}
}

module.exports = SetLocationCommand;
