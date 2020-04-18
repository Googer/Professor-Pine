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
  settings = require('./data/settings'),
  Commando = require('discord.js-commando'),
  Discord = require('discord.js'),
  Client = new Commando.Client({
    owner: privateSettings.owner,
    restWsBridgeTimeout: 10000,
    restTimeOffset: 1000,
    commandPrefix: settings.commandPrefix || '!'
  }),
  DB = require('./app/db.js'),
  NodeCleanup = require('node-cleanup'),
  Gym = require('./app/gym'),
  Helper = require('./app/helper'),
  IP = require('./app/process-image'),
  ExRaidChannel = require('./app/ex-gym-channel'),
  Map = require('./app/map'),
  Notify = require('./app/notify'),
  PartyManager = require('./app/party-manager'),
  Role = require('./app/role'),
  Utility = require('./app/utility'),
  IntervalUpdater = require('./app/update'),
  {CommandGroup} = require('./app/constants');

NodeCleanup((exitCode, signal) => {
  PartyManager.shutdown();
});

Client.registry.registerDefaultTypes();
Client.registry.registerTypesIn(__dirname + '/types');
Client.registry.registerTypesIn(__dirname + '/types/counters');

Client.registry.registerGroup('region', 'Region setting');
Client.registry.registerGroup(CommandGroup.ADMIN, 'Administration');
Client.registry.registerGroup(CommandGroup.BASIC_RAID, 'Raid Basics');
Client.registry.registerGroup(CommandGroup.RAID_CRUD, 'Raid Creation and Maintenance');
Client.registry.registerGroup(CommandGroup.TRAIN, 'Trains');

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

    require('./commands/admin/gyms/importgyms'),
    require('./commands/admin/gyms/creategym'),
    require('./commands/admin/gyms/editgym'),
    require('./commands/admin/gyms/deletegym'),
    require('./commands/admin/gyms/findgym'),
    require('./commands/admin/gyms/gymdetail'),
    require('./commands/admin/gyms/gymqueue'),
    require('./commands/admin/gyms/gymplaces'),
    require('./commands/admin/gyms/geocode'),
    require('./commands/admin/gyms/clearimagecache'),
    require('./commands/admin/gyms/export-tsv'),

    require('./commands/admin/regions/importregions'),
    require('./commands/admin/regions/setregion'),
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
  require('./commands/notifications/mention-train-stops'),

  require('./commands/regions/bounds'),

  require('./commands/parties/join'),
  require('./commands/parties/interested'),
  require('./commands/parties/check-in'),

  require('./commands/raids/done'),

  require('./commands/parties/local'),
  require('./commands/parties/remote'),
  require('./commands/parties/check-out'),
  require('./commands/parties/leave'),

  require('./commands/raids/cancel-start-time'),
  require('./commands/parties/meet-time'),
  require('./commands/parties/group'),
  require('./commands/parties/label-group'),
  require('./commands/parties/new-group'),

  require('./commands/parties/status'),
  require('./commands/parties/directions'),
  require('./commands/parties/shout'),
  require('./commands/parties/save-party'),

  require('./commands/raids/raid'),
  require('./commands/parties/delete'),

  require('./commands/raids/hatch-time'),
  require('./commands/parties/time-left'),
  require('./commands/parties/set-pokemon'),
  require('./commands/raids/set-location'),
  require('./commands/raids/set-moveset'),

  require('./commands/raids/auto-status'),
  require('./commands/raids/report-privacy'),

  require('./commands/trains/train'),
  require('./commands/trains/name'),
  require('./commands/trains/route'),
  require('./commands/trains/route-add'),
  require('./commands/trains/route-delete'),
  require('./commands/trains/route-edit'),
  require('./commands/trains/route-clear'),
  require('./commands/trains/previous'),
  require('./commands/trains/next'),
  require('./commands/trains/skip'),
  require('./commands/trains/train-finished'),
  require('./commands/trains/conductor'),
  require('./commands/trains/not-conductor'),
  require('./commands/trains/save-route'),
  require('./commands/trains/use-route'),

  require('./commands/raids/submit-request'),

  require('./commands/util/help'),
  require('./commands/util/counters'),
  require('./commands/util/howmany'),
  require('./commands/util/pvp-rank'),
  require('./commands/admin/raid-boss'),
  require('./commands/admin/raid-bosses'),
  require('./commands/admin/populate-raid-bosses'),
  require('./commands/admin/add-nickname'),
  require('./commands/admin/view-member-settings'),
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
  require('./commands/game/find-nickname'),
  require('./commands/notifications/boss-set-notifications'),
  require('./commands/notifications/new-train-notifications')
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

Client.on('ready', async () => {
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
    await DB.initialize(Client);
    Map.initialize(Client);
    IP.initialize();
    await Gym.buildIndexes();

    module.exports.isInitialized = isInitialized = true;
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

PartyManager.initialize()
  .then(() => Client.login(privateSettings.discordBotToken))
  .catch(err => log.error(err));

module.exports.isInitialized = isInitialized;
