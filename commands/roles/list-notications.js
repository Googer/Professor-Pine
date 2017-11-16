"use strict";

const log = require('loglevel').getLogger('NotificationsCommand'),
	Commando = require('discord.js-commando'),
	{CommandGroup} = require('../../app/constants'),
	{MessageEmbed} = require('discord.js'),
	pokemon_data = require('../../data/pokemon'),
	Helper = require('../../app/helper'),
	Notify = require('../../app/notify');

class NotificationsCommand extends Commando.Command {
	constructor(client) {
		super(client, {
			name: 'notifications',
			group: CommandGroup.ROLES,
			memberName: 'notifications',
			aliases: ['list-notifications', 'show-notifications', 'list-wants', 'show-wants', 'wants'],
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
		return Notify.getNotifications(message.member)
			.then(async results => {
				const embed = new MessageEmbed();
				embed.setTitle('Currently assigned pokémon notifications:');
				embed.setColor(4437377);

				const pokemon_list = results
					.map(number => pokemon_data.find(pokemon => pokemon.number === number))
					.map(pokemon => pokemon.name.charAt(0).toUpperCase() + pokemon.name.slice(1))
					.sort()
					.join('\n');

				if (pokemon_list.length > 0) {
					embed.setDescription(pokemon_list);
				} else {
					embed.setDescription('<None>');
				}

				const messages = [];
				try {
					messages.push(await message.direct({embed}));
					messages.push(await message.reply('Sent you a DM with current raid boss notifications.'));
				} catch (err) {
					messages.push(await message.reply('Unable to send you the notifications list DM. You probably have DMs disabled.'));
				}
				return messages;
			})
			.catch(err => log.error(err));
	}
}

module.exports = NotificationsCommand;
