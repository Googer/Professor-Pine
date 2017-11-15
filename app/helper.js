"use strict";

const log = require('loglevel').getLogger('Helper'),
	text = require('../data/text'),
	{Team} = require('./constants'),
	settings = require('../data/settings');

class Helper {
	constructor() {
		this.text = text;
		this.client = null;
		this.notify_client = null;

		// cache of emoji ids, populated on client login
		this.emojis = null;
	}

	setClient(client) {
		this.client = client;

		this.emojis = new Map(this.client.emojis.map(emoji => [emoji.name.toLowerCase(), emoji]));

		// map out some shortcuts per connected guild, so that a lengthy "find" is not required constantly
		// TODO:  Some day instead of using a single configurable settings channel name, allow each guild to set a bot channel in DB
		this.guild = new Map(this.client.guilds.map(guild => {
			const roles = new Map(guild.roles.map(role => [role.name.toLowerCase(), role]));

			return [
				guild.id,
				{
					channels: {
						bot_lab: guild.channels.find(channel => {
							return channel.name === settings.channels.bot_lab;
						}),
						mod_bot_lab: guild.channels.find(channel => {
							return channel.name === settings.channels.mod_bot_lab;
						}),
						unown: guild.channels.find(channel => {
							return channel.name === settings.channels.unown;
						}),
						help: null,
					},
					roles,
					emojis: null
				}
			]
		}));

		this.client.on('message', message => {
			if (message.type === 'PINS_ADD' && message.client.user.bot) {
				message.delete()
					.catch(err => log.error(err));
			}

			if (message.channel.type !== 'dm') {
				const unown_channel = this.guild.get(message.guild.id).channels.unown;

				if (unown_channel && message.channel.id === unown_channel.id && message.mentions.has(this.getRole(message.guild, 'unown'))) {
					message.pin()
						.catch(err => log.error(err));
				}
			}
		});

		this.client.on('guildCreate', guild => {
			// cache this guild's roles
			this.guild.set(guild, [
				guild.id,
				{
					channels: {
						bot_lab: guild.channels.find(channel => {
							return channel.name === settings.channels.bot_lab;
						}),
						mod_bot_lab: guild.channels.find(channel => {
							return channel.name === settings.channels.mod_bot_lab;
						}),
						unown: guild.channels.find(channel => {
							return channel.name === settings.channels.unown;
						}),
						help: null,
					},
					roles: new Map(guild.roles.map(role => [role.name.toLowerCase(), role])),
					emojis: null
				}
			]);
		});

		this.client.on('guildDelete', guild => {
			// remove this guild from cache
			this.guild.delete(guild.id);
		});

		this.client.on('roleCreate', role => {
			// add new role to corresponding cache entry for its guild
			const guild_map = this.guild.get(role.guild.id).roles;

			if (!!guild_map) {
				guild_map.set(role.name.toLowerCase(), role);
			}
		});

		this.client.on('roleDelete', role => {
			// remove role from corresponding cache entry for its guild
			const guild_map = this.guild.get(role.guild.id).roles;

			if (!!guild_map) {
				guild_map.delete(role.name.toLowerCase());
			}
		});

		this.client.on('roleUpdate', (old_role, new_role) => {
			// remove old role from corresponding cache entry for its guild and
			// add new role to corresponding cache entry for its guild

			// these *should* be the same guild but let's not assume that!
			const old_guild_map = this.guild.get(old_role.guild.id).roles,
				new_guild_map = this.guild.get(new_role.guild.id).roles;

			if (!!old_guild_map) {
				old_guild_map.delete(old_role.name.toLowerCase());
			}

			if (!!new_guild_map) {
				new_guild_map.set(new_role.name.toLowerCase(), new_role);
			}
		});

		client.on('emojiCreate', emoji => {
			// add new emoji to emojis cache
			this.emojis.set(emoji.name.toLowerCase(), emoji);
		});

		client.on('emojiDelete', emoji => {
			// delete emoji from emojis cache
			this.emojis.delete(emoji.name.toLowerCase());
		});

		client.on('emojiUpdate', (old_emoji, new_emoji) => {
			// delete old emoji from emojis cache and add new one to it
			this.emojis.delete(old_emoji.name.toLowerCase());
			this.emojis.set(new_emoji.name.toLowerCase(), new_emoji);
		});
	}

	setNotifyClient(client) {
		this.notify_client = client;
	}

	getMemberForNotification(guild_id, member_id) {
		return this.notify_client.guilds.get(guild_id).members.get(member_id)
	}

	isManagement(message) {
		let is_mod_or_admin = false;

		if (message.channel.type !== 'dm') {
			const admin_role = this.getRole(message.guild, 'admin'),
				moderator_role = this.getRole(message.guild, 'moderator'),

				admin_role_id = admin_role ?
					admin_role.id :
					-1,
				moderator_role_id = moderator_role ?
					moderator_role.id :
					-1;

			is_mod_or_admin = message.member.roles.has(admin_role_id) ||
				message.member.roles.has(moderator_role_id);
		}
		return is_mod_or_admin || this.client.isOwner(message.author);
	}

	isBotChannel(message) {
		const guild = this.guild.get(message.guild.id),
			bot_lab_channel_id = guild.channels.bot_lab ?
				guild.channels.bot_lab.id :
				-1,
			mod_bot_lab_channel_id = guild.channels.mod_bot_lab ?
				guild.channels.mod_bot_lab.id :
				-1;

		return message.channel.id === bot_lab_channel_id || message.channel.id === mod_bot_lab_channel_id;
	}

	getRole(guild, role_name) {
		const guild_map = this.guild.get(guild.id);

		return guild_map.roles.get(role_name.toLowerCase());
	}

	getEmoji(emoji_name) {
		return this.emojis.has(emoji_name.toLowerCase()) ?
			this.emojis.get(emoji_name.toLowerCase()) :
			'';
	}

	getTeam(member) {
		const roles = this.guild.get(member.guild.id).roles;

		if (roles.has('instinct') && member.roles.has(roles.get('instinct').id)) {
			return Team.INSTINCT;
		}

		if (roles.has('mystic') && member.roles.has(roles.get('mystic').id)) {
			return Team.MYSTIC;
		}

		if (roles.has('valor') && member.roles.has(roles.get('valor').id)) {
			return Team.VALOR;
		}

		return Team.NONE;
	}

	getText(path, message) {
		let text = this.text;
		for (let key of path.split('.')) {
			text = text[key];
		}

		// replace variables in text
		return this.replaceText(text, message);
	}

	replaceText(text, message) {
		// quick search for variables to replace
		if (text.search(/\$\{.*?\}/g) >= 0) {
			// replace guild related variables (if any exist)
			if (message && message.guild && message.guild.id) {
				const guild = this.guild.get(message.guild.id);
				text = text.replace(/\$\{bot_channel\}/g, guild.channels.bot_lab.toString());
			}
		}

		return text;
	}
}

module.exports = new Helper();
