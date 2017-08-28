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
			examples: ['\t!iam Mystic', '\t!role Valor', '\t!assign Instinct'],
			argsType: 'multiple'
		});
	}

	run(message, args) {
		if (message.channel.type !== 'text') {
			message.reply('Please use `.iam` from a public channel.');
			return;
		}

		Role.assignRole(message.channel, message.member, args[0]);
	}
}

module.exports = IAmCommand;
