"use strict";

const log = require('loglevel').getLogger('ImageProcessor'),
  fs = require('fs'),
  Helper = require('./helper'),
  Jimp = require('jimp'),
  moment = require('moment'),
  path = require('path'),
  PartyManager = require('./party-manager'),
  Raid = require('./raid'),
  regionMap = require('PgP-Data/data/region-map'),
  settings = require('../data/settings'),
  tesseract = require('tesseract.js'),
  {TimeParameter} = require('./constants'),
  uuidv1 = require('uuid/v1');

// Will save all images regardless of how right or wrong, in order to better examine output
const debugFlag = true;

class ImageProcessing {
  constructor() {
    // store debug information into this folder
    this.imagePath = '/../assets/processing/';

    if (!fs.existsSync(path.join(__dirname, this.imagePath))) {
      fs.mkdirSync(path.join(__dirname, this.imagePath));
    }

    this.gymPokemonTesseract = tesseract.create({
      langPath: path.dirname(require.resolve('PgP-Data/data/eng.traineddata'))
    });
    this.timeTesseract = tesseract.create();
    this.tierTesseract = tesseract.create();

    this.baseTesseractOptions = {
      load_bigram_dawg: '0',
      load_fixed_length_dawgs: '0',
      load_freq_dawg: '0',
      load_unambig_dawg: '0',
      load_punc_dawg: '0',
      paragraph_text_based: '0',
      language_model_penalty_non_dict_word: '1.5',
      classify_misfit_junk_penalty: '0.8',
      language_model_penalty_font: '0.8',
      language_model_penalty_script: '0.8',
      segment_penalty_dict_nonword: '1.5',
      // segment_penalty_garbage: '2.0'
    };

    this.gymPokemonTesseractOptions = Object.assign({}, this.baseTesseractOptions, {
      load_number_dawg: '0'
    });

    this.timeTesseractOptions = Object.assign({}, this.baseTesseractOptions, {
      load_system_dawg: '0',
      tessedit_pageseg_mode: '7',	// character mode; instead of word mode
      tessedit_char_whitelist: '0123456789:! APM',
      numeric_punctuation: ':'
    });

    this.timeRemainingTesseractOptions = Object.assign({}, this.baseTesseractOptions, {
      load_system_dawg: '0',
      // tessedit_pageseg_mode: '7',	// character mode; instead of word mode
      tessedit_char_whitelist: '0123456789: ',
      numeric_punctuation: ':'
    });

    this.tierTesseractOptions = Object.assign({}, this.baseTesseractOptions, {
      load_system_dawg: '0',
      load_punc_dawg: '0',
      load_number_dawg: '0',
      classify_misfit_junk_penalty: '0',
      tessedit_char_whitelist: '@®©'
    });
  }

  initialize() {
    Helper.client.on('message', message => {
      const imageUrl = (message.attachments.size) ?
        message.attachments.first().url :
        '';

      // attempt to process first attachment/image if it exists (maybe some day will go through all the attachments...)
      if (imageUrl && imageUrl.search(/jpg|jpeg|png/)) {
        log.info('Image Processing Start: ', message.author.id, message.channel.name, imageUrl);
        message.temporaryProcessingTimestamp = Date.now();
        this.process(message, imageUrl);
      }
    });
  }

  /**
   * Convert a suspected limited-range pixel value from limited range (16-235)
   * to full range (0-255), clamping as necessary
   */
  static convertToFullRange(value) {
    return Math.min(
      Math.max((value - 16) * (256 / 219), 0),
      255);
  }

  process(message, url) {
    let newImage, id;

    // if not in a proper raid channel, cancel out immediately
    if (!regionMap[message.channel.name]) {
      return;
    }

    // show users the bot is starting to process their image
    message.react('🤔')
      .catch(err => log.error(err));

    Jimp.read(url)
      .then(image => {
        if (!image) {
          return;
        }
        id = uuidv1();

        // resize to some standard size to help tesseract
        newImage = image.scaleToFit(1440, 2560, Jimp.RESIZE_HERMITE);

        // determine if image is a raid image or not
        let raid = false;

        // check for pink "time remaining" pixels
        newImage.scan(newImage.bitmap.width / 2, (newImage.bitmap.height / 4.34) - 80, 1, 160, function (x, y, idx) {
          if (raid) {
            return;
          }

          let red = this.bitmap.data[idx],
            green = this.bitmap.data[idx + 1],
            blue = this.bitmap.data[idx + 2];

          // pink = { r: 250, g: 135, b: 149 }
          if (red <= 255 && red >= 227 && green <= 148 && green >= 122 && blue <= 162 && blue >= 136) {
            raid = true;
            return;
          }

          red = ImageProcessing.convertToFullRange(red);
          green = ImageProcessing.convertToFullRange(green);
          blue = ImageProcessing.convertToFullRange(blue);

          if (red <= 255 && red >= 227 && green <= 148 && green >= 122 && blue <= 162 && blue >= 136) {
            raid = true;
          }
        });

        if (!raid) {
          // check for orange "time remaining" pixels
          newImage.scan(newImage.bitmap.width / 1.19, (newImage.bitmap.height / 1.72) - 80, 1, 160, function (x, y, idx) {
            if (raid) {
              return;
            }

            let red = this.bitmap.data[idx],
              green = this.bitmap.data[idx + 1],
              blue = this.bitmap.data[idx + 2];

            // orange = { r: 255, g: 120, b: 55 }
            if (red <= 255 && red >= 232 && green <= 133 && green >= 107 && blue <= 68 && blue >= 42) {
              raid = true;
              return;
            }

            red = ImageProcessing.convertToFullRange(red);
            green = ImageProcessing.convertToFullRange(green);
            blue = ImageProcessing.convertToFullRange(blue);

            if (red <= 255 && red >= 232 && green <= 133 && green >= 107 && blue <= 68 && blue >= 42) {
              raid = true;
            }
          });
        }

        if (!raid) {
          return null;
        }

        return this.getRaidData(id, message, newImage);
      })
      .then(data => {
        // write original image as a reference
        if (debugFlag ||
          ((data === false || (data && (!data.phoneTime || !data.gym || !data.timeRemaining || data.pokemon.placeholder))) && log.getLevel() === log.levels.DEBUG)) {
          log.debug(data);
          newImage.write(path.join(__dirname, this.imagePath, `${id}.png`));
        }

        if (data) {
          this.createRaid(message, data);
        } else {
          // this means no gym was found what-so-ever so either processing was really messed up or it's not a raid screenshot
          this.removeReaction(message);
        }
      })
      .catch(err => {
        // something went very wrong
        log.error(err);
        this.removeReaction(message);
        message.react('❌')
          .catch(err => log.error(err));
      });
  }

