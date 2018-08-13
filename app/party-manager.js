const log = require('loglevel').getLogger('PartyManager'),
  storage = require('node-persist'),
  Raid = require('./raid'),
  {PartyType} = require('./constants');

class PartyManager {
  constructor() {
    this.activeStorage = storage.create({
      dir: 'parties/active',
      forgiveParseErrors: true
    });
    this.activeStorage.initSync();

    this.completedStorage = storage.create({
      dir: 'parties/complete',
      forgiveParseErrors: true
    });
    this.completedStorage.initSync();

    // maps channel ids to raid / train party info for that channel
    this.parties = Object.create(null);

    this.activeStorage
      .forEach((channelId, party) => {
        switch (party.type) {
          case PartyType.RAID:
            this.parties[channelId] = new Raid(this, party);
            break;

          case PartyType.RAID_TRAIN:
            this.parties[channelId] = new RaidTrain(this, party);
            break;

          case PartyType.MEETUP:
            this.parties[channelId] = new Meetup(this, party);
            break;
        }
        this.parties[channelId] = party;
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
      channel = await this.getChannel(channelId),
      member = channel.guild.members.get(memberId);

    if (!!member) {
      return Promise.resolve(member);
    }

    log.warn(`Removing nonexistent member ${memberId} from raid`);
    party.removeAttendee(memberId);

    throw new Error(`Member ${memberId} does not exist!`);
  }

  findRaid(gymId) {
    return Object.values(this.parties)
      .find(raid => raid.gymId === gymId);
  }

  raidExistsForGym(gymId) {
    return Object.values(this.parties)
      .map(raid => raid.gymId)
      .includes(gymId);
  }

  getChannel(channelId) {
    const channel = this.client.channels.get(channelId);

    if (!channel) {
      if (this.validParty(channelId)) {
        log.warn(`Deleting party for nonexistent channel ${channelId}`);

        this.deleteParty(channelId, false);
      }

      return Promise.reject(new Error('Channel does not exist'));
    }

    return Promise.resolve(channel);
  }

  async getMessage(messageCacheId) {
    const [channelId, messageId] = messageCacheId.split(':');

    return this.getChannel(channelId)
      .then(channel => channel.messages.fetch(messageId))
      .catch(err => {
        log.error(err);
        const raid = this.getParty(channelId);

        if (!!raid) {
          log.warn(`Deleting nonexistent message ${messageId} from raid ${channelId}`);
          raid.messages.splice(raid.messages.indexOf(messageCacheId), 1);

          this.persistParty(raid);
        } else {
          // try to find message in raids list that matches this message since that's what this non-existent message
          // most likely is from
          Object.values(this.parties)
            .filter(raid => raid.messages.indexOf(messageCacheId) !== -1)
            .forEach(raid => {
              log.warn(`Deleting nonexistent message ${messageId} from raid ${raid.channelId}`);
              raid.messages.splice(raid.messages.indexOf(messageCacheId), 1);

              this.persistParty(raid);
            });
        }

        return Promise.reject(new Error('Message does not exist'));
      });
  }

  persistParty(party) {
    try {
      this.activeStorage.setItemSync(party.channelId, party);
    } catch (err) {
      log.error(err);
    }
  }

  deleteParty(channelId, deleteChannel = true) {
    const party = this.getParty(channelId);

    // delete all messages for party, with defensive check first that raid actually has any
    if (Array.isArray(party.messages)) {
      party.messages
        .filter(messageCacheId => messageCacheId.split(':')[0] !== channelId)
        .forEach(messageCacheId => this.getMessage(messageCacheId)
          .then(message => message.delete())
          .catch(err => log.error(err)));
    }

    const channelDeletePromise = deleteChannel ?
      this.getChannel(channelId)
        .then(channel => channel.delete()) :
      Promise.resolve(true);

    channelDeletePromise
      .then(result => {
        // delete messages from raid object before moving to completed raid
        // storage as they're no longer needed
        delete party.messages;

        delete party.messagesSinceDeletionScheduled;

        // TODO: this is only really right for raids, not trains or generic meetups, so rethink / revisit this
        this.completedStorage.getItem(party.gymId.toString())
          .then(gymRaids => {
            if (!gymRaids) {
              gymRaids = [];
            }
            gymRaids.push(party);
            try {
              this.completedStorage.setItemSync(party.gymId.toString(), gymRaids)
            } catch (err) {
              log.error(err);
            }
            return true;
          })
          .then(result => this.activeStorage.removeItemSync(channelId))
          .catch(err => log.error(err));

        delete this.parties[channelId];
      })
      .catch(err => log.error(err));
  }

  validParty(channelId) {
    return !!this.parties[channelId];
  }

  getParty(channelId) {
    return this.parties[channelId];
  }

  getAllRaids(channelId) {
    return Object.values(this.parties)
      .filter(raid => raid.sourceChannelId === channelId);
  }

  getCreationChannelName(channelId) {
    return this.validParty(channelId) ?
      this.getChannel(this.getParty(channelId).sourceChannelId)
        .then(channel => channel.name)
        .catch(err => {
          log.error(err);
          return '';
        }) :
      this.getChannel(channelId)
        .then(channel => channel.name)
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
