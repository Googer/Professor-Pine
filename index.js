"use strict";

const Commando = require('discord.js-commando');
const Client = new Commando.Client();

const discord_settings = require('./data/discord');

Client.registry.registerGroup('raids', 'Raids');
Client.registry.registerDefaults();
Client.registry.registerCommandsIn(__dirname + '/commands');

Client.on('ready', () => {
});

Client.on('message', (message) => {
	if (message.content === 'ping') {
		message.channel.send('pong');
	}
});

Client.login(discord_settings.discord_client_id);
