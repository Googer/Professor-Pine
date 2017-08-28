"use strict";

const DBManager = require('./app/db.js');
const Commando = require('discord.js-commando');
const Client = new Commando.Client({
	owners: [ '188406143796772864', '277303642992934914' ]
});

const discord_settings = require('./data/discord');

Client.registry.registerGroup('admin', 'Administration');
Client.registry.registerGroup('raids', 'Raids');
Client.registry.registerGroup('roles', 'Roles');
Client.registry.registerDefaults();
Client.registry.registerCommandsIn(__dirname + '/commands');

Client.on('ready', () => {
	DBManager.initialize(Client.guilds);
	console.log('BOT IS ONLINE!');
});

Client.on('message', (message) => {
	if (message.content === 'ping') {
	}
});

Client.login(discord_settings.discord_client_id);
