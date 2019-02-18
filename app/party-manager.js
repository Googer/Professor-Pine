const log = require('loglevel').getLogger('PartyManager'),
  settings = require('../data/settings'),
  storage = require('node-persist'),
  {PartyType} = require('./constants'),
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
        lastIntervalRunTime = lastIntervalTime - settings.cleanupInterval;

      Object.entries(this.parties)
        .filter(([channelId, party]) => party.type === PartyType.RAID)
        .forEach(async ([channelId, party]) => {
          if ((party.hatchTime && now > party.hatchTime && party.hatchTime > lastIntervalTime) ||
            nowDay !== lastIntervalDay) {
            party.refreshStatusMessages()
              .catch(err => log.error(err));
          }

          if ((now > party.hatchTime && party.hatchTime > lastIntervalRunTime)
              || (now > party.endTime && party.endTime > lastIntervalRunTime)) {
            const newChannelName = party.generateChannelName();

            await this.getChannel(party.channelId)
              .then(channelResult => {
                if (channelResult.ok) {
                  party.refreshStatusMessages()
                    .catch(err => log.error(err));

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

                  party.refreshStatusMessages()
                    .catch(err => log.error(err));

                  // ask members if they finished party
                  party.setPresentAttendeesToComplete(group.id)
                    .catch(err => log.error(err));
                } else if (!group.startClearTime && now > group.startTime) {
                  group.startClearTime = startClearTime;

                  await party.persist();

                  party.refreshStatusMessages()
                    .catch(err => log.error(err));
                }
              }
            });

          if (((party.endTime !== TimeType.UNDEFINED_END_TIME && now > party.endTime + deletionGraceTime) || now > party.lastPossibleTime + deletionGraceTime) &&
            !party.deletionTime) {
            // party's end time is set (or last possible time) in the past, even past the grace period,
            // so schedule its deletion
            party.deletionTime = deletionTime;

            party.sendDeletionWarningMessage();
            await party.persist();
          }
          if (party.deletionTime && now > party.deletionTime) {
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

    // maps channel ids to raid / train party info for that channel
    this.parties = Object.create(null);

    this.activeStorage
      .forEach(entry => {
        if (!entry) {
          return;
        }

        const channelId = entry.key,
          party = entry.value;

        if (party.type) {
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
        }
      });
  }

  shutdown() {
    this.client.destroy();
  }

  setClient(client) {
    this.client = client;

    client.on('message', message => {
      if (message.author.id !== client.user.id) {
        // if this is a raid channel that's scheduled for deletion, trigger deletion warning message
        const raid = this.getParty(message.channel.id);

        if (!!raid && !!raid.deletionTime) {
          raid.sendDeletionWarningMessage();
        }
      }
    });
  }

  async getMember(channelId, memberId) {
    const party = this.getParty(channelId),
      channel = (await this.getChannel(channelId)).channel,
      member = channel.guild.members.get(memberId);

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

  getChannel(channelId) {
    try {
      const channel = this.client.channels.get(channelId);

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
            }
          } else {
            const message = await channel.channel.messages.fetch(messageId);
            return {message: message, ok: true};
          }
        })
        .catch(err => {
          log.error(err);
          return Promise.resolve({error: new Error('Message does not exist'), ok: false});
        });
    } catch (err) {
      log.error(err);
      return Promise.resolve({error: err, ok: false});
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

  validParty(channelId, types = undefined) {
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
      return message.pin();
    }
  }
}

module.exports = new PartyManager();
