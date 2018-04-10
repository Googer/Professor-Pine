"use strict";

const log = require('loglevel').getLogger('DenotifyAllCommand'),
	Commando = require('discord.js-commando'),
	{CommandGroup} = require('../../app/constants'),
	Helper = require('../../app/helper'),
	Notify = require('../../app/notify'),
	settings = require('../../data/settings');

class DenotifyAllCommand extends Commando.Command {
	constructor(client) {
		super(client, {
			name: 'unwant-all',
			group: CommandGroup.NOTIFICATIONS,
			memberName: 'unwant-all',
			aliases: ['denotify-all', 'want-none', 'dewant-all', 'clear-wants'],
			description: 'Removes all notifications for raid bosses.\n',
			details: 'Use this command to remove all notifications for raid bosses.',
			examples: ['\t!unwant-all'],
			guildOnly: true
		});

		client.dispatcher.addInhibitor(message => {
			if (!!message.command && message.command.name === 'unwant-all' && !Helper.isBotChannel(message)) {
				return ['invalid-channel', message.reply(Helper.getText('denotifyall.warning', message))];
			}
			return false;
		});
	}

	async run(message, args) {
		Notify.removeAllPokemonNotifications(message.member)
			.then(result => message.react(Helper.getEmoji(settings.emoji.thumbs_up) || '👍'))
			.catch(err => log.error(err));
	}
}

module.exports = DenotifyAllCommand;
