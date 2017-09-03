"use strict";

const Commando = require('discord.js-commando');
const Role = require('../../app/role');

class AsarCommand extends Commando.Command {
	constructor(client) {
		super(client, {
			name: 'asar',
			group: 'admin',
			memberName: 'asar',
			description: 'Add new self assignable role.'
		});
	}

	run(message, args) {
		args = args.split(/,\s?/g);

		if (message.channel.type !== 'text') {
			message.reply('Please use `asar` from a public channel.');
			return;
		}

		Role.addNewRoles(message.channel, message.member, args).then(() => {
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

module.exports = AsarCommand;
