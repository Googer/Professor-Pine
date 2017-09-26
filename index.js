"use strict";

const log = require('loglevel');
require('loglevel-prefix-persist/server')(process.env.NODE_ENV, log, {
	level: {
		production: 'debug',
		development: 'debug'
	},
	persist: 'debug',
	max: 5
});

log.setLevel('debug');

const discord_settings = require('./data/discord'),
	Commando = require('discord.js-commando'),
	Client = new Commando.Client({
		owner: discord_settings.owner,
		restWsBridgeTimeout: 10000,
		restTimeOffset: 1000
	}),
	// DB = require('./app/db.js'),
	NodeCleanup = require('node-cleanup'),
	Helper = require('./app/helper'),
	Raid = require('./app/raid');

NodeCleanup((exitCode, signal) => {
	Raid.shutdown();
});

// Disable commands other than help on DM channels
Client.dispatcher.addInhibitor(message =>
	message.message.channel.type === 'dm' &&
	!message.message.content.trim().match(/^help/i));

Client.registry.registerGroup('admin', 'Administration');
Client.registry.registerGroup('basic-raid', 'Raid Basics');
Client.registry.registerGroup('raid-crud', 'Raid Creation and Maintenance');
Client.registry.registerGroup('roles', 'Roles');
Client.registry.registerDefaults();
Client.registry.registerTypesIn(__dirname + '/types');

Client.registry.registerCommands([
	// require('./commands/admin/asar'),
	// require('./commands/admin/rsar'),
	// require('./commands/admin/lsar'),

	require('./commands/raids/join'),
	require('./commands/raids/interested'),
	require('./commands/raids/check-in'),
	require('./commands/raids/done'),

	require('./commands/raids/check-out'),
	require('./commands/raids/leave'),

	require('./commands/raids/start-time'),
	require('./commands/raids/status'),

	require('./commands/raids/create'),

	require('./commands/raids/hatch-time'),
	require('./commands/raids/time-left'),
	require('./commands/raids/set-pokemon'),
	require('./commands/raids/set-location'),

	// require('./commands/roles/iam'),
	// require('./commands/roles/iamnot')
]);

Client.on('ready', () => {
	log.info('Client logged in');
	// DB.initialize(Client.guilds);
	Helper.setClient(Client);
	Raid.setClient(Client);
});

Client.on('error', err => log.error(err));
Client.on('warn', err => log.warn(err));
Client.on('debug', err => log.debug(err));

Client.on('disconnect', event => {
	log.error(`Client disconnected, code ${event.code}, reason '${event.reason}'...`);

	Client.destroy()
		.then(() => Client.login(discord_settings.discord_bot_token));
});

Client.on('reconnecting', () => log.info('Client reconnecting...'));

Client.on('guildUnavailable', guild => {
	log.warn(`Guild ${guild.id} unavailable!`);
});

Client.on('message', message => {
	if (message.type === 'PINS_ADD' && message.client.user.bot) {
		message.delete()
			.catch(err => log.error(err));
	}
});

Client.login(discord_settings.discord_bot_token);
