"use strict";

const text = require('../data/text'),
	settings = require('../data/settings');

class Helper {
	constructor() {
		this.text = text;
		this.client = null;
	}

	setClient(client) {
		this.client = client;

		// map out some shortcuts to channels, based on connected guilds, so that a lengthy "find" is not required every time text is entered
		// TODO:  Some day instead of using a single configurable settings channel name, allow each guild to set a bot channel in DB
		this.guild_channels = new Map(this.client.guilds.map(guild => [
			guild.id,
			{
				bot_lab: guild.channels.find(channel => {
					return channel.name === settings.channels.bot_lab;
				})
			}
		]));

		// listen for messages to "help" with
		this.client.on('message', message => {
			let guild = this.guild_channels.get(message.guild.id);

			// command "!iam" - warning of incorrect channel, suggest command & channel
			if (message.content.search(/^([.!])i\s?a([mn])\s?.*?|^([.!])?ia([mn])([.!])?\s?.*?$/gi) >= 0 && message.channel.id !== guild.bot_lab.id) {
				message.reply(this.getText('iam.warning', message));
			}

			// command "!iam" - correct channel, incorrect command, suggest command
			if (message.content.search(/^([.!])i\s?an\s?.*?|^([.!])?ian([.!])?\s?.*?$|^ia([nm])$/gi) >= 0 && message.channel.id === guild.bot_lab.id) {
				message.reply(this.getText('iam.suggestion', message));
			}
		});
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
				const guild_channels = this.guild_channels.get(message.guild.id);
				text = text.replace(/\$\{bot_channel\}/g, guild_channels.bot_lab.toString());
			}
		}

		return text;
	}
}

module.exports = new Helper();
