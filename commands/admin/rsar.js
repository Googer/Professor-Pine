"use strict";

const Commando = require('discord.js-commando');
const Role = require('../../app/role');

class RsarCommand extends Commando.Command {
	constructor(client) {
		super(client, {
			name: 'rsar',
			group: 'admin',
			memberName: 'rsar',
			description: 'Add new self assignable role.'
		});
	}

	run(message, args) {
		args = args.split(/,\s?/g);

		if (message.channel.type !== 'text') {
			message.reply('Please use `rsar` from a public channel.');
			return;
		}

		Role.removeOldRoles(message.channel, message.member, args).then(() => {
			message.react('👍');
		}).catch((err) => {
			if (err && err.error) {
				message.reply(err.error);
			} else {
				console.log(err);
			}
		});
	}
}

module.exports = RsarCommand;
