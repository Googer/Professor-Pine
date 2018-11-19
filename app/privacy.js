"use strict";

const log = require('loglevel').getLogger('Privacy'),
  DB = require('./db'),
  lunr = require('lunr'),
  {PrivacyOpts} = require('./constants'),
  Search = require('./search');

class Privacy extends Search {
  constructor() {
    super();
  }

  async buildIndex() {
    log.info('Indexing privacies...');

    this.index = lunr(function () {
      this.ref('privacy');
      this.field('name');

      // remove stop word filter
      this.pipeline.remove(lunr.stopWordFilter);

      // Anonymous Raid Reports aliases
      this.add({'privacy': PrivacyOpts.ANONYMOUS, name: 'hidden'});
      this.add({'privacy': PrivacyOpts.ANONYMOUS, name: 'invisible'});
      this.add({'privacy': PrivacyOpts.ANONYMOUS, name: 'anonymous'});
      this.add({'privacy': PrivacyOpts.ANONYMOUS, name: 'private'});
      this.add({'privacy': PrivacyOpts.ANONYMOUS, name: 'yes'});

      // Shown Raid Reports aliases
      this.add({'privacy': PrivacyOpts.VISIBLE, name: 'unhidden'});
      this.add({'privacy': PrivacyOpts.VISIBLE, name: 'shown'});
      this.add({'privacy': PrivacyOpts.VISIBLE, name: 'visible'});
      this.add({'privacy': PrivacyOpts.VISIBLE, name: 'nonanonymous'});
      this.add({'privacy': PrivacyOpts.VISIBLE, name: 'public'});
      this.add({'privacy': PrivacyOpts.VISIBLE, name: 'no'});
    });

    log.info('Indexing privacies complete');
  }

  search(term) {
    return Search.singleTermSearch(term.toLowerCase(), this.index, ['name']);
  }

  // get user's privacy state for reporting raids; if they're not in the table at all,
  // assume they're visible
  async getPrivacyStatus(memberId) {
    const result = await DB.DB('User')
      .where('userSnowflake', memberId)
      .pluck('raidPrivacy')
      .first();

    return !!result ?
      result.raidPrivacy :
      PrivacyOpts.VISIBLE;
  }

  // set user's automatic status for raids to value passed in
  setPrivacyStatus(member, privacy) {
    return DB.insertIfAbsent('User', Object.assign({},
      {
        userSnowflake: member.user.id
      }))
      .then(userId => DB.DB('User')
        .where('id', userId)
        .update({
          raidPrivacy: privacy
        }))
      .catch(err => log.error(err));
  }
}

module.exports = new Privacy();