  /**
   * Header can contain black-gray text or white-gray text
   *    need to turn these areas into extremes and filter out everything else
   **/
  filterNearWhiteContent(x, y, idx) {
    const red = this.bitmap.data[idx + 0],
      green = this.bitmap.data[idx + 1],
      blue = this.bitmap.data[idx + 2],
      alpha = this.bitmap.data[idx + 3];

    if (red >= 210 && green >= 210 && blue >= 210) {
      this.bitmap.data[idx + 0] = 255;
      this.bitmap.data[idx + 1] = 255;
      this.bitmap.data[idx + 2] = 255;
    } else {
      this.bitmap.data[idx + 0] = 0;
      this.bitmap.data[idx + 1] = 0;
      this.bitmap.data[idx + 2] = 0;
    }
  }

  /**
   * Header can contain black-gray text or white-gray text
   *    need to turn these areas into extremes and filter out everything else
   **/
  filterSemiWhiteContent(x, y, idx) {
    const red = this.bitmap.data[idx + 0],
      green = this.bitmap.data[idx + 1],
      blue = this.bitmap.data[idx + 2],
      alpha = this.bitmap.data[idx + 3];

    if (red >= 150 && green >= 150 && blue >= 150) {
      this.bitmap.data[idx + 0] = 255;
      this.bitmap.data[idx + 1] = 255;
      this.bitmap.data[idx + 2] = 255;
    } else {
      this.bitmap.data[idx + 0] = 0;
      this.bitmap.data[idx + 1] = 0;
      this.bitmap.data[idx + 2] = 0;
    }
  }

  /**
   * Header can contain black-gray text or white-gray text
   *    need to turn these areas into extremes and filter out everything else
   **/
  filterNearBlackContent(x, y, idx) {
    const red = this.bitmap.data[idx + 0],
      green = this.bitmap.data[idx + 1],
      blue = this.bitmap.data[idx + 2],
      alpha = this.bitmap.data[idx + 3];

    if (red <= 18 && green <= 18 && blue <= 18) {
      this.bitmap.data[idx + 0] = 255;
      this.bitmap.data[idx + 1] = 255;
      this.bitmap.data[idx + 2] = 255;
    } else {
      this.bitmap.data[idx + 0] = 0;
      this.bitmap.data[idx + 1] = 0;
      this.bitmap.data[idx + 2] = 0;
    }
  }

  /**
   * Header can contain black-gray text or white-gray text
   *    need to turn these areas into extremes and filter out everything else
   **/
  filterSemiBlackContent(x, y, idx) {
    const red = this.bitmap.data[idx + 0],
      green = this.bitmap.data[idx + 1],
      blue = this.bitmap.data[idx + 2],
      alpha = this.bitmap.data[idx + 3];

    if (red <= 50 && green <= 50 && blue <= 50) {
      this.bitmap.data[idx + 0] = 255;
      this.bitmap.data[idx + 1] = 255;
      this.bitmap.data[idx + 2] = 255;
    } else {
      this.bitmap.data[idx + 0] = 0;
      this.bitmap.data[idx + 1] = 0;
      this.bitmap.data[idx + 2] = 0;
    }
  }

  /**
   * Normal body text will always be white-gray text, don't need to be as aggressive here
   **/
  filterBodyContent(x, y, idx) {
    const red = this.bitmap.data[idx + 0],
      green = this.bitmap.data[idx + 1],
      blue = this.bitmap.data[idx + 2],
      alpha = this.bitmap.data[idx + 3];

    if (red >= 170 && green >= 170 && blue >= 170) {
      this.bitmap.data[idx + 0] = 255;
      this.bitmap.data[idx + 1] = 255;
      this.bitmap.data[idx + 2] = 255;
    } else {
      this.bitmap.data[idx + 0] = 0;
      this.bitmap.data[idx + 1] = 0;
      this.bitmap.data[idx + 2] = 0;
    }
  }

