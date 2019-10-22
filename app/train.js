"use strict";

const log = require('loglevel').getLogger('Raid'),
  removeDiacritics = require('diacritics').remove,
  moment = require('moment'),
  settings = require('../data/settings'),
  {PartyStatus, PartyType} = require('./constants'),
  Discord = require('discord.js'),
  Helper = require('./helper'),
  Party = require('./party'),
  User = require('./user'),
  Region = require('./region'),
  DB = require('./db');

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
    train.nextLastRun = moment().valueOf();
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
      type: 'text',
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

  async setTrainName(trainName) {
    this.trainName = trainName;

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

  async setPokemon(pokemon) {
    this.pokemon = pokemon;
    this.isExclusive = !!pokemon.exclusive;

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
    if (!!!this.route) {
      this.route = [];
    }

    if (this.route.find(existingGymId => existingGymId === gymId) !== undefined) {
      return false;
    }

    this.route.push(gymId);

    await this.persist();

    return this.route;
  }

  async insertRouteGym(index, gymId) {
    if (!!!this.route) {
      this.route = [];
    }

    this.route.splice(index, 0, gymId);

    await this.persist();

    return this.route;
  }

  async moveToNextGym(author) {
    if (!!!this.route || !this.route.length || this.currentGym === (this.route.length + 1)) {
      return true;
    }

    const member = this.attendees[author.id];

    if (!member) {
      return {error: 'You are not signed up for this train!'};
    }

    this.currentGym = this.currentGym + 1;
    this.nextLastRun = moment().valueOf();

    let present = await this.getPresentAttendees();
    await this.setAttendeesToComing(present);

    await this.persist();

    return true;
  }

  async skipGym(author) {
    if (!!!this.route || !this.route.length || this.currentGym === (this.route.length + 1)) {
      return true;
    }

    const member = this.attendees[author.id];

    if (!member) {
      return {error: 'You are not signed up for this train!'};
    }


    this.currentGym = this.currentGym + 2;

    let present = await this.getPresentAttendees();
    await this.setAttendeesToComing(present);

    await this.persist();

    return true;
  }

  async moveToPreviousGym(author) {
    if (!!!this.route || !this.route.length || this.currentGym === (this.route.length + 1) || this.currentGym === 0) {
      return true;
    }

    const member = this.attendees[author.id];

    if (!member) {
      return {error: 'You are not signed up for this train!'};
    }

    this.currentGym = this.currentGym - 1;

    let present = await this.getPresentAttendees();
    await this.setAttendeesToComing(present);

    await this.persist();

    return true;
  }

  async finishRoute(author) {
    this.currentGym = !!this.route ? this.route.length + 1 : 0;

    const member = this.attendees[author.id];

    if (!member) {
      return {error: 'You are not signed up for this train!'};
    }

    await this.persist();

    return true;
  }

  async getPresentAttendees() {
    let attendeeEntries = Object.entries(this.attendees),
      attendeesWithMembers = (await Promise.all(attendeeEntries
        .map(async attendeeEntry => [await this.getMember(attendeeEntry[0]), attendeeEntry[1]])))
        .filter(([member, attendee]) => member.ok === true)
        .map(([member, attendee]) => [member.member, attendee]);

    return attendeesWithMembers
      .filter(attendeeEntry => attendeeEntry[1].status === PartyStatus.PRESENT);
  }

  async setAttendeesToComing(attendeeList) {
    attendeeList.forEach(member => {
      this.attendees[member[0].user.id] = {
        group: member[1].group,
        number: member[1].number,
        status: PartyStatus.COMING
      }
    });

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
    return {party: this};
  }

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
        ` (Conductor: ${this.conductor.username})` :
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
      let gym = await Gym.getGym(route[currentGym]);
      let currentName = !!gym.nickname ?
        gym.nickname :
        gym.name;
      let currentUrl = `https://www.google.com/maps/search/?api=1&query=${gym.lat}%2C${gym.lon}`;

      embed.addField('**Current Gym**', `[${currentName}](${currentUrl})`);

      if (route[currentGym + 1]) {
        let nextGym = await Gym.getGym(route[currentGym + 1]);
        let nextName = !!nextGym.nickname ?
          nextGym.nickname :
          nextGym.name;
        let nextUrl = `https://www.google.com/maps/search/?api=1&query=${nextGym.lat}%2C${nextGym.lon}`;

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
      let gymId = this.route[this.currentGym || 0],
        gym = await Gym.getGym(gymId);

      if (!!gym && gym.taggedEx) {
        if (!!gym && gym.confirmedEx) {
          additionalInformation += 'Confirmed EX Raid location - This gym has the EX gym tag and has previously hosted an EX Raid.';
        } else {
          additionalInformation += 'Potential EX Raid location - This gym has the EX gym tag.';
        }
      }

      if (!!gym && !!gym.notice) {
        if (additionalInformation !== '') {
          additionalInformation += '\n\n';
        }

        additionalInformation += gym.notice;
      }

      if (additionalInformation !== '') {
        embed.addField('**Location Information**', additionalInformation);
      }
    }

    return {embed};
  }

  async refreshStatusMessages(replaceAnnouncementMessage) {
    if (!this.messages) {
      // odd, but ok... (actually can happen if all messages got removed from Pine's cache through Discord blips, etc.
      return;
    }

    const currentAnnouncementMessage = this.messages
      .find(messageCacheId => messageCacheId.split(':')[0] === this.oldSourceChannelId);

    // Refresh messages
    let editMessageChain,
      currentStep;

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

              if (currentStep) {
                currentStep = editMessageChain
                  .then(() => message.edit(channelMovedMessageHeader, fullStatusMessage))
              } else {
                editMessageChain = message.edit(channelMovedMessageHeader, fullStatusMessage);
                currentStep = editMessageChain;
              }
              currentStep = currentStep.then(message => message.delete({timeout: settings.messageCleanupDelayStatus}))
                .then(async result => {
                  this.messages.splice(this.messages.indexOf(currentAnnouncementMessage), 1);
                  await this.persist();
                });
            } else {
              const channelMessage = (message.channel.id === this.channelId) ?
                await this.getSourceChannelMessageHeader() :
                message.content;

              if (currentStep) {
                currentStep = currentStep
                  .then(() => message.edit(channelMessage, fullStatusMessage))
              } else {
                editMessageChain = message.edit(channelMessage, fullStatusMessage);
                currentStep = editMessageChain;
              }
            }
          }
        } catch (err) {
          log.error(err);
        }

        return editMessageChain;
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

  async setRoute(route) {
    this.route = route;

    await this.persist();
  }

  async getRouteEmbed() {
    let embed = new Discord.MessageEmbed(),
      current = this.currentGym || 0;

    embed.setColor('GREEN');
    let description = '';

    if (this.route && this.route.length) {
      for (let index = 0; index < this.route.length; ++index) {
        let complete = index < current ? '~~' : '',
          completeText = index < current ? ' (Completed)' : '',
          gym = await Gym.getGym(this.route[index]),
          exText = (gym.taggedEx || gym.confirmedEx) ? ' (EX Eligible)**' : '',
          exStart = (gym.taggedEx || gym.confirmedEx) ? '**' : '',
          gymName = !!gym.nickname ?
            gym.nickname :
            gym.name;

        description += (index + 1) + `. ${complete}${exStart}${gymName}${exText}${complete}${completeText}\n`;
      }

      embed.setDescription(description);
    } else {
      embed.setTitle('Route not set.');
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

  async removeLastRouteMessage(message, secondaryMessage) {
    const messageCacheId = `${message.channel.id.toString()}:${message.id.toString()}`;
    const messageCacheSecondaryId = `${secondaryMessage.channel.id.toString()}:${secondaryMessage.id.toString()}`;


    if (!!this.lastRouteMessage) {
      PartyManager.getMessage(this.lastRouteMessage)
        .then(messageResult => {
          if (messageResult.ok) {
            messageResult.message.delete();
          }
        })
        .catch(err => log.error(err));
    }

    if (!!this.lastRouteMessageSecondary) {
      PartyManager.getMessage(this.lastRouteMessageSecondary)
        .then(messageResult => {
          if (messageResult.ok) {
            messageResult.message.delete();
          }
        })
        .catch(err => log.error(err));
    }

    this.lastRouteMessage = messageCacheId;
    this.lastRouteMessageSecondary = messageCacheSecondaryId;

    await this.persist();
  }

  async removeLastTrainMovement(message, secondaryMessage) {
    const messageCacheId = `${message.channel.id.toString()}:${message.id.toString()}`;
    const messageCacheSecondaryId = `${secondaryMessage.channel.id.toString()}:${secondaryMessage.id.toString()}`;


    if (!!this.lastMovementMessage) {
      PartyManager.getMessage(this.lastMovementMessage)
        .then(messageResult => {
          if (messageResult.ok) {
            messageResult.message.delete();
          }
        })
        .catch(err => log.error(err));
    }

    if (!!this.lastMovementMessageSecondary) {
      PartyManager.getMessage(this.lastMovementMessageSecondary)
        .then(messageResult => {
          if (messageResult.ok) {
            messageResult.message.delete();
          }
        })
        .catch(err => log.error(err));
    }

    this.lastMovementMessage = messageCacheId;
    this.lastMovementMessageSecondary = messageCacheSecondaryId;

    await this.persist();
  }

  async removeRouteMessage(message) {
    if (!!this.lastRouteMessage) {
      PartyManager.getMessage(this.lastRouteMessage)
        .then(messageResult => {
          if (messageResult.ok) {
            messageResult.message.delete();
          }
        })
        .catch(err => log.error(err));
    }

    if (!!this.lastRouteMessageSecondary) {
      PartyManager.getMessage(this.lastRouteMessageSecondary)
        .then(messageResult => {
          if (messageResult.ok) {
            messageResult.message.delete();
          }
        })
        .catch(err => log.error(err));
    }

    this.lastRouteMessage = undefined;
    this.lastRouteMessageSecondary = undefined;

    await this.persist();
  }

  async getNotificationMessageHeader(memberId) {
    const raidChannel = (await PartyManager.getChannel(this.channelId)).channel,
      regionChannel = (await PartyManager.getChannel(this.sourceChannelId)).channel,
      member = this.createdById > 0 ?
        (await this.getMember(memberId)).member :
        null,
      byLine = member !== null ?
        ` by ${member.displayName}` :
        '';

    return `A new train has been announced in #${regionChannel.name}${byLine}: ${raidChannel.toString()}.`;
  }

  async saveRoute(name, message) {
    const userId = await User.getUserId(message),
          regionId = await Region.getRegionId(this.sourceChannelId);

    return DB.knex('SavedRoutes')
      .insert({
        name: name,
        gyms: this.route.join(','),
        userId: userId,
        region: regionId
      })
      .returning('id');
  }

  async getSavedRoutes(message) {
    const userId = await User.getUserId(message),
      regionId = await Region.getRegionId(this.sourceChannelId);

    return DB.knex('SavedRoutes')
      .where('region', regionId)
      .andWhere('userId', userId);
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
      endTime: this.endTime,
      nextLastRun: this.nextLastRun,
      lastRouteMessage: this.lastRouteMessage,
      lastRouteMessageSecondary: this.lastRouteMessageSecondary,
      lastMovementMessage: this.lastMovementMessage,
      lastMovementMessageSecondary: this.lastMovementMessageSecondary
    });
  }
}

module.exports = RaidTrain;
