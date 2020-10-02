const log = require('loglevel').getLogger('PartyManager'),
  Helper = require('./helper'),
  moment = require('moment'),
  NaturalArgumentType = require('../types/natural'),
  settings = require('../data/settings'),
  storage = require('node-persist'),
  {PartyStatus, PartyType} = require('./constants'),
  Region = require('./region'),
  TimeType = require('../types/time');

let Meetup,
  Raid,
  RaidTrain;

process.nextTick(() => {
  Meetup = require('./meetup');
  Raid = require('./raid');
  RaidTrain = require('./train');
});

class PartyManager {
  constructor() {
    let lastIntervalTime = moment().valueOf(),
      lastIntervalDay = moment().dayOfYear();

    // loop to clean up raids periodically
    this.update = setInterval(() => {
      const nowMoment = moment(),
        nowDay = nowMoment.dayOfYear(),
        now = nowMoment.valueOf(),
        startClearTime = now + (settings.startClearTime * 60 * 1000),
        deletionGraceTime = settings.deletionGraceTime * 60 * 1000,
        deletionTime = now + (settings.deletionWarningTime * 60 * 1000),
        trainOrMeetupDeletionTime = now + (settings.trainOrMeetupDeletionWarningTime * 60 * 1000),
        lastIntervalRunTime = lastIntervalTime - settings.cleanupInterval,
        partiesToRefresh = new Set();

      Object.entries(this.parties)
        .filter(([channelId, party]) => [PartyType.RAID, PartyType.RAID_TRAIN, PartyType.MEETUP].indexOf(party.type) !== -1)
        .forEach(async ([channelId, party]) => {
          if ((party.hatchTime && now > party.hatchTime && party.hatchTime > lastIntervalTime) ||
            nowDay !== lastIntervalDay) {
            const channelResult = await this.getChannel(channelId),
              channelName = channelResult.ok ?
                channelResult.channel.name :
                'invalid';

            log.debug(`Refreshing status messages for ${party.type} ${channelName}`);
            partiesToRefresh.add(party);
          }

          if ((now > party.hatchTime && party.hatchTime > lastIntervalRunTime)
            || (now > party.endTime && party.endTime > lastIntervalRunTime)) {
            const newChannelName = await party.generateChannelName();

            await this.getChannel(party.channelId)
              .then(channelResult => {
                if (channelResult.ok) {
                  partiesToRefresh.add(party);

                  return channelResult.channel.setName(newChannelName);
                }
              })
              .catch(err => log.error(err));
          }

          party.groups
            .forEach(async group => {
              if (group.startTime) {
                if (group.startClearTime && (now > group.startClearTime)) {
                  // clear out start time
                  delete group.startTime;
                  delete group.startClearTime;

                  await party.persist();

                  partiesToRefresh.add(party);

                  // ask members if they finished party
                  party.setPresentAttendeesToComplete(group.id)
                    .catch(err => log.error(err));
                } else if (!group.startClearTime && now > group.startTime) {
                  group.startClearTime = startClearTime;

                  await party.persist();

                  partiesToRefresh.add(party);
                }
              }
            });

          for (const party of partiesToRefresh.values()) {
            await party.refreshStatusMessages()
              .catch(err => log.error(err));
          }

          if (((party.endTime !== TimeType.UNDEFINED_END_TIME && now > party.endTime + deletionGraceTime) || now > party.lastPossibleTime + deletionGraceTime) &&
            !party.deletionTime) {
            // party's end time is set (or last possible time) in the past, even past the grace period,
            // so schedule its deletion
            party.deletionTime = (party.type === PartyType.RAID_TRAIN || party.type === PartyType.MEETUP) ?
              trainOrMeetupDeletionTime :
              deletionTime;

            party.sendDeletionWarningMessage();
            await party.persist();
          }
          if (party.deletionTime && now > party.deletionTime && party.deletionTime !== -1) {
            party.delete();
          }

          lastIntervalTime = now;
          lastIntervalDay = nowDay;
        });
    }, settings.cleanupInterval);
  }

