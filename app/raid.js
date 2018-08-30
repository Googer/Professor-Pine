"use strict";

const log = require('loglevel').getLogger('Raid'),
  removeDiacritics = require('diacritics').remove,
  moment = require('moment'),
  settings = require('../data/settings'),
  {PartyStatus, PartyType} = require('./constants'),
  Discord = require('discord.js'),
  Helper = require('./helper'),
  Party = require('./party'),
  Status = require('./status'),
  TimeType = require('../types/time');

let Gym,
  PartyManager;

process.nextTick(() => {
  Gym = require('./gym');
  PartyManager = require('./party-manager');
});

class Raid extends Party {
  constructor(data = undefined) {
    super(PartyType.RAID, data);
  }

  static async createRaid(sourceChannelId, memberId, pokemon, gymId, time = TimeType.UNDEFINED_END_TIME) {
    const raidExists = PartyManager.raidExistsForGym(gymId),
      raid = raidExists ?
        PartyManager.findRaid(gymId) :
        new Raid(),
      memberStatus = await Status.getAutoStatus(memberId);

    if (!raidExists) {
      // add some extra raid data to remember
      raid.createdById = memberId;
      raid.isExclusive = !!pokemon.exclusive;
      raid.sourceChannelId = sourceChannelId;
      raid.creationTime = moment().valueOf();
      raid.lastPossibleTime = raid.creationTime + (raid.isExclusive ?
        (settings.exclusiveRaidIncubateDuration + settings.exclusiveRaidHatchedDuration) * 60 * 1000 :
        (settings.standardRaidIncubateDuration + settings.standardRaidHatchedDuration) * 60 * 1000);

      raid.pokemon = pokemon;
      raid.gymId = gymId;

      raid.groups = [{id: 'A'}];
      raid.defaultGroupId = 'A';

      raid.attendees = Object.create(Object.prototype);
    }

    if (memberStatus !== PartyStatus.NOT_INTERESTED) {
      raid.attendees[memberId] = {number: 1, status: memberStatus, group: 'A'};
    }

    if (!raidExists) {
      const sourceChannel = (await PartyManager.getChannel(sourceChannelId)).channel,
        channelName = raid.generateChannelName();

      let newChannelId;

      return sourceChannel.guild.channels.create(channelName, {
        parent: sourceChannel.parent,
        overwrites: sourceChannel.permissionOverwrites
      })
        .then(newChannel => {
          newChannelId = newChannel.id;

          PartyManager.parties[newChannelId] = raid;
          raid.channelId = newChannelId;

          // move channel to end
          return newChannel.guild.setChannelPositions([{
            channel: newChannel,
            position: newChannel.guild.channels.size - 1
          }]);
        })
        .then(async guild => {
          if (time === TimeType.UNDEFINED_END_TIME) {
            raid.endTime = TimeType.UNDEFINED_END_TIME;
            await raid.persist();
          } else {
            await raid.setRaidEndTime(time);
          }

          return {
            party: raid,
            existing: false
          };
        });
    } else {
      await raid.persist();

      return {
        party: raid,
        existing: true
      };
    }
  }

  async setIncompleteScreenshotMessage(message) {
    this.incompleteScreenshotMessage = `${this.channelId.toString()}:${message.id.toString()}`;

    await this.persist();

    return message;
  }