  /**
   * Normal body text will always be white-gray text, don't need to be as aggressive here
   **/
  filterBodyContent2(x, y, idx) {
    const red = this.bitmap.data[idx + 0],
      green = this.bitmap.data[idx + 1],
      blue = this.bitmap.data[idx + 2],
      alpha = this.bitmap.data[idx + 3];

    if (red >= 210 && green >= 210 && blue >= 210) {
      this.bitmap.data[idx + 0] = 255;
      this.bitmap.data[idx + 1] = 255;
      this.bitmap.data[idx + 2] = 255;
    } else {
      this.bitmap.data[idx + 0] = 0;
      this.bitmap.data[idx + 1] = 0;
      this.bitmap.data[idx + 2] = 0;
    }
  }

  /**
   * Large text such as the pokemon name, cp, or tier information is here and will always be white-gray
   **/
  filterLargeBodyContent(x, y, idx) {
    const red = this.bitmap.data[idx + 0],
      green = this.bitmap.data[idx + 1],
      blue = this.bitmap.data[idx + 2],
      alpha = this.bitmap.data[idx + 3];

    if (red >= 200 && green >= 200 && blue >= 200) {
      this.bitmap.data[idx + 0] = 255;
      this.bitmap.data[idx + 1] = 255;
      this.bitmap.data[idx + 2] = 255;
    } else {
      this.bitmap.data[idx + 0] = 0;
      this.bitmap.data[idx + 1] = 0;
      this.bitmap.data[idx + 2] = 0;
    }
  }

  /**
   * Large text such as the pokemon name, cp, or tier information is here and will always be white-gray
   **/
  filterLargeBodyContent2(x, y, idx) {
    const red = this.bitmap.data[idx + 0],
      green = this.bitmap.data[idx + 1],
      blue = this.bitmap.data[idx + 2],
      alpha = this.bitmap.data[idx + 3];

    if (red >= 180 && green >= 180 && blue >= 180) {
      this.bitmap.data[idx + 0] = 255;
      this.bitmap.data[idx + 1] = 255;
      this.bitmap.data[idx + 2] = 255;
    } else {
      this.bitmap.data[idx + 0] = 0;
      this.bitmap.data[idx + 1] = 0;
      this.bitmap.data[idx + 2] = 0;
    }
  }

  /**
   * Trying to filter out near-pure white pixels
   **/
  filterPureWhiteContent(x, y, idx) {
    const red = this.bitmap.data[idx + 0],
      green = this.bitmap.data[idx + 1],
      blue = this.bitmap.data[idx + 2],
      alpha = this.bitmap.data[idx + 3];

    if (red >= 240 && green >= 240 && blue >= 240) {
      this.bitmap.data[idx + 0] = 255;
      this.bitmap.data[idx + 1] = 255;
      this.bitmap.data[idx + 2] = 255;
    } else {
      this.bitmap.data[idx + 0] = 0;
      this.bitmap.data[idx + 1] = 0;
      this.bitmap.data[idx + 2] = 0;
    }
  }

  /**
   * Trying to filter out near-pure white pixels
   **/
  filterPureWhiteContent2(x, y, idx) {
    const red = this.bitmap.data[idx + 0],
      green = this.bitmap.data[idx + 1],
      blue = this.bitmap.data[idx + 2],
      alpha = this.bitmap.data[idx + 3];

    if (red >= 247 && green >= 247 && blue >= 247) {
      this.bitmap.data[idx + 0] = 255;
      this.bitmap.data[idx + 1] = 255;
      this.bitmap.data[idx + 2] = 255;
    } else {
      this.bitmap.data[idx + 0] = 0;
      this.bitmap.data[idx + 1] = 0;
      this.bitmap.data[idx + 2] = 0;
    }
  }

  /**
   * Given a tesseract result, find the highest-confidence subsequences in the result text
   */
  tesseractGetConfidentSequences(result, useWords = false, minConfidence = 60) {
    return result.text === '' ?
      [] :
      useWords ?
        [result.words
          .map(word => word.choices
            // choose highest-confidence word
              .sort((choiceA, choiceB) => choiceB.confidence - choiceA.confidence)[0]
          )
          .filter(word => word.confidence > minConfidence)
          .map(word => word.text)
          .join(' ')] :
        result.symbols
        // strip out very low-confidence colons (tesseract will see them correctly but with low confidence)
          .filter(symbol => symbol.text !== ':' || symbol.confidence >= 20)
          .map(symbol => Object.assign({}, symbol, symbol.choices
            // choose highest-confidence symbol - not always the default one from tesseract!
              .sort((choiceA, choiceB) => choiceB.confidence - choiceA.confidence)[0]
          ))
          .reduce((previous, current) => {
            /// separate into chunks using low-confidence symbols as separators
            let chunk;

            if (current.confidence < minConfidence || previous.length === 0 ||
              current.word.baseline !== previous[previous.length - 1][previous[previous.length - 1].length - 1].word.baseline
            ) {
              chunk = [];
              previous.push(chunk);
            } else {
              chunk = previous[previous.length - 1];
            }

            chunk.push(current);

            return previous;
          }, [])
          // strip out symbols below min threshold
          .map(array => array.filter(symbol => symbol.confidence >= minConfidence))
          // sort to put highest-confidence tokens first
          .sort((arrA, arrB) => ((arrB
              .map(symbol => symbol.confidence)
              .reduce((total, current) => total + current, 0) / arrB.length) || 0) -
            ((arrA
              .map(symbol => symbol.confidence)
              .reduce((total, current) => total + current, 0) / arrA.length) || 0))
          .map(symbols => symbols.map(symbol => symbol.text)
            .join(''));
  }

