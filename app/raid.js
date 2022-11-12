"use strict";

const log = require('loglevel').getLogger('Raid'),
  removeDiacritics = require('diacritics').remove,
  AsyncLock = require('async-lock'),
  moment = require('moment'),
  settings = require('../data/settings'),
  {PartyStatus, PartyType} = require('./constants'),
  Discord = require('discord.js'),
  Helper = require('./helper'),
  Moves = require('./moves'),
  Pokemon = require('./pokemon'),
  Party = require('./party'),
  Status = require('./status'),
  Privacy = require('./privacy'),
  text = require('../data/text'),
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

  static async createRaid(sourceChannelId, memberId, pokemon, gymId, isExclusive, isElite, time = TimeType.UNDEFINED_END_TIME) {
    return Raid.lock.acquire(gymId, async () => {
      const raidExists = PartyManager.raidExistsForGym(gymId, isExclusive, isElite),
        raid = raidExists ?
          PartyManager.findRaid(gymId, isExclusive, isElite) :
          new Raid(),
        memberStatus = await Status.getAutoStatus(memberId),
        memberPrivacy = await Privacy.getPrivacyStatus(memberId);

      if (!raidExists) {
        if (pokemon.name === undefined || pokemon.name === 'mega' || pokemon.name === 'elite') {
          let defaultBoss = await Pokemon.getDefaultTierBoss(!!pokemon.exclusive ?
            'ex' :
            !!pokemon.elite ?
              'elite' :
              !!pokemon.mega ?
                'mega' :
                pokemon.tier);

          if (!!defaultBoss) {
            pokemon = defaultBoss;
            raid.defaulted = true;
          }
        } else {
          if (pokemon.quickMoves && pokemon.quickMoves.length === 1) {
            raid.quickMove = pokemon.quickMoves[0];
          }

          if (pokemon.cinematicMoves && pokemon.cinematicMoves.length === 1) {
            raid.cinematicMove = pokemon.cinematicMoves[0];
          }
        }

        // add some extra raid data to remember
        raid.createdById = memberPrivacy ?
          -1 :
          memberId;
        raid.originallyCreatedBy = memberId;
        raid.isExclusive = !!pokemon.exclusive;
        raid.isElite = !!pokemon.elite;
        raid.isMega = !!pokemon.mega;
        raid.sourceChannelId = sourceChannelId;
        raid.creationTime = moment().valueOf();
        raid.lastPossibleTime = raid.creationTime + (raid.isExclusive ?
          (settings.exclusiveRaidIncubateDuration + settings.exclusiveRaidHatchedDuration) * 60 * 1000 :
          raid.isElite ?
            (settings.eliteRaidIncubateDuration + settings.eliteRaidHatchedDuration) * 60 * 1000 :
            (settings.standardRaidIncubateDuration + settings.standardRaidHatchedDuration) * 60 * 1000);

        raid.pokemon = pokemon;
        raid.gymId = gymId;

        raid.groups = [{id: 'A'}];
        raid.defaultGroupId = 'A';

        raid.attendees = Object.create(Object.prototype);
      }

      if (memberStatus !== PartyStatus.NOT_INTERESTED) {
        raid.attendees[memberId] = {number: 1, status: memberStatus, group: raid.defaultGroupId};
      }

      if (!raidExists) {
        const sourceChannel = (await PartyManager.getChannel(sourceChannelId)).channel,
          channelName = await raid.generateChannelName();

        let newChannelId;

        return sourceChannel.guild.channels.create(channelName, {
          type: 'text',
          parent: sourceChannel.parent,
          overwrites: sourceChannel.permissionOverwrites
        })
          .then(newChannel => {
            newChannelId = newChannel.id;

            PartyManager.parties[newChannelId] = raid;
            raid.channelId = newChannelId;

            return PartyManager.orderChannels(raid);
          })
          .then(async guild => {
            if (time === TimeType.UNDEFINED_END_TIME) {
              raid.endTime = TimeType.UNDEFINED_END_TIME;
              await raid.persist();
            } else {
              await raid.setEndTime(time);
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
          existing: true,
          memberStatus: memberStatus
        };
      }
    });
  }

  static async getRaidsFormattedMessage(channelId) {
    const raids = PartyManager.getAllParties(channelId, PartyType.RAID)
        .filter(raid => !!!raid.isExclusive)
        .sort((raidA, raidB) => {
          const timeA = !!raidA.endTime ?
              raidA.endTime :
              raidA.lastPossibleTime,
            timeB = !!raidB.endTime ?
              raidB.endTime :
              raidB.lastPossibleTime;

          return timeA - timeB;
        }),
      summaryFields = (await Promise.all(raids.map(async raid => await raid.getSummaryField())))
        .filter(summaryField => summaryField !== ''),
      groupedRaids = Object.create(null);

    summaryFields
      .forEach(summaryField => {
        const pokemon = summaryField.name,
          field = summaryField.value,
          fields = groupedRaids[pokemon];

        if (!fields) {
          groupedRaids[pokemon] = [field];
        } else {
          fields.push(field);
        }
      });

    if (Object.keys(groupedRaids).length === 0) {
      return 'No non-EX raids exist for this channel.  Create one with \`!raid\`!';
    }

    const embed = new Discord.MessageEmbed();
    embed.setColor('GREEN');
    embed.setTitle('Currently Active Raids');

    Object.keys(groupedRaids).sort()
      .forEach(pokemon => embed.addField(pokemon, groupedRaids[pokemon].join('\n')));

    return embed;
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
      members = (await Promise.all(memberIds
        .map(async memberId => await this.getMember(memberId))))
        .filter(member => member.ok === true)
        .map(member => member.member),
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

                    let userResponse = response.content.toLowerCase().trim();

                    const commandPrefix = message.client.options.commandPrefix,
                      isCommand = userResponse.startsWith(commandPrefix),
                      doneAliases = ['done', 'complete', 'finished', 'finish', 'caught-it', 'got-it', 'missed-it', 'donr',
                        'caughtit', 'gotit', 'missedit', 'caught it', 'got it', 'missed it', 'i missed it',
                        'it ran', 'i got it'];

                    if (isCommand) {
                      let doneCommand = false;

                      doneAliases.forEach(alias => {
                        if (userResponse.indexOf(alias) !== -1) {
                          doneCommand = true;
                        }
                      });

                      if (!doneCommand) {
                        // don't try to process response
                        return true;
                      }

                      userResponse = userResponse.substr(1).trim();
                    }

                    confirmation = message.client.registry.types.get('boolean').truthy.has(userResponse) || doneAliases.indexOf(userResponse) !== -1;
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

    const hatchTimeMoment = moment(hatchTime);
    hatchTimeMoment.seconds(0);
    hatchTimeMoment.milliseconds(0);
    hatchTime = hatchTimeMoment.valueOf();

    if (this.duration) {
      endTime = hatchTime + this.duration * 60 * 1000;
    } else if (this.isExclusive) {
      endTime = hatchTime + (settings.exclusiveRaidHatchedDuration * 60 * 1000);
    } else if (this.isElite) {
      endTime = hatchTime + (settings.eliteRaidHatchedDuration * 60 * 1000);
    } else {
      endTime = hatchTime + (settings.standardRaidHatchedDuration * 60 * 1000);
    }

    const oldHatchTime = this.hatchTime;

    this.hatchTime = hatchTime;
    this.endTime = endTime;

    // update or delete screenshot if all information has now been set
    if (this.incompleteScreenshotMessage) {
      if (this.timeWarn && oldHatchTime !== hatchTime) {
        delete this.timeWarn;
      }

      PartyManager.getMessage(this.incompleteScreenshotMessage)
        .then(messageResult => {
          if (messageResult.ok) {
            const message = messageResult.message;

            if (this.timeWarn || !this.pokemon || (this.pokemon && this.pokemon.placeholder)) {
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

    const newChannelName = await this.generateChannelName();

    await PartyManager.getChannel(this.channelId)
      .then(channelResult => {
        if (channelResult.ok) {
          return channelResult.channel.setName(newChannelName);
        }
      })
      .catch(err => log.error(err));

    await this.persist();

    PartyManager.orderChannels(this)
      .catch(err => log.error(err));

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

  async cancelMeetingTime(memberId) {
    const member = this.attendees[memberId];

    if (!member) {
      return {error: 'You are not signed up for this raid!'};
    }

    const group = this.groups
      .find(group => group.id === member.group);

    delete group.startTime;
    // delete start clear time if there is one
    if (group.startClearTime) {
      delete group.startClearTime;
    }

    await this.persist();
    return {party: this};
  }

  async setEndTime(endTime) {
    let hatchTime;

    if (this.duration) {
      hatchTime = endTime - (this.duration * 60 * 1000);
    } else if (this.isExclusive) {
      hatchTime = endTime - (settings.exclusiveRaidHatchedDuration * 60 * 1000);
    } else if (this.isElite) {
      hatchTime = endTime - (settings.eliteRaidHatchedDuration * 60 * 1000);
    } else {
      hatchTime = endTime - (settings.standardRaidHatchedDuration * 60 * 1000);
    }

    const oldEndTime = this.endTime;

    this.hatchTime = hatchTime;
    this.endTime = endTime;

    // update or delete screenshot if all information has now been set
    if (this.incompleteScreenshotMessage) {
      if (this.timeWarn && oldEndTime !== endTime) {
        delete this.timeWarn;
      }

      PartyManager.getMessage(this.incompleteScreenshotMessage)
        .then(messageResult => {
          if (messageResult.ok) {
            const message = messageResult.message;

            if (this.timeWarn || !this.pokemon || (this.pokemon && this.pokemon.placeholder)) {
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

    const newChannelName = await this.generateChannelName();

    await PartyManager.getChannel(this.channelId)
      .then(channelResult => {
        if (channelResult.ok) {
          return channelResult.channel.setName(newChannelName);
        }
      })
      .catch(err => log.error(err));

    await this.persist();

    PartyManager.orderChannels(this)
      .catch(err => log.error(err));

    return {party: this};
  }

  async setDuration(duration) {
    this.duration = duration;

    if (this.hatchTime) {
      this.endTime = this.hatchTime + this.duration * 60 * 1000;
    }

    const newChannelName = await this.generateChannelName();

    await PartyManager.getChannel(this.channelId)
      .then(channelResult => {
        if (channelResult.ok) {
          return channelResult.channel.setName(newChannelName);
        }
      })
      .catch(err => log.error(err));

    await this.persist();

    return {party: this};
  }

  async setMoveset(moveset) {
    if (!!moveset.quick) {
      this.quickMove = moveset.quick;
    }

    if (!!moveset.cinematic) {
      this.cinematicMove = moveset.cinematic;
    }

    await this.persist();

    return {party: this};
  }

  async setPokemon(pokemon) {
    this.pokemon = pokemon;
    this.isExclusive = !!pokemon.exclusive;
    this.isElite = !!pokemon.elite;
    this.isMega = !!pokemon.mega;

    // clear any set moves
    delete this.quickMove;
    delete this.cinematicMove;

    if (pokemon.quickMoves && pokemon.quickMoves.length === 1) {
      this.quickMove = pokemon.quickMoves[0];
    }

    if (pokemon.cinematicMoves && pokemon.cinematicMoves.length === 1) {
      this.cinematicMove = pokemon.cinematicMoves[0];
    }

    // update or delete screenshot if all information has now been set
    if (this.incompleteScreenshotMessage) {
      await PartyManager.getMessage(this.incompleteScreenshotMessage)
        .then(messageResult => {
          if (messageResult.ok) {
            const message = messageResult.message;

            if (this.timeWarn || this.endTime === TimeType.UNDEFINED_END_TIME) {
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

    this.lastPossibleTime = Math.max(this.creationTime + (this.duration ?
      (settings.standardRaidIncubateDuration + this.duration) * 60 * 1000 : this.isExclusive ?
        (settings.exclusiveRaidIncubateDuration + settings.exclusiveRaidHatchedDuration) * 60 * 1000 :
        this.isElite ?
          (settings.eliteRaidIncubateDuration + settings.eliteRaidHatchedDuration) * 60 * 1000 :
          (settings.standardRaidIncubateDuration + settings.standardRaidHatchedDuration) * 60 * 1000),
      this.lastPossibleTime);

    if (this.endTime !== TimeType.UNDEFINED_END_TIME) {
      await this.setEndTime(this.endTime);
    }

    const newChannelName = await this.generateChannelName();

    await PartyManager.getChannel(this.channelId)
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

    const newChannelName = await this.generateChannelName();

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

  async getSummaryField() {
    const pokemonName = this.pokemon.name ?
        this.pokemon.name.charAt(0).toUpperCase() + this.pokemon.name.slice(1) :
        '',
      pokemon = this.isExclusive ?
        'EX Raid' :
        this.isElite ?
          'Elite Raid' :
          pokemonName.length > 0 ?
            pokemonName :
            'Tier ' + this.pokemon.tier,
      gym = await Gym.getGym(this.gymId),
      gymName = (!!gym.nickname ?
        gym.nickname :
        gym.name),
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
        Object.assign({}, {
          name: pokemon,
          value: `${channelResult.channel.toString()} :: ${gymName} :: **${totalAttendees}** potential trainer${totalAttendees !== 1 ? 's' : ''}${endTime}`
        }) :
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

  async getNotificationMessageHeader(memberId) {
    const raidChannel = (await PartyManager.getChannel(this.channelId)).channel,
      regionChannel = (await PartyManager.getChannel(this.sourceChannelId)).channel,
      pokemonName = this.pokemon.name ?
        this.pokemon.name.charAt(0).toUpperCase() + this.pokemon.name.slice(1) :
        `a level ${this.pokemon.tier} boss`,
      gym = await Gym.getGym(this.gymId),
      gymName = !!gym.nickname ?
        gym.nickname :
        gym.name,
      member = this.createdById > 0 ?
        (await this.getMember(memberId)).member :
        null,
      byLine = member !== null ?
        ` by ${member.displayName}` :
        '';

    return `A raid for ${pokemonName} has been announced at ${gymName} (#${regionChannel.name})${byLine}: ${raidChannel.toString()}.`;
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

  createRemoteRaidChannelMessage() {
    PartyManager.getChannel(this.channelId)
      .then(async channelResult => {
        if (channelResult.ok) {
          const raidChannel = channelResult.channel;

          const remoteRaidAnnounceChannel = Helper.getRemoteRaidAnnounceChannel(raidChannel.guild);

          if (remoteRaidAnnounceChannel) {
            const formattedMessage = await this.getFullStatusMessage();

            return remoteRaidAnnounceChannel.send(formattedMessage)
              .then(remoteRaidStatusMessage => PartyManager.addMessage(this.channelId, remoteRaidStatusMessage))
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

    if (this.endTime === TimeType.UNDEFINED_END_TIME) {
      message += '\n\n**Time** could not be determined, please help set the time by typing either \`!hatch <time>\` or \`!end <time>\`';
    } else if (this.timeWarn) {
      message += '\n\n**Time** could not be determined precisely, please help set the time by typing either \`!hatch <time>\` or \`!end <time>\`';
    }

    return message;
  }

  async getFullStatusMessage() {
    const pokemon = !!this.pokemon.name && this.pokemon.name !== 'mega' ?
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
      pokemonQuickMove = !!this.quickMove ?
        Moves.getFriendlyName(this.quickMove) :
        '????',
      pokemonCinematicMove = !!this.cinematicMove ?
        Moves.getFriendlyName(this.cinematicMove) :
        '????',
      raidDescription = this.isExclusive ?
        `EX Raid against ${pokemon}` :
        this.isElite ?
          `Elite Raid against ${pokemon}` :
          this.isMega ?
            `Mega Raid against ${pokemon}` :
            `Level ${this.pokemon.tier} Raid against ${pokemon}`,

      now = moment(),

      calendarFormat = {
        sameDay: 'LT',
        sameElse: 'l LT'
      },

      reportingMember = (this.createdById >= 0) ?
        (await this.getMember(this.createdById)).member :
        {displayName: '????'},

      endTime = this.endTime !== TimeType.UNDEFINED_END_TIME ?
        text.raid.time.remaining.replace("${time}", moment(this.endTime).calendar(null, calendarFormat)) :
        text.raid.time.unset,
      hatchTime = !!this.hatchTime ?
        moment(this.hatchTime) :
        '',
      hatchLabel = !!this.hatchTime ?
        now > hatchTime ?
          '__Egg Hatched At__' :
          '__Egg Hatch Time__' :
        '',
      hatchStage = this.getHatchStage(),
      gym = await Gym.getGym(this.gymId),
      gymName = !!gym.nickname ?
        gym.nickname :
        gym.name,
      gymUrl = `https://www.google.com/maps/search/?api=1&query=${gym.lat}%2C${gym.lon}`,
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

      embedColors = {
        2: 'GREEN',
        3: '#ff0000'
      },
      embed = new Discord.MessageEmbed();

    if (hatchStage !== 1) {
      embed.setColor(embedColors[hatchStage]);
    }

    embed.setTitle(`Map Link: ${gymName}`);
    embed.setURL(gymUrl);

    const shiny = !!this.pokemon && this.pokemon.shiny ?
      Helper.getEmoji(settings.emoji.shiny).toString() || '✨' :
      '';
    embed.setDescription(raidDescription + shiny);

    if (pokemonUrl !== '') {
      embed.setThumbnail(pokemonUrl);
    }

    let pokemonDataContent = '';

    if (this.pokemon.weakness && this.pokemon.weakness.length > 0) {
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

    if (pokemon !== '????' && (settings.showUnknownMoves || pokemonQuickMove !== '????' || pokemonCinematicMove !== '????')) {
      if (pokemonDataContent) {
        pokemonDataContent += '\n\n';
      }

      pokemonDataContent += '**Moveset (Fast / Charge)**\n';
      pokemonDataContent += `${pokemonQuickMove} / ${pokemonCinematicMove}`;
    }

    if (pokemonDataContent !== '') {
      embed.addField('**Pokémon Information**', pokemonDataContent);
    }

    embed.setFooter(text.raid.footer.replace("${timeFooter}", endTime).replace("${member}", reportingMember.displayName),
      (!!reportingMember && reportingMember.displayName !== '????') ?
        reportingMember.user.displayAvatarURL() :
        Helper.client.rest.cdn.DefaultAvatar(0)
    );

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
          embed.addField('Interested', Party.buildAttendeesList(groupInterestedAttendees, totalAttendeeCount), true);
        }
        if (groupComingAttendees.length > 0) {
          embed.addField('Coming', Party.buildAttendeesList(groupComingAttendees, totalAttendeeCount), true);
        }
        if (groupPresentAttendees.length > 0) {
          embed.addField('Present', Party.buildAttendeesList(groupPresentAttendees, totalAttendeeCount), true);
        }
      });

    if (completeAttendees.length > 0) {
      embed.addField(' __Complete__', Party.buildAttendeesList(completeAttendees, totalAttendeeCount));
    }

    if (!!this.hatchTime && !isNaN(this.hatchTime)) {
      embed.addField(hatchLabel, hatchTime.calendar(null, calendarFormat));
    }

    let additionalInformation = '';

    if (!this.isExclusive) {
      if (gym.taggedEx) {
        if (gym.confirmedEx) {
          additionalInformation += 'Confirmed EX Raid location - This gym has the EX gym tag and has previously hosted an EX Raid.';
        } else {
          additionalInformation += 'Potential EX Raid location - This gym has the EX gym tag.';
        }
      }
    }

    if (!!gym.notice) {
      if (additionalInformation !== '') {
        additionalInformation += '\n\n';
      }

      additionalInformation += gym.notice;
    }

    if (additionalInformation !== '') {
      embed.addField('**Location Information**', additionalInformation);
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

              if (currentStep) {
                currentStep = currentStep
                  .then(() => message.edit(channelMessage, formattedMessage));
              } else {
                editMessageChain = message.edit(channelMessage, formattedMessage);
                currentStep = editMessageChain;
              }

              currentStep = currentStep
                .then(message => message.delete({timeout: settings.messageCleanupDelayStatus}))
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
                  .then(() => message.edit(channelMessage, formattedMessage))
              } else {
                editMessageChain = message.edit(channelMessage, formattedMessage);
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
      const raidChannelMessage = await this.getChannelMessageHeader(),
        formattedMessage = await this.getFullStatusMessage(),
        newSourceChannel = (await PartyManager.getChannel(this.sourceChannelId)).channel;

      newSourceChannel.send(raidChannelMessage, formattedMessage)
        .then(announcementMessage => PartyManager.addMessage(this.channelId, announcementMessage, true))
        .catch(err => log.error(err));

      await this.persist();
    }
  }

  async generateChannelName() {
    const nonCharCleaner = new RegExp(/[^\w]/, 'g'),
      pokemonName = (this.isExclusive ?
        'ex raid' :
        this.isElite ?
          'elite raid' :
          this.generatePokemonName(this.pokemon)),
      gym = await Gym.getGym(this.gymId),
      gymName = (!!gym.nickname ?
        removeDiacritics(gym.nickname) :
        removeDiacritics(gym.name))
        .toLowerCase()
        .replace(nonCharCleaner, ' ')
        .split(' ')
        .filter(token => token.length > 0)
        .join('-');

    return pokemonName + '-' + gymName;
  }

  generatePokemonName(pokemon) {
    const nonCharCleaner = new RegExp(/[^\w]/, 'g');
    let type = '',
      prefixType = this.getHatchStage();

    if (prefixType === 1) {
      type = 'egg ' + (pokemon.mega ? 'mega' : pokemon.tier);
    } else if (prefixType === 3 && pokemon.name === undefined) {
      type = 'expired ' + (pokemon.mega ? 'mega' : pokemon.tier);
    } else if (prefixType === 3 && pokemon.name !== undefined) {
      type = 'expired ' + pokemon.name;
    } else if (prefixType === 2 && pokemon.name === undefined) {
      type = 'boss ' + (pokemon.mega ? 'mega' : pokemon.tier);
    } else if (prefixType === 2 && pokemon.name !== undefined) {
      type = pokemon.name;
    }

    return type.replace(nonCharCleaner, ' ')
      .split(' ')
      .filter(token => token.length > 0)
      .join('-');
  }

  getHatchStage() {
    let now = moment(),
      hatchTime = !!this.hatchTime ?
        moment(this.hatchTime) :
        moment.invalid(),
      endTime = (!!this.endTime && this.endTime !== TimeType.UNDEFINED_END_TIME) ?
        moment(this.endTime) :
        moment.invalid();

    if (!hatchTime.isValid() || now < hatchTime || hatchTime.isSame(now)) {
      return 1;
    } else if (now >= endTime) {
      return 3;
    } else if (now >= hatchTime) {
      return 2;
    }
  }

  toJSON() {
    return Object.assign(super.toJSON(), {
      originallyCreatedBy: this.originallyCreatedBy,
      isExclusive: this.isExclusive,
      isElite: this.isElite,
      isMega: this.isMega,
      lastPossibleTime: this.lastPossibleTime,
      timeWarn: this.timeWarn,
      hatchTime: this.hatchTime,
      endTime: this.endTime,
      duration: this.duration,
      pokemon: this.pokemon,
      gymId: this.gymId,
      quickMove: this.quickMove,
      cinematicMove: this.cinematicMove
    });
  }
}

Raid.lock = new AsyncLock();

module.exports = Raid;
