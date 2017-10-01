"use strict";

const log = require('loglevel').getLogger('RsarCommand'),
	Commando = require('discord.js-commando'),
	Helper = require('../../app/helper'),
	Role = require('../../app/role');

class RsarCommand extends Commando.Command {
	constructor(client) {
		super(client, {
			name: 'rsar',
			group: 'admin',
			memberName: 'rsar',
			description: 'Remove self assignable role.',
			guildOnly: true
		});

		client.dispatcher.addInhibitor(message => {
			if (!!message.command && message.command.name === 'rsar') {
				if (!Helper.isManagement(message)) {
					return ['unauthorized', message.reply('You are not authorized to use this command.')];
				}

				if (message.channel.type !== 'text') {
					return ['invalid-channel', message.reply('Please use `!lsar` from a public channel.')];
				}
			}

			return false;
		});
	}

	run(message, args) {
		args = args.split(/,\s?/g);

		Role.removeOldRoles(message.channel, message.member, args)
			.then(() => message.react('👍'))
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
