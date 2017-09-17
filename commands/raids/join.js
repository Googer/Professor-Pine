"use strict";

const log = require('loglevel').getLogger('JoinCommand'),
	Commando = require('discord.js-commando'),
	Constants = require('../../app/constants'),
	Gym = require('../../app/gym'),
	Raid = require('../../app/raid'),
	NaturalArgumentType = require('../../types/natural'),
	Utility = require('../../app/utility');

class JoinCommand extends Commando.Command {
	constructor(client) {
		super(client, {
			name: 'join',
			group: 'raids',
			memberName: 'join',
			aliases: ['attend', 'omw'],
			description: 'Join a raid!',
			details: 'Use this command to join a raid.  If a time has yet to be determined, then when a time is determined, everyone who has joined will be notified of the official raid start time.',
			examples: ['\t!join', '\t!join +1', '\t!attend', '\t!attend 2'],
			args: [
				{
					key: 'raid_id',
					label: 'raid id',
					prompt: 'What is the ID of the raid you wish to join?',
					type: 'raid'
				},
				{
					key: 'additional_attendees',
					label: 'additional attendees',
					prompt: 'How many additional people will be coming with you?\nExample: `1`',
					type: 'natural',
					default: NaturalArgumentType.UNDEFINED_NUMBER
				}
			],
			argsPromptLimit: 3,
			guildOnly: true
		});

		client.dispatcher.addInhibitor(message => {
			if (message.command.name === 'join' && !Gym.isValidChannel(message.channel.name)) {
				message.reply('Join a raid from its raid channel!');
				return true;
			}
			return false;
		});
	}

	async run(message, args) {
		const raid_id = args['raid_id'],
			additional_attendees = args['additional_attendees'],
			info = Raid.setMemberStatus(raid_id, message.member.id, Constants.RaidStatus.COMING, additional_attendees);

		if (!info.error) {
			message.react('👍')
				.catch(err => log.error(err));

			Utility.cleanConversation(message);

			Raid.refreshStatusMessages(info.raid);
		} else {
			message.reply(info.error)
				.catch(err => log.error(err));
		}
	}
}

module.exports = JoinCommand;