  /**
   * Basically try to augment tesseract text confidence in by replacing low confidence with spaces and searching for colons
   **/
  tesseractProcessTime(result) {
    const confidentText = this.tesseractGetConfidentSequences(result, false, 70);

    let match = '';

    confidentText.forEach(text => {
      if (match !== '') {
        return;
      }

      // if still no colon, replace common matches with colon in an attempt to get a match
      if (text.search(':') < 0) {
        text = text.replace(/!/g, ':');
      }

      // HACK: On a decent number of screenshots, a colon in the phone time is seen as a 1 or 2,
      // so try making a version of the time that replaces it to cover this possibility
      if (text.match(/([0-2]?\d)([12])([0-5]\d)(\s?[ap]m)?/)) {
        text = text.replace(/([0-2]?\d)([12])([0-5]\d)(\s?[ap]m)?/, '$1:$3') + ' ' + text;
      }

      let textMatch = text
        .replace(/[^\w\s:!]/g, ' ')
        .match(/([0-2]?\d:?([0-5]\d)(\s?[ap]m)?)/i);

      if (textMatch) {
        match = textMatch;
      }
    });

    return match;
  }

  async getPhoneTime(id, message, image, region) {
    let value, phoneTime;

    // try different levels of processing to get time
    for (let processingLevel = 0; processingLevel <= 3; processingLevel++) {
      const debugImagePath = path.join(__dirname, this.imagePath, `${id}-phone-time-${processingLevel}.png`);

      value = await this.getOCRPhoneTime(id, message, image, region, processingLevel);
      phoneTime = value.text;

      if (phoneTime) {
        // Determine AM or PM time
        if (phoneTime.search(/([ap])m/gi) >= 0) {
          phoneTime = moment(phoneTime, ['hmm a', 'h:m a']);
        } else {
          // figure out if time should be AM or PM
          const now = moment(),
            timeAM = moment(phoneTime + ' am', ['hmm a', 'Hmm', 'h:m a', 'H:m']),
            timePM = moment(phoneTime + ' pm', ['hmm a', 'Hmm', 'h:m a', 'H:m']),
            times = [timeAM.diff(now), timePM.diff(now)];

          // whatever time is closer to current time (less diff), use that
          if (Math.abs(times[0]) < Math.abs(times[1])) {
            phoneTime = timeAM;
          } else {
            phoneTime = timePM;
          }
        }
      }

      // something has gone wrong if no info was matched, save image for later analysis
      if (debugFlag || ((!phoneTime || (phoneTime && !phoneTime.isValid())) && log.getLevel() === log.levels.DEBUG)) {
        log.debug('Phone Time: ', id, value.text);
        value.image.write(debugImagePath);
      }

      // don't jump up to next level of processing if a time has been found
      if (phoneTime && phoneTime.isValid()) {
        break;
      }
    }

    // NOTE:  There is a chance that the time is not valid, but when that's the case
    //        I think we should just leave the time unset, rather than guessing that the time is now.
    //        Don't want to confuse people with slightly incorrect times.
    return {phoneTime: phoneTime};
  }

  getOCRPhoneTime(id, message, image, region, level = 0) {
    return new Promise((resolve, reject) => {
      const croppedRegion = {
        x: 0,
        y: region.y,
        width: region.width,
        height: region.height
      };

      new Promise((resolve, reject) => {
        let newImage = image.clone()
          .crop(croppedRegion.x, croppedRegion.y, croppedRegion.width, croppedRegion.height)
          .scale(2, Jimp.RESIZE_HERMITE);

        switch (level) {
          case 0:
            newImage = newImage.scan(0, 0, croppedRegion.width * 2, croppedRegion.height * 2, this.filterNearBlackContent);
            break;

          case 1:
            newImage = newImage.scan(0, 0, croppedRegion.width * 2, croppedRegion.height * 2, this.filterNearWhiteContent);
            break;

          case 2:
            newImage = newImage.scan(0, 0, croppedRegion.width * 2, croppedRegion.height * 2, this.filterSemiBlackContent);
            break;

          case 3:
            newImage = newImage.scan(0, 0, croppedRegion.width * 2, croppedRegion.height * 2, this.filterSemiWhiteContent);
            break;
        }

        newImage.getBuffer(Jimp.MIME_PNG, (err, image) => {
          if (err) {
            reject(err);
          }

          this.timeTesseract.recognize(image, this.timeTesseractOptions)
            .catch(err => reject(err))
            .then(result => {
              const match = this.tesseractProcessTime(result);
              if (match && match.length) {
                resolve({
                  image: newImage,
                  text: match[1],
                  result
                });
              } else {
                resolve({
                  image: newImage,
                  result
                });
              }
            });
        });
      })
        .then(value => {
          resolve(value);
        })
        .catch(err => {
          reject(err);
        });
    });
  }

