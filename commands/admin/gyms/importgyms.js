const log = require('loglevel').getLogger('ImportGymsCommand'),
  commando = require('discord.js-commando'),
  DB = require('../../../app/db'),
  oneLine = require('common-tags').oneLine,
  Helper = require('../../../app/helper'),
  Gym = require('../../../app/gym'),
  Region = require('../../../app/region'),
  request = require('request'),
  {CommandGroup} = require('../../../app/constants');

module.exports = class ImportGyms extends commando.Command {
  constructor(client) {
    super(client, {
      name: 'import-gyms',
      group: CommandGroup.REGION,
      memberName: 'import-gyms',
      description: 'Imports gym data from a github repo.',
      details: oneLine`
				This command will import gyms and gym metadata from json files in a legacy pine data repo.`,
      examples: ['\importgyms https://github.com/Googer/PgP-Data'],
      args: [{
        key: 'repo',
        prompt: 'Provide a github url for a Professor Pine data repo',
        type: 'string'
      }]
    });

    client.dispatcher.addInhibitor(message => {
      if (!!message.command && message.command.name === 'import-gyms') {

        if (!Helper.isBotChannel(message) && !Helper.isManagement(message)) {
          return ['invalid-channel', message.reply('You are not authorized to run this command.')];
        }

      }
      return false;
    });
  }

  async run(msg, args) {
    const repo = this.validRepo(args.repo);

    if (repo) {
      const downloadReaction = await msg.react('📥')
        .catch(err => log.error(err));

      const gyms = await this.getJSON(`${repo}raw/master/data/gyms.json`)
        .catch(err => {
          msg.reply('This does not appear to be a valid gyms repository.')
            .catch(err => log.error(err));
          log.error(err);
        });

      const gymMetadata = await this.getJSON(`${repo}raw/master/data/gyms-metadata.json`)
        .catch(err => log.error(err));

      downloadReaction.users.remove(msg.client.user.id)
        .catch(err => log.error(err));

      if (gyms && gymMetadata) {
        const thinkingReaction = await msg.react('🤔')
          .catch(err => log.error(err));

        const keys = Object.keys(gymMetadata);

        for (let i = 0; i < gyms.length; i++) {
          if (gymMetadata[gyms[i].gymId]) {
            gyms[i]["meta"] = gymMetadata[gyms[i].gymId];
          }
        }

        await this.makeImport(gyms)
          .catch(err => log.error(err));

        msg.say(`Imported ${gyms.length} gyms and ${keys.length} meta entries.`)
          .catch(err => log.error(err));

        const favoritesCount = (await this.migrateFavoriteGyms(gyms)
          .catch(err => log.error(err)));

        msg.say(`Migrated ${favoritesCount} user favorites to new gym indices.`)
          .catch(err => log.error(err));

        thinkingReaction.users.remove(msg.client.user.id)
          .catch(err => log.error(err));
      } else {
        msg.say("Hmm... Didnt get correct data back.")
          .catch(err => log.error(err));
      }
    } else {
      msg.reply("Invalid URL. Please provide a valid GitHub repo URL.")
        .catch(err => log.error(err));
    }
  }

  validRepo(repo) {
    const validPrefix = "https://github.com/";
    const first = repo.substring(0, validPrefix.length);
    const last = repo.substring(repo.length - 1, 1);
    if (first === validPrefix) {
      let url = repo;
      if (last !== "/") {
        url = url + "/"
      }
      return url;
    }

    return false;
  }

  async getJSON(url) {
    const that = this;
    return new Promise(async (resolve, reject) => {
      const options = {
        method: 'GET',
        url: url,
        headers: {
          'cache-control': 'no-cache',
          'content-type': 'application/json'
        },
        json: true
      };

      request(options, (error, response, body) => {
        if (error) throw new Error(error);
        if (response.statusCode === 200) {
          resolve(body);
        } else {
          log.error(`Error getting json from url: ${url} Status Code: ${response.statusCode}`);
          reject(false);
        }
      });
    });
  }

  formatGeodata(geodata) {
    const addressComponents = {};
    for (let i = 0; i < geodata.length; i++) {
      const sections = geodata[i]["addressComponents"];
      for (let j = 0; j < sections.length; j++) {
        const section = sections[j];
        const types = section["types"];
        const shortName = section["shortName"];
        if (types) {
          for (let k = 0; k < types.length; k++) {
            const type = types[k].toLowerCase();
            let values = [];
            if (addressComponents[type]) {
              values = addressComponents[type]
            }

            if (values.indexOf(shortName) === -1) {
              values.push(shortName);
            }

            addressComponents[type] = values;
          }
        }
      }
    }

    let data = {};
    let components = {};

    const keys = Object.keys(addressComponents);
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      const value = addressComponents[key];
      components[key] = value.join(" ");
    }

    data["addressComponents"] = components;
    return data;
  }

  getGymValues(gym) {
    return [gym.gymName, gym.gymId, gym.gymInfo.latitude, gym.gymInfo.longitude, gym.gymInfo.gymDescription];
  }

  makeMetaInsert(gym) {
    const geodata = JSON.stringify(this.formatGeodata(gym.gymInfo.addressComponents));
    const places = gym.gymInfo.places.join(' ');
    let statement = "INSERT INTO GymMeta (gymId,";

    const fields = ["description"];
    const content = ["?"];
    if (gym.meta) {
      if (gym.meta.nickname) {
        fields.push("nickname");
        content.push("?");
      }

      if (gym.meta.hasHostedEx) {
        fields.push("confirmedEx");
        content.push("?");
      }

      if (gym.meta.hasExTag) {
        fields.push("taggedEx");
        content.push("?");
      }

      if (gym.meta.additionalTerms) {
        fields.push("keywords");
        content.push("?");
      }

      if (gym.meta.additionalInformation) {
        fields.push("notice");
        content.push("?");
      }
    }

    if (geodata.length > 0) {
      fields.push("geodata");
      content.push("?");
    }

    if (places.length > 0) {
      fields.push("places");
      content.push("?");
    }

    statement += fields.join(", ");
    statement += ") VALUES(LAST_INSERT_ID(), ";
    statement += content.join(", ");
    statement += ");";

    return statement;
  }

  getMetaValues(gym) {
    const geodata = JSON.stringify(this.formatGeodata(gym.gymInfo.addressComponents));
    const places = gym.gymInfo.places.join(' ');
    const content = this.getGymValues(gym);
    if (gym.meta) {
      if (gym.meta.nickname) {
        content.push(gym.meta.nickname);
      }

      if (gym.meta.hasHostedEx) {
        content.push(1);
      }

      if (gym.meta.hasExTag) {
        content.push(1);
      }

      if (gym.meta.additionalTerms) {
        content.push(gym.meta.additionalTerms);
      }

      if (gym.meta.additionalInformation) {
        content.push(gym.meta.additionalInformation);
      }
    }

    if (geodata.length > 0) {
      content.push(geodata);
    }

    if (places.length > 0) {
      content.push(places);
    }

    return content;
  }

  async makeImport(gyms) {
    for (let i = 0; i < gyms.length; i++) {
      const gym = gyms[i];
      let statement = "BEGIN;";
      statement += "INSERT INTO Gym (name, pogoId, lat, lon) VALUES(?, ?, ?, ?);";
      statement += this.makeMetaInsert(gym);
      statement += "COMMIT;";

      await Region.importGym(statement, this.getMetaValues(gym));
    }

    // Rebuild everything so bot doesnt need a hard restart
    await Gym.buildIndexes();
  }

  async migrateFavoriteGyms(gyms) {
    for (const importedGym of gyms) {
      const gymDbId = (await DB.DB('Gym')
        .where({pogoId: importedGym.gymId})
        .first()
        .pluck('id')
        .catch(err => log.error(err)));

      if (gymDbId.length > 0) {
        await DB.DB('GymNotification')
          .where({gym: importedGym.gymId})
          .update({
            gym: gymDbId
          })
          .catch(err => log.error(err));
      }
    }

    const favoritesCount = (await DB.DB('GymNotification')
      .count()
      .first()
      .catch(err => log.error(err)));

    return favoritesCount['count(*)'];
  }
};