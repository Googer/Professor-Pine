"use strict";

const log = require('loglevel').getLogger('NotifyCommand'),
	Commando = require('discord.js-commando'),
	{CommandGroup} = require('../../app/constants'),
	Helper = require('../../app/helper'),
	Notify = require('../../app/notify'),
	Utility = require('../../app/utility');

class NotifyCommand extends Commando.Command {
	constructor(client) {
		super(client, {
			name: 'notify',
			group: CommandGroup.ROLES,
			memberName: 'notify',
			aliases: [],
			description: 'Adds notifications for a raid boss.',
			details: 'Use this command to request notifications for a specific raid boss.',
			examples: ['\t!notify lugia'],
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
			if (!!message.command && message.command.name === 'notify' && !Helper.isBotChannel(message)) {
				return ['invalid-channel', message.reply(Helper.getText('notify.warning', message))];
			}
			return false;
		});
	}

	async run(message, args) {
		const pokemon = args['pokemon'];

		Notify.assignNotification(message.member, pokemon)
			.then(result => message.react(Helper.getEmoji('snorlaxthumbsup') || '👍'))
			.catch(err => log.error(err));

		Utility.cleanConversation(message);
	}
}

module.exports = NotifyCommand;
