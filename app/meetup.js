"use strict";

const log = require('loglevel').getLogger('Meetup'),
  moment = require('moment'),
  {PartyStatus, PartyType} = require('./constants'),
  Discord = require('discord.js'),
  Helper = require('./helper'),
  Party = require('./party');

let PartyManager;

process.nextTick(() => {
  PartyManager = require('./party-manager');
});

class Meetup extends Party {
  constructor(data = undefined) {
    super(PartyType.MEETUP, data);
  }

  static async createMeetup(sourceChannelId, memberId, meetupName) {
    const meetup = new Meetup(PartyManager);

    // add some extra meetup data to remember
    meetup.createdById = memberId;
    meetup.sourceChannelId = sourceChannelId;
    meetup.creationTime = moment().valueOf();

    meetup.meetupName = meetupName;

    meetup.location = undefined;

    meetup.groups = [{id: 'A'}];
    meetup.defaultGroupId = 'A';

    meetup.attendees = Object.create(Object.prototype);
    meetup.attendees[memberId] = {number: 1, status: PartyStatus.INTERESTED, group: 'A'};

    const sourceChannel = (await PartyManager.getChannel(sourceChannelId)).channel,
      channelName = meetup.generateChannelName();

    let newChannelId;

    return sourceChannel.guild.channels.create(channelName, {
      parent: sourceChannel.parent,
      overwrites: sourceChannel.permissionOverwrites
    })
      .then(newChannel => {
        newChannelId = newChannel.id;

        PartyManager.parties[newChannelId] = meetup;
        meetup.channelId = newChannelId;

        // move channel to end
        return newChannel.guild.setChannelPositions([{
          channel: newChannel,
          position: newChannel.guild.channels.cache.size - 1
        }]);
      })
      .then(async guild => {
        return {party: meetup};
      });
  }

  async setName(meetupName) {
    this.meetupName = meetupName;

    await this.persist();

    const newChannelName = this.generateChannelName();

    await PartyManager.getChannel(this.channelId)
      .then(channelResult => {
        if (channelResult.ok) {
          return channelResult.channel.setName(newChannelName);
        }
      })
      .catch(err => log.error(err));

    return {party: this};
  }

  async setDescription(description) {
    this.description = description;

    await this.persist();

    return {party: this};
  }

  async setMeetingTime(memberId, startTime) {
    const member = this.attendees[memberId];

    if (!member) {
      return {error: `You are not signed up for this ${this.type}!`};
    }

    this.startTime = startTime;

    await this.persist();

    return {party: this};
  }

  async cancelMeetingTime(memberId) {
    const member = this.attendees[memberId];

    if (!member) {
      return {error: `You are not signed up for this ${this.type}!`};
    }

    delete this.startTime;

    await this.persist();
    return {party: this};
  }

  async setEndTime(endTime) {
    this.endTime = endTime;

    await this.persist();
  }

  getChannelMessageHeader() {
    return PartyManager.getChannel(this.channelId)
      .then(channelResult => channelResult.ok ?
        `Use ${channelResult.channel.toString()} for the following meetup:` :
        '')
      .catch(err => log.error(err));
  }

  getSourceChannelMessageHeader() {
    return PartyManager.getChannel(this.sourceChannelId)
      .then(channelResult => channelResult.ok ?
        `Use ${channelResult.channel.toString()} to return to this meetup\'s regional channel.` :
        '')
      .catch(err => log.error(err));
  }

  async getFullStatusMessage() {
    const calendarFormat = {
        sameDay: 'LT',
        sameElse: 'l LT'
      },
      reportingMember = (await this.getMember(this.createdById)).member,
      meetupReporter = `Originally reported by ${reportingMember.displayName}`,
      attendeeEntries = Object.entries(this.attendees),

      meetingTime = !!this.startTime ?
        moment(this.startTime) :
        '',
      finishTime = !!this.endTime ?
        moment(this.endTime) :
        '',
      meetingLabel = !!this.startTime || !!this.endTime ?
        '__Meetup Times__' :
        '',

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
    embed.setTitle('Meetup: ' + this.meetupName);

    embed.setFooter(meetupReporter, reportingMember.user.displayAvatarURL());

    if (!!this.description) {
      embed.addField('__Meeting Information__', this.description);
    }

    let timeFrame = '';

    if (!!this.startTime && !isNaN(this.startTime)) {
      timeFrame += meetingTime.calendar(null, calendarFormat);
    }

    if (!!this.endTime && !isNaN(this.endTime)) {
      timeFrame += ' - ' + finishTime.calendar(null, calendarFormat);
    }

    if (timeFrame) {
      embed.addField(meetingLabel, timeFrame);
    }

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

    return {embed};
  }

  async refreshStatusMessages() {
    // Refresh messages
    [...this.messages, this.lastStatusMessage]
      .filter(messageCacheId => messageCacheId !== undefined)
      .forEach(async messageCacheId => {
        try {
          const messageResult = await (PartyManager.getMessage(messageCacheId));

          if (messageResult.ok) {
            const message = messageResult.message,
              fullStatusMessage = await this.getFullStatusMessage(),
              channelMessage = (message.channel.id === this.channelId) ?
                await this.getSourceChannelMessageHeader() :
                message.content;

            message.edit(channelMessage, fullStatusMessage)
              .catch(err => log.error(err));
          }
        } catch (err) {
          log.error(err);
        }
      });
  }

  generateChannelName() {
    const nonCharCleaner = new RegExp(/[^\w]/, 'g');

    return `meetup ${this.meetupName}`
      .replace(nonCharCleaner, ' ')
      .split(' ')
      .filter(token => token.length > 0)
      .join('-');
  }

  toJSON() {
    return Object.assign(super.toJSON(), {
      meetupName: this.meetupName,
      description: this.description,
      startTime: this.startTime,
      endTime: this.endTime
    });
  }
}

module.exports = Meetup;
