"use strict";

const log = require('loglevel').getLogger('RaidCommand'),
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
      gymId = args['gymId'];

    let sourceChannel = message.channel;

    if (!!message.adjacent) {
      // Found gym is in an adjacent region
      const confirmationCollector = new Commando.ArgumentCollector(message.client, [
          {
            key: 'confirm',
            label: 'confirmation',
            prompt: `${message.adjacent.gymName} was found in ${message.adjacent.channel.toString()}!  Should this raid be created there?\n`,
            type: 'boolean'
          }
        ], 3),
        confirmationResult = await confirmationCollector.obtain(message);

      let confirmation = false;
      Utility.cleanCollector(confirmationResult);

      if (!confirmationResult.cancelled) {
        confirmation = confirmationResult.values['confirm'];
      }

      if (!confirmation) {
        return;
      }

      sourceChannel = message.adjacent.channel;
    }

    let raid;

    Raid.createRaid(sourceChannel.id, message.member.id, pokemon, gymId)
    // create and send announcement message to region channel
      .then(async info => {
        raid = info.party;

        if (!info.existing) {
          raid = info.party;
          const channelMessageHeader = await raid.getChannelMessageHeader(),
            fullStatusMessage = await raid.getFullStatusMessage();

          return sourceChannel.send(channelMessageHeader, fullStatusMessage)
            .then(announcementMessage => PartyManager.addMessage(raid.channelId, announcementMessage))
            // create and send initial status message to raid channel
            .then(async botMessage => {
              const sourceChannelMessageHeader = await raid.getSourceChannelMessageHeader(),
                fullStatusMessage = await raid.getFullStatusMessage();
              return PartyManager.getChannel(raid.channelId)
                .then(channelResult => {
                  if (channelResult.ok) {
                    return channelResult.channel.send(sourceChannelMessageHeader, fullStatusMessage);
                  }
                })
                .catch(err => log.error(err));
            })
            .then(channelRaidMessage => PartyManager.addMessage(raid.channelId, channelRaidMessage, true))
            // now ask user about remaining time on this brand-new raid
            .then(result => {
              // somewhat hacky way of letting time type know if some additional information
              message.pokemon = raid.pokemon;
              message.isExclusive = raid.isExclusive;

              if (raid.pokemon.name) {
                return this.endTimeCollector.obtain(message);
              } else {
                return this.hatchTimeCollector.obtain(message);
              }
            })
            .then(async collectionResult => {
              Utility.cleanCollector(collectionResult);

              if (!collectionResult.cancelled) {
                if (raid.pokemon.name) {
                  await raid.setEndTime(collectionResult.values[TimeParameter.END]);
                } else {
                  await raid.setHatchTime(collectionResult.values[TimeParameter.HATCH]);
                }

                return raid.refreshStatusMessages();
              }
            })
            .then(async result => {
              Helper.client.emit('raidCreated', raid, message.member.id);

              // Fire region changed event if it was created from the wrong region
              if (!!message.adjacent) {
                const raidChannelResult = await PartyManager.getChannel(raid.channelId);

                if (raidChannelResult.ok) {
                  const raidChannel = raidChannelResult.channel;
                  Helper.client.emit('raidRegionChanged', raid, raidChannel, true);
                }
              }

              return true;
            })
            .catch(err => log.error(err));
        } else {
          raid.refreshStatusMessages()
            .catch(err => log.error(err));
        }
      })
      .catch(err => log.error(err));
  }
}

module.exports = RaidCommand;