  async getRaidTimeRemaining(id, message, image, region) {
    const debugImagePathA = path.join(__dirname, this.imagePath, `${id}-time-remaining-a.png`),
      debugImagePathB = path.join(__dirname, this.imagePath, `${id}-time-remaining-b.png`),
      values = await this.getOCRRaidTimeRemaining(id, message, image, region);

    // something has gone wrong if no info was matched, save image for later analysis
    if (debugFlag || (!values.text && log.getLevel() === log.levels.DEBUG)) {
      log.debug('Time Remaining (a): ', id, values.result1.text);
      log.debug('Time Remaining (b): ', id, values.result2.text);
      values.image1.write(debugImagePathA);
      values.image2.write(debugImagePathB);
    }

    // NOTE:  There is a chance timeRemaining could not be determined... not sure if we would want to do
    //        a different time of image processing at that point or not...
    return {timeRemaining: values.text, definitelyEgg: values.definitelyEgg};
  }

  getOCRRaidTimeRemaining(id, message, image, region) {
    return new Promise((resolve, reject) => {
      const region1 = {
          x: region.width - (region.width / 3.4),
          y: region.height - (region.height / 2.2),
          width: region.width / 4,
          height: region.height / 12
        },
        region2 = {
          x: (region.width / 2) - (region.width / 6),
          y: region.height / 6.4,
          width: region.width / 3,
          height: region.height / 8
        };

      let promises = [];

      // check the middle-right portion of the screen for the time remaining (pokemon)
      promises.push(new Promise((resolve, reject) => {
        const newImage = image.clone()
          .crop(region1.x, region1.y, region1.width, region1.height)
          .scan(0, 0, region1.width, region1.height, this.filterPureWhiteContent)
          .getBuffer(Jimp.MIME_PNG, (err, image) => {
            if (err) {
              reject(err);
            }

            this.timeTesseract.recognize(image, this.timeRemainingTesseractOptions)
              .catch(err => reject(err))
              .then(result => {
                const confidentWords = this.tesseractGetConfidentSequences(result, true),
                  match = confidentWords.length > 0 ?
                    confidentWords[0].match(/(\d{1,2}:\d{2}:\d{2})/) :
                    '';
                if (match && match.length) {
                  resolve({
                    image: newImage,
                    text: match[1],
                    result
                  });
                } else {
                  resolve({
                    image: newImage,
                    result
                  });
                }
              });
          });
      }));

      // check the top-middle portion of the screen for the time remaining (egg)
      promises.push(new Promise((resolve, reject) => {
        const newImage = image.clone()
          .crop(region2.x, region2.y, region2.width, region2.height)
          .scan(0, 0, region2.width, region2.height, this.filterPureWhiteContent)
          .getBuffer(Jimp.MIME_PNG, (err, image) => {
            if (err) {
              reject(err);
            }

            this.timeTesseract.recognize(image, this.timeRemainingTesseractOptions)
              .catch(err => reject(err))
              .then(result => {
                const confidentWords = this.tesseractGetConfidentSequences(result, true),
                  match = confidentWords.length > 0 ?
                    confidentWords[0].match(/(\d{1,2}:\d{2}:\d{2})/) :
                    '';
                if (match && match.length) {
                  resolve({
                    image: newImage,
                    text: match[1],
                    result
                  });
                } else {
                  resolve({
                    image: newImage,
                    result
                  });
                }
              });
          });
      }));

      // pass along collected data once all promises have resolved
      Promise.all(promises)
        .then(values => {
          resolve({
            definitelyEgg: !!values[1].text,
            image1: values[0].image,
            image2: values[1].image,
            text: values[0].text || values[1].text,
            result1: values[0].result,
            result2: values[1].result
          });
        })
        .catch(err => {
          reject(err);
        });
    });
  }

  async getGymName(id, message, image, region) {
    const GymType = Helper.client.registry.types.get('gym');
    let values, gymName, gymWords;
    let validation = false;

    // try different levels of processing to get gym name
    for (let processingLevel = 0; processingLevel <= 1; processingLevel++) {
      const debugImagePath = path.join(__dirname, this.imagePath, `${id}-gym-name-${processingLevel}.png`);
      values = await this.getOCRGymName(id, message, image, region, processingLevel);

      // start by splitting into words of 3 characters or more, and sorting by size of each word
      gymName = values.text;
      gymWords = gymName.split(' ')
        .filter(word => {
          return word.length > 2;
        })
        .sort((a, b) => b.length - a.length);

      // re-combine shortened gym name
      gymName = gymWords.join(' ');

      // ensure gym exist and is allowed to be created
      validation = await GymType.validate(gymName, message, {isScreenshot: true});

      if (!validation) {
        // If gymName doesn't exist, start popping off the shortest words in an attempt to get a match
        //    Example: 6 words = 3 attempts, 2 words = 1 attempt
        for (let i = 0; i <= Math.floor(gymWords.length / 2); i++) {
          const word = gymWords[gymWords.length - 1];

          // only remove words of length 4 characters or lower
          if (word && word.length <= 4) {
            gymWords.pop();
            gymName = gymWords.join(' ');

            // ensure gym exists and is allowed to be created
            validation = await GymType.validate(gymName, message, {isScreenshot: true});

            if (validation) {
              break;
            }
          } else {
            // stop trying to remove words
            break;
          }
        }
      }

      if (debugFlag || (!validation && log.getLevel() === log.levels.DEBUG)) {
        log.debug('Gym Name: ', id, values.text);
        values.image.write(debugImagePath);
      }

      if (validation) {
        break;
      }
    }

    if (validation === true) {
      return await GymType.parse(gymName, message, {isScreenshot: true});
    }

    if (validation !== true && validation !== false) {
      message.channel.send(validation)
        .then(message => message.delete({timeout: settings.messageCleanupDelayError}))
        .catch(err => log.error(err));
    }

    // If nothing has been determined to make sense, then either OCR or Validation has failed for whatever reason
    // TODO:  Try a different way of getting tesseract info from image
    return false;
  }

