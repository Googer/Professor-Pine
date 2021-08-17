"use strict";

const log = require('loglevel').getLogger('DB'),
  AsyncLock = require('async-lock'),
  knex = require('knex'),
  privateSettings = require('../data/private-settings');

class DBManager {
  constructor() {
    this.initLock = new AsyncLock();
    this.initialized = false;

    this.connection = null;

    this.guilds = new Map();

    this.knex = knex({
      client: 'mysql',
      connection: {
        host: privateSettings.db.host,
        user: privateSettings.db.user,
        password: privateSettings.db.password,
        database: privateSettings.db.schema,
        port: privateSettings.db.port || '3306',
      },
      migrations: {
        directory: './app/db/migrations'
      },
      seeds: {
        directory: './app/db/seeds'
      },
      debug: true
    });
  }

  async init() {
    await this.initLock.acquire('db', async () => {
      if (!this.initialized) {
        await this.knex.migrate.latest()
          .then(() => this.knex.seed.run())
          .then(() => this.initialized = true)
          .catch(err => log.error(err));
     }
    });
  }

  async initialize(client) {
    await this.init();
    client.guilds.cache.forEach(guild =>
      this.insertIfAbsent('Guild', Object.assign({},
        {
          snowflake: guild.id
        }))
        .catch(err => log.error(err)));

    client.on('guildCreate', guild =>
      this.insertIfAbsent('Guild', Object.assign({},
        {
          snowflake: guild.id
        }))
        .catch(err => log.error(err)));

    client.on('guildDelete', guild => {
      this.DB('Guild')
        .where('snowflake', guild.id)
        .del()
        .catch(err => log.error(err));
    });
  }

  get DB() {
    return this.knex;
  }

  insertIfAbsent(tableName, data, transaction = undefined) {
    const firstData = data[0] ?
      data[0] :
      data,
      objectProperties = Object.getOwnPropertyNames(firstData),
      existsQuery = this.knex(tableName)
        .where(objectProperties[0], firstData[objectProperties[0]]);

    for (let i = 1; i < objectProperties.length; i++) {
      existsQuery
        .andWhere(objectProperties[i], firstData[objectProperties[i]]);
    }

    return existsQuery
      .first()
      .then(result => {
        if (!result) {
          return transaction ?
            this.knex(tableName).transacting(transaction)
              .insert(firstData)
              .returning('id') :
            this.knex(tableName)
              .insert(firstData)
              .returning('id');
        } else {
          return [result.id];
        }
      });
  }
}

module.exports = new DBManager();