  async initialize() {
    this.activeStorage = storage.create({
      dir: 'parties/active',
      forgiveParseErrors: true
    });
    await this.activeStorage.init();

    this.completedStorage = storage.create({
      dir: 'parties/complete',
      forgiveParseErrors: true
    });
    await this.completedStorage.init();

    if (settings.features.reactionCommands) {
      // map group reactions to group identifiers
      this.groupEmojiToGroupId = {};

      Object.keys(settings.groupReactions)
        .forEach(key => this.groupEmojiToGroupId[settings.groupReactions[key]] = key);
    }

    // maps channel ids to raid / train party info for that channel
    this.parties = Object.create(null);

    await this.activeStorage
      .forEach(entry => {
        if (!entry) {
          return;
        }

        const channelId = entry.key,
          party = entry.value;

        if (party && party.type) {
          switch (party.type) {
            case PartyType.RAID:
              this.parties[channelId] = new Raid(party);
              break;

            case PartyType.RAID_TRAIN:
              this.parties[channelId] = new RaidTrain(party);
              break;

            case PartyType.MEETUP:
              this.parties[channelId] = new Meetup(party);
              break;
          }
        } else if (!party) {
          log.error('INVALID PARTY: ' + channelId);
        }
      });

    this.loadGymCache();

    this.messageDeleteListener = message => {
      if (message.author.id !== this.client.user.id) {
        // if this is a raid channel that's scheduled for deletion, trigger deletion warning message
        const raid = this.getParty(message.channel.id);

        if (!!raid && !!raid.deletionTime) {
          raid.sendDeletionWarningMessage();
        }
      }
    };

    this.messageReactionListener = async (reaction, user) => {
      if (user.bot) {
        return;
      }

      // When we receive a reaction we check if the reaction is partial or not
      if (reaction.partial) {
        // If the message this reaction belongs to was removed the fetching might result in an API error, which we need to handle
        try {
          await reaction.fetch();
        } catch (err) {
          log.error(err);
          return;
        }
      }

      const reactionMessageId = `${reaction.message.channel.id}:${reaction.message.id}`,
        party = Object.values(this.parties)
          .filter(party => party.messages.indexOf(reactionMessageId) !== -1 ||
            party.lastStatusMessage === reactionMessageId)[0];

      if (!party) {
        return;
      }

      const displayName = reaction.message.guild.members.cache.get(user.id).toString() || user.username;

      let reactionEmoji = false;

      switch (reaction.emoji.name) {
        case settings.reactionCommands.interested.custom:
        case settings.reactionCommands.interested.plain: {
          reactionEmoji = true;

          const interestedCommand = Helper.client.registry.resolveCommand('maybe'),
            statusMessageResult = await this.getMessage(party.messages
              .filter(messageCacheId => messageCacheId.startsWith(party.channelId))[0]);

          if (statusMessageResult.ok) {
            const arg = party.getMemberStatus(user.id) === PartyStatus.NOT_INTERESTED ?
              party.defaultGroupId :
              NaturalArgumentType.UNDEFINED_NUMBER;

            interestedCommand.run(statusMessageResult.message, {
              additionalAttendees: arg,
              isReaction: true,
              reactionMemberId: user.id
            })
              .then(() => party.postMessage(`${displayName} is interested in this ${party.type}!`, 'YELLOW'))
              .catch(err => log.error(err));
          }

          break;
        }

        case settings.reactionCommands.join.custom:
        case settings.reactionCommands.join.plain: {
          reactionEmoji = true;

          const joinCommand = Helper.client.registry.resolveCommand('join'),
            statusMessageResult = await this.getMessage(party.messages
              .filter(messageCacheId => messageCacheId.startsWith(party.channelId))[0]);

          if (statusMessageResult.ok) {
            const arg = party.getMemberStatus(user.id) === PartyStatus.NOT_INTERESTED ?
              party.defaultGroupId :
              NaturalArgumentType.UNDEFINED_NUMBER;

            joinCommand.run(statusMessageResult.message, {
              additionalAttendees: arg,
              isReaction: true,
              reactionMemberId: user.id
            })
              .then(() => party.postMessage(`${displayName} has joined this ${party.type}!`, 'AQUA'))
              .catch(err => log.error(err));
          }

          break;
        }

        case settings.reactionCommands.here.custom:
        case settings.reactionCommands.here.plain: {
          reactionEmoji = true;

          const hereCommand = Helper.client.registry.resolveCommand('here'),
            statusMessageResult = await this.getMessage(party.messages
              .filter(messageCacheId => messageCacheId.startsWith(party.channelId))[0]);

          if (statusMessageResult.ok) {
            const arg = party.getMemberStatus(user.id) === PartyStatus.NOT_INTERESTED ?
              party.defaultGroupId :
              NaturalArgumentType.UNDEFINED_NUMBER;

            hereCommand.run(statusMessageResult.message, {
              additionalAttendees: arg,
              isReaction: true,
              reactionMemberId: user.id
            })
              .then(() => party.postMessage(`${displayName} has arrived at this ${party.type}!`, 'GREEN'))
              .catch(err => log.error(err));
          }

          break;
        }

        case settings.reactionCommands.done.custom:
        case settings.reactionCommands.done.plain: {
          reactionEmoji = true;

          const doneCommand = Helper.client.registry.resolveCommand('done'),
            statusMessageResult = await this.getMessage(party.messages
              .filter(messageCacheId => messageCacheId.startsWith(party.channelId))[0]);

          if (statusMessageResult.ok) {
            const arg = party.getMemberStatus(user.id) === PartyStatus.NOT_INTERESTED ?
              party.defaultGroupId :
              NaturalArgumentType.UNDEFINED_NUMBER;

            doneCommand.run(statusMessageResult.message, {
              isReaction: true,
              reactionMemberId: user.id
            })
              .then(() => party.postMessage(`${displayName} has completed this ${party.type}!`, 'DARK_GREEN'))
              .catch(err => log.error(err));
          }

          break;
        }

        case settings.reactionCommands.incrementCount.plain: {
          reactionEmoji = true;

          const status = party.getMemberStatus(user.id);

          if (status === PartyStatus.NOT_INTERESTED) {
            // say interested in this ${party.type}
            const interestedCommand = Helper.client.registry.resolveCommand('maybe'),
              statusMessageResult = await this.getMessage(party.messages
                .filter(messageCacheId => messageCacheId.startsWith(party.channelId))[0]);

            if (statusMessageResult.ok) {
              const arg = party.getMemberStatus(user.id) === PartyStatus.NOT_INTERESTED ?
                party.defaultGroupId :
                NaturalArgumentType.UNDEFINED_NUMBER;

              interestedCommand.run(statusMessageResult.message, {
                additionalAttendees: arg,
                isReaction: true,
                reactionMemberId: user.id
              })
                .then(() => party.postMessage(`${displayName} is interested in this ${party.type}!`, 'YELLOW'))
                .catch(err => log.error(err));
            }
          } else {
            party.setMemberStatus(user.id, status, party.getAttendee(user.id).number)
              .then(() => party.refreshStatusMessages())
              .catch(err => log.error(err));
          }
          break;
        }

        case settings.reactionCommands.decrementCount.plain: {
          reactionEmoji = true;

          const status = party.getMemberStatus(user.id);

          if (status !== PartyStatus.NOT_INTERESTED) {
            const attendee = party.getAttendee(user.id),
              count = attendee.number > 2 ?
                attendee.number - 2 :
                0;

            party.setMemberStatus(user.id, status, count)
              .then(() => party.refreshStatusMessages())
              .catch(err => log.error(err));
          }
          break;
        }

        case settings.reactionCommands.remote.custom:
        case settings.reactionCommands.remote.plain: {
          reactionEmoji = true;

          const isRemote = party.getMemberIsRemote(user.id),
            command = isRemote ?
              Helper.client.registry.resolveCommand('local') :
              Helper.client.registry.resolveCommand('remote'),
            statusMessageResult = await this.getMessage(party.messages
              .filter(messageCacheId => messageCacheId.startsWith(party.channelId))[0]);

          if (statusMessageResult.ok) {
            const arg = party.getMemberStatus(user.id) === PartyStatus.NOT_INTERESTED ?
              party.defaultGroupId :
              NaturalArgumentType.UNDEFINED_NUMBER;

            command.run(statusMessageResult.message, {
              additionalAttendees: arg,
              isReaction: true,
              reactionMemberId: user.id
            })
              .then(() => party.postMessage(`${displayName} is doing this ${party.type} ${isRemote ? 'locally' : 'remotely'}!`, 'BLUE'))
              .catch(err => log.error(err));
          }

          break;
        }

        case settings.reactionCommands.notInterested.custom:
        case settings.reactionCommands.notInterested.plain: {
          reactionEmoji = true;

          const leaveCommand = Helper.client.registry.resolveCommand('leave'),
            statusMessageResult = await this.getMessage(party.messages
              .filter(messageCacheId => messageCacheId.startsWith(party.channelId))[0]);

          if (statusMessageResult.ok) {
            leaveCommand.run(statusMessageResult.message, {
              isReaction: true,
              reactionMemberId: user.id
            })
              .then(() => party.postMessage(`${displayName} has left this ${party.type}!`, 'RED'))
              .catch(err => log.error(err));
          }

          break;
        }

        case settings.groupReactions.A:
        case settings.groupReactions.B:
        case settings.groupReactions.C:
        case settings.groupReactions.D:
        case settings.groupReactions.E: {
          reactionEmoji = true;

          const groupCommand = Helper.client.registry.resolveCommand('group'),
            group = this.groupEmojiToGroupId[reaction.emoji.name],
            statusMessageResult = await this.getMessage(party.messages
              .filter(messageCacheId => messageCacheId.startsWith(party.channelId))[0]);

          if (statusMessageResult.ok) {
            groupCommand.run(statusMessageResult.message, group, {
              isReaction: true,
              reactionMemberId: user.id
            })
              .then(() => party.postMessage(`${displayName} has joined group ${group}!`, 'BLUE'))
              .catch(err => log.error(err));
          }

          break;
        }
      }

      if (reactionEmoji) {
        const partyChannel = (await this.getChannel(party.channelId)).channel;
        if (!!partyChannel) {
          Helper.client.emit('partyChannelReaction', party, partyChannel, user.id)
        }
      }

      // Remove user's reaction to keep things clean
      reaction.users.remove(user)
        .catch(err => log.error(err));
    }
  }

