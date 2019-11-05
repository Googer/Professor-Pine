// Access the workerData by requiring it.
const log = require('loglevel').getLogger('NotifyHelper');
require('loglevel-prefix-persist/server')(process.env.NODE_ENV, log, {
  level: {
    production: 'debug',
    development: 'debug'
  },
  persist: 'debug',
  max: 5
});

log.setLevel('debug');

const async = require('async'),
  Discord = require('discord.js'),
  NodeCleanup = require('node-cleanup'),
  {parentPort} = require('worker_threads'),
  privateSettings = require('../data/private-settings'),
  settings = require('../data/settings'),
  NotifyClient = new Discord.Client({
    owner: privateSettings.owner,
    restWsBridgeTimeout: 10000,
    restTimeOffset: 1000,
    commandPrefix: settings.commandPrefix || '!'
  });

const jobQueue = async.queue(async ({userId, message, embed}) =>
    await sendMessage(userId, message, embed)
      .catch(err => log.error(err)),
  1);

jobQueue.empty(() => log.info('Message queue empty'));
jobQueue.drain(() => log.info('Message queue fully processed'));

NodeCleanup((exitCode, signal) => {
  NotifyClient.destroy();
});

async function sendMessage(userId, message, embed) {
  const user = NotifyClient.users.get(userId);

  if (embed) {
    await user.send(message, {embed})
      .catch(err => log.error(err));
  } else {
    await user.send(message)
      .catch(err => log.error(err));
  }

  return Promise.resolve();
}

parentPort.on('message', messages => {
  messages
    .forEach(message => jobQueue.push(message));

  log.info('Messages pushed to queue');

  parentPort.postMessage(true);
});

NotifyClient.on('ready', () => {
  log.info('Notify client logged in');
});

NotifyClient.on('error', err => log.error(err));
NotifyClient.on('warn', err => log.warn(err));
NotifyClient.on('debug', err => log.debug(err));

NotifyClient.on('rateLimit', event =>
  log.warn(`Rate limited for ${event.timeout} ms, triggered by method '${event.method}', path '${event.path}', route '${event.route}'`));

NotifyClient.on('disconnect', event => {
  log.error(`Notify Client disconnected, code ${event.code}, reason '${event.reason}'...`);

  NotifyClient.destroy()
    .then(() => NotifyClient.login(privateSettings.discordNotifyToken))
    .catch(err => log.error(err));
});

NotifyClient.login(privateSettings.discordNotifyToken);
