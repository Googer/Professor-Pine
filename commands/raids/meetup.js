"use strict";

const log = require('loglevel').getLogger('TrainCommand'),
  Commando = require('discord.js-commando'),
  {CommandGroup} = require('../../app/constants'),
  Gym = require('../../app/gym'),
  Helper = require('../../app/helper'),
  PartyManager = require('../../app/party-manager'),
  Meetup = require('../../app/meetup');

class MeetupCommand extends Commando.Command {
  constructor(client) {
    super(client, {
      name: 'meetup',
      group: CommandGroup.RAID_CRUD,
      memberName: 'meetup',
      aliases: ['meet-up'],
      description: 'Announces a new meetup.\n',
      details: 'Use this command to start organizing a new meetup.',
      examples: ['\t!meetup'],
      args: [
        {
          key: 'name',
          label: 'name',
          prompt: 'What do you wish to name this meetup?',
          type: 'string'
        }
      ],
      argsPromptLimit: 3,
      throttling: {
        usages: 2,
        duration: 900
      },
      guildOnly: true
    });

    client.dispatcher.addInhibitor(message => {
      if (!!message.command && message.command.name === 'meetup' &&
        (PartyManager.validParty(message.channel.id) || !Gym.isValidChannel(message.channel.name))) {
        return ['invalid-channel', message.reply('Create meetups from region channels!')];
      }
      return false;
    });
  }

  async run(message, args) {
    const meetupName = args['name'];

    let sourceChannel = message.channel;

    let meetup;

    Meetup.createMeetup(sourceChannel.id, message.member.id, meetupName)
      // create and send announcement message to region channel
      .then(async info => {
        meetup = info.party;
        const channelMessageHeader = await meetup.getChannelMessageHeader(),
          fullStatusMessage = await meetup.getFullStatusMessage();

        return sourceChannel.send(channelMessageHeader, fullStatusMessage);
      })
      .then(announcementMessage => PartyManager.addMessage(meetup.channelId, announcementMessage))
      // create and send initial status message to meetup channel
      .then(async botMessage => {
        const sourceChannelMessageHeader = await meetup.getSourceChannelMessageHeader(),
          fullStatusMessage = await meetup.getFullStatusMessage();
        return PartyManager.getChannel(meetup.channelId)
          .then(channelResult => {
            if (channelResult.ok) {
              return channelResult.channel.send(sourceChannelMessageHeader, fullStatusMessage);
            }
          })
          .catch(err => log.error(err));
      })
      .then(meetupMessage => PartyManager.addMessage(meetup.channelId, meetupMessage, true))
      .then(async result => {
        Helper.client.emit('meetupCreated', meetup, message.member.id);

        return true;
      })
      .catch(err => log.error(err));
  }
}

module.exports = MeetupCommand;
