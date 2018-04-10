"use strict";

const log = require('loglevel').getLogger('NotifyCommand'),
	Commando = require('discord.js-commando'),
	{CommandGroup} = require('../../app/constants'),
	Helper = require('../../app/helper'),
	Notify = require('../../app/notify'),
	settings = require('../../data/settings');

class NotifyCommand extends Commando.Command {
	constructor(client) {
		super(client, {
			name: 'want',
			group: CommandGroup.NOTIFICATIONS,
			memberName: 'want',
			aliases: ['i-want', 'notify'],
			description: 'Adds notifications for a raid boss.',
			details: 'Use this command to request notifications for a specific raid boss.',
			examples: ['\t!want ttar'],
			args: [
				{
					key: 'pokemon',
					prompt: 'What pokémon do you wish to be notified for?\nExample: `lugia`\n',
					type: 'pokemon'
				}
			],
			argsPromptLimit: 3,
			guildOnly: true
		});

		client.dispatcher.addInhibitor(message => {
			if (!!message.command && message.command.name === 'want' && !Helper.isBotChannel(message)) {
				return ['invalid-channel', message.reply(Helper.getText('notify.warning', message))];
			}
			return false;
		});
	}

	async run(message, args) {
		const pokemon = args['pokemon'];

		Notify.assignPokemonNotification(message.member, pokemon)
			.then(result => message.react(Helper.getEmoji(settings.emoji.thumbs_up) || '👍'))
			.catch(err => log.error(err));
	}
}

module.exports = NotifyCommand;
