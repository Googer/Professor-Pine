"use strict";

const log = require('loglevel').getLogger('AsarCommand'),
	Commando = require('discord.js-commando'),
	Helper = require('../../app/helper'),
	Role = require('../../app/role');

class AsarCommand extends Commando.Command {
	constructor(client) {
		super(client, {
			name: 'asar',
			group: 'admin',
			memberName: 'asar',
			description: 'Add new self assignable role.',
			guildOnly: true
		});

		client.dispatcher.addInhibitor(message => {
			if (!!message.command && message.command.name === 'asar') {
				if (!Helper.isManagement(message)) {
					return ['unauthorized', message.reply('You are not authorized to use this command.')];
				}

				if (message.channel.type !== 'text') {
					return ['invalid-channel', message.reply('Please use `!asar` from a public channel.')];
				}
			}

			return false;
		});
	}

	run(message, args) {
		// split text by comma "," into an array, and split those strings by "-" for an array of arrays
		//		NOTE:  Spaces are required for "-" separation as roles could be "foo-bar"
		args = args.split(/,\s?/g).map(arg => arg.trim().split(/\s-\s/));

		Role.upsertRoles(message.channel, message.member, args)
			.then(() => message.react('👍'))
			.catch((err) => {
				if (err && err.error) {
					message.reply(err.error)
						.catch(err => log.error(err));
				} else {
					log.error(err);
				}
			});
	}
}

module.exports = AsarCommand;
