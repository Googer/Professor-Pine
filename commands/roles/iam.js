"use strict";

const Commando = require('discord.js-commando');
const Role = require('../../app/role');

class IAmCommand extends Commando.Command {
	constructor(client) {
		super(client, {
			name: 'iam',
			group: 'roles',
			memberName: 'iam',
			aliases: ['assign'],
			description: 'Assign available roles to yourself.',
			details: '?????',
			examples: ['\t!iam Mystic', '\t!role Valor', '\t!assign Instinct']
		});
	}

	run(message, args) {
		if (message.channel.type !== 'text') {
			message.reply('Please use `!iam` from a public channel.');
			return;
		}

		Role.assignRole(message.channel, message.member, args).then(() => {
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

module.exports = IAmCommand;
