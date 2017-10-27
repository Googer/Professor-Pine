"use strict";

const log = require('loglevel').getLogger('JoinCommand'),
	Commando = require('discord.js-commando'),
	{CommandGroup, RaidStatus} = require('../../app/constants'),
	Helper = require('../../app/helper'),
	Raid = require('../../app/raid'),
	NaturalArgumentType = require('../../types/natural'),
	Utility = require('../../app/utility');

class JoinCommand extends Commando.Command {
	constructor(client) {
		super(client, {
			name: 'join',
			group: CommandGroup.BASIC_RAID,
			memberName: 'join',
			aliases: ['attend', 'omw', 'coming'],
			description: 'Joins an existing raid.',
			details: 'Use this command to join a raid.  If a time has yet to be determined, then when a time is determined, everyone who has joined will be notified of the official raid start time.',
			examples: ['\t!join', '\t!join +1', '\t!attend', '\t!attend 2'],
			args: [
				{
					key: 'additional_attendees',
					label: 'additional attendees',
					prompt: 'How many additional people are coming with you?\nExample: `+1`\n\n*or*\n\nHow many people are coming (including yourself)?\nExample: `2`\n',
					type: 'natural',
					default: NaturalArgumentType.UNDEFINED_NUMBER
				}
			],
			argsPromptLimit: 3,
			guildOnly: true
		});

		client.dispatcher.addInhibitor(message => {
			if (!!message.command && message.command.name === 'join' &&
				!Raid.validRaid(message.channel.id)) {
				return ['invalid-channel', message.reply('Join a raid from its raid channel!')];
			}
			return false;
		});
	}

	async run(message, args) {
		const additional_attendees = args['additional_attendees'],
			info = Raid.setMemberStatus(message.channel.id, message.member.id, RaidStatus.COMING, additional_attendees);

		if (!info.error) {
			message.react(Helper.getEmoji('snorlaxthumbsup') || '👍')
				.catch(err => log.error(err));

			Utility.cleanConversation(message);

			Raid.refreshStatusMessages(info.raid);
		} else {
			return message.reply(info.error)
				.catch(err => log.error(err));
		}
	}
}

module.exports = JoinCommand;
