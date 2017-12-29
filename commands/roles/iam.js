"use strict";

const log = require('loglevel').getLogger('IAmCommand'),
	Commando = require('discord.js-commando'),
	{CommandGroup} = require('../../app/constants'),
	{MessageEmbed} = require('discord.js'),
	settings = require('../../data/settings'),
	Helper = require('../../app/helper'),
	Role = require('../../app/role');

class IAmCommand extends Commando.Command {
	constructor(client) {
		super(client, {
			name: 'iam',
			group: CommandGroup.ROLES,
			memberName: 'iam',
			aliases: ['assign'],
			description: 'Assign available roles to yourself.',
			details: '?????',
			examples: ['\t!iam Mystic', '\t!role Valor', '\t!assign Instinct'],
			guildOnly: true
		});

		// store a list of message id's spawned from this command, and the page they're on
		this.messages = new Map();

		// Map from guild id to number of self-assignable roles for it
		this.role_counts = new Map();

		client.dispatcher.addInhibitor(message => {
			if (!!message.command && message.command.name === 'iam' &&
				!Helper.isBotChannel(message)) {
				return ['invalid-channel', message.reply(Helper.getText('iam.warning', message))];
			}
			return false;
		});

		client.on('messageReactionAdd', (reaction, user) => {
			this.navigatePage(reaction, user);
		});

		// clean up messages after 10 minutes of inactivity
		this.update = setInterval(() => {
			const then = Date.now() - 600000;

			this.messages.forEach((value, key, map) => {
				if (then > value.time) {
					value.message.delete()
						.catch(err => log.error(err));
					map.delete(key);
				}
			});
		}, settings.cleanup_interval);
	}

	navigatePage(reaction, user) {
		if (user.bot || !this.messages.has(reaction.message.id)) {
			return;
		}

		let current = this.messages.get(reaction.message.id).current;

		// if no page exists for message, then assume not the right message (as this is a global listener);
		if (isNaN(current)) {
			return;
		}

		if (reaction.emoji.name === '⬅') {
			if (current > 0) {
				current--;
				this.updatePage(reaction.message, current);
			}
		} else if (reaction.emoji.name === '➡') {
			if (current < Math.ceil(this.role_counts.get(reaction.message.guild.id) / 5) - 1) {
				current++;
				this.updatePage(reaction.message, current);
			}
		}

		// remove reaction so that pagination makes a BIT more sense...
		reaction.remove(user);
	}

	updatePage(message, current) {
		Role.getRoles(message.guild)
			.then(rows => {
				const roles = new Map();

				rows.forEach(row => {
					let role;

					if (!roles.has(row.roleId)) {
						role = Object.assign({}, {
							role_name: row.roleName,
							role_description: row.roleDescription,
							aliases: []
						});
						roles.set(row.roleId, role);
					} else {
						role = roles.get(row.roleId);
					}

					if (row.aliasName) {
						role.aliases.push(row.aliasName);
					}
				});

				const roles_array = Array.from(roles.values())
						.sort((a, b) => a.role_name.localeCompare(b.role_name)),
					count = roles_array.length,
					start = current * 5,
					end = start + 5;

				// making sure no one can go beyond the limits
				if (start > count - 1 || start < 0) {
					return;
				}

				let string = '';
				for (let i = start; i < end; i++) {
					if (!roles_array[i]) {
						break;
					}

					string += `**${roles_array[i].role_name}**\n${(roles_array[i].role_description) ? roles_array[i].role_description + '\n\n' : ''}`;
				}

				const embed = new MessageEmbed();
				embed.setTitle(`There ${roles.size === 1 ? 'is' : 'are'} ${roles.size} self-assignable ${roles.size === 1 ? 'role' : 'roles'}:`);
				embed.setDescription(string);
				embed.setColor('GREEN');
				embed.setFooter(`Page ${current + 1} of ${Math.ceil(count / 5)}`);

				message.edit('Type `!iam <name>` to add one of the following roles to your account.',
					{embed})
					.then(bot_message => {
						this.messages.set(bot_message.id, {time: Date.now(), current, message: bot_message});
					});
			})
			.catch(err => log.error(err));
	}

	async run(message, args) {
		if (!args.length) {
			// if no arguments were given, send the user a list of roles w/ optional descriptions
			Role.getRoles(message.guild)
				.then(rows => {
					const roles = new Map();

					rows.forEach(row => {
						let role;

						if (!roles.has(row.roleId)) {
							role = Object.assign({}, {
								role_name: row.roleName,
								role_description: row.roleDescription,
								aliases: []
							});
							roles.set(row.roleId, role);
						} else {
							role = roles.get(row.roleId);
						}

						if (row.aliasName) {
							role.aliases.push(row.aliasName);
						}
					});

					const roles_array = Array.from(roles.values())
							.sort((a, b) => a.role_name.localeCompare(b.role_name)),
						count = roles_array.length;

					this.role_counts.set(message.guild.id, count);

					let string = '';
					for (let i = 0; i < Math.min(count, 5); i++) {
						string += `**${roles_array[i].role_name}**\n${(roles_array[i].role_description) ? roles_array[i].role_description + '\n\n' : ''}`;
					}

					const embed = new MessageEmbed();
					embed.setTitle(`There ${roles.size === 1 ? 'is' : 'are'} ${roles.size} self-assignable ${roles.size === 1 ? 'role' : 'roles'}:`);
					embed.setDescription(string);
					embed.setColor('GREEN');
					embed.setFooter(`Page 1 of ${Math.ceil(count / 5)}`);

					message.channel.send(`Type \`${message.client.commandPrefix}iam <name>\` to add one of the following roles to your account.`,
						{embed})
						.then(bot_message => {
							this.messages.set(bot_message.id, {time: Date.now(), current: 0, message: bot_message});

							bot_message.react('⬅')
								.then(reaction => bot_message.react('➡'))
								.catch(err => log.error(err));
						});
				})
				.catch(err => {
					if (err && err.error) {
						message.reply(err.error)
							.catch(err => log.error(err));
					} else {
						log.error(err);
					}
				});
		} else {
			Role.assignRole(message.channel, message.member, args)
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
}

module.exports = IAmCommand;
