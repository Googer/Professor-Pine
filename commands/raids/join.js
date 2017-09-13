"use strict";

const Commando = require('discord.js-commando'),
	Constants = require('../../app/constants'),
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
			if (message.command.name === 'join' && !Raid.validRaid(message.channel.id)) {
				message.reply('Join a raid from its raid channel!');
				return true;
			}
			return false;
		});
	}

	async run(message, args) {
		const additional_attendees = args['additional_attendees'],
			info = Raid.setMemberStatus(message.channel.id, message.member.id, Constants.RaidStatus.COMING, additional_attendees);

		if (!info.error) {
			const total_attendees = Raid.getAttendeeCount(info.raid);

			message.react('👍')
				.catch(err => console.error(err));

			Utility.cleanConversation(message);

			const verb =
					total_attendees === 1 ?
						'is' :
						'are',
				noun =
					total_attendees === 1 ?
						'trainer' :
						'trainers',
				channel = await Raid.getChannel(info.raid.channel_id)
					.catch(err => console.error(err));

			message.member.send(`You signed up for raid ${channel.toString()}. ` +
				`There ${verb} now **${total_attendees}** potential ${noun}!  ` +
				'Be sure to update your status in its channel!')
				.catch(err => console.error(err));

			// get previous bot message & update
			await Raid.refreshStatusMessages(info.raid);
		} else {
			message.reply(info.error)
				.catch(err => console.error(err));
		}
	}
}

module.exports = JoinCommand;
