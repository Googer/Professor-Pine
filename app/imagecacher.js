"use strict";

const log = require('loglevel').getLogger('ImageCacher'),
  request = require("request"),
  fs = require('fs');

class ImageCacher {
  constructor() {
  }

  async fetchAndCache(url, path) {
    return new Promise(async function (resolve, reject) {
      if (fs.existsSync(path)) {
        resolve(path);
      } else {
        const stream = request
          .get(url)
          .on('error', function (response) {
            log.error(`Something went wrong caching image for path ${path} from url: ${url}`);
            reject(false);
          })
          .pipe(fs.createWriteStream(path));

        stream.on('finish', async function () {
          resolve(path);
        });
      }
    });
  }

  async clearCache() {
    const that = this;
    return new Promise(async function (resolve, reject) {
      let regions = await that.deleteFilesInDirectory("images/regions").catch(error => false);
      let gyms = await that.deleteFilesInDirectory("images/gyms").catch(error => false);

      log.info(`DELETED REGION IMAGES: ${regions}`);
      log.info(`DELETED GYM IMAGES: ${gyms}`);

      let total = 0;
      if (regions) {
        total += regions
      }
      if (gyms) {
        total += gyms
      }

      resolve(total);
    });
  }

  deleteCachedImage(path) {
    fs.unlink(path, err => {
      if (err) {
        log.error(`An error occurred deleting cached image: ${err}`);
      }
    });
  }

  async deleteFilesInDirectory(directory) {
    return new Promise(async function (resolve, reject) {
      fs.readdir(directory, async function (err, files) {
        if (err) {
          reject(err);
        }
        let count = files.length;

        for (const file of files) {
          await fs.unlink(`${directory}/${file}`, err => {
            if (err) {
              log.error(`An error occurred deleting cached images: ${err}`);
              count -= 1;
            }
          });
        }

        resolve(count);
      });
    });
  }
}

module.exports = new ImageCacher();
