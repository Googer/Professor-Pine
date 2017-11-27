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

const private_settings = require('./data/private-settings'),
	Commando = require('discord.js-commando'),
	Client = new Commando.Client({
		owner: private_settings.owner,
		restWsBridgeTimeout: 10000,
		restTimeOffset: 1000
	}),
	DB = require('./app/db.js'),
	NodeCleanup = require('node-cleanup'),
	Helper = require('./app/helper'),
	IP = require('./app/process-image'),
	Raid = require('./app/raid'),
	Utility = require('./app/utility'),
	settings = require('./data/settings');

NodeCleanup((exitCode, signal) => {
	Raid.shutdown();
});

if (settings.features.roles) {
	Client.registry.registerGroup('admin', 'Administration');
}

Client.registry.registerGroup('basic-raid', 'Raid Basics');
Client.registry.registerGroup('raid-crud', 'Raid Creation and Maintenance');

if (settings.features.roles) {
	Client.registry.registerGroup('roles', 'Roles');
}

Client.registry.registerDefaultTypes();
Client.registry.registerDefaultGroups();

Client.registry.registerCommand(require('./commands/util/help'));

Client.registry.registerDefaultCommands({help: false});

Client.registry.registerTypesIn(__dirname + '/types');

if (settings.features.roles) {
	Client.registry.registerCommands([
		require('./commands/admin/asar'),
		require('./commands/admin/rsar'),
		require('./commands/admin/lsar'),

		require('./commands/roles/iam'),
		require('./commands/roles/iamnot')
	]);
}

Client.registry.registerCommands([
	require('./commands/raids/join'),
	require('./commands/raids/interested'),
	require('./commands/raids/check-in'),
	require('./commands/raids/done'),

	require('./commands/raids/check-out'),
	require('./commands/raids/leave'),

	require('./commands/raids/start-time'),
	require('./commands/raids/status'),
	require('./commands/raids/directions'),

	require('./commands/raids/create'),
	require('./commands/raids/delete'),

	require('./commands/raids/hatch-time'),
	require('./commands/raids/time-left'),
	require('./commands/raids/set-pokemon'),
	require('./commands/raids/set-location'),

	require('./commands/raids/submit-request')
]);

let is_initialized = false;

Client.on('ready', () => {
	log.info('Client logged in');

	// Only initialize various classes once ever since ready event gets fired
	// upon reconnecting after longer outages
	if (!is_initialized) {
		Helper.setClient(Client);
		Raid.setClient(Client);
		DB.initialize(Client.guilds);
		IP.initialize();

		is_initialized = true;
	}
});

Client.on('error', err => log.error(err));
Client.on('warn', err => log.warn(err));
Client.on('debug', err => log.debug(err));

Client.on('rateLimit', event =>
	log.warn(`Rate limited for ${event.timeout} ms, triggered by method '${event.method}', path '${event.path}', route '${event.route}'`));

Client.on('commandRun', (command, result, message, args, from_pattern) => {
	log.debug(`Command '${command.name}' run from message '${message.content}' by user ${message.author.id}`);
	message.is_successful = true;
});

Client.on('commandError', (command, err, message, args, from_pattern) => {
	log.error(`Command '${command.name}' error from message '${message.content}' by user ${message.author.id}`);
});

Client.on('commandFinalize', (command, message, from_pattern) => {
	Utility.cleanConversation(message, !!message.is_successful, !Raid.validRaid(message.channel.id));
});

Client.on('disconnect', event => {
	log.error(`Client disconnected, code ${event.code}, reason '${event.reason}'...`);

	Client.destroy()
		.then(() => Client.login(private_settings.discord_bot_token));
});

Client.on('reconnecting', () => log.info('Client reconnecting...'));

Client.on('guildUnavailable', guild => {
	log.warn(`Guild ${guild.id} unavailable!`);
});

Client.login(private_settings.discord_bot_token);
