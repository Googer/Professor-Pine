"use strict";

const log = require('loglevel').getLogger('ImageCacher'),
  path = require('path'),
  request = require('request'),
  fs = require('fs');

class ImageCacher {
  constructor() {
  }

  async fetchAndCache(url, fileName) {
    return new Promise(async (resolve, reject) => {
      if (fs.existsSync(fileName)) {
        resolve(fileName);
      } else {
        const outputDir = path.dirname(fileName).split(path.sep).pop();

        if (!fs.existsSync(outputDir)) {
          fs.mkdirSync(outputDir, {recursive: true});
        }

        const stream = request
          .get(url)
          .on('error', response => {
            log.error(`Something went wrong caching image for path ${fileName} from url: ${url}`);
            reject(false);
          })
          .pipe(fs.createWriteStream(fileName));

        stream.on('finish', async () => {
          resolve(fileName);
        });
      }
    });
  }

  async clearCache() {
    const that = this;
    return new Promise(async (resolve, reject) => {
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
    return new Promise(async (resolve, reject) => {
      fs.readdir(directory, async (err, files) => {
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
