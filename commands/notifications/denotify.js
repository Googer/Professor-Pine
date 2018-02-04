"use strict";

const log = require('loglevel').getLogger('DenotifyCommand'),
	Commando = require('discord.js-commando'),
	{CommandGroup} = require('../../app/constants'),
	Helper = require('../../app/helper'),
	Notify = require('../../app/notify');

class DenotifyCommand extends Commando.Command {
	constructor(client) {
		super(client, {
			name: 'unwant',
			group: CommandGroup.NOTIFICATIONS,
			memberName: 'unwant',
			aliases: ['i-dont-want', 'dont-want', 'denotify', 'dewant'],
			description: 'Removes notifications for a raid boss.',
			details: 'Use this command to remove notifications for a specific raid boss.',
			examples: ['\t!unwant ttar'],
			args: [
				{
					key: 'pokemon',
					prompt: 'What pokémon do you wish to be no longer be notified for?\nExample: `lugia`\n',
					type: 'pokemon'
				}
			],
			argsPromptLimit: 3,
			guildOnly: true
		});

		client.dispatcher.addInhibitor(message => {
			if (!!message.command && message.command.name === 'unwant' && !Helper.isBotChannel(message)) {
				return ['invalid-channel', message.reply(Helper.getText('denotify.warning', message))];
			}
			return false;
		});
	}

	async run(message, args) {
		const pokemon = args['pokemon'];

		Notify.removePokemonNotification(message.member, pokemon)
			.then(result => message.react(Helper.getEmoji('snorlaxthumbsup') || '👍'))
			.catch(err => log.error(err));
	}
}

module.exports = DenotifyCommand;