  async setPresentAttendeesToComplete(groupId, memberId) {
    let groupIdToFilter = undefined;

    if (!!memberId) {
      const attendee = this.attendees[memberId];

      if (attendee) {
        groupIdToFilter = attendee.group;
      }

      // set member that issued this command to complete
      this.setMemberStatus(memberId, PartyStatus.COMPLETE);
      this.refreshStatusMessages()
        .catch(err => log.error(err));
    } else {
      groupIdToFilter = groupId;
    }

    // if user just immediately said done without ever having joined the raid in the first place,
    // don't ask anyone else if they finished since they weren't part of any set group
    if (groupIdToFilter === undefined) {
      return;
    }

    const channel = (await PartyManager.getChannel(this.channelId)).channel;

    const attendees = Object.entries(this.attendees)
        .filter(([attendeeId, attendeeStatus]) => attendeeId !== memberId)
        .filter(([attendeeId, attendeeStatus]) => attendeeStatus.group === groupIdToFilter),
      memberIds = attendees
        .map(([attendeeId, attendeeStatus]) => attendeeId),
      members = await Promise.all(memberIds
        .map(async attendeeId => await this.getMember(attendeeId)))
        .catch(err => log.error(err)),
      presentMembers = members
        .filter(member => this.attendees[member.id].status === PartyStatus.PRESENT),
      timeout = settings.raidCompleteTimeout;

    if (presentMembers.length > 0) {
      const membersString = presentMembers
        .map(member => `**${member.displayName}**`)
        .reduce((prev, next) => prev + ', ' + next);

      const autocompleteMembers = [];

      channel.send(`${membersString}: Have you completed this raid?  Answer **no** within ${timeout} minutes to indicate you haven't; otherwise it will be assumed you have!`)
        .then(message => {
          Promise.all(presentMembers
            .map(presentMember => {
              this.setMemberStatus(presentMember.id, PartyStatus.COMPLETE_PENDING);

              return message.channel.awaitMessages(
                response => response.author.id === presentMember.id, {
                  max: 1,
                  time: timeout * 60 * 1000,
                  errors: ['time']
                })
                .then(collectedResponses => {
                  let confirmation, response;

                  if (collectedResponses && collectedResponses.size === 1) {
                    response = collectedResponses.first();

                    const commandPrefix = this.client.options.commandPrefix,
                      userResponse = response.content.toLowerCase().trim(),
                      isCommand = userResponse.startsWith(commandPrefix);

                    if (isCommand) {
                      // don't try to process response
                      return true;
                    }

                    confirmation = this.client.registry.types.get('boolean').truthy.has(userResponse);
                  } else {
                    confirmation = false;
                  }

                  if (confirmation) {
                    response.react(Helper.getEmoji(settings.emoji.thumbsUp) || '👍')
                      .catch(err => log.error(err));

                    this.setMemberStatus(presentMember.id, PartyStatus.COMPLETE);

                    this.refreshStatusMessages()
                      .catch(err => log.error(err));
                  } else {
                    response.react(Helper.getEmoji(settings.emoji.thumbsDown) || '👎')
                      .catch(err => log.error(err));

                    this.setMemberStatus(presentMember.id, PartyStatus.PRESENT);
                  }

                  return Promise.resolve(true);
                })
                .catch(collectedResponses => {
                  // defensive check that raid in fact still exists
                  if (!!PartyManager.getParty(this.channelId)) {
                    // check that user didn't already set their status to something else (via running another command during the collection period)
                    if (this.getMemberStatus(presentMember.id) === PartyStatus.COMPLETE_PENDING) {
                      autocompleteMembers.push(presentMember);

                      // set user status to complete
                      this.setMemberStatus(presentMember.id, PartyStatus.COMPLETE);
                    }
                  }

                  return Promise.resolve(true);
                });
            }))
            .then(() => {
              // defensive check that raid in fact still exists
              if (!!PartyManager.getParty(this.channelId)) {
                this.refreshStatusMessages()
                  .catch(err => log.error(err));

                if (autocompleteMembers.length > 0) {
                  const membersString = autocompleteMembers
                    .map(member => `**${member.displayName}**`)
                    .reduce((prev, next) => prev + ', ' + next);

                  message.channel
                    .send(`${membersString}: I am assuming you *have* completed this raid.`)
                    .catch(err => log.error(err));
                }
              }
            })
        });
    }
  }

