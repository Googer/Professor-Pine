"use strict";

const Commando = require('discord.js-commando'),
	Constants = require('../../app/constants'),
	Raid = require('../../app/raid'),
	NaturalArgumentType = require('../../types/natural'),
	Utility = require('../../app/utility');

class InterestedCommand extends Commando.Command {
	constructor(client) {
		super(client, {
			name: 'interested',
			group: 'raids',
			memberName: 'interested',
			aliases: ['maybe', 'hmm'],
			description: 'Express interest in a raid!',
			details: 'Use this command to express interest in a raid.',
			examples: ['\t!interested', '\t!maybe', '\t!hmm'],
			args: [
				{
					key: 'additional_attendees',
					label: 'additional attendees',
					prompt: 'How many additional people would be coming with you?\nExample: `1`',
					type: 'natural',
					default: NaturalArgumentType.UNDEFINED_NUMBER
				}
			],
			argsPromptLimit: 3,
			guildOnly: true
		});

		client.dispatcher.addInhibitor(message => {
			if (message.command.name === 'interested' && !Raid.validRaid(message.channel.id)) {
				message.reply('Express interest in a raid from its raid channel!');
				return true;
			}
			return false;
		});
	}

	async run(message, args) {
		const additional_attendees = args['additional_attendees'],
			info = Raid.setMemberStatus(message.channel.id, message.member.id, Constants.RaidStatus.INTERESTED, additional_attendees);

		if (!info.error) {
			message.react('👍')
				.catch(err => console.error(err));

			Utility.cleanConversation(message);

			Raid.refreshStatusMessages(info.raid);
		} else {
			message.reply(info.error)
				.catch(err => console.error(err));
		}
	}
}

module.exports = InterestedCommand;
