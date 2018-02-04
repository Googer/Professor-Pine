"use strict";

const log = require('loglevel').getLogger('DenotifyCommand'),
	Commando = require('discord.js-commando'),
	{CommandGroup} = require('../../app/constants'),
	Helper = require('../../app/helper'),
	Notify = require('../../app/notify');

class UnfavoriteAllCommand extends Commando.Command {
	constructor(client) {
		super(client, {
			name: 'unfavorite-all',
			group: CommandGroup.NOTIFICATIONS,
			memberName: 'unfavorite-all',
			aliases: [],
			description: 'Removes all notifications for gyms.',
			details: 'Use this command to remove all notifications for gyms.',
			examples: ['\t!unfavorite-all'],
			guildOnly: true
		});

		client.dispatcher.addInhibitor(message => {
			if (!!message.command && message.command.name === 'unfavorite-all' && !Helper.isBotChannel(message)) {
				return ['invalid-channel', message.reply(Helper.getText('unfavoriteall.warning', message))];
			}
			return false;
		});
	}

	async run(message, args) {
		Notify.removeAllGymNotifications(message.member)
			.then(result => message.react(Helper.getEmoji('snorlaxthumbsup') || '👍'))
			.catch(err => log.error(err));
	}
}

module.exports = UnfavoriteAllCommand;
