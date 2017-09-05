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
		// split text by comma "," into an array, and split those strings by "-" for an array of arrays
		//		NOTE:  Spaces are required for "-" seperation as roles could be "foo-bar"
		args = args.split(/,\s?/g).map(arg => arg.trim().split(/\s-\s/));

		if (message.channel.type !== 'text') {
			message.reply('Please use `asar` from a public channel.');
			return;
		}

		Role.upsertRoles(message.channel, message.member, args).then(() => {
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
