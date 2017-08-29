"use strict";

const Commando = require('discord.js-commando'),
	Raid = require('../../app/raid'),
	Utility = require('../../app/utility'),
	Constants = require('../../app/constants');

class JoinCommand extends Commando.Command {
	constructor(client) {
		super(client, {
			name: 'join',
			group: 'raids',
			memberName: 'join',
			aliases: ['attend'],
			description: 'Join a raid!',
			details: 'Use this command to join a raid.  If a time has yet to be determined, then when a time is determined, everyone who has joined will be notified of the official raid start time.',
			examples: ['\t!join lugia-0', '\t!join zapdos-1 +3', '\t!attend lugia-0', '\t!attend tyranitar-2 3'],
			args: [
				{
					key: 'additional_attendees',
					label: 'additional attendees',
					prompt: 'How many additional people will be coming with you?',
					type: 'integer',
					default: 0
				},
				{
					key: 'raid',
					prompt: 'Which raid do you wish to join?',
					type: 'raid',
					default: {id: Constants.CURRENT_RAID_ID}
				}
			],
			guildOnly: true
		});
	}

	run(message, args) {
		const raid = args['raid'],
			additional_attendees = args['additional_attendees'];

		let total_attendees = 0;

		const info = Raid.addAttendee(message.channel, message.member, raid.id, additional_attendees);

		if (info.error) {
			message.channel.send(info.error);
		} else {
			total_attendees = Raid.getAttendeeCount({raid: info.raid});

			message.react('👍');

			Utility.cleanConversation(message);

			message.member.send(`You signed up for raid **${info.raid.id}**. There are now **${total_attendees}** potential Trainer(s) so far!`);

			// get previous bot message & update
			Raid.getMessage(message.channel, message.member, info.raid.id)
				.edit(Raid.getFormattedMessage(info.raid));
		}
	}
}

module.exports = JoinCommand;
