"use strict";

const Commando = require('discord.js-commando'),
	NaturalArgumentType = require('../../types/natural'),
	Raid = require('../../app/raid'),
	Constants = require('../../app/constants'),
	Utility = require('../../app/utility');

class CheckInCommand extends Commando.Command {
	constructor(client) {
		super(client, {
			name: 'check-in',
			group: 'raids',
			memberName: 'check-in',
			aliases: ['arrive', 'arrived', 'present', 'here'],
			description: 'Let others know you have arrived at the raid location and are ready to fight the raid boss!',
			details: 'Use this command to tell everyone you are at the raid location and to ensure that no one is left behind.',
			examples: ['\t!check-in +1', '\t!arrived', '\t!present'],
			args: [
				{
					key: 'additional_attendees',
					label: 'additional attendees',
					prompt: 'How many additional people are here with you?\nExample: `1`',
					type: 'natural',
					default: NaturalArgumentType.UNDEFINED_NUMBER
				}
			],
			argsPromptLimit: 3,
			guildOnly: true
		});

		client.dispatcher.addInhibitor(message => {
			if (message.command.name === 'check-in' && !Raid.validRaid(message.channel.id)) {
				message.reply('Check into a raid from its raid channel!');
				return true;
			}
			return false;
		});
	}

	async run(message, args) {
		const additional_attendees = args['additional_attendees'],
			info = Raid.setMemberStatus(message.channel.id, message.member.id, Constants.RaidStatus.PRESENT, additional_attendees);

		message.react('👍')
			.catch(err => console.error(err));

		Utility.cleanConversation(message);

		Raid.refreshStatusMessages(info.raid);
	}
}

module.exports = CheckInCommand;
