const privateSettings = require('../data/private-settings'),
  log = require('loglevel').getLogger('DBHelper'),
  DB = require('./db'),
  mysql = require('mysql');

//Purpose of this class is for direct communication with MySQL
//This is necessary for doing geo queries on the database, which knex is not capable of handling
class DBHelper {
  constructor() {
    this.pool = mysql.createPool({
      host: privateSettings.db.host,
      user: privateSettings.db.user,
      password: privateSettings.db.password,
      database: privateSettings.db.schema,
      multipleStatements: true,
      supportBigNumbers: true,
      bigNumberStrings: true
    });
  }

  getConnection() {
    if (!this.connection) {
      this.connection = mysql.createConnection({
        host: privateSettings.db.host,
        user: privateSettings.db.user,
        password: privateSettings.db.password,
        database: privateSettings.db.schema,
        multipleStatements: true,
        supportBigNumbers: true,
        bigNumberStrings: true
      });
    }

    return this.connection;
  }

  handleDisconnect(connection) {
    connection.connect((err) => { // The server is either down
      if (err) { // or restarting (takes a while sometimes).
        log.error('error when connecting to db:', err);
        setTimeout(() => {
          this.handleDisconnect(connection);
        }, 2000); // We introduce a delay before attempting to reconnect,
      } // to avoid a hot loop, and to allow our node script to
    });

    connection.on('error', (err) => {
      log.error('db error', err);
      if (err.code === 'PROTOCOL_CONNECTION_LOST') { // Connection to the MySQL server is usually
        this.handleDisconnect(connection); // lost due to either server restart, or a
      } else { // connnection idle timeout (the wait_timeout
        throw err; // server variable configures this)
      }
    });
  }

  async query(queryString) {
    const that = this;
    return new Promise(async (resolve, reject) => {
      await DB.init();

      that.pool.getConnection(async (error, connection) => {
        connection.query("SET NAMES 'utf8mb4'");
        connection.query("SET CHARACTER SET 'utf8mb4'");
        connection.query(queryString, (err, results) => {
          connection.release();

          if (err) {
            log.error("mysql error: " + err);
            throw err
          } else {
            resolve(results);
          }
        });
      });
    });
  }

  async query(queryString, values) {
    const that = this;
    return new Promise(async (resolve, reject) => {
      await DB.init();

      that.pool.getConnection(async (error, connection) => {
        connection.query("SET NAMES 'utf8mb4'");
        connection.query("SET CHARACTER SET 'utf8mb4'");
        connection.query(queryString, values, (err, results) => {
          connection.release();
          if (err) {
            log.error("mysql error: " + err);
            throw err;
          } else {
            resolve(results);
          }
        });
      });

    });
  }

  escapeValue(value) {
    return mysql.escape(value);
  }
}

module.exports = new DBHelper();
