"use strict";

const Commando = require('discord.js-commando'),
	Client = new Commando.Client({
		owners: [ '188406143796772864', '277303642992934914' ]
	}),
	DB = require('./app/db.js'),
	Raid = require('./app/raid'),
	discord_settings = require('./data/discord'),
	nodeCleanup = require('node-cleanup');

nodeCleanup((exitCode, signal) => {
	Raid.shutdown();
});

Client.registry.registerGroup('admin', 'Administration');
Client.registry.registerGroup('raids', 'Raids');
Client.registry.registerGroup('roles', 'Roles');
Client.registry.registerDefaults();
Client.registry.registerTypesIn(__dirname + '/types');

Client.registry.registerCommands([
	require('./commands/raids/create'),
	require('./commands/raids/time-left'),
	require('./commands/raids/join'),
	require('./commands/raids/start-time'),
	require('./commands/raids/check-in'),
	require('./commands/raids/check-out'),
	require('./commands/raids/leave'),
	require('./commands/raids/set-pokemon'),
	require('./commands/raids/set-location'),
	require('./commands/raids/status')
]);

const guilds = new Map([...Client.guilds]);

Client.on('ready', () => {
	const new_guilds = new Map([...Client.guilds]);

	DB.initialize(Client.guilds);

	Array.from(guilds.keys())
		.forEach(guild_id => new_guilds.delete(guild_id));

	Raid.setClient(Client, new_guilds.values().next().value);

	console.log('BOT IS ONLINE!');
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
