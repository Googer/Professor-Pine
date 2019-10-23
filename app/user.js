"use strict";

const log = require('loglevel').getLogger('User'),
  Helper = require('./helper'),
  DB = require('./db');

class User {
  async getUserSettings(memberId) {
    const result = await DB.DB('User')
      .where('userSnowflake', memberId)
      .first();

    return !!result ?
        result :
        null;
  }

  async getSilphUsername(memberId) {
    const result = await DB.DB('User')
      .where('userSnowflake', memberId)
      .pluck('silph')
      .first();

    return !!result ?
      result.silph :
      null;
  }

  setSilphUsername(member, username) {
    return DB.insertIfAbsent('User', Object.assign({},
      {
        userSnowflake: member.user.id
      }))
      .then(userId => DB.DB('User')
        .where('id', userId)
        .update({
          silph: username
        }))
      .catch(err => log.error(err));
  }

  async getFriendCode(memberId) {
    const result = await DB.DB('User')
      .where('userSnowflake', memberId)
      .pluck('friendcode')
      .first();

    return !!result ?
      result.friendcode :
      null;
  }

  setFriendCode(member, code) {
    return DB.insertIfAbsent('User', Object.assign({},
      {
        userSnowflake: member.user.id
      }))
      .then(userId => DB.DB('User')
        .where('id', userId)
        .update({
          friendcode: code
        }))
      .catch(err => log.error(err));
  }

  async getNickname(memberId) {
    const result = await DB.DB('User')
      .where('userSnowflake', memberId)
      .pluck('nickname')
      .first();

    return !!result ?
      result.nickname :
      null;
  }

  setRaidBossNotification(member, notification) {
    return DB.insertIfAbsent('User', Object.assign({},
      {
        userSnowflake: member.user.id
      }))
      .then(userId => DB.DB('User')
        .where('id', userId)
        .update({
          raidBoss: notification
        }))
      .catch(err => log.error(err));
  }

  setNewTrainNotification(member, notification) {
    return DB.insertIfAbsent('User', Object.assign({},
      {
        userSnowflake: member.user.id
      }))
      .then(userId => DB.DB('User')
        .where('id', userId)
        .update({
          newTrain: notification
        }))
      .catch(err => log.error(err));
  }


  setNickname(member, nickname) {
    return DB.insertIfAbsent('User', Object.assign({},
      {
        userSnowflake: member.user.id
      }))
      .then(userId => DB.DB('User')
        .where('id', userId)
        .update({
          nickname: nickname
        }))
      .catch(err => log.error(err));
  }

  async getDiscordNameFromUsername(nickname, message) {
    const result = await DB.DB('User')
      .where('nickname', nickname)
      .pluck('userSnowflake')
      .first();

    if (!!result) {
      const channel = Helper.client.channels.get(message.channel.id),
        member = channel ?
          channel.guild.members.get(result.userSnowflake) :
          false;

      return member;
    }

    return false;
  }

  async getUserId(message) {

    const result = await DB.DB('User')
      .where('userSnowflake', message.author.id)
      .first();

    console.log(result);

    return !!result ? result.id : null;
  }
}

module.exports = new User();
