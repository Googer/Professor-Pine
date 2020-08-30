const request = require('request'),
  FETCH_URL = 'https://raw.githubusercontent.com/PokeMiners/game_masters/master/latest/latest.json';

const downloadGameMaster = () =>
  new Promise((resolve, reject) => {
    request.get(FETCH_URL, (error, response, body) => {
      if (response.body === '404: Not Found\n') {
        return reject(new Error('Could not find game_master.'));
      }
      if (error) {
        return reject(error);
      }

      try {
        resolve(JSON.parse(body));
      } catch (exception) {
        reject(exception);
      }
    });
  });

module.exports = {downloadGameMaster};
