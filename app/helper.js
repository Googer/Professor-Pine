"use strict";

const text = require('../data/text'),
	settings = require('../data/settings');

class Helper {
	constructor() {
		this.text = text;
		this.client = null;

		// cache of emoji ids, populated on client login
		this.emojis = Object.create(null);
	}

	setClient(client) {
		this.client = client;

		const emojis = new Map(this.client.emojis.map(emoji => [emoji.name.toLowerCase(), emoji.toString()]));

		this.emojis.mystic = emojis.get('mystic') || '';
		this.emojis.valor = emojis.get('valor') || '';
		this.emojis.instinct = emojis.get('instinct') || '';
		this.emojis.pokeball = emojis.get('pokeball') || '';
		this.emojis.greatball = emojis.get('greatball') || '';
		this.emojis.ultraball = emojis.get('ultraball') || '';
		this.emojis.masterball = emojis.get('masterball') || '';
		this.emojis.premierball = emojis.get('premierball') || '';

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
						help: null,
					},
					roles: {
						mystic: roles.get('mystic'),
						valor: roles.get('valor'),
						instinct: roles.get('instinct'),
						admin: roles.get('administrator') || roles.get('admin'),
						moderator: roles.get('moderator') || roles.get('mod'),
					},
					emojis: {
					}
				}
			]
		}));

		// listen for messages to "help" with
		this.client.on('message', message => {
			if (!message.guild) {
				return;
			}

			const guild = this.guild.get(message.guild.id);

			// command "!iam" - warning of incorrect channel, suggest command & channel
			if (message.content.search(/^([.!])i\s?a([mn])\s?.*?|^([.!])?ia([mn])([.!])?\s?.*?$/gi) >= 0 && message.channel.id !== guild.channels.bot_lab.id) {
				message.reply(this.getText('iam.warning', message));
			}

			// command "!iam" - correct channel, incorrect command, suggest command
			if (message.content.search(/^([.!])i\s?an\s?.*?|^([.!])?ian([.!])?\s?.*?$|^ia([nm])$/gi) >= 0 && message.channel.id === guild.channels.bot_lab.id) {
				message.reply(this.getText('iam.suggestion', message));
			}
		});
	}

	isManagement(message) {
		return !!(this.client.isOwner(message.member) ||
			message.member.roles.get(this.guild.get(message.guild.id).roles.admin.id) ||
			message.member.roles.get(this.guild.get(message.guild.id).roles.moderator.id));
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
