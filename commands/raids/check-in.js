"use strict";

const log = require('loglevel').getLogger('CheckInCommand'),
	Commando = require('discord.js-commando'),
	NaturalArgumentType = require('../../types/natural'),
	Gym = require('../../app/gym'),
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
					key: 'raid_id',
					label: 'raid id',
					prompt: 'What is the ID of the raid you wish to check into?',
					type: 'raid'
				},
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
			if (message.command.name === 'check-in' && !Gym.isValidChannel(message.channel.name)) {
				message.reply('Check into a raid from its raid channel!');
				return true;
			}
			return false;
		});
	}

	async run(message, args) {
		const raid_id = args['raid_id'],
			additional_attendees = args['additional_attendees'],
			info = Raid.setMemberStatus(raid_id, message.member.id, Constants.RaidStatus.PRESENT, additional_attendees);

		message.react('👍')
			.catch(err => log.error(err));

		Utility.cleanConversation(message);

		Raid.refreshStatusMessages(info.raid);
	}
}

module.exports = CheckInCommand;