  async setHatchTime(hatchTime) {
    let endTime;

    if (this.pokemon.duration) {
      endTime = hatchTime + (this.pokemon.duration * 60 * 1000);
    }
    if (this.isExclusive) {
      endTime = hatchTime + (settings.exclusiveRaidHatchedDuration * 60 * 1000);
    } else {
      endTime = hatchTime + (settings.standardRaidHatchedDuration * 60 * 1000);
    }

    this.hatchTime = hatchTime;
    this.endTime = endTime;

    // update or delete screenshot if all information has now been set
    if (this.incompleteScreenshotMessage) {
      if (this.timeWarn) {
        delete this.timeWarn;
      }

      PartyManager.getMessage(this.incompleteScreenshotMessage)
        .then(messageResult => {
          if (messageResult.ok) {
            const message = messageResult.message;

            if (!this.pokemon || (this.pokemon && this.pokemon.placeholder)) {
              message.edit(this.getIncompleteScreenshotMessage())
                .catch(err => log.error(err));
            } else {
              message.delete()
                .catch(err => log.error(err));
              delete this.incompleteScreenshotMessage;
            }
          }
        })
        .catch(err => log.error(err));
    }

    await this.persist();

    return {party: this};
  }

  async setMeetingTime(memberId, startTime) {
    const member = this.attendees[memberId];

    if (!member) {
      return {error: 'You are not signed up for this raid!'};
    }

    const group = this.groups
      .find(group => group.id === member.group);

    group.startTime = startTime;

    // delete start clear time if there is one
    if (group.startClearTime) {
      delete group.startClearTime;
    }

    await this.persist();

    return {party: this};
  }

  async setEndTime(endTime) {
    let hatchTime;

    if (this.pokemon.duration) {
      hatchTime = endTime - (this.pokemon.duration * 60 * 1000);
    } else if (this.isExclusive) {
      hatchTime = endTime - (settings.exclusiveRaidHatchedDuration * 60 * 1000);
    } else {
      hatchTime = endTime - (settings.standardRaidHatchedDuration * 60 * 1000);
    }

    this.hatchTime = hatchTime;
    this.endTime = endTime;

    // update or delete screenshot if all information has now been set
    if (this.incompleteScreenshotMessage) {
      delete this.timeWarn;

      PartyManager.getMessage(this.incompleteScreenshotMessage)
        .then(messageResult => {
          if (messageResult.ok) {
            const message = messageResult.message;

            if (!this.pokemon || (this.pokemon && this.pokemon.placeholder)) {
              message.edit(this.getIncompleteScreenshotMessage())
                .catch(err => log.error(err));
            } else {
              message.delete()
                .catch(err => log.error(err));
              delete this.incompleteScreenshotMessage;
            }
          }
        })
        .catch(err => log.error(err));
    }

    await this.persist();

    return {party: this};
  }