  shutdown() {
    this.client.destroy();
  }

  setClient(client) {
    this.client = client;
    this.regionChannels = [];
    this.loadRegionChannels();

    client.on('message', this.messageDeleteListener);

    if (settings.features.reactionCommands) {
      client.on('messageReactionAdd', this.messageReactionListener);
    }

    // client.on('trainGymChanged', async (gymId, train) => {
    //   // train set a new location, create a new raid automatically if it hasn't already been reported
    //   const raidCommand = client.registry.findCommands('raid')[0],
    //     guild = (await this.getChannel(train.channelId)).channel.guild,
    //     raidCommandEnabled = raidCommand.isEnabledIn(guild);
    //
    //   if (raidCommandEnabled) {
    //     Raid.createRaid(train.sourceChannelId, train.createdById, {
    //       name: 'pokemon',
    //       tier: '????'
    //     }, gymId, false);
    //   }
    // });
  }

  async orderChannels(party) {
    const partyChannelResult = await this.getChannel(party.channelId);
    if (partyChannelResult.ok) {
      const guild = partyChannelResult.channel.guild,
        partyChannels = await Promise.all(Object.entries(this.parties)
          .map(async ([channelId, party]) => Object.assign({}, {
            party,
            channelResult: await (this.getChannel(channelId))
          }))),
        sortedGuildPartyChannels = partyChannels
          .filter(({channelResult}) => channelResult.ok)
          .map(({party, channelResult}) => Object.assign({}, {party, channel: channelResult.channel}))
          .filter(({channel}) => channel.guild.id === guild.id)
          .sort((a, b) => {
            let result;

            // First sort by type - meetups, then raid trains, then raids
            switch (a.party.type) {
              case PartyType.MEETUP:
                switch (b.party.type) {
                  case PartyType.MEETUP:
                    result = 0;
                    break;

                  case PartyType.RAID:
                  case PartyType.RAID_TRAIN:
                    result = -1;
                    break;
                }
                break;

              case PartyType.RAID:
                switch (b.party.type) {
                  case PartyType.MEETUP:
                  case PartyType.RAID_TRAIN:
                    result = 1;
                    break;

                  case PartyType.RAID:
                    result = 0;
                    break;
                }
                break;

              case PartyType.RAID_TRAIN:
                switch (b.party.type) {
                  case PartyType.MEETUP:
                    result = 1;
                    break;

                  case PartyType.RAID:
                    result = -1;
                    break;

                  case PartyType.RAID_TRAIN:
                    result = 0;
                    break;
                }
                break;
            }

            if (result === 0) {
              // Sort by end time, unset always first
              const aEndTime = a.party.endTime ?
                a.party.endTime :
                0;

              const bEndTime = b.party.endTime ?
                b.party.endTime :
                0;

              result = aEndTime - bEndTime;
            }

            if (result === 0) {
              // Just compare channel names
              result = a.channel.name.localeCompare(b.channel.name);
            }

            return result;
          }),
        guildChannelSize = guild.channels.cache.size,
        channelPositions = [];

      for (let i = 0; i < sortedGuildPartyChannels.length; ++i) {
        channelPositions.push(Object.assign({}, {
          channel: sortedGuildPartyChannels[i].channel.id,
          position: guildChannelSize - sortedGuildPartyChannels.length + i
        }));
      }

      return guild.setChannelPositions(channelPositions);
    }
  }

