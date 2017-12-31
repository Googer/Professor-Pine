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
	Discord = require('discord.js'),
	Client = new Commando.Client({
		owner: private_settings.owner,
		restWsBridgeTimeout: 10000,
		restTimeOffset: 1000
	}),
	NotifyClient = new Discord.Client({
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
	settings = require('./data/settings'),
	{CommandGroup} = require('./app/constants');

NodeCleanup((exitCode, signal) => {
	Raid.shutdown();
});

Client.registry.registerDefaultTypes();
Client.registry.registerTypesIn(__dirname + '/types');

if (settings.features.roles) {
	Client.registry.registerGroup(CommandGroup.ADMIN, 'Administration');
}

Client.registry.registerGroup(CommandGroup.BASIC_RAID, 'Raid Basics');
Client.registry.registerGroup(CommandGroup.RAID_CRUD, 'Raid Creation and Maintenance');

if (settings.features.roles) {
	Client.registry.registerGroup(CommandGroup.ROLES, 'Roles');
}

Client.registry.registerGroup(CommandGroup.NOTIFICATIONS, 'Notifications');
Client.registry.registerGroup(CommandGroup.UTIL, 'Utility');

if (settings.features.roles) {
	Client.registry.registerCommands([
		require('./commands/admin/asar'),
		require('./commands/admin/rsar'),
		require('./commands/admin/lsar'),

		require('./commands/roles/iam'),
		require('./commands/roles/iamnot'),
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

	require('./commands/raids/submit-request'),

	require('./commands/notifications/notify'),
	require('./commands/notifications/denotify'),
	require('./commands/notifications/list-notications'),
	require('./commands/notifications/denotify-all'),

	require('./commands/util/help')
]);

if (private_settings.google_api_key !== '') {
	Client.registry.registerCommand(
		require('./commands/util/find-region'));
}

let is_initialized = false;

Client.on('ready', () => {
	log.info('Client logged in');

	// Only initialize various classes once ever since ready event gets fired
	// upon reconnecting after longer outages
	if (!is_initialized) {
		Helper.setClient(Client);
		Raid.setClient(Client);
		DB.initialize(Client);
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
	Utility.cleanConversation(message, !!message.is_successful, !Raid.validRaid(message.channel.id) && !Helper.isBotChannel(message));
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

//

NotifyClient.on('ready', () => {
	log.info('Notify client logged in');

	Helper.setNotifyClient(NotifyClient);
});

NotifyClient.on('error', err => log.error(err));
NotifyClient.on('warn', err => log.warn(err));
NotifyClient.on('debug', err => log.debug(err));

NotifyClient.on('rateLimit', event =>
	log.warn(`Rate limited for ${event.timeout} ms, triggered by method '${event.method}', path '${event.path}', route '${event.route}'`));


NotifyClient.login(private_settings.discord_notify_token);
