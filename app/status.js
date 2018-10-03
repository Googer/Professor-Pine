"use strict";

const log = require('loglevel').getLogger('Status'),
  DB = require('./db'),
  lunr = require('lunr'),
  {PartyStatus} = require('./constants'),
  Search = require('./search');

class Status extends Search {
  constructor() {
    super();
  }

  async buildIndex() {
    log.info('Indexing statuses...');

    this.index = lunr(function () {
      this.ref('status');
      this.field('name');

      // remove stop word filter
      this.pipeline.remove(lunr.stopWordFilter);

      // Not interested aliases
      this.add({'status': PartyStatus.NOT_INTERESTED, 'name': 'leave'});
      this.add({'status': PartyStatus.NOT_INTERESTED, 'name': 'part'});
      this.add({'status': PartyStatus.NOT_INTERESTED, 'name': 'not-interested'});
      this.add({'status': PartyStatus.NOT_INTERESTED, 'name': 'uninterested'});
      this.add({'status': PartyStatus.NOT_INTERESTED, 'name': 'meh'});
      this.add({'status': PartyStatus.NOT_INTERESTED, 'name': 'bye'});
      this.add({'status': PartyStatus.NOT_INTERESTED, 'name': 'none'});
      this.add({'status': PartyStatus.NOT_INTERESTED, 'name': 'off'});

      // Interested aliases
      this.add({'status': PartyStatus.INTERESTED, 'name': 'maybe'});
      this.add({'status': PartyStatus.INTERESTED, 'name': 'interested'});
      this.add({'status': PartyStatus.INTERESTED, 'name': 'interest'});
      this.add({'status': PartyStatus.INTERESTED, 'name': 'hmm'});
      this.add({'status': PartyStatus.INTERESTED, 'name': 'on'});

      // Join aliases
      this.add({'status': PartyStatus.COMING, 'name': 'join'});
      this.add({'status': PartyStatus.COMING, 'name': 'attend'});
      this.add({'status': PartyStatus.COMING, 'name': 'omw'});
      this.add({'status': PartyStatus.COMING, 'name': 'coming'});
      this.add({'status': PartyStatus.COMING, 'name': 'going'});
    });

    log.info('Indexing statuses complete');
  }

  search(term) {
    return Search.singleTermSearch(term.toLowerCase(), this.index, ['name']);
  }

  // get user's automatic status for reporting raids; if they're not in the table at all,
  // assume they're interested
  async getAutoStatus(memberId) {
    const result = await DB.DB('User')
      .where('userSnowflake', memberId)
      .pluck('status')
      .first();

    return !!result ?
      result.status :
      PartyStatus.INTERESTED;
  }

  // set user's automatic status for raids to value passed in
  setAutoStatus(member, status) {
    return DB.insertIfAbsent('User', Object.assign({},
      {
        userSnowflake: member.user.id
      }))
      .then(userId => DB.DB('User')
        .where('id', userId)
        .update({
          status: status
        }))
      .catch(err => log.error(err));
  }
}

module.exports = new Status();