  async loadRegionChannels() {
    const that = this;
    Region.checkRegionsExist()
      .then(success => {
        if (success) {
          that.client.channels.cache.forEach(async channel => {
            const region = await Region.getRegionsRaw(channel.id)
              .catch(error => false);
            if (region) {
              that.regionChannels.push(channel.id);
            }

            let last = that.client.channels.cache.array().slice(-1)[0];
            if (channel.id === last.id) {
              that.clearOldRegionChannels();
            }
          })
        }
      }).catch(error => log.error(error));
  }

  async clearOldRegionChannels() {
    const that = this;
    Region.checkRegionsExist()
      .then(async success => {
        if (success) {
          const regions = await Region.getAllRegions()
            .catch(error => log.error(error));
          log.debug("TOTAL REGIONS FOUND: " + regions.length);
          const deleted = await Region.deleteRegionsNotInChannels(that.regionChannels)
            .catch(error => log.error(error));
          if (!!deleted && deleted.affectedRows) {
            log.debug("DELETED " + deleted.affectedRows + " REGIONS NOT TIED TO CHANNELS")
          }
        }
      })
      .catch(error => log.error(error));
  }

  cacheRegionChannel(channel) {
    this.regionChannels.push(channel);
  }

  gymIsCached(gymId) {
    if (this.gymCache) {
      for (let i = 0; i < this.gymCache.length; i++) {
        const gym = this.gymCache[i];
        if (gym.id === gymId) {
          return true;
        }
      }
    }

    return false;
  }

