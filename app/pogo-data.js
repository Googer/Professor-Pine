const LRU = require('lru-cache'),
  request = require('request'),
  GAME_MASTER_URL = 'https://raw.githubusercontent.com/PokeMiners/game_masters/master/latest/latest.json',
  TEXT_URL = 'https://raw.githubusercontent.com/PokeMiners/pogo_assets/master/Texts/Latest%20APK/English.txt',
  cache = new LRU({
    max: 2,
    options: {
      ttl: 1000 * 30
    },
    updateAgeOnGet: false
  }),
  Lock = new (require('async-lock')),

  download = (url, isJson) => {
    return Lock.acquire(url, async () => {
      let result = cache.get(url);

      if (result === undefined) {
        return new Promise((resolve, reject) => {
          request.get(url, (error, response, body) => {
            if (response.body === '404: Not Found\n') {
              return reject(new Error('Could not find file.'));
            }
            if (error) {
              return reject(error);
            }

            try {
              const parsedBody = isJson ?
                JSON.parse(body) :
                body;
              cache.set(url, parsedBody);
              resolve(parsedBody);
            } catch (exception) {
              reject(exception);
            }
          });
        });

      } else {
        return result;
      }
    });
  },

  downloadGameMaster = async () => await download(GAME_MASTER_URL, true),
  downloadText = async () => await download(TEXT_URL, false);

module.exports = {downloadGameMaster, downloadText};
