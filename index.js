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
	DB = require('./app/db.js'),
	NodeCleanup = require('node-cleanup'),
	Helper = require('./app/helper'),
	Raid = require('./app/raid');

NodeCleanup((exitCode, signal) => {
	Raid.shutdown();
});

Client.registry.registerGroup('admin', 'Administration');
Client.registry.registerGroup('basic-raid', 'Raid Basics');
Client.registry.registerGroup('raid-crud', 'Raid Creation and Maintenance');
Client.registry.registerGroup('roles', 'Roles');

Client.registry.registerDefaultTypes();
Client.registry.registerDefaultGroups();

Client.registry.registerCommand(require('./commands/util/help'));

Client.registry.registerDefaultCommands({help: false});

Client.registry.registerTypesIn(__dirname + '/types');

Client.registry.registerCommands([
	require('./commands/admin/asar'),
	require('./commands/admin/rsar'),
	require('./commands/admin/lsar'),

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

	require('./commands/roles/iam'),
	require('./commands/roles/iamnot'),

	require('./commands/roles/list-notications'),
	require('./commands/roles/notify'),
	require('./commands/roles/denotify')
]);

Client.on('ready', () => {
	log.info('Client logged in');
	DB.initialize(Client.guilds);
	Helper.setClient(Client);
	Raid.setClient(Client);
});

Client.on('error', err => log.error(err));
Client.on('warn', err => log.warn(err));
Client.on('debug', err => log.debug(err));

Client.on('rateLimit', event =>
	log.warn(`Rate limited for ${event.timeout} ms, triggered by method '${event.method}', path '${event.path}', route '${event.route}'`));

Client.on('commandRun', (command, result, message, args, from_pattern) => {
	log.debug(`Command '${command.name}' run from message '${message.content}' by user ${message.author.id}`);
});

Client.on('commandError', (command, err, message, args, from_pattern) => {
	log.error(`Command '${command.name}' error from message '${message.content}' by user ${message.author.id}`);
});

Client.on('disconnect', event => {
	log.error(`Client disconnected, code ${event.code}, reason '${event.reason}'...`);

	Client.destroy()
		.then(() => Client.login(discord_settings.discord_bot_token));
});

Client.on('reconnecting', () => log.info('Client reconnecting...'));

Client.on('guildUnavailable', guild => {
	log.warn(`Guild ${guild.id} unavailable!`);
});

Client.login(discord_settings.discord_bot_token);
