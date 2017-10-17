"use strict";

const log = require('loglevel').getLogger('CheckOutCommand'),
	Commando = require('discord.js-commando'),
	{RaidStatus} = require('../../app/constants'),
	Helper = require('../../app/helper'),
	Raid = require('../../app/raid');

class CheckOutCommand extends Commando.Command {
	constructor(client) {
		super(client, {
			name: 'not-here',
			group: 'basic-raid',
			memberName: 'not-here',
			aliases: ['check-out', 'depart'],
			description: 'Lets others know you have gone to the wrong location for an existing raid.',
			details: 'Use this command in case you thought you were at the right location, but were not.',
			examples: ['\t!not-here', '\t!checkout'],
			guildOnly: true
		});

		client.dispatcher.addInhibitor(message => {
			if (!!message.command && message.command.name === 'not-here' &&
				!Raid.validRaid(message.channel.id)) {
				return ['invalid-channel', message.reply('Check out of a raid from its raid channel!')];
			}
			return false;
		});
	}

	async run(message, args) {
		const info = Raid.setMemberStatus(message.channel.id, message.member.id, RaidStatus.INTERESTED);

		if (!info.error) {
			message.react(Helper.getEmoji('snorlaxthumbsup') || '👍')
				.catch(err => log.error(err));

			Raid.refreshStatusMessages(info.raid);
		} else {
			message.reply(info.error)
				.catch(err => log.error(err));
		}
	}
}

module.exports = CheckOutCommand;