  async setPokemon(pokemon) {
    this.pokemon = pokemon;
    this.isExclusive = !!pokemon.exclusive;

    // update or delete screenshot if all information has now been set
    if (this.incompleteScreenshotMessage) {
      PartyManager.getMessage(this.incompleteScreenshotMessage)
        .then(messageResult => {
          if (messageResult.ok) {
            const message = messageResult.message;

            if (!this.hatchTime && this.endTime === TimeType.UNDEFINED_END_TIME) {
              message.edit(this.getIncompleteScreenshotMessage())
                .catch(err => log.error(err));
            } else {
              message.delete()
                .catch(err => log.error(err));
              delete this.incompleteScreenshotMessage;
            }
          }
        })
        .catch(err => log.error(err));
    }

    this.lastPossibleTime = Math.max(this.creationTime + (pokemon.duration ?
      (pokemon.incubation + pokemon.duration) * 60 * 1000 : this.isExclusive ?
        (settings.exclusiveRaidIncubateDuration + settings.exclusiveRaidHatchedDuration) * 60 * 1000 :
        (settings.standardRaidIncubateDuration + settings.standardRaidHatchedDuration) * 60 * 1000),
      this.lastPossibleTime);

    await this.setEndTime(this.endTime);

    const newChannelName = this.generateChannelName();

    PartyManager.getChannel(this.channelId)
      .then(channelResult => {
        if (channelResult.ok) {
          return channelResult.channel.setName(newChannelName);
        }
      })
      .catch(err => log.error(err));

    return {party: this};
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

  static async getRaidsFormattedMessage(channelId) {
    const raids = PartyManager.getAllParties(channelId, PartyType.RAID);

    if (!raids || raids.length === 0) {
      return 'No raids exist for this channel.  Create one with \`!raid\`!';
    }

    const raidStrings = await Promise.all(raids
        .map(async raid => await raid.getShortMessage())),
      filteredRaidStrings = raidStrings
        .filter(raidString => {
          return raidString !== '';
        });

    if (filteredRaidStrings.length === 0) {
      return 'No raids exist for this channel.  Create one with \`!raid\`!';
    }

    return filteredRaidStrings.join('\n');
  }

  getShortMessage() {
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

  getChannelMessageHeader() {
    return PartyManager.getChannel(this.channelId)
      .then(channelResult => channelResult.ok ?
        `Use ${channelResult.channel.toString()} for the following raid:` :
        '')
      .catch(err => log.error(err));
  }

  async getNotificationMessage(memberId) {
    const raidChannel = (await PartyManager.getChannel(this.channelId)).channel,
      regionChannel = (await PartyManager.getChannel(this.sourceChannelId)).channel,
      pokemonName = this.pokemon.name ?
        this.pokemon.name.charAt(0).toUpperCase() + this.pokemon.name.slice(1) :
        `a level ${this.pokemon.tier} boss`,
      gym = Gym.getGym(this.gymId),
      gymName = !!gym.nickname ?
        gym.nickname :
        gym.gymName,
      member = (await this.getMember(memberId)).member;

    return `A raid for ${pokemonName} has been announced at ${gymName} (#${regionChannel.name}) by ${member.displayName}: ${raidChannel.toString()}.`;
  }

  async getExChannelMessageHeader() {
    const raidChannel = (await PartyManager.getChannel(this.channelId)).channel,
      regionChannel = (await PartyManager.getChannel(this.sourceChannelId)).channel;

    return `A raid at a potential EX gym has been announced: ${raidChannel.toString()} - ` +
      `it resides in ${regionChannel.toString()}.`;
  }

  getSourceChannelMessageHeader() {
    return PartyManager.getChannel(this.sourceChannelId)
      .then(channelResult => channelResult.ok ?
        `Use ${channelResult.channel.toString()} to return to this raid\'s regional channel.` :
        '')
      .catch(err => log.error(err));
  }

  createPotentialExRaidMessage() {
    PartyManager.getChannel(this.channelId)
      .then(async channelResult => {
        if (channelResult.ok) {
          const raidChannel = channelResult.channel;

          const exRaidChannel = Helper.getExRaidAnnounceChannel(raidChannel.guild);

          if (exRaidChannel) {
            const raidChannelMessage = await this.getExChannelMessageHeader(),
              formattedMessage = await this.getFullStatusMessage();

            return exRaidChannel.send(raidChannelMessage, formattedMessage)
              .then(exRaidStatusMessage => PartyManager.addMessage(this.channelId, exRaidStatusMessage))
          }
        }
      })
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

  async getFullStatusMessage() {
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
              formattedMessage = await this.getFullStatusMessage();

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
                await this.getSourceChannelMessageHeader() :
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
      const raidChannelMessage = await this.getChannelMessageHeader(),
        formattedMessage = await this.getFullStatusMessage(),
        newSourceChannel = (await PartyManager.getChannel(this.sourceChannelId)).channel;

      newSourceChannel.send(raidChannelMessage, formattedMessage)
        .then(announcementMessage => PartyManager.addMessage(this.channelId, announcementMessage, true))
        .catch(err => log.error(err));

      await this.persist();
    }
  }

  generateChannelName() {
    const nonCharCleaner = new RegExp(/[^\w]/, 'g'),
      pokemonName = (this.isExclusive ?
        'ex raid' :
        !!this.pokemon.name ?
          this.pokemon.name :
          `tier ${this.pokemon.tier}`)
        .replace(nonCharCleaner, ' ')
        .split(' ')
        .filter(token => token.length > 0)
        .join('-'),
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
      isExclusive: this.isExclusive,
      lastPossibleTime: this.lastPossibleTime,
      pokemon: this.pokemon,
      gymId: this.gymId
    });
  }
}

module.exports = Raid;