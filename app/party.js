"use strict";

const log = require('loglevel').getLogger('Party'),
  Helper = require('./helper'),
  moment = require('moment'),
  NaturalArgumentType = require('../types/natural'),
  {PartyStatus, Team} = require('./constants');

let PartyManager;

process.nextTick(() => PartyManager = require('./party-manager'));

class Party {
  constructor(type, data = undefined) {
    if (new.target === Party) {
      throw new TypeError("Cannot construct Party instances directly");
    }

    this.type = type;

    if (data !== undefined) {
      Object.assign(this, data);
    }
  }

  async persist() {
    await PartyManager.persistParty(this);
  }

  delete() {
    PartyManager.deleteParty(this.channelId);
  }

  getAttendeeCount(group) {
    return Object.values(this.attendees)
    // complete attendees shouldn't count
      .filter(attendee => attendee.status !== PartyStatus.COMPLETE)
      .filter(attendee => !!group ?
        attendee.group === group :
        true)
      .map(attendee => attendee.number)
      .reduce((total, number) => total + number, 0);
  }

  async getMember(memberId) {
    return PartyManager.getMember(this.channelId, memberId);
  }

  async removeAttendee(memberId) {
    const attendee = this.attendees[memberId];

    if (!attendee) {
      return {error: `You are not signed up for this ${this.type}.`};
    }

    delete this.attendees[memberId];

    await this.persist();

    return {party: this};
  }

  getMemberStatus(memberId) {
    const attendee = this.attendees[memberId];

    return !!attendee ?
      attendee.status :
      PartyStatus.NOT_INTERESTED;
  }

  async setMemberStatus(memberId, status, additionalAttendees = NaturalArgumentType.UNDEFINED_NUMBER) {
    const attendee = this.attendees[memberId],
      number = (additionalAttendees !== NaturalArgumentType.UNDEFINED_NUMBER)
        ? 1 + additionalAttendees
        : 1;

    if (!attendee) {
      this.attendees[memberId] = {
        group: this.defaultGroupId,
        number: number,
        status: status
      }
    } else {
      if (additionalAttendees !== NaturalArgumentType.UNDEFINED_NUMBER) {
        attendee.number = number;
      }
      attendee.status = status;
    }

    await this.persist();

    return {party: this};
  }

  async createGroup(memberId) {
    const groupCount = this.groups.length;

    if (groupCount >= 5) {
      return {error: `A ${this.type} cannot have more than 5 groups!`};
    }

    const newGroupId = String.fromCharCode('A'.charCodeAt(0) + groupCount),
      newGroup = {id: newGroupId};

    this.groups.push(newGroup);
    this.defaultGroupId = newGroupId;

    await this.persist();

    this.setMemberGroup(memberId, newGroupId);

    return {party: this, group: newGroupId};
  }

  async setMemberGroup(memberId, groupId) {
    let attendee = this.attendees[memberId];

    if (!attendee) {
      // attendee isn't part of this party; set them as coming in default group
      this.setMemberStatus(memberId, PartyStatus.COMING);

      attendee = this.attendees[memberId];
    }

    attendee.group = groupId;

    await this.persist();

    return {party: this};
  }

  async setGroupLabel(memberId, label) {
    const member = this.attendees[memberId];

    if (!member) {
      return {error: `You are not signed up for this ${this.type}!`};
    }

    const group = this.groups
      .find(group => group.id === member.group);

    group.label = label;

    await this.persist();

    return {party: this};
  }

  sendDeletionWarningMessage() {
    // send deletion warning message to this party every 5th call to this
    if (!!this.messagesSinceDeletionScheduled) {
      ++this.messagesSinceDeletionScheduled;
    } else {
      this.messagesSinceDeletionScheduled = 1;
    }

    if (this.messagesSinceDeletionScheduled % 5 === 1) {
      const timeUntilDeletion = moment(this.deletionTime).fromNow();

      PartyManager.getChannel(this.channelId)
        .then(channelResult => {
          if (channelResult.ok) {
            channelResult.channel.send(`**WARNING**: This channel will self-destruct ${timeUntilDeletion}!`);
          }
        })
        .catch(err => log.error(err));
    }
  }

  async replaceLastMessage(message) {
    const messageCacheId = `${message.channel.id.toString()}:${message.id.toString()}`;

    if (!!this.lastStatusMessage) {
      PartyManager.getMessage(this.lastStatusMessage)
        .then(messageResult => {
          if (messageResult.ok) {
            messageResult.message.delete();
          }
        })
        .catch(err => log.error(err));
    }

    this.lastStatusMessage = messageCacheId;

    await this.persist();
  }

  static buildAttendeesList(attendeesList, emojiName, totalAttendeeCount) {
    const emoji = Helper.getEmoji(emojiName).toString();

    let result = '';

    if (totalAttendeeCount < 60) {
      attendeesList.forEach(([member, attendee]) => {
        if (result.length > 1024) {
          return;
        }

        const displayName = member.displayName.length > 12 ?
          member.displayName.substring(0, 11).concat('…') :
          member.displayName;

        result += emoji + ' ' + displayName;

        // show how many additional attendees this user is bringing with them
        if (attendee.number > 1) {
          result += ' +' + (attendee.number - 1);
        }

        // add role emoji indicators if role exists
        switch (Helper.getTeam(member)) {
          case Team.INSTINCT:
            result += ' ' + Helper.getEmoji('instinct').toString();
            break;

          case Team.MYSTIC:
            result += ' ' + Helper.getEmoji('mystic').toString();
            break;

          case Team.VALOR:
            result += ' ' + Helper.getEmoji('valor').toString();
            break;
        }

        result += '\n';
      });
    }

    if (result.length === 0 || result.length > 1024) {
      // try again with 'plain' emoji
      result = '';

      attendeesList.forEach(([member, attendee]) => {
        const displayName = member.displayName.length > 12 ?
          member.displayName.substring(0, 11).concat('…') :
          member.displayName;

        result += '• ' + displayName;

        // show how many additional attendees this user is bringing with them
        if (attendee.number > 1) {
          result += ' +' + (attendee.number - 1);
        }

        // add role emoji indicators if role exists
        switch (Helper.getTeam(member)) {
          case Team.INSTINCT:
            result += ' ⚡';
            break;

          case Team.MYSTIC:
            result += ' ❄';
            break;

          case Team.VALOR:
            result += ' 🔥';
            break;
        }

        result += '\n';
      });

      if (result.length > 1024) {
        // one last check, just truncate if it's still too long -
        // it's better than blowing up! sorry people with late alphabetical names!
        result = result.substring(0, 1022) + '…';
      }
    }

    return result;
  };

  toJSON() {
    return Object.assign({}, {
      type: this.type,
      channelId: this.channelId,
      sourceChannelId: this.sourceChannelId,
      createdById: this.createdById,
      creationTime: this.creationTime,
      attendees: this.attendees,
      groups: this.groups,
      messages: this.messages,
      lastStatusMessage: this.lastStatusMessage,
      defaultGroupId: this.defaultGroupId
    });
  }
}

module.exports = Party;