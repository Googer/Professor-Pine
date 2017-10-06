"use strict";

const log = require('loglevel').getLogger('InterestedCommand'),
	Commando = require('discord.js-commando'),
	Constants = require('../../app/constants'),
	Raid = require('../../app/raid'),
	NaturalArgumentType = require('../../types/natural'),
	Utility = require('../../app/utility');

class InterestedCommand extends Commando.Command {
	constructor(client) {
		super(client, {
			name: 'maybe',
			group: 'basic-raid',
			memberName: 'maybe',
			aliases: ['interested', 'hmm'],
			description: 'Expresses interest in an existing raid without committing to it.',
			details: 'Use this command to express interest in a raid.',
			examples: ['\t!maybe', '\t!interested', '\t!hmm'],
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
			if (!!message.command && message.command.name === 'maybe' &&
				!Raid.validRaid(message.channel.id)) {
				return ['invalid-channel', message.reply('Express interest in a raid from its raid channel!')];
			}
			return false;
		});
	}

	async run(message, args) {
		const additional_attendees = args['additional_attendees'],
			info = Raid.setMemberStatus(message.channel.id, message.member.id, Constants.RaidStatus.INTERESTED, additional_attendees);

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

module.exports = InterestedCommand;