  async loadGymCache() {
    if (!this.gymCache) {
      this.gymCache = [];
    }
    const that = this;
    Object.entries(this.parties)
      .filter(([channelId, party]) => party.type === PartyType.RAID)
      .forEach(async ([channelId, party]) => {
        if (!that.gymIsCached(party.gymId)) {
          const gym = await Region.getGym(party.gymId);
          that.gymCache.push(gym);
        }
      });
  }

  cacheGym(gym) {
    if (!this.gymCache) {
      this.gymCache = [];
    }
    if (!this.gymIsCached(gym.id)) {
      this.gymCache.push(gym);
    }
  }

  getCachedGym(gymId) {
    if (this.gymIsCached(gymId)) {
      for (let i = 0; i < this.gymCache.length; i++) {
        const gym = this.gymCache[i];
        if (gym.id === gymId) {
          return gym;
        }
      }
    } else {
      log.warn(`${gymId} not cached`);
    }

    return null;
  }

  getRaidChannelCache() {
    return this.regionChannels;
  }

  channelCanRaid(channelId) {
    return this.regionChannels.indexOf(channelId) > -1;
  }

  categoryHasRegion(category) {
    const children = Helper.childrenForCategory(category);
    if (children.length > 0) {
      for (let i = 0; i < children.length; i++) {
        const child = children[i];
        if (this.channelCanRaid(child.id)) {
          return true;
        }
      }
    } else {
      return false;
    }
  }