  getOCRGymName(id, message, image, region, level = 0) {
    return new Promise((resolve, reject) => {
      let newImage = image.clone()
        .crop(region.x, region.y, region.width, region.height);

      // basic level 0 processing by default
      if (level === 0) {
        newImage = newImage.scan(0, 0, region.width, region.height, this.filterBodyContent);
      } else {
        newImage = newImage.scan(0, 0, region.width, region.height, this.filterBodyContent2);
      }

      newImage.getBuffer(Jimp.MIME_PNG, (err, image) => {
        if (err) {
          reject(err);
        }

        this.gymPokemonTesseract.recognize(image, this.gymPokemonTesseractOptions)
          .catch(err => reject(err))
          .then(result => {
            const confidentWords = this.tesseractGetConfidentSequences(result, true),
              text = confidentWords.length > 0 ?
                confidentWords[0]
                  .replace(/[^\w\s-]/g, '')
                  .replace(/\n/g, ' ').trim() :
                '';
            resolve({
              image: newImage,
              text,
              result
            });
          });
      });
    });
  }

  async getPokemonName(id, message, image, region) {
    const PokemonType = Helper.client.registry.types.get('pokemon');
    let values,
      pokemon,
      cp;

    // try different levels of processing to get pokemon
    for (let processingLevel = 0; processingLevel <= 4; processingLevel++) {
      const debugImagePath = path.join(__dirname, this.imagePath, `${id}-pokemon-name-${processingLevel}.png`);
      values = await this.getOCRPokemonName(id, message, image, region, processingLevel);
      pokemon = values.pokemon;
      cp = values.cp;

      if (PokemonType.validate(pokemon, message) === true) {
        pokemon = PokemonType.parse(pokemon, message);
      } else if (PokemonType.validate(`${cp}`, message) === true) {
        pokemon = PokemonType.parse(`${cp}`, message);
      } else {
        // if not a valid pokemon, use some placeholder information
        pokemon = {
          placeholder: true,
          name: 'pokemon',
          tier: '????'
        };
      }
      pokemon.egg = false;

      // something has gone wrong if no info was matched, save image for later analysis
      if (debugFlag || (pokemon.placeholder && log.getLevel() === log.levels.DEBUG)) {
        log.debug('Pokemon Name: ', id, values.result.text);
        values.image.write(debugImagePath);
      }

      // match found, can stop now
      if (!pokemon.placeholder) {
        break;
      }
    }

    return {pokemon, cp};
  }

  getOCRPokemonName(id, message, image, region, level = 0) {
    // modify crop region based on "level" of processing
    const widthAmount = (region.width / 22) * level,
      heightAmount = (region.height / 15) * level;

    region = {
      x: region.x + widthAmount,
      y: region.y + heightAmount - (heightAmount / 15),
      width: region.width - (widthAmount * 2),
      height: region.height - (heightAmount * 2)
    };

    return new Promise((resolve, reject) => {
      let newImage = image.clone();

      newImage = newImage.crop(region.x, region.y, region.width, region.height)
        .blur(3)
        .brightness(-0.2);

      if (!(level % 2)) {
        newImage = newImage.scan(0, 0, region.width, region.height, this.filterLargeBodyContent);
      } else {
        newImage = newImage.scan(0, 0, region.width, region.height, this.filterLargeBodyContent2);
      }

      newImage.getBuffer(Jimp.MIME_PNG, (err, image) => {
        if (err) {
          reject(err);
        }

        this.gymPokemonTesseract.recognize(image, this.gymPokemonTesseractOptions)
          .catch(err => reject(err))
          .then(result => {
            const text = result.text.replace(/[^\w\n]/gi, '');
            let matchCP = text.match(/\d{3,10}/g),
              matchPokemon = text.replace(/(cp)?\s?\d+/g, ' ').match(/\w+/g),
              pokemon = '',
              cp = 0;

            // get longest matching word as "pokemon"
            if (matchPokemon && matchPokemon.length) {
              pokemon = matchPokemon.sort((a, b) => b.length - a.length)[0];
            }

            // get longest matching number as "cp"
            if (matchCP && matchCP.length) {
              cp = Number(matchCP.sort((a, b) => b.length - a.length)[0]).valueOf();
            }

            resolve({
              image: newImage,
              cp,
              pokemon,
              result
            });
          });
      });
    });
  }

