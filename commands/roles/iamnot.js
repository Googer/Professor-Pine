"use strict";

const log = require('loglevel').getLogger('IAmNotCommand'),
	Commando = require('discord.js-commando'),
	{CommandGroup} = require('../../app/constants'),
	Helper = require('../../app/helper'),
	Role = require('../../app/role');

class IAmNotCommand extends Commando.Command {
	constructor(client) {
		super(client, {
			name: 'iamnot',
			group: CommandGroup.ROLES,
			memberName: 'iamnot',
			aliases: ['unassign'],
			description: 'Unassign roles from yourself.',
			details: '?????',
			examples: ['\t!iamnot Mystic', '\t!unassign Valor'],
			guildOnly: true
		});

		client.dispatcher.addInhibitor(message => {
			if (message.channel.type === 'dm') {
				return false;
			}

			// command "!iamnot" - warning of incorrect channel, suggest command & channel
			if (message.content.search(/^[.!]\s?i\s?a[mn]\s?not\s?.*?$/gi) >= 0 && !Helper.isBotChannel(message)) {
				return ['invalid-channel', message.reply(Helper.getText('iamnot.warning', message))];
			}

			// command "!iamnot" - correct channel, incorrect command, suggest command
			if (message.content.search(/^[.!]\s?i\s?a[mn]\s?not\s?.*?$/gi) >= 0 && Helper.isBotChannel(message)) {
				return ['invalid-channel', message.reply(Helper.getText('iamnot.suggestion', message))];
			}

			return false;
		});
	}

	run(message, args) {
		Role.removeRole(message.channel, message.member, args)
			.then(() => message.react(Helper.getEmoji('snorlaxthumbsup') || '👍'))
			.catch(err => {
				if (err && err.error) {
					message.reply(err.error)
						.catch(err => log.error(err));
				} else {
					log.error(err);
				}
			});
	}
}

module.exports = IAmNotCommand;
