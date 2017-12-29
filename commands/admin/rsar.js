"use strict";

const log = require('loglevel').getLogger('RsarCommand'),
	Commando = require('discord.js-commando'),
	{CommandGroup} = require('../../app/constants'),
	Helper = require('../../app/helper'),
	Role = require('../../app/role');

class RsarCommand extends Commando.Command {
	constructor(client) {
		super(client, {
			name: 'rsar',
			group: CommandGroup.ADMIN,
			memberName: 'rsar',
			description: 'Remove self-assignable role.',
			guildOnly: true
		});

		client.dispatcher.addInhibitor(message => {
			if (!!message.command && message.command.name === 'rsar') {
				if (!Helper.isManagement(message)) {
					return ['unauthorized', message.reply('You are not authorized to use this command.')];
				}
			}

			return false;
		});
	}

	async run(message, args) {
		args = args.split(/,\s?/g);

		Role.removeOldRoles(message.guild, args)
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

module.exports = RsarCommand;