  async getTier(id, message, image, region, definitelyEgg) {
    const PokemonType = Helper.client.registry.types.get('pokemon');
    let values, pokemon;

    // try different levels of processing to get time
    for (let processingLevel = 0; processingLevel <= 2; processingLevel++) {
      const debugImagePath = path.join(__dirname, this.imagePath, `${id}-tier-${processingLevel}.png`);
      values = await this.getOCRTier(id, message, image, region, processingLevel);

      // NOTE: Expects string in validation of egg tier
      pokemon = `${values.tier}`;
      if (PokemonType.validate(pokemon, message) === true) {
        pokemon = PokemonType.parse(pokemon, message);
      } else {
        // if not a valid tier, use some placeholder information
        pokemon = {placeholder: true, name: 'egg', tier: '????'};
      }

      // something has gone wrong if no info was matched, save image for later analysis
      log.debug('Tier: ', id, values.result.text);
      if (debugFlag || (pokemon.placeholder && log.getLevel() === log.levels.DEBUG)) {
        values.image.write(debugImagePath);
      }

      if (!pokemon.placeholder) {
        break;
      }
    }

    // NOTE:  There is a chance egg tier could not be determined and we may need to try image processing again before returning...
    return {tier: values.tier, pokemon, egg: definitelyEgg || values.tier > 0};
  }

