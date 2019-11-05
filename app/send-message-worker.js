// Access the workerData by requiring it.
const log = require('loglevel').getLogger('NotifyHelper'),
  {parentPort} = require('worker_threads'),
  Discord = require('discord.js'),
  NodeCleanup = require('node-cleanup'),
  privateSettings = require('../data/private-settings'),
  settings = require('../data/settings'),
  NotifyClient = new Discord.Client({
    owner: privateSettings.owner,
    restWsBridgeTimeout: 10000,
    restTimeOffset: 1000,
    commandPrefix: settings.commandPrefix || '!'
  });

NodeCleanup((exitCode, signal) => {
  NotifyClient.destroy();
});

async function sendMessage(guildId, memberId, message, embed) {
  const member = NotifyClient.guilds.get(guildId).members.get(memberId);

  if (embed) {
    await member.send(message, {embed})
      .catch(err => log.error(err));
  } else {
    await member.send(message)
      .catch(err => log.error(err));
  }

  return Promise.resolve();
}

parentPort.on('message', async messages => {
  let promiseChain,
    currentPromise;

  for (const {guildId, memberId, message, embed} of messages) {
    if (currentPromise) {
      currentPromise = currentPromise
        .then(() => sendMessage(guildId, memberId, message, embed))
    } else {
      currentPromise = sendMessage(guildId, memberId, message, embed);
      promiseChain = currentPromise;
    }
  }

  await promiseChain
    .catch(err => log.error(err));
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
