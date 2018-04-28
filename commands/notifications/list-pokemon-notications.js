"use strict";

const log = require('loglevel').getLogger('PokemonNotificationsCommand'),
	Commando = require('discord.js-commando'),
	{CommandGroup} = require('../../app/constants'),
	{MessageEmbed} = require('discord.js'),
	Helper = require('../../app/helper'),
	Notify = require('../../app/notify'),
	Pokemon = require('../../app/pokemon');

class PokemonNotificationsCommand extends Commando.Command {
	constructor(client) {
		super(client, {
			name: 'wants',
			group: CommandGroup.NOTIFICATIONS,
			memberName: 'wants',
			aliases: ['notifications', 'list-notifications', 'show-notifications', 'list-wants', 'show-wants'],
			description: 'Shows currently active notifications for raid bosses.',
			details: 'Use this command to get your currently active raid boss notifications.',
			examples: ['\t!wants'],
			guildOnly: true
		});

		client.dispatcher.addInhibitor(message => {
			if (!!message.command && message.command.name === 'wants' && !Helper.isBotChannel(message)) {
				return ['invalid-channel', message.reply(Helper.getText('notifications.warning', message))];
			}
			return false;
		});
	}

	async run(message, args) {
		return Notify.getPokemonNotifications(message.member)
			.then(async results => {
				const embed = new MessageEmbed(),
					pokemon_data = Pokemon.pokemon;

				embed.setTitle('Currently assigned pokémon notifications:');
				embed.setColor(4437377);

				const pokemon_list = results
					.map(number => pokemon_data.find(pokemon => (pokemon.number === number) ||
						(pokemon.tier === -number)))
					.map(pokemon => pokemon.name ?
						pokemon.name.charAt(0).toUpperCase() + pokemon.name.slice(1) :
						`Level ${pokemon.tier}`)
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

module.exports = PokemonNotificationsCommand;
