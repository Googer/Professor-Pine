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

const privateSettings = require('./data/private-settings'),
  Commando = require('discord.js-commando'),
  Discord = require('discord.js'),
  Client = new Commando.Client({
    owner: privateSettings.owner,
    restWsBridgeTimeout: 10000,
    restTimeOffset: 1000
  }),
  NotifyClient = new Discord.Client({
    owner: privateSettings.owner,
    restWsBridgeTimeout: 10000,
    restTimeOffset: 1000
  }),
  DB = require('./app/db.js'),
  NodeCleanup = require('node-cleanup'),
  Helper = require('./app/helper'),
  IP = require('./app/process-image'),
  ExRaidChannel = require('./app/ex-gym-channel'),
  Notify = require('./app/notify'),
  PartyManager = require('./app/party-manager'),
  Role = require('./app/role'),
  Utility = require('./app/utility'),
  WebServer = require('./app/web/server'),
  settings = require('./data/settings'),
  {CommandGroup} = require('./app/constants');

NodeCleanup((exitCode, signal) => {
  PartyManager.shutdown();
  NotifyClient.destroy();
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

if (settings.features.notifications) {
  Client.registry.registerGroup(CommandGroup.NOTIFICATIONS, 'Notifications');
}
Client.registry.registerGroup(CommandGroup.FRIENDS, 'Friend Codes');
Client.registry.registerGroup(CommandGroup.SILPH, 'Silph Road');

Client.registry.registerGroup(CommandGroup.COMMANDS, 'Command');
Client.registry.registerGroup(CommandGroup.UTIL, 'Utility');

Client.registry.registerDefaultCommands({help: false, prefix: false, eval: false});

if (settings.features.roles) {
  Client.registry.registerCommands([
    require('./commands/admin/asar'),
    require('./commands/admin/rsar'),
    require('./commands/admin/lsar'),
    require('./commands/admin/aar'),

    require('./commands/roles/iam'),
    require('./commands/roles/iamnot'),
  ]);
}

if (settings.features.notifications) {
  Client.registry.registerCommands([
    require('./commands/notifications/notify'),
    require('./commands/notifications/denotify'),
    require('./commands/notifications/list-pokemon-notications'),
    require('./commands/notifications/denotify-all'),

    require('./commands/notifications/favorite'),
    require('./commands/notifications/unfavorite'),
    require('./commands/notifications/list-gym-notifications'),
    require('./commands/notifications/unfavorite-all')
  ]);
}

Client.registry.registerCommands([
  require('./commands/notifications/mention'),
  require('./commands/notifications/mention-groups'),
  require('./commands/notifications/mention-shouts'),

  require('./commands/raids/join'),
  require('./commands/raids/interested'),
  require('./commands/raids/check-in'),
  require('./commands/raids/done'),

  require('./commands/raids/check-out'),
  require('./commands/raids/leave'),

  require('./commands/raids/start-time'),
  require('./commands/raids/group'),
  require('./commands/raids/label-group'),
  require('./commands/raids/new-group'),

  require('./commands/raids/status'),
  require('./commands/raids/directions'),
  require('./commands/raids/shout'),

  require('./commands/raids/raid'),
  require('./commands/raids/delete'),

  require('./commands/raids/hatch-time'),
  require('./commands/raids/time-left'),
  require('./commands/raids/set-pokemon'),
  require('./commands/raids/set-location'),
  require('./commands/raids/set-moveset'),

  require('./commands/raids/auto-status'),
  require('./commands/raids/report-privacy'),

  require('./commands/raids/train'),

  require('./commands/raids/submit-request'),

  require('./commands/util/help'),
  require('./commands/admin/raid-boss'),
  require('./commands/admin/raid-bosses'),
  require('./commands/admin/populate-raid-bosses'),
  require('./commands/util/boss-tier'),
  require('./commands/admin/autoset'),
  require('./commands/admin/shiny'),
  require('./commands/admin/not-shiny'),
  require('./commands/tsr/card'),
  require('./commands/tsr/register'),
  require('./commands/admin/rare'),
  require('./commands/notifications/spawn'),
  require('./commands/game/register-friend-code'),
  require('./commands/game/register-nickname'),
  require('./commands/game/friend-code'),
  require('./commands/game/find-nickname')
]);

if (privateSettings.regionMapLink !== '') {
  Client.registry.registerCommand(
    require('./commands/util/maps')
  )
}

if (privateSettings.googleApiKey !== '') {
  Client.registry.registerCommand(
    require('./commands/util/find-region'));
}

let isInitialized = false;

Client.on('ready', () => {
  log.info('Client logged in');

  // Only initialize various classes once ever since ready event gets fired
  // upon reconnecting after longer outages
  if (!isInitialized) {
    Helper.setClient(Client);

    if (settings.features.exGymChannel) {
      ExRaidChannel.initialize();
    }

    if (settings.features.notifications) {
      Notify.initialize();
    }

    if (settings.features.roles) {
      Role.initialize();
    }

    PartyManager.setClient(Client);
    DB.initialize(Client);
    IP.initialize();

    if (settings.features.web) {
      WebServer.initialize();
    }

    isInitialized = true;
  }
});

process.on('unhandledRejection', (reason, promise) => {
  log.error('Unhandled rejection at:', promise, 'reason:', reason);
});

Client.on('error', err => log.error(err));
Client.on('warn', err => log.warn(err));
Client.on('debug', err => log.debug(err));

Client.on('rateLimit', event =>
  log.warn(`Rate limited for ${event.timeout} ms, triggered by method '${event.method}', path '${event.path}', route '${event.route}'`));

Client.on('commandRun', (command, result, message, args, fromPattern) => {
  log.debug(`Command '${command.name}' run from message '${message.content}' by user ${message.author.id}`);
  message.isSuccessful = true;
});

Client.on('commandError', (command, err, message, args, fromPattern) => {
  log.error(`Command '${command.name}' error from message '${message.content}' by user ${message.author.id}`);
});

Client.on('commandFinalize', (command, message, fromPattern) => {
  Utility.cleanConversation(message, !!message.isSuccessful, !!message.deleteOriginal ||
    (!PartyManager.validParty(message.channel.id) && !Helper.isBotChannel(message)));
});

Client.on('disconnect', event => {
  log.error(`Client disconnected, code ${event.code}, reason '${event.reason}'...`);

  Client.destroy()
    .then(() => Client.login(privateSettings.discordBotToken))
    .catch(err => log.error(err));
});

Client.on('reconnecting', () => log.info('Client reconnecting...'));

Client.on('guildUnavailable', guild => {
  log.warn(`Guild ${guild.id} unavailable!`);
});

NotifyClient.on('ready', () => {
  log.info('Notify client logged in');

  Helper.setNotifyClient(NotifyClient);
});

NotifyClient.on('error', err => log.error(err));
NotifyClient.on('warn', err => log.warn(err));
NotifyClient.on('debug', err => log.debug(err));

NotifyClient.on('rateLimit', event =>
  log.warn(`Rate limited for ${event.timeout} ms, triggered by method '${event.method}', path '${event.path}', route '${event.route}'`));

NotifyClient.on('disconnect', event => {
  log.error(`Notify Client disconnected, code ${event.code}, reason '${event.reason}'...`);

  NotifyClient.destroy()
    .then(() => Client.login(privateSettings.discordNotifyToken))
    .catch(err => log.error(err));
});

PartyManager.initialize()
  .then(() => Client.login(privateSettings.discordBotToken))
  .then(() => NotifyClient.login(privateSettings.discordNotifyToken))
  .catch(err => log.error(err));
