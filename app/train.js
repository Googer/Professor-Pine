"use strict";

const log = require('loglevel').getLogger('Raid'),
  removeDiacritics = require('diacritics').remove,
  moment = require('moment'),
  settings = require('../data/settings'),
  {PartyStatus, PartyType} = require('./constants'),
  Discord = require('discord.js'),
  Helper = require('./helper'),
  Party = require('./party'),
  TimeType = require('../types/time');

let Gym,
  PartyManager;

process.nextTick(() => {
  Gym = require('./gym');
  PartyManager = require('./party-manager');
});

class RaidTrain extends Party {
  constructor(data = undefined) {
    super(PartyType.RAID_TRAIN, data);
  }

  static async createRaidTrain(sourceChannelId, memberId, trainName) {
    const train = new RaidTrain(PartyManager);

    // add some extra train data to remember
    train.createdById = memberId;
    train.sourceChannelId = sourceChannelId;
    train.creationTime = moment().valueOf();

    train.trainName = trainName;
    train.gymId = undefined;

    train.groups = [{id: 'A'}];
    train.defaultGroupId = 'A';

    train.attendees = Object.create(Object.prototype);
    train.attendees[memberId] = {number: 1, status: PartyStatus.INTERESTED, group: 'A'};

    const sourceChannel = (await PartyManager.getChannel(sourceChannelId)).channel,
      channelName = train.generateChannelName();

    let newChannelId;

    return sourceChannel.guild.channels.create(channelName, {
      parent: sourceChannel.parent,
      overwrites: sourceChannel.permissionOverwrites
    })
      .then(newChannel => {
        newChannelId = newChannel.id;

        PartyManager.parties[newChannelId] = train;
        train.channelId = newChannelId;

        // move channel to end
        return newChannel.guild.setChannelPositions([{
          channel: newChannel,
          position: newChannel.guild.channels.size - 1
        }]);
      })
      .then(async guild => {
        return {party: train};
      });
  }

  async setLocation(gymId, newRegionChannel = undefined) {
    this.gymId = gymId;
    if (!!newRegionChannel) {
      this.oldSourceChannelId = this.sourceChannelId;
      this.sourceChannelId = newRegionChannel.id;
    }

    await this.persist();

    const newChannelName = this.generateChannelName();

    await PartyManager.getChannel(this.channelId)
      .then(channelResult => {
        if (channelResult.ok) {
          return channelResult.channel.setName(newChannelName);
        }
      })
      .then(channel => {
        if (!!newRegionChannel) {
          // reparent this raid to new channel's category
          return channel.setParent(newRegionChannel.parent);
        }
      })
      .then(channel => {
        if (!!newRegionChannel) {
          // reset channel permissions to new parent category permissions
          return channel.lockPermissions();
        }
      })
      .then(channel => {
        if (!!newRegionChannel) {
          Helper.client.emit('raidRegionChanged', this, channel, false);
        }
      })
      .catch(err => log.error(err));

    return {party: this};
  }

  getTrainShortMessage() {
    const totalAttendees = this.getAttendeeCount(),
      calendarFormat = {
        sameDay: 'LT',
        sameElse: 'l LT'
      };

    return PartyManager.getChannel(this.channelId)
      .then(channelResult => channelResult.ok ?
        `**${this.trainName}**\n` +
        `${channelResult.channel.toString()} :: **${totalAttendees}** potential trainer${totalAttendees !== 1 ? 's' : ''}\n` :
        '')
      .catch(err => {
        log.error(err);
        return '';
      });
  }

  getChannelMessageHeader() {
    return PartyManager.getChannel(this.channelId)
      .then(channelResult => channelResult.ok ?
        `Use ${channelResult.channel.toString()} for the following raid train:` :
        '')
      .catch(err => log.error(err));
  }

  getSourceChannelMessageHeader() {
    return PartyManager.getChannel(this.sourceChannelId)
      .then(channelResult => channelResult.ok ?
        `Use ${channelResult.channel.toString()} to return to this raid train\'s regional channel.` :
        '')
      .catch(err => log.error(err));
  }

