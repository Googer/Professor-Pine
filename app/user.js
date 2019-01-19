"use strict";

const log = require('loglevel').getLogger('Status'),
  DB = require('./db');

class User {
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
}

 module.exports = new User();
