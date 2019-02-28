const commando = require('discord.js-commando'),
  log = require('loglevel').getLogger('ImportGymsCommand'),
  Discord = require('discord.js'),
  oneLine = require('common-tags').oneLine,
  Region = require('../../../app/region'),
  PartyManager = require('../../../app/party-manager'),
  Gym = require('../../../app/gym'),
  Helper = require('../../../app/helper'),
  request = require('request'),
  {CommandGroup} = require('../../../app/constants');

module.exports = class ImportGyms extends commando.Command {
	constructor(client) {
		super(client, {
			name: 'importgyms',
			aliases: ['import-gyms'],
			group: CommandGroup.REGION,
			memberName: 'importgyms',
			description: 'Imports gym data from a github repo.',
			details: oneLine `
				This command will import gyms and gym metadata from json files in a legacy pine data repo.
			`,
			examples: ['\importgyms https://github.com/Googer/PgP-Data'],
			args: [{
				key: 'repo',
				prompt: 'Provide a github url for a Professor Pine data repo',
				type: 'string'
			}]
		});

		client.dispatcher.addInhibitor(message => {
			if (!!message.command && message.command.name === 'importgyms') {

        if(!Helper.isBotChannel(message) && !Helper.isManagement(message)) {
          return ['invalid-channel', message.reply('You are not authorized to run this command.')];
        }

			}
			return false;
		});
	}

	async run(msg, args) {
    const repo = this.validRepo(args.repo);

		if (repo) {

      var gyms = await this.getJSON(`${repo}raw/master/data/gyms.json`);
      const gym_meta = await this.getJSON(`${repo}raw/master/data/gyms-metadata.json`);

      if(gyms && gym_meta) {
        const keys = Object.keys(gym_meta);

        for(var i=0; i<gyms.length; i++) {
          if(gym_meta[gyms[i].gymId]) {
            gyms[i]["meta"] = gym_meta[gyms[i].gymId];
          }
        }

        await this.makeImport(gyms);
        msg.say(`Imported ${gyms.length} gyms and ${keys.length} meta entries.`);
      } else {
        msg.say("Hmm... Didnt get correct data back.");
      }

		} else {
      msg.reply("Invalid URL. Please provide a valid GitHub repo URL.")
		}


	}

	validRepo(repo) {
    const valid_prefix = "https://github.com/";
		const first = repo.substring(0, valid_prefix.length);
		const last = repo.substring(repo.length-1, 1);
    if(first === valid_prefix) {
      var url = repo;
      if(last !== "/") {
        url = url + "/"
      }
      return url;
		}

		return false;
	}

  async getJSON(url) {
    var that = this;
    return new Promise(async function(resolve,reject) {
      var options = {
  			method: 'GET',
  			url: url,
  			headers: {
  				'cache-control': 'no-cache',
  				'content-type': 'application/json'
  			},
  			json: true
  		};

  		request(options, function(error, response, body) {
  			if (error) throw new Error(error);
  			if(response.statusCode === 200) {
          resolve(body);
  			} else {
  				log.error(`Error getting json from url: ${url} Status Code: ${response.statusCode}`)
          reject(false);
  			}
  		});
    });

  }

  formatGeodata(geodata) {
    var addressComponents = {};
    for(var i=0;i<geodata.length;i++) {
      var sections = geodata[i]["addressComponents"];
      for(var j=0;j<sections.length;j++) {
        var section = sections[j];
        var types = section["types"];
        var shortName = section["shortName"];
        if(types) {
          for(var k=0;k<types.length;k++) {
            var type = types[k].toLowerCase();
            var values = [];
            if(addressComponents[type]) {
              values = addressComponents[type]
            }

            if(values.indexOf(shortName) == -1) {
              values.push(shortName);
            }

            addressComponents[type] = values;
          }
        }
      }
    }

    var data = {};
    var components = {};

    data = {}
    components = {}

    const keys = Object.keys(addressComponents);
    for(var i=0; i<keys.length;i++) {
      const key = keys[i];
      const value = addressComponents[key];
      components[key] = value.join(" ");
    }

    data["addressComponents"] = components;
    return data
  }

  getGymValues(gym) {
    return [gym.gymName, gym.gymInfo.latitude, gym.gymInfo.longitude];
  }

  makeMetaInsert(gym) {
    const geodata = JSON.stringify(this.formatGeodata(gym.gymInfo.addressComponents));
    const places = gym.gymInfo.places.join(' ');
    var statement = "INSERT INTO GymMeta (gym_id, ";

    var fields = [];
    var content = [];
    if(gym.meta) {
      if(gym.meta.nickname) {
        fields.push("nickname");
        content.push("?");
      }

      if(gym.meta.hasHostedEx) {
        fields.push("ex_raid");
        content.push("?");
      }

      if(gym.meta.hasExTag) {
        fields.push("ex_tagged");
        content.push("?");
      }

      if(gym.meta.additionalTerms) {
        fields.push("keywords");
        content.push("?");
      }

      if(gym.meta.additionalInformation) {
        fields.push("notice");
        content.push("?");
      }
    }

    if(geodata.length > 0) {
      fields.push("geodata");
      content.push("?");
    }

    if(places.length > 0) {
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
    var content = this.getGymValues(gym);
    if(gym.meta) {
      if(gym.meta.nickname) {
        content.push(gym.meta.nickname);
      }

      if(gym.meta.hasHostedEx) {
        content.push(1);
      }

      if(gym.meta.hasExTag) {
        content.push(1);
      }

      if(gym.meta.additionalTerms) {
        content.push(gym.meta.additionalTerms);
      }

      if(gym.meta.additionalInformation) {
        content.push(gym.meta.additionalInformation);
      }
    }

    if(geodata.length > 0) {
      content.push(geodata);
    }

    if(places.length > 0) {
      content.push(places);
    }

    return content;
  }

  async makeImport(gyms) {
    for(var i = 0; i<gyms.length;i++) {
      const gym = gyms[i];
      var statement = "BEGIN;"
      statement += "INSERT INTO Gym (name, lat, lon) VALUES(?, ?, ?);";
      statement += this.makeMetaInsert(gym);
      statement += "COMMIT;"

      await Region.importGym(statement,this.getMetaValues(gym));
    }

    //Rebuild everything so bot doesnt need a hard restart
    await Gym.buildIndexes();
  }

};
