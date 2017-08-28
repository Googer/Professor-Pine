"use strict";

const Commando = require('discord.js-commando'),
	Client = new Commando.Client(),

	discord_settings = require('./data/discord');

Client.registry.registerGroup('raids', 'Raids');
Client.registry.registerDefaults();
Client.registry.registerTypesIn(__dirname + '/types');
Client.registry.registerCommandsIn(__dirname + '/commands');

Client.on('ready', () => {
});

Client.on('message', (message) => {
	if (message.content.startsWith('.iam') && message.channel.name !== 'the-bot-lab') {
		message.author.sendMessage('Use #the-bot-lab to assign roles!');
		if (message.channel.type === 'text') {
			message.delete();
		}
	}
});

Client.login(discord_settings.discord_client_id);
