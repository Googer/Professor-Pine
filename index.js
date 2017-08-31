"use strict";

const Commando = require('discord.js-commando'),
	Client = new Commando.Client(),
	Raid = require('./app/raid'),
	discord_settings = require('./data/discord'),
	nodeCleanup = require('node-cleanup');

nodeCleanup((exitCode, signal) => {
	if (signal) {
		Raid.cleanupAllRaids()
			.then(result => {
				console.log(result);

				// calling process.exit() won't inform parent process of signal
				process.kill(process.pid, signal);
			})
			.catch(err => {
				console.log(err);

				// calling process.exit() won't inform parent process of signal
				process.kill(process.pid, signal);
			});

		nodeCleanup.uninstall(); // don't call cleanup handler again
		return false;
	}
});

Client.registry.registerGroup('raids', 'Raids');
Client.registry.registerDefaults();
Client.registry.registerTypesIn(__dirname + '/types');

Client.registry.registerCommands([
	require('./commands/raids/create'),
	require('./commands/raids/end-time'),
	require('./commands/raids/join'),
	require('./commands/raids/start-time'),
	require('./commands/raids/check-in'),
	require('./commands/raids/check-out'),
	require('./commands/raids/leave'),
	require('./commands/raids/set-pokemon'),
	require('./commands/raids/set-location'),
	require('./commands/raids/status')
]);

Client.on('ready', () => {
});

Client.on('message', message => {
	if (message.content.startsWith('.iam') && message.channel.name !== 'the-bot-lab') {
		message.author.send('Use #the-bot-lab to assign roles!');
		if (message.channel.type === 'text') {
			message.delete()
				.catch(err => console.log(err));
		}
	}

	if (message.type === 'PINS_ADD' && message.client.user.bot) {
		message.delete()
			.catch(err => console.log(err));
	}
});

Client.login(discord_settings.discord_client_id);