  async getOCRTier(id, message, image, region, level = 0) {
    let y;

    if (level === 0) {
      y = region.y;
    } else {
      y = region.y - ((region.height / 8) * level);
    }

    // checking left and right sides of image for time...
    region = {
      x: region.x,
      y,
      width: region.width,
      height: region.height
    };

    return new Promise((resolve, reject) => {
      const newImage = image.clone()
        .crop(region.x, region.y, region.width, region.height)
        .scan(0, 0, region.width, region.height, this.filterPureWhiteContent2)
        .blur(1)
        .getBuffer(Jimp.MIME_PNG, (err, image) => {
          if (err) {
            reject(err);
          }

          this.tierTesseract.recognize(image, this.tierTesseractOptions)
            .catch(err => reject(err))
            .then(result => {
              let tier = 0;

              // tier symbols will all be on the same line, so pick the text/line of whatever line has the most matches (assuming other lines are stray artifacts and/or clouds)
              for (let i = 0; i < result.lines.length; i++) {
                // replace characters that are almost always jibberish characters
                const text = result.lines[i].text
                  .replace(/\s/g, '')
                  .replace(/“”‘’"'-_=\\\/\+/g, '');

                // match highly probable / common character regex
                const match = text.match(/[@Q9Wé®©]+/g);

                if (match && match.length && match[0].length > tier) {
                  tier = match[0].length;
                }
              }

              resolve({
                image: newImage,
                tier,
                result
              });
            });
        });
    });
  }

  async getRaidData(id, message, image) {
    const checkPhoneColor = Jimp.intToRGBA(image.getPixelColor(0, 85)),

      // location of cropping / preprocessing for different pieces of information (based on % width & % height for scalability purposes)
      gymLocation = {
        x: image.bitmap.width / 5.1,
        y: image.bitmap.height / 26,
        width: image.bitmap.width - (image.bitmap.width / 5.1),
        height: image.bitmap.height / 13
      },
      phoneTimeCrop = {
        x: image.bitmap.width / 2.5,
        y: 0,
        width: image.bitmap.width,
        height: image.bitmap.height / 27
      },
      pokemonNameCrop = {
        x: 0,
        y: image.bitmap.height / 7.0,
        width: image.bitmap.width,
        height: image.bitmap.height / 4.7
      },
      tierCrop = {
        x: image.bitmap.width / 3.8,
        y: image.bitmap.height / 3.65,
        width: image.bitmap.width - (image.bitmap.width / 1.9),
        height: image.bitmap.height / 8
      },
      allCrop = {
        x: 0,
        y: 0,
        width: image.bitmap.width,
        height: image.bitmap.height
      };
    let promises = [];

    // special case for some kind of odd vertical phone
    if (checkPhoneColor.r <= 20 && checkPhoneColor.g <= 20 && checkPhoneColor.b <= 20) {
      gymLocation.y += 100;
    }

    // GYM NAME
    const gym = await this.getGymName(id, message, image, gymLocation);

    if (!gym) {
      return false;
    }

    // PHONE TIME
    promises.push(this.getPhoneTime(id, message, image, phoneTimeCrop));

    // TIME REMAINING
    const {timeRemaining, definitelyEgg} = await this.getRaidTimeRemaining(id, message, image, allCrop);

    // NOTE:  This seems like a bug in await syntax, but I can't use shorthands for settings values
    //        when they're await within an IF function like this... really stupid.
    if (definitelyEgg) {
      // POKEMON TIER
      promises.push(this.getTier(id, message, image, tierCrop, true));
    } else {
      // POKEMON NAME
      promises.push(this.getPokemonName(id, message, image, pokemonNameCrop));
      promises.push(this.getTier(id, message, image, tierCrop, false));
    }

    // CLARIFICATION:  So basically tier, pokemon, cp, and phone time are not dependent on each other,
    //                 so by making them totally asynchronous, we speed up execution time slightly.
    return Promise.all(promises)
      .then(values => {
        const selectedPokemon = definitelyEgg ?
          values[1].pokemon : // tier-detected pokemon is value 1 when we're confident it's an egg
          values[1].pokemon.placeholder ?
            values[2].tier > 0 ?
              values[2].pokemon : // value 1 is a placeholder, so use value 2 if it got a reading on tier
              values[1].pokemon : // value 2 didn't read a tier, so use value 1's placeholder
            values[1].pokemon; // pokemon read successfully; use it

        return {
          gym,
          timeRemaining: timeRemaining,
          phoneTime: values[0].phoneTime,
          tier: values[1].tier || (values[2] && values[2].tier) || 0,
          cp: values[1].cp || 0,
          pokemon: selectedPokemon
        };
      })
      .catch(err => {
        log.error(err);
        return false;
      });
  }

  removeReaction(message) {
    message.reactions
      .filter(reaction => reaction.emoji.name === '🤔' && reaction.me)
      .forEach(reaction => reaction.users.remove(message.client.user.id)
        .catch(err => log.error(err)))
  }

  createRaid(message, data) {
    const TimeType = Helper.client.registry.types.get('time'),
      messageTime = moment(message.createdAt),
      earliestAcceptedTime = messageTime.clone()
        .subtract(settings.standardRaidIncubateDuration, 'minutes')
        .subtract(settings.standardRaidHatchedDuration, 'minutes');

    let gymId = data.gym,
      pokemon = data.pokemon,
      time = data.phoneTime,
      duration = data.timeRemaining ?
        moment.duration(data.timeRemaining, 'hh:mm:ss') :
        moment.invalid(),
      arg = {},
      timeWarn = false;

    // If time wasn't found or is way off-base, base raid's expiration time off of message time instead
    if (!time || !time.isBetween(earliestAcceptedTime, messageTime, null, '[]')) {
      time = messageTime.clone().subtract(settings.screenshotMessageOffsetTime, 'seconds');
      timeWarn = true;
    }

    // Need to fake TimeType data in order to validate/parse time...
    // NOTE:  all time must be "end time" due to how createRaid works / expects end time
    message.argString = '';
    message.isExclusive = false;
    arg.prompt = '';
    arg.key = TimeParameter.END;

    // if egg, need to add standard hatched duration to phone's time to account for raid's actual duration
    // when setting end time
    if (time && time.isValid() && pokemon.egg) {
      time = time.add(settings.standardRaidHatchedDuration, 'minutes');
    }

    // add duration to time if both exist
    if (time && time.isValid() && duration.isValid() && duration.asMilliseconds() > 0) {
      // add time remaining to phone's current time to get final hatch or despawn time
      time = time.add(duration);
    }

    if (TimeType.validate(time.format('[at] h:mma'), message, arg) === true) {
      time = TimeType.parse(time.format('[at] h:mma'), message, arg);
    } else {
      // time was not valid, don't set any time (would rather have accurate time, than an inaccurate guess at the time)
      message.channel
        .send(time.format('h:mma') + ' is an invalid end time.  Either time was not interpreted correctly or has already expired.')
        .then(message => message.delete({timeout: settings.messageCleanupDelayError}))
        .catch(err => log.error(err));
      time = false;
    }

    // remove all reactions from processed image
    this.removeReaction(message);

    log.info('Processing Time: ' + ((Date.now() - message.temporaryProcessingTimestamp) / 1000) + ' seconds');

    // time was determined but was not valid - create with unset time instead
    if (time === false) {
      time = TimeType.UNDEFINED_END_TIME;
    }

    let raid;
    Raid.createRaid(message.channel.id, message.member.id, pokemon, gymId, time)
      .then(async info => {
        raid = info.party;

        if (timeWarn) {
          raid.timeWarn = true;
        }

        const raidChannelMessage = await raid.getRaidChannelMessage(),
          formattedMessage = await raid.getFormattedMessage();

        return message.channel.send(raidChannelMessage, formattedMessage);
      })
      .then(announcementMessage => PartyManager.addMessage(raid.channelId, announcementMessage, true))
      .then(async result => {
        await PartyManager.getChannel(raid.channelId)
          .then(async channel => {
            // if pokemon, time remaining, or phone time was not determined, need to add original image to new channel,
            // in the hope the someone can manually read the screenshot and set the appropriate information
            if (pokemon.placeholder === true || !time || timeWarn) {
              await channel.channel
                .send(raid.getIncompleteScreenshotMessage(), {
                  files: [
                    message.attachments.first().url
                  ]
                })
                .then(message => raid.setIncompleteScreenshotMessage(message))
                .catch(err => log.error(err));
            }

            message.delete()
              .catch(err => log.error(err));
          });
      })
      .then(async botMessage => {
        const raidSourceChannelMessage = await raid.getRaidSourceChannelMessage(),
          formattedMessage = await raid.getFormattedMessage();
        return PartyManager.getChannel(raid.channelId)
          .then(channel => channel.channel.send(raidSourceChannelMessage, formattedMessage))
          .catch(err => log.error(err));
      })
      .then(channelRaidMessage => {
        PartyManager.addMessage(raid.channelId, channelRaidMessage, true);
      })
      .then(result => {
        Helper.client.emit('raidCreated', raid, message.member.id);

        return true;
      })
      .catch(err => log.error(err));
  }
}

module.exports = new ImageProcessing();
