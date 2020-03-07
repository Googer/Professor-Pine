"use strict";

const log = require('loglevel').getLogger('SubmitRequestCommand'),
  Commando = require('discord.js-commando'),
  {CommandGroup, PartyType} = require('../../app/constants'),
  Gym = require('../../app/gym'),
  Helper = require('../../app/helper'),
  https = require('https'),
  privateSettings = require('../../data/private-settings'),
  PartyManager = require('../../app/party-manager'),
  settings = require('../../data/settings');

class SubmitRequestCommand extends Commando.Command {
  constructor(client) {
    super(client, {
      name: 'request',
      group: CommandGroup.RAID_CRUD,
      memberName: 'request',
      aliases: ['submit-request'],
      description: 'Submits a change request for a gym in the master database to development.',
      details: 'Use this command submit a change request to a gym, such as a nickname, additional search terms for it, additional information that should be displayed with its raid status messages, etc.',
      examples: ['\t!request',
        '\t!request Everyone local knows this gym as \'red door church\'.  Can you add this as a nickname for it?',
        '\t!request The owner of the store that this gym is at gets annoyed if players stand in front of the door to his shop\'s entrance.'],
      throttling: {
        usages: 3,
        duration: 1800
      },
      args: [
        {
          key: 'reason',
          prompt: 'What information do you want to be added or changed for this gym?\n',
          type: 'string',
          wait: 120,
          infinite: true
        }
      ],
      guildOnly: true
    });

    client.dispatcher.addInhibitor(message => {
      if (!!message.command && message.command.name === 'request' &&
        !PartyManager.validParty(message.channel.id, [PartyType.RAID])) {
        return {
          reason: 'invalid-channel',
          response: message.reply('Make gym change requests from a raid channel!')
        };
      }
      return false;
    });
  }

  async run(message, args) {
    const reason = `Request from ${message.member.displayName}:\n\n` + args['reason']
        .map(reason => reason.trim())
        .join(' '),
      raid = PartyManager.getParty(message.channel.id),
      gymId = raid.gymId,
      gym = await Gym.getGym(gymId),
      postData = JSON.stringify({
        title: `Gym request: '${gym.name}' (id ${gymId})`,
        body: reason,
        labels: [`${gymId}`]
      }),
      postOptions = {
        hostname: 'api.github.com',
        path: `/repos/${privateSettings.githubRepo}/issues`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
          'User-Agent': 'Mozilla/5.0'
        },
        auth: `${privateSettings.githubUser}:${privateSettings.githubPassword}`
      },
      postRequest = https.request(postOptions, result => {
        result.setEncoding('utf8');
        result
          .on('data', chunk => log.debug('Response: ' + chunk))
          .on('error', err => log.error(err))
          .on('end', () => {
            message.react(Helper.getEmoji(settings.emoji.thumbsUp) || '👍')
              .catch(err => log.error(err));
          });
      });

    postRequest.on('error', err => log.error(err));

    // post the data
    postRequest.write(postData);
    postRequest.end();
  }
}

module.exports = SubmitRequestCommand;
