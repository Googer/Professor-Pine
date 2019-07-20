"use strict";

const log = require('loglevel').getLogger('RaidTrain'),
  moment = require('moment'),
  settings = require('../data/settings'),
  {PartyStatus, PartyType} = require('./constants'),
  Discord = require('discord.js'),
  Helper = require('./helper'),
  Party = require('./party');

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
    train.route = [];
    train.currentGym = 0;
    train.conductor = null;

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

  async setPokemon(pokemon) {
    this.pokemon = pokemon;
    this.isExclusive = !!pokemon.exclusive;
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

  async clearRoute() {
    this.route = [];
    await this.persist();

    return true;
  }

  async removeRouteGym(gymIndex) {
    this.route.splice(gymIndex, 1);

    await this.persist();

    return true;
  }

  async addRouteGym(gymId) {
    let gym = Gym.getGym(gymId);

    if (!!!this.route) {
      this.route = [];
    }

    if (this.route.find(gym => gym.gymId === gymId) !== undefined) {
      return false;
    }

    this.route.push(gym);

    await this.persist();

    return this.route;
  }

  async insertRouteGym(index, gym) {
    if (!!!this.route) {
      this.route = [];
    }

    this.route.splice(index, 0, gym);

    await this.persist();

    return this.route;
  }

  async moveToNextGym() {
    if (!!this.route || !this.route.length || this.currentGym === (this.route.length + 1)) {
      return true;
    }

    this.currentGym = this.currentGym + 1;

    await this.persist();

    return true;
  }

  async skipGym() {
    if (!!this.route || !this.route.length || this.currentGym === (this.route.length + 1)) {
      return true;
    }

    this.currentGym = this.currentGym + 2;

    await this.persist();

    return true;
  }

  async moveToPreviousGym() {
    if (!!this.route || !this.route.length || this.currentGym === (this.route.length + 1) || this.currentGym === 0) {
      return true;
    }

    this.currentGym = this.currentGym - 1;

    await this.persist();

    return true;
  }

  async finishRoute() {
    this.currentGym = !!this.route ? this.route.length + 1 : 0;

    await this.persist();

    return true;
  }

  async setConductor(member) {
    this.conductor = member;

    await this.persist();

    return true;
  }

  async setEndTime(endTime) {
    this.endTime = endTime;

    await this.persist();

  async setLocation(gymId, newRegionChannel = undefined) {
    this.gymId = gymId;
    if (!!newRegionChannel) {
      this.oldSourceChannelId = this.sourceChannelId;
      this.sourceChannelId = newRegionChannel.id;
    }

    await this.persist();

    Helper.client.emit('trainGymChanged', gymId, this);

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
    const totalAttendees = this.getAttendeeCount();

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
    const calendarFormat = {
        sameDay: 'LT',
        sameElse: 'l LT'
      },

      reportingMember = (await this.getMember(this.createdById)).member,
      raidReporter = `Originally reported by ${reportingMember.displayName}`,

      meetingTime = !!this.startTime ?
        moment(this.startTime) :
        '',
      finishTime = !!this.endTime ?
        moment(this.endTime) :
        '',
      meetingLabel = !!this.startTime || !!this.endTime ?
        '__Train Times__' :
        '',
      currentGym = this.currentGym || 0,
      route = this.route ? this.route : [],
      pokemon = !!this.pokemon ? this.pokemon.name.charAt(0).toUpperCase() + this.pokemon.name.slice(1) : '',
      pokemonUrl = !!this.pokemon && !!this.pokemon.url ?
        this.pokemon.url :
        '',
      pokemonCPString = !!this.pokemon && this.pokemon.bossCP > 0 ?
        `${this.pokemon.minBaseCP}-${this.pokemon.maxBaseCP} / ` +
        `${this.pokemon.minBoostedCP}-${this.pokemon.maxBoostedCP} ${this.pokemon.boostedConditions.boosted
          .map(condition => Helper.getEmoji(condition))
          .join('')}` :
        '',
      shiny = !!this.pokemon && this.pokemon.shiny ?
      Helper.getEmoji(settings.emoji.shiny) || '✨' :
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
      embed = new Discord.MessageEmbed(),
      conductor = !!this.conductor ?
          ` (Conductor: ${this.conductor.username})`:
          '';

    embed.setColor('GREEN');
    embed.setTitle('Raid Train: ' + this.trainName + conductor);

    if (pokemonUrl !== '') {
      embed.setThumbnail(pokemonUrl);
    }

    if (!route.length) {
      embed.addField('**Current Gym**', 'Route Unset');
    } else if (currentGym >= route.length) {
      embed.addField('**Current Gym**', 'Route has been completed.');
    } else {
      let currentName = !!route[currentGym].nickname ?
          route[currentGym].nickname :
          route[currentGym].gymName;
      let currentUrl = Gym.getUrl(route[currentGym].gymInfo.latitude, route[currentGym].gymInfo.longitude);

      embed.addField('**Current Gym**', `[${currentName}](${currentUrl})`);

      if (route[currentGym + 1]) {
        let nextName = !!route[currentGym + 1].nickname ?
          route[currentGym + 1].nickname :
          route[currentGym + 1].gymName;
        let nextUrl = Gym.getUrl(route[currentGym + 1].gymInfo.latitude, route[currentGym + 1].gymInfo.longitude);

        embed.addField('**Next Gym**', `[${nextName}](${nextUrl})`);
      }
    }

    let pokemonDataContent = '';

    if (this.pokemon && this.pokemon.weakness && this.pokemon.weakness.length > 0) {
      pokemonDataContent += '**Weaknesses**\n';
      pokemonDataContent += this.pokemon.weakness
        .map(weakness => Helper.getEmoji(weakness.type).toString() +
          (weakness.multiplier > 1.6 ?
            'x2 ' :
            ''))
        .join('');
    }

    if (pokemonCPString) {
      if (pokemonDataContent) {
        pokemonDataContent += '\n\n';
      }

      pokemonDataContent += '**Catch CP Ranges**\n';
      pokemonDataContent += pokemonCPString;
    }

    if (pokemonDataContent !== '') {
      embed.addField('**' + pokemon + shiny + ' Information**', pokemonDataContent);
    }

    embed.setFooter(raidReporter, reportingMember.user.displayAvatarURL());

    let timeFrame = '';

    if (!!this.startTime && !isNaN(this.startTime)) {
      timeFrame += meetingTime.calendar(null, calendarFormat);
    }

    if (!!this.endTime && !isNaN(this.endTime)) {
      if (timeFrame) {
        timeFrame += ' - ';
      }

      timeFrame += finishTime.calendar(null, calendarFormat);

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

    let additionalInformation = '';

    if (route && route.length) {
      let gym = this.route[this.currentGym || 0];

      if (!!gym && gym.hasHostedEx) {
        additionalInformation += 'Confirmed EX Raid location.';
      } else if (!!gym && gym.hasExTag) {
        additionalInformation += 'Potential EX Raid location - This gym has the EX gym tag.';
      }

      if (!!gym && !!gym.additionalInformation) {
        if (additionalInformation !== '') {
          additionalInformation += '\n\n';
        }

        additionalInformation += gym.additionalInformation;
      }

      if (additionalInformation !== '') {
        embed.addField('**Location Information**', additionalInformation);
      }
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

  getRouteEmbed() {
    let embed = new Discord.MessageEmbed(),
      current = this.currentGym || 0;

    embed.setColor('GREEN');
    let description = '';

    if (this.route && this.route.length) {
      this.route.forEach((gym, index) => {
        let complete = index < current ? '~~' : '',
          completeText = index < current ? ' (Completed)' : '',
          gymName = !!gym.nickname ? gym.nickname : gym.gymName;

        description += (index + 1) + `. ${complete}${gymName}${complete}${completeText}\n`;
      });

      embed.setDescription(description)
    } else {
      embed.setTitle('Route not set.')
    }

    return embed;
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
      gymId: this.gymId,
      startTime: this.startTime,
      isExclusive: this.isExclusive,
      pokemon: this.pokemon,
      currentGym: this.currentGym,
      route: this.route,
      conductor: this.conductor,
      endTime: this.endTime
    });
  }
}

module.exports = RaidTrain;