  async getFullStatusMessage() {
    const reportingMember = (await this.getMember(this.createdById)).member,
      raidReporter = `Originally reported by ${reportingMember.displayName}`,

      gym = Gym.getGym(this.gymId),
      gymName = !!gym ?
        (!!gym.nickname ?
          gym.nickname :
          gym.gymName) :
        'Location unset',
      gymUrl = !!gym ?
        `https://www.google.com/maps/search/?api=1&query=${gym.gymInfo.latitude}%2C${gym.gymInfo.longitude}` :
        '',
      attendeeEntries = Object.entries(this.attendees),
      totalAttendeeCount = attendeeEntries.length,
      attendeesWithMembers = (await Promise.all(attendeeEntries
        .map(async attendeeEntry => [await this.getMember(attendeeEntry[0]), attendeeEntry[1]])))
        .filter(([member, attendee]) => member.ok === true)
        .map(([member, attendee]) => [member.member, attendee]),
      sortedAttendees = attendeesWithMembers
        .sort((entryA, entryB) => {
          const teamA = Helper.getTeam(entryA[0]),
            teamB = Helper.getTeam(entryB[0]),
            nameA = entryA[0].displayName,
            nameB = entryB[0].displayName;

          const teamCompare = teamA - teamB;

          return (teamCompare !== 0) ?
            teamCompare :
            nameA.localeCompare(nameB);
        }),

      interestedAttendees = sortedAttendees
        .filter(attendeeEntry => attendeeEntry[1].status === PartyStatus.INTERESTED),
      comingAttendees = sortedAttendees
        .filter(attendeeEntry => attendeeEntry[1].status === PartyStatus.COMING),
      presentAttendees = sortedAttendees
        .filter(attendeeEntry => attendeeEntry[1].status === PartyStatus.PRESENT ||
          attendeeEntry[1].status === PartyStatus.COMPLETE_PENDING),
      embed = new Discord.MessageEmbed();

    embed.setColor('GREEN');
    embed.setTitle(`Map Link: ${gymName}`);
    embed.setURL(gymUrl);

    embed.setFooter(raidReporter, reportingMember.user.displayAvatarURL());

    this.groups
      .forEach(group => {
        const totalAttendees = this.getAttendeeCount(group.id);

        let groupLabel = `__Group ${group.id}__`;

        if (!!group.label) {
          const truncatedLabel = group.label.length > 150 ?
            group.label.substring(0, 149).concat('…') :
            group.label;

          groupLabel += `: ${truncatedLabel}`;
        }

        let groupDescription = `Trainers: ${totalAttendees.toString()}`;

        embed.addField(groupLabel, groupDescription);

        const groupInterestedAttendees = interestedAttendees
            .filter(attendeeEntry => attendeeEntry[1].group === group.id),
          groupComingAttendees = comingAttendees
            .filter(attendeeEntry => attendeeEntry[1].group === group.id),
          groupPresentAttendees = presentAttendees
            .filter(attendeeEntry => attendeeEntry[1].group === group.id);

        if (groupInterestedAttendees.length > 0) {
          embed.addField('Interested', Party.buildAttendeesList(groupInterestedAttendees, 'pokeball', totalAttendeeCount), true);
        }
        if (groupComingAttendees.length > 0) {
          embed.addField('Coming', Party.buildAttendeesList(groupComingAttendees, 'greatball', totalAttendeeCount), true);
        }
        if (groupPresentAttendees.length > 0) {
          embed.addField('Present', Party.buildAttendeesList(groupPresentAttendees, 'ultraball', totalAttendeeCount), true);
        }
      });

    let additionalInformation = '';

    if (!this.isExclusive) {
      if (!!gym && gym.is_ex) {
        additionalInformation += 'Confirmed EX Raid location.';
      } else if (!!gym && gym.is_park) {
        additionalInformation += 'Potential EX Raid location - This gym is located in a park.';
      }
    }

    if (!!gym && !!gym.additional_information) {
      if (additionalInformation !== '') {
        additionalInformation += '\n\n';
      }

      additionalInformation += gym.additional_information;
    }

    if (additionalInformation !== '') {
      embed.addField('**Location Information**', additionalInformation);
    }

    return {embed};
  }

  async refreshStatusMessages(replaceAnnouncementMessage) {
    const currentAnnouncementMessage = this.messages
      .find(messageCacheId => messageCacheId.split(':')[0] === this.oldSourceChannelId);

    // Refresh messages
    [...this.messages, this.lastStatusMessage]
      .filter(messageCacheId => messageCacheId !== undefined)
      .forEach(async messageCacheId => {
        try {
          const messageResult = await (PartyManager.getMessage(messageCacheId));

          if (messageResult.ok) {
            const message = messageResult.message,
              fullStatusMessage = await this.getFullStatusMessage();

            if (messageCacheId === currentAnnouncementMessage && replaceAnnouncementMessage) {
              // replace header of old announcement status message and schedule its deletion
              const raidChannel = (await PartyManager.getChannel(this.channelId)).channel,
                newSourceChannel = (await PartyManager.getChannel(this.sourceChannelId)).channel,
                channelMovedMessageHeader = `${raidChannel} has been moved to ${newSourceChannel}.`;

              message.edit(channelMovedMessageHeader, fullStatusMessage)
                .then(message => message.delete({timeout: settings.messageCleanupDelayStatus}))
                .then(async result => {
                  this.messages.splice(this.messages.indexOf(currentAnnouncementMessage), 1);
                  await this.persist();
                })
                .catch(err => log.error(err));
            } else {
              const channelMessage = (message.channel.id === this.channelId) ?
                await this.getSourceChannelMessageHeader() :
                message.content;

              message.edit(channelMessage, fullStatusMessage)
                .catch(err => log.error(err));
            }

          }
        } catch (err) {
          log.error(err);
        }
      });

    if (replaceAnnouncementMessage) {
      // Send new announcement message to new source channel
      const channelMessageHeader = await this.getChannelMessageHeader(),
        fullStatusMessage = await this.getFullStatusMessage(),
        newSourceChannel = (await PartyManager.getChannel(this.sourceChannelId)).channel;

      newSourceChannel.send(channelMessageHeader, fullStatusMessage)
        .then(announcementMessage => PartyManager.addMessage(this.channelId, announcementMessage, true))
        .catch(err => log.error(err));

      await this.persist();
    }
  }

  generateChannelName() {
    const nonCharCleaner = new RegExp(/[^\w]/, 'g');

    return `train ${this.trainName}`
      .replace(nonCharCleaner, ' ')
      .split(' ')
      .filter(token => token.length > 0)
      .join('-');
  }

  toJSON() {
    return Object.assign(super.toJSON(), {
      trainName: this.trainName,
      gymId: this.gymId
    });
  }
}

module.exports = RaidTrain;