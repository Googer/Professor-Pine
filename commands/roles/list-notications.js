"use strict";

const log = require('loglevel').getLogger('NotificationsCommand'),
	Commando = require('discord.js-commando'),
	{MessageEmbed} = require('discord.js'),
	Helper = require('../../app/helper'),
	Notify = require('../../app/notify'),
	Utility = require('../../app/utility');

class NotificationsCommand extends Commando.Command {
	constructor(client) {
		super(client, {
			name: 'notifications',
			group: 'roles',
			memberName: 'notifications',
			aliases: ['list-notifications', 'show-notifications'],
			description: 'Show currently active notifications for raid bosses.',
			details: 'Use this command to get your currently active raid boss notifications.',
			examples: ['\t!notifications'],
			guildOnly: true
		});

		client.dispatcher.addInhibitor(message => {
			if (!!message.command && message.command.name === 'notifications' && !Helper.isBotChannel(message)) {
				return ['invalid-channel', message.reply(Helper.getText('notifications.warning', message))];
			}
			return false;
		});
	}

	async run(message, args) {
		Notify.getNotifications(message.member)
			.then(async results => {
				const embed = new MessageEmbed();
				embed.setTitle('Currently assigned pokémon notifications:');
				embed.setColor(4437377);

				const pokemon_list = results
					.sort()
					.map(pokemon => pokemon.charAt(0).toUpperCase() + pokemon.slice(1))
					.join('\n');

				if (pokemon_list.length > 0) {
					embed.setDescription(pokemon_list);
				} else {
					embed.setDescription('<None>');
				}

				try {
					return message.direct({embed})
						.then(direct_message => message.reply('Sent you a DM with current raid boss notifications.'))
				} catch (err) {
					await message.reply('Unable to send you the notifications list DM. You probably have DMs disabled.')
						.catch(err => log.error(err));
				}
			})
			.catch(err => log.error(err));

		Utility.cleanConversation(message);
	}
}

module.exports = NotificationsCommand;
