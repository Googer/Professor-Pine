"use strict";

const log = require('loglevel').getLogger('NewGroupCommand'),
	Commando = require('discord.js-commando'),
	{CommandGroup} = require('../../app/constants'),
	Helper = require('../../app/helper'),
	Raid = require('../../app/raid');

class NewGroupCommand extends Commando.Command {
	constructor(client) {
		super(client, {
			name: 'new-group',
			group: CommandGroup.BASIC_RAID,
			memberName: 'new-group',
			aliases: ['create-group'],
			description: 'Creates a new group for a raid and sets your group to it.',
			details: 'Use this command to create a new group for a raid.',
			examples: ['\t!new-group'],
			guildOnly: true
		});

		client.dispatcher.addInhibitor(message => {
			if (!!message.command && message.command.name === 'new-group' &&
				!Raid.validRaid(message.channel.id)) {
				return ['invalid-channel', message.reply('Create a new raid group for a raid from its raid channel!')];
			}
			return false;
		});
	}

	async run(message, args) {
		const info = Raid.createGroup(message.channel.id, message.member.id);

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

module.exports = NewGroupCommand;
