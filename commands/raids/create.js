"use strict";

const log = require('loglevel').getLogger('CreateCommand'),
  Commando = require('discord.js-commando'),
  {CommandGroup, TimeParameter} = require('../../app/constants'),
  Gym = require('../../app/gym'),
  Helper = require('../../app/helper'),
  PartyManager = require('../../app/party-manager'),
  Raid = require('../../app/raid'),
  Utility = require('../../app/utility');

class RaidCommand extends Commando.Command {
  constructor(client) {
    super(client, {
      name: 'raid',
      group: CommandGroup.RAID_CRUD,
      memberName: 'raid',
      aliases: ['create', 'announce'],
      description: 'Announces a new raid.',
      details: 'Use this command to start organizing a new raid.  For your convenience, this command combines several options such that you can set the pokémon and the location of the raid all at once.  ' +
        'Once created, it will further prompt you for the raid\'s hatch or end time.',
      examples: ['\t!raid lugia', '\t!raid zapdos manor theater', '\t!raid magikarp olea', '\t!raid ttar frog fountain'],
      throttling: {
        usages: 15,
        duration: 900
      },
      args: [
        {
          key: 'pokemon',
          prompt: 'What pokémon (or tier if unhatched) is this raid?\nExample: `lugia`\n',
          type: 'pokemon',
        },
        {
          key: 'gymId',
          label: 'gym',
          prompt: 'Where is this raid taking place?\nExample: `manor theater`\n',
          type: 'gym',
          wait: 60
        }
      ],
      argsPromptLimit: 3,
      guildOnly: true
    });

    this.hatchTimeCollector = new Commando.ArgumentCollector(client, [
      {
        key: TimeParameter.HATCH,
        label: 'hatch time',
        prompt: 'How much time is remaining (in minutes) until the raid hatches?\nExample: `43`\n\n*or*\n\nWhen does this raid hatch?\nExample: `6:12`\n',
        type: 'time'
      }
    ], 3);

    this.endTimeCollector = new Commando.ArgumentCollector(client, [
      {
        key: TimeParameter.END,
        label: 'time left',
        prompt: 'How much time is remaining (in minutes) until the raid ends?\nExample: `43`\n\n*or*\n\nWhen does this raid end?\nExample: `6:12`\n',
        type: 'time'
      }
    ], 3);

    client.dispatcher.addInhibitor(message => {
      if (!!message.command && message.command.name === 'raid' &&
        (PartyManager.validParty(message.channel.id) || !Gym.isValidChannel(message.channel.name))) {
        return ['invalid-channel', message.reply('Create raids from region channels!')];
      }
      return false;
    });
  }

  async run(message, args) {
    const pokemon = args['pokemon'],
      gym_id = args['gymId'];

    let raid;

    Raid.createRaid(message.channel.id, message.member.id, pokemon, gym_id)
    // create and send announcement message to region channel
      .then(async info => {
        raid = info.raid;
        const raidChannelMessage = await raid.getRaidChannelMessage(),
          formattedMessage = await raid.getFormattedMessage();

        return message.channel.send(raidChannelMessage, formattedMessage);
      })
      .then(announcementMessage => PartyManager.addMessage(raid.channelId, announcementMessage))
      // create and send initial status message to raid channel
      .then(async botMessage => {
        const raidSourceChannelMessage = await raid.getRaidSourceChannelMessage(),
          formattedMessage = await raid.getFormattedMessage();
        return PartyManager.getChannel(raid.channelId)
          .then(channelResult => {
            if (channelResult.ok) {
              return channelResult.channel.send(raidSourceChannelMessage, formattedMessage);
            }
          })
          .catch(err => log.error(err));
      })
      .then(channelRaidMessage => PartyManager.addMessage(raid.channelId, channelRaidMessage, true))
      // now ask user about remaining time on this brand-new raid
      .then(result => {
        // somewhat hacky way of letting time type know if some additional information
        message.pokemon = raid.pokemon;
        message.isExclusive = raid.isExclusive();

        if (raid.pokemon.name) {
          return this.endTimeCollector.obtain(message);
        } else {
          return this.hatchTimeCollector.obtain(message);
        }
      })
      .then(collectionResult => {
        Utility.cleanCollector(collectionResult);

        if (!collectionResult.cancelled) {
          if (raid.pokemon.name) {
            raid.setRaidEndTime(collectionResult.values[TimeParameter.END]);
          } else {
            raid.setRaidHatchTime(collectionResult.values[TimeParameter.HATCH]);
          }

          return raid.refreshStatusMessages();
        }
      })
      .then(result => {
        Helper.client.emit('raidCreated', raid, message.member.id);

        return true;
      })
      .catch(err => log.error(err));
  }
}

module.exports = RaidCommand;
