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

  static async createRaidTrain(sourceChannelId, memberId) {
    const train = new RaidTrain(PartyManager);

    // add some extra train data to remember
    train.createdById = memberId;
    train.sourceChannelId = sourceChannelId;
    train.creationTime = moment().valueOf();

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
    const pokemon = this.isExclusive ?
      'EX Raid' :
      this.pokemon.name ?
        this.pokemon.name.charAt(0).toUpperCase() + this.pokemon.name.slice(1) :
        'Tier ' + this.pokemon.tier,
      gym = Gym.getGym(this.gymId),
      gymName = (!!gym.nickname ?
        gym.nickname :
        gym.gymName),
      totalAttendees = this.getAttendeeCount(),
      calendarFormat = {
        sameDay: 'LT',
        sameElse: 'l LT'
      },
      endTime = this.endTime !== TimeType.UNDEFINED_END_TIME ?
        ` :: Ends at **${moment(this.endTime).calendar(null, calendarFormat)}**` :
        '';

    return PartyManager.getChannel(this.channelId)
      .then(channelResult => channelResult.ok ?
        `**${pokemon}**\n` +
        `${channelResult.channel.toString()} :: ${gymName} :: **${totalAttendees}** potential trainer${totalAttendees !== 1 ? 's' : ''}${endTime}\n` :
        '')
      .catch(err => {
        log.error(err);
        return '';
      });
  }

  getTrainChannelMessage() {
    return PartyManager.getChannel(this.channelId)
      .then(channelResult => channelResult.ok ?
        `Use ${channelResult.channel.toString()} for the following raid:` :
        '')
      .catch(err => log.error(err));
  }

  async getTrainNotificationMessage(memberId) {
    const raidChannel = (await PartyManager.getChannel(this.channelId)).channel,
      regionChannel = (await PartyManager.getChannel(this.sourceChannelId)).channel,
      pokemonName = this.pokemon.name ?
        this.pokemon.name.charAt(0).toUpperCase() + this.pokemon.name.slice(1) :
        `a level ${this.pokemon.tier} boss`,
      gym = Gym.getGym(this.gymId),
      gymName = !!gym.nickname ?
        gym.nickname :
        gym.gymName,
      member = await this.getMember(memberId);

    return `A raid for ${pokemonName} has been announced at ${gymName} (#${regionChannel.name}) by ${member.displayName}: ${raidChannel.toString()}.`;
  }

  async getTrainExChannelMessage() {
    const raidChannel = (await PartyManager.getChannel(this.channelId)).channel,
      regionChannel = (await PartyManager.getChannel(this.sourceChannelId)).channel;

    return `A raid at a potential EX gym has been announced: ${raidChannel.toString()} - ` +
      `it resides in ${regionChannel.toString()}.`;
  }

  getTrainSourceChannelMessage() {
    return PartyManager.getChannel(this.sourceChannelId)
      .then(channelResult => channelResult.ok ?
        `Use ${channelResult.channel.toString()} to return to this raid\'s regional channel.` :
        '')
      .catch(err => log.error(err));
  }

  getIncompleteScreenshotMessage() {
    let message = '';

    if (!this.pokemon || (this.pokemon && this.pokemon.placeholder)) {
      message += '\n\n**Pokemon** could not be determined, please help set the pokemon by typing \`!pokemon <name>\`';
    }

    log.debug(this.hatchTime, this.endTime, TimeType.UNDEFINED_END_TIME);
    if (!this.hatchTime && this.endTime === TimeType.UNDEFINED_END_TIME) {
      message += '\n\n**Time** could not be determined, please help set the time by typing either \`!hatch <time>\` or \`!end <time>\`';
    } else if (this.timeWarn) {
      message += '\n\n**Time** could not be determined precisely, please help set the time by typing either \`!hatch <time>\` or \`!end <time>\`';
    }

    return message;
  }

  async getFormattedMessage() {
    const pokemon = !!this.pokemon.name ?
      this.pokemon.name.charAt(0).toUpperCase() + this.pokemon.name.slice(1) :
      '????',
      pokemonUrl = !!this.pokemon.url ?
        this.pokemon.url :
        '',
      pokemonCPString = this.pokemon.bossCP > 0 ?
        `${this.pokemon.minBaseCP}-${this.pokemon.maxBaseCP} / ` +
        `${this.pokemon.minBoostedCP}-${this.pokemon.maxBoostedCP} ${this.pokemon.boostedConditions.boosted
          .map(condition => Helper.getEmoji(condition))
          .join('')}` :
        '',

      raidDescription = this.isExclusive ?
        `EX Raid against ${pokemon}` :
        `Level ${this.pokemon.tier} Raid against ${pokemon}`,

      now = moment(),

      calendarFormat = {
        sameDay: 'LT',
        sameElse: 'l LT'
      },

      reportingMember = (await this.getMember(this.createdById)).member,
      raidReporter = `originally reported by ${reportingMember.displayName}`,

      endTime = this.endTime !== TimeType.UNDEFINED_END_TIME ?
        `Raid available until ${moment(this.endTime).calendar(null, calendarFormat)}, ` :
        'Raid end time currently unset, ',
      hatchTime = !!this.hatchTime ?
        moment(this.hatchTime) :
        '',
      hatchLabel = !!this.hatchTime ?
        now > hatchTime ?
          '__Egg Hatched At__' :
          '__Egg Hatch Time__' :
        '',

      gym = Gym.getGym(this.gymId),
      gymName = !!gym.nickname ?
        gym.nickname :
        gym.gymName,
      gymUrl = `https://www.google.com/maps/search/?api=1&query=${gym.gymInfo.latitude}%2C${gym.gymInfo.longitude}`,
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
      completeAttendees = sortedAttendees
        .filter(attendeeEntry => attendeeEntry[1].status === PartyStatus.COMPLETE),
      embed = new Discord.MessageEmbed();

    embed.setColor('GREEN');
    embed.setTitle(`Map Link: ${gymName}`);
    embed.setURL(gymUrl);
    embed.setDescription(raidDescription);

    if (pokemonUrl !== '') {
      embed.setThumbnail(pokemonUrl);
    }

    if (this.pokemon.weakness && this.pokemon.weakness.length > 0) {
      embed.addField('**Weaknesses**', this.pokemon.weakness
        .map(weakness => Helper.getEmoji(weakness.type).toString() +
          (weakness.multiplier > 1.5 ?
            'x2 ' :
            ''))
        .join(''));
    }

    if (pokemonCPString) {
      embed.addField('**Catch CP Ranges**', pokemonCPString);
    }

    embed.setFooter(endTime + raidReporter, reportingMember.user.displayAvatarURL());

    this.groups
      .forEach(group => {
        const startTime = !!group.startTime ?
          moment(group.startTime) :
          '',
          totalAttendees = this.getAttendeeCount(group.id);

        let groupLabel = `__Group ${group.id}__`;

        if (!!group.label) {
          const truncatedLabel = group.label.length > 150 ?
            group.label.substring(0, 149).concat('…') :
            group.label;

          groupLabel += `: ${truncatedLabel}`;
        }

        let groupDescription = `Trainers: ${totalAttendees.toString()}`;

        if (!!group.startTime) {
          groupDescription += ` :: Meeting ⏰: **${startTime.calendar(null, calendarFormat)}**`;
        }

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

    if (completeAttendees.length > 0) {
      embed.addField('__Complete__', Party.buildAttendeesList(completeAttendees, 'premierball', totalAttendeeCount));
    }

    if (!!this.hatchTime) {
      embed.addField(hatchLabel, hatchTime.calendar(null, calendarFormat));
    }

    let additionalInformation = '';

    if (!this.isExclusive) {
      if (gym.is_ex) {
        additionalInformation += 'Confirmed EX Raid location.';
      } else if (gym.is_park) {
        additionalInformation += 'Potential EX Raid location - This gym is located in a park.';
      }
    }

    if (!!gym.additional_information) {
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
              formattedMessage = await this.getFormattedMessage();

            if (messageCacheId === currentAnnouncementMessage && replaceAnnouncementMessage) {
              // replace header of old announcement status message and schedule its deletion
              const raidChannel = (await PartyManager.getChannel(this.channelId)).channel,
                newSourceChannel = (await PartyManager.getChannel(this.sourceChannelId)).channel,
                channelMessage = `${raidChannel} has been moved to ${newSourceChannel}.`;

              message.edit(channelMessage, formattedMessage)
                .then(message => message.delete({timeout: settings.messageCleanupDelayStatus}))
                .then(async result => {
                  this.messages.splice(this.messages.indexOf(currentAnnouncementMessage), 1);
                  await this.persist();
                })
                .catch(err => log.error(err));
            } else {
              const channelMessage = (message.channel.id === this.channelId) ?
                await this.getTrainSourceChannelMessage() :
                message.content;

              message.edit(channelMessage, formattedMessage)
                .catch(err => log.error(err));
            }

          }
        } catch (err) {
          log.error(err);
        }
      });

    if (replaceAnnouncementMessage) {
      // Send new announcement message to new source channel
      const raidChannelMessage = await this.getTrainChannelMessage(),
        formattedMessage = await this.getFormattedMessage(),
        newSourceChannel = (await PartyManager.getChannel(this.sourceChannelId)).channel;

      newSourceChannel.send(raidChannelMessage, formattedMessage)
        .then(announcementMessage => PartyManager.addMessage(this.channelId, announcementMessage, true))
        .catch(err => log.error(err));

      await this.persist();
    }
  }

  generateChannelName() {
    const nonCharCleaner = new RegExp(/[^\w]/, 'g'),
      gym = Gym.getGym(this.gymId),
      gymName = (!!gym.nickname ?
        removeDiacritics(gym.nickname) :
        removeDiacritics(gym.gymName))
        .toLowerCase()
        .replace(nonCharCleaner, ' ')
        .split(' ')
        .filter(token => token.length > 0)
        .join('-');

    return pokemonName + '-' + gymName;
  }

  toJSON() {
    return Object.assign(super.toJSON(), {
      gymId: this.gymId
    });
  }
}

module.exports = RaidTrain;