"use strict";

const Commando = require('discord.js-commando');
const Role = require('../../app/role');

class LsarCommand extends Commando.Command {
	constructor(client) {
		super(client, {
			name: 'lsar',
			group: 'admin',
			memberName: 'lsar',
			description: 'List self assignable roles.',
			argsType: 'multiple'
		});
	}

	run(message, args) {
		if (message.channel.type !== 'text') {
			message.reply('Please use `lsar` from a public channel.');
			return;
		}

		Role.getRoles(message.channel, message.member).then((roles) => {
			const count = roles.length;

			roles.sort((a, b) => {
				if (a.value < b.value) { return -1; }
				if (a.value > b.value) { return 1; }
				return 0;
			});

			let string = '';
			for (let i=0; i<roles.length; i++) {
				string += roles[i].value + '\n';
			}

			message.channel.send({
				'embed': {
					'title': `There are ${count} self assignable roles`,
					'description':
						`${string}`,
					'color': 4437377
				}
			});
		}).catch((err) => {
			if (err && err.error) {
				message.reply(err.error);
			} else {
				console.log(err);
			}
		});
	}
}

module.exports = LsarCommand;