  async getMember(channelId, memberId) {
    const party = this.getParty(channelId),
      channel = (await this.getChannel(channelId)).channel,
      member = await channel.guild.members.fetch(memberId)
        .catch(err => {
          log.error(err);
          return undefined;
        });

    if (!!member) {
      return Promise.resolve({member, ok: true});
    }

    log.warn(`Removing nonexistent member ${memberId} from raid`);
    party.removeAttendee(memberId);

    return Promise.resolve({error: new Error(`Member ${memberId} does not exist!`), ok: false});
  }

  findRaid(gymId, isExclusive) {
    return Object.values(this.parties)
      .filter(party => party.type === PartyType.RAID)
      .filter(raid => (!!raid.isExclusive) === isExclusive)
      .find(raid => raid.gymId === gymId);
  }

  raidExistsForGym(gymId, isExclusive) {
    return Object.values(this.parties)
      .filter(party => party.type === PartyType.RAID)
      .filter(raid => (!!raid.isExclusive) === isExclusive)
      .map(raid => raid.gymId)
      .includes(gymId);
  }

  async getChannel(channelId) {
    try {
      const channel = await this.client.channels.fetch(channelId)
        .catch(err => {
          log.error(err);
          return undefined;
        });

      if (!channel) {
        if (this.validParty(channelId)) {
          log.warn(`Deleting raid for nonexistent channel ${channelId}`);

          this.deleteParty(channelId, false);
        }

        return Promise.resolve({error: new Error('Channel does not exist'), ok: false});
      }

      return Promise.resolve({channel, ok: true});
    } catch (err) {
      log.error(err);
      return Promise.resolve({error: err, ok: false});
    }
  }

  async getMessage(messageCacheId) {
    try {
      const [channelId, messageId] = messageCacheId.split(':');

      return this.getChannel(channelId)
        .then(async channel => {
          if (!channel.ok) {
            const party = this.getParty(channelId);

            if (!!party) {
              log.warn(`Deleting nonexistent message ${messageId} from ${party.name} ${channelId}`);
              party.messages.splice(party.messages.indexOf(messageCacheId), 1);

              await party.persist();
            } else {
              // try to find message in parties list that matches this message since that's what this non-existent message
              // most likely is from
              Object.values(this.parties)
                .filter(party => party.messages.indexOf(messageCacheId) !== -1)
                .forEach(async party => {
                  log.warn(`Deleting nonexistent message ${messageId} from ${party.name} ${party.channelId}`);
                  party.messages.splice(party.messages.indexOf(messageCacheId), 1);

                  await party.persist();
                });

              return {error: new Error('Message does not exist'), ok: false};
            }
          } else {
            const message = await channel.channel.messages.fetch(messageId)
              .catch(err => {
                log.error(err);
                return undefined;
              });

            if (!!message) {
              return {message: message, ok: true};
            } else {
              return {error: new Error('Could not fetch message'), ok: false};
            }
          }
        })
        .catch(err => {
          log.error(err);
          return {error: new Error('Message does not exist'), ok: false};
        });
    } catch (err) {
      log.error(err);
      return {error: err, ok: false};
    }
  }

  async persistParty(party) {
    await this.activeStorage.setItem(party.channelId, party)
      .catch(err => log.error(err));
  }

