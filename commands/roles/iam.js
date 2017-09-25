"use strict";

const Commando = require('discord.js-commando'),
	Helper = require('../../app/helper'),
	Role = require('../../app/role');

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
			guildOnly: true
		});

		client.dispatcher.addInhibitor(message => {
			// command "!iam" - warning of incorrect channel, suggest command & channel
			if (message.content.search(/^([!])i\s?a([mn])\s?(?!not).*?|^([!])?ia([mn])([!])?\s?(?!not).*?$/gi) >= 0 && !Role.isBotChannel(message)) {
				return ['invalid-channel', message.reply(Helper.getText('iam.warning', message))];
			}

			// command "!iam" - correct channel, incorrect command, suggest command
			if (message.content.search(/^([!])i\s?an\s?.*?|^([!])?ian([!])?\s?.*?$|^ia([nm])$/gi) >= 0 && Role.isBotChannel(message)) {
				return ['invalid-channel', message.reply(Helper.getText('iam.suggestion', message))];
			}

			return false;
		});

		client.on('messageReactionAdd', (message, user) => {
			if (user.bot) { return; }

			const pages = message.message.embeds[0].footer.text.match(/[0-9]+/g);
			let current = pages[0];
			const last = pages[1];

			if (message.emoji.name == '⬅') {
				if (current > 1) {
					current--;
					console.log('previous');
					this.updatePage(message.message, current);
				}
			} else if (message.emoji.name == '➡') {
				if (current < last) {
					current++;
					console.log('next');
					this.updatePage(message.message, current);
				}
			}
		});

		client.on('messageReactionRemove', (message, user) => {
			if (user.bot) { return; }

			const pages = message.message.embeds[0].footer.text.match(/[0-9]+/g);
			let current = pages[0];
			const last = pages[1];

			if (message.emoji.name == '➡') {
				if (current > 1) {
					current--;
					console.log('previous');
					this.updatePage(message.message, current);
				}
			} else if (message.emoji.name == '⬅') {
				if (current < last) {
					current++;
					console.log('next');
					this.updatePage(message.message, current);
				}
			}
		});
	}

	updatePage(message, current) {
		Role.getRoles(message.channel, message.member).then(roles => {
			const count = roles.length;
			const start = (current - 1) * 5;
			const end = start + 5;

			let string = '';
			for (let i=start; i<end; i++) {
				string += `**${roles[i].value}**\n${(roles[i].description) ? roles[i].description + '\n\n': ''}`;
			}

			message.edit('Type `!iam <name>` to add one of the following roles to your account.', {
				embed: {
					title: `There are ${count} self assignable roles`,
					description: `${string}`,
					color: 4437377,
					footer: {
						text: `Page ${current} of ${Math.floor(count / 5)}`
					}
				}
			});
		}).catch((err) => {
			console.log(err);
		});
	}

	run(message, args) {
		if (!args.length) {
			// if no arguments were given, send the user a list of roles w/ optional descriptions
			Role.getRoles(message.channel, message.member).then((roles) => {
				const count = roles.length;

				let string = '';
				for (let i=0; i<5; i++) {
					string += `**${roles[i].value}**\n${(roles[i].description) ? roles[i].description + '\n\n': ''}`;
				}

				message.channel.send('Type `!iam <name>` to add one of the following roles to your account.', {
					embed: {
						title: `There are ${count} self assignable roles`,
						description: `${string}`,
						color: 4437377,
						footer: {
							text: `Page 1 of ${Math.floor(count / 5)}`
						}
					}
				}).then((bot_message) => {
					// small delay needed to ensure right arrow shows up after left arrow
					setTimeout(() => {
						bot_message.react('➡');
					}, 500);

					bot_message.react('⬅');
				});
			}).catch((err) => {
				if (err && err.error) {
					message.reply(err.error);
				} else {
					console.log(err);
				}
			});
		} else {
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
}

module.exports = IAmCommand;