  deleteParty(channelId, deleteChannel = true) {
    const party = this.getParty(channelId);

    // delete all messages for party, with defensive check first that raid actually has any
    if (Array.isArray(party.messages)) {
      party.messages
        .filter(messageCacheId => messageCacheId.split(':')[0] !== channelId)
        .forEach(messageCacheId => this.getMessage(messageCacheId)
          .then(messageResult => {
            if (messageResult.ok) {
              messageResult.message.delete()
                .catch(err => log.error(err));
            }
          })
          .catch(err => log.error(err)));
    }

    const channelDeletePromise = deleteChannel ?
      this.getChannel(channelId)
        .then(channelResult => {
          return channelResult.ok ?
            channelResult.channel.delete()
              .catch(err => log.error(err)) :
            Promise.resolve(true);
        }) :
      Promise.resolve(true);

    channelDeletePromise
      .then(result => {
        // delete messages from raid object before moving to completed raid
        // storage as they're no longer needed
        delete party.messages;
        delete party.messagesSinceDeletionScheduled;

        if (party.type === PartyType.RAID) {
          // TODO: this is only really right for raids, not trains or generic meetups, so rethink / revisit this
          this.completedStorage.getItem(party.gymId.toString())
            .then(gymRaids => {
              if (!gymRaids) {
                gymRaids = [];
              }
              gymRaids.push(party);
              return this.completedStorage.setItem(party.gymId.toString(), gymRaids);
            })
            .then(result => this.activeStorage.removeItem(channelId))
            .catch(err => log.error(err));
        } else {
          this.activeStorage.removeItem(channelId)
            .catch(err => log.error(err));
        }

        delete this.parties[channelId];
      })
      .catch(err => log.error(err));
  }

  validParty(channelId, types) {
    const party = this.parties[channelId];

    return !!party && (types !== undefined ?
      types.indexOf(party.type) >= 0 :
      true);
  }

  getParty(channelId) {
    return this.parties[channelId];
  }

  getAllParties(channelId, type) {
    return Object.values(this.parties)
      .filter(party => party.sourceChannelId === channelId)
      .filter(party => party.type === type);
  }

  getCreationChannelId(channelId) {
    return this.validParty(channelId) ?
      this.getParty(channelId).sourceChannelId :
      channelId;
  }

  getCreationChannelName(channelId) {
    return this.validParty(channelId) ?
      this.getChannel(this.getParty(channelId).sourceChannelId)
        .then(channelResult => channelResult.ok ?
          channelResult.channel.name :
          '')
        .catch(err => {
          log.error(err);
          return '';
        }) :
      this.getChannel(channelId)
        .then(channelResult => channelResult.ok ?
          channelResult.channel.name :
          '')
        .catch(err => {
          log.error(err);
          return '';
        });
  }

  addMessage(channelId, message, pin = false) {
    const party = this.getParty(channelId);

    if (!party.messages) {
      party.messages = [];
    }

    const messageCacheId = `${message.channel.id.toString()}:${message.id.toString()}`;

    party.messages.push(messageCacheId);

    this.persistParty(party);

    if (pin) {
      message.pin()
        .catch(err => log.error(err));
    }

    return this.addReactions(message)
      .then(() => this.addGroupReactions(party, message));
  }

  addReactions(message) {
    let reactionPromise = Promise.resolve();

    if (settings.features.reactionCommands) {
      Object.values(settings.reactionCommands)
        .forEach(emoji => reactionPromise = reactionPromise
          .then(result => message.react(Helper.getEmoji(emoji.custom) || emoji.plain)));
    }

    return reactionPromise;
  }

  addGroupReactions(party, message) {
    let reactionPromise = Promise.resolve();

    if (settings.features.reactionCommands) {
      const groupCount = party.groups.length;

      if (groupCount > 1) {
        party.groups.forEach(({id}) => {
          const emoji = settings.groupReactions[id];
          if (!message.reactions.resolve(emoji)) {
            reactionPromise = reactionPromise
              .then(result => message.react(emoji));
          }
        });
      }
    }

    return reactionPromise;
  }
}

module.exports = new PartyManager();
