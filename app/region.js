const log = require('loglevel').getLogger('RegionManager'),
  Discord = require('discord.js'),
  https = require('https'),
  tj = require('togeojson-with-extended-style'),
  lunr = require('lunr'),
  dbhelper = require('./dbhelper'),
  Meta = require('./geocode'),
  DOMParser = require('xmldom').DOMParser,
  ImageCacher = require('./imagecacher'),
  stringSimilarity = require('string-similarity'),
  privateSettings = require('../data/private-settings'),
  request = require("request"),
  turf = require('@turf/turf');

//This gets the decimal lat/lon value from a string of degree/minute/seconds
function getDecimalValueFromCoord(str) {
  //degrees + (minutes/60) + (seconds/3600)
  const degreePos = str.indexOf('°');
  const minutePos = str.indexOf("'");
  const secondPos = str.indexOf('%22');
  const degrees = str.substring(0, degreePos);
  const minutes = str.substring(minutePos, degreePos + 1);
  const seconds = str.substring(secondPos, minutePos + 1);

  const last = str.substring(str.length - 1, str.length);
  const negative = last === "W" || last === "S"; //if the value is S (South) it is a negative latitude - if it is W (West) it is a negative longitude
  const result = parseFloat(degrees, 10) + (parseFloat(minutes, 10) / 60) + (parseFloat(seconds, 10) / 3600);

  return negative ? result * -1 : result;
}

function ParseDMS(input) {
  const parts = input.split(/[^\d\w.]+/);
  const lat = ConvertDMSToDD(parts[0], parts[1], parts[2], parts[3]);
  const lng = ConvertDMSToDD(parts[4], parts[5], parts[6], parts[7]);

  return {
    "lat": Number(lat),
    "lng": Number(lng)
  };
}

function ConvertDMSToDD(degrees, minutes, seconds, direction) {
  const s = seconds / (60 * 60);
  const m = minutes / 60;

  let dd = Number(degrees) + Number(m) + Number(s);

  if (direction === "S" || direction === "W") {
    dd = dd * -1;
  } // Don't do anything for N or E
  return dd;
}

function Point(x, y) {
  this.x = x;
  this.y = y;
}

function Region(points) {
  this.points = points || [];
  this.length = points.length;
}

function uniq(a) {
  const og = [];
  a.forEach(str => {
    if (og.indexOf(str) < 0) {
      og.push(str);
    }
  });

  return og;
}

function arrayContains(needle, arrhaystack) {
  return (arrhaystack.indexOf(needle) > -1);
}

function distance(lat1, lon1, lat2, lon2, unit) {
  const radlat1 = Math.PI * lat1 / 180;
  const radlat2 = Math.PI * lat2 / 180;
  const theta = lon1 - lon2;
  const radtheta = Math.PI * theta / 180;
  let dist = Math.sin(radlat1) * Math.sin(radlat2) + Math.cos(radlat1) * Math.cos(radlat2) * Math.cos(radtheta);
  dist = Math.acos(dist);
  dist = dist * 180 / Math.PI;
  dist = dist * 60 * 1.1515;
  if (unit === "K") {
    dist = dist * 1.609344
  }
  if (unit === "N") {
    dist = dist * 0.8684
  }
  return dist
}

String.prototype.replaceAll = function (search, replace) {
  //if replace is not sent, return original string otherwise it will
  //replace search string with 'undefined'.
  if (replace === undefined) {
    return this.toString();
  }

  return this.replace(new RegExp('[' + search + ']', 'g'), replace);
};

Region.prototype.area = function () {
  let area = 0,
    i,
    j,
    point1,
    point2;

  for (i = 0, j = this.length - 1; i < this.length; j = i, i++) {
    point1 = this.points[i];
    point2 = this.points[j];
    area += point1.x * point2.y;
    area -= point1.y * point2.x;
  }
  area /= 2;

  return area;
};

Region.prototype.centroid = function () {
  let x = 0,
    y = 0,
    i,
    j,
    f,
    point1,
    point2;

  for (i = 0, j = this.length - 1; i < this.length; j = i, i++) {
    point1 = this.points[i];
    point2 = this.points[j];
    f = point1.x * point2.y - point2.x * point1.y;
    x += (point1.x + point2.x) * f;
    y += (point1.y + point2.y) * f;
  }

  f = this.area() * 6;

  return new Point(x / f, y / f);
};

class RegionHelper {
  constructor() {
  }

  getPointFromText(text) {
    const final = text.replaceAll(" ", "");
    const items = final.split(",");
    return {
      "x": Number(items[0]),
      "y": Number(items[1])
    };
  }

  getCoordRegionFromText(text) {
    const trimmed = text.substring(9, text.length - 2);
    const items = trimmed.split(",");

    const points = [];
    for (let i = 0; i < items.length; i++) {
      const coords = items[i].split(" ");
      points[i] = {
        "x": Number(coords[0]),
        "y": Number(coords[1])
      };
    }

    return new Region(points);
  }

  regionFromGeoJSON(geojson) {
    const coordinates = geojson["geometry"]["coordinates"][0];
    const points = [];
    for (let i = 0; i < coordinates.length; i++) {
      let coords = coordinates[i];
      //geojson coordinates are backwards (longitude, latitude)
      points[i] = {
        "x": Number(coords[1]),
        "y": Number(coords[0])
      };
    }

    return new Region(points);
  }

  enlargePolygonFromRegion(region) {
    const coords = [];
    for (let p = 0; p < region.length; p++) {
      let point = region.points[p];
      const points = [point.y, point.x];
      coords.push(points);
    }

    try {
      const poly = turf.polygon([coords]);
      const buffer = turf.buffer(poly, '2.0');
      const options = {tolerance: 0.005};
      const enlarged = turf.simplify(buffer, options);

      return this.regionFromGeoJSON(enlarged);
    } catch (error) {
      log.error(error);
      return null;
    }

  }

  getJSONRegionFromText(text) {
    const trimmed = text.substring(9, text.length - 2);
    const items = trimmed.split(",");

    const points = [];
    for (let i = 0; i < items.length; i++) {
      const coords = items[i].split(" ");
      const point = [Number(coords[0]), Number(coords[1])];
      points[i] = point;
    }

    return points;
  }

  googleMapsLinkForRegion(text) {
    const region = this.getCoordRegionFromText(text);
    const trimmed = text.substring(9, text.length - 2);
    const items = trimmed.split(",");
    const joined = items.join("|");
    const final = joined.replaceAll(" ", ",");

    const center = region.centroid();

    return "http://maps.google.com/maps/api/staticmap?size=500x300&format=png&center=" + center.x + "," + center.y + "&path=color:red|" + final + "&sensor=false&scale=2&key=" + privateSettings.googleApiKey;
  }

  googlePinLinkForPoint(coordString) {
    //https://www.google.com/maps/search/?api=1&query=40.3526935781,-79.8271793297
    return "https://www.google.com/maps/search/?api=1&query=" + coordString.replaceAll(" ", "");
  }

  async checkRegionsExist() {
    return new Promise(async function (resolve, reject) {
      const results = await dbhelper.query("SHOW TABLES LIKE 'Region';")
        .catch(error => resolve(false));
      if (results.length > 0 && results[0] !== undefined) {
        resolve(true);
      } else {
        resolve(false);
      }
    });
  }

  async getRegionId(channel) {
    return new Promise(async function (resolve, reject) {
      const results = await dbhelper.query("SELECT id FROM Region WHERE channelId = ?", [channel])
        .catch(error => reject(false));
      if (results.length > 0 && results[0] !== undefined) {
        resolve(results[0]["id"]);
      } else {
        reject(false);
      }
    });
  }

  async getRegionsRaw(channel) {
    return new Promise(async function (resolve, reject) {
      const results = await dbhelper.query("SELECT ST_AsText(bounds) FROM Region WHERE channelId = ?", [channel])
        .catch(error => reject(false));
      if (results.length > 0 && results[0] !== undefined) {
        resolve(results[0]["ST_AsText(bounds)"]);
      } else {
        reject(false);
      }
    });
  }

  async getChannelsForGym(gym) {
    return new Promise(async function (resolve, reject) {
      const q = "SELECT channelId FROM Region WHERE ST_CONTAINS(bounds, POINT(?, ?));";
      const results = await dbhelper.query(q, [gym.lat, gym.lon])
        .catch(error => reject(false));
      resolve(results);
    });
  }

  polygonStringFromRegion(region) {
    let polystring = "POLYGON((";
    for (let i = 0; i < region.length; i++) {
      const coords = region.points[i];

      polystring += coords.x + " " + coords.y;
      if (i + 1 < region.length) {
        polystring += ",";
      }
    }

    polystring += "))";
    return polystring;
  }

  pointStringFromPoint(point) {
    return "POINT (" + point.x + " " + point.y + ")";
  }

  checkCoordForChannel(channel, coords, resolve, reject) {
    const that = this;
    const selectQuery = "SELECT ST_AsText(bounds) FROM Region WHERE channelId = ?";
    dbhelper.query(selectQuery, [channel]).then(async function (results) {
      const region = that.getCoordRegionFromText(results[0]["ST_AsText(bounds)"]);
      let query = "SELECT ST_CONTAINS( ST_GeomFromText('";
      query += that.polygonStringFromRegion(region);
      query += "'),";
      query += "ST_GeomFromText('";
      query += that.pointStringFromPoint(that.getPointFromText(coords));
      query += "'));";

      dbhelper.query(query)
        .then(result => {
          const match = result[0][Object.keys(result[0])[0]];
          if (match === 1) {
            resolve(true);
          } else {
            resolve("The coordinates provided are not within this channels bounds.");
          }
        }).catch(error => {
        log.error(error);
        resolve("An unknown error occurred");
      });
    }).catch(error => {
      log.error(error);
      resolve("An unknown error occurred")
    });
  }

  async getAllRegions() {
    const selectQuery = "SELECT * FROM Region;";
    return new Promise(async function (resolve, reject) {
      const results = await dbhelper.query(selectQuery)
        .catch(error => {
          log.error(error);
          return null;
        });
      if (results) {
        resolve(results);
      } else {
        reject("No regions defined in this server");
      }
    });
  }

  async deleteRegionsNotInChannels(channels) {
    if (channels.length > 0) {
      let selectQuery = "DELETE FROM Region WHERE ";
      const orOptions = [];

      for (let i = 0; i < channels.length; i++) {
        const option = " channelId <> " + channels[i];
        orOptions.push(option)
      }

      selectQuery += orOptions.join(' AND');

      return new Promise(async function (resolve, reject) {
        const results = await dbhelper.query(selectQuery)
          .catch(error => {
            log.error(error);
            return null;
          });
        if (results) {
          resolve(results);
        } else {
          reject("No regions defined in this server");
        }
      });
    } else {
      return new Promise(async function (resolve, reject) {
        reject("No regions defined in this server")
      });
    }

  }

  getRegionEmbed(channel) {
    const that = this;
    return new Promise(async function (resolve, reject) {
      const region = await that.getRegionsRaw(channel)
        .catch(error => {
          log.error(error);
          return false;
        });
      if (!region) {
        reject("No region defined for this channel");
        return;
      }

      const gyms = await that.getGymCount(channel)
        .catch(error => {
          log.error(error);
          return 0;
        });
      const regionId = await that.getRegionId(channel)
        .catch(error => {
          log.error(error);
          return false;
        });

      const url = that.googleMapsLinkForRegion(region);
      if (url != null) {
        const embed = new Discord.MessageEmbed()
          .setTitle("This channel covers the following area")
          .setURL(url);

        if (regionId) {
          let url = that.googleMapsLinkForRegion(region);
          let path = `images/regions/${regionId}.png`;
          let imagePath = await ImageCacher.fetchAndCache(url, path)
            .catch(error => {
              log.error(error);
              return false;
            });

          if (imagePath) {
            let parts = imagePath.split("/");
            let imageName = parts[parts.length - 1];
            const attachment = new Discord.MessageAttachment(imagePath);
            embed.attachFiles([attachment]);
            embed.setImage(`attachment://${imageName}`);
          }
        }

        if (gyms) {
          embed.setDescription("There " + (gyms === 1 ? "is" : "are") + " " + (gyms !== 0 ? gyms : "no") + " gym" + (gyms < 1 || gyms > 1 ? "s" : "") + " within this region");
        } else {
          embed.setDescription("There are currently no gyms within this region")
        }

        resolve(embed);
      } else {
        reject("No region defined for this channel");
      }
    })
  }

  getRegionDetailEmbed(channel) {
    const that = this;
    return new Promise(async function (resolve, reject) {
      const region = await that.getRegionsRaw(channel)
        .catch(error => {
          log.error(error);
          return false;
        });
      if (!region) {
        reject("No region defined for this channel");
        return;
      }

      const gyms = await that.getGymCount(channel)
        .catch(error => {
          log.error(error);
          return 0;
        });

      const url = that.googleMapsLinkForRegion(region);
      if (url != null) {
        const embed = new Discord.MessageEmbed()
          .setTitle("This channel covers the following area")
          .setURL(url)
          .setImage(url);

        if (gyms) {
          embed.setDescription("There " + (gyms === 1 ? "is" : "are") + " " + (gyms !== 0 ? gyms : "no") + " gym" + (gyms < 1 || gyms > 1 ? "s" : "") + " within this region");
        } else {
          embed.setDescription("There are currently no gyms within this region")
        }

        resolve(embed);
      } else {
        reject("No region defined for this channel");
      }
    })
  }

  isValidCoords(str) {
    return str.match(/^(\-?\d+(\.\d+)?),\s*(\-?\d+(\.\d+)?)$/g);
  }

  async getCoordStringFromURL(url, resolve, reject) {
    log.info("checking if coordinates is a url");
    if (url.search("google.com") > 0) {

      //Google Maps Desktop Pin Links
      //**Decimal lat/lon in the url itself are incorrect values - so take the degree/hour/minute coords from URL and convert them to decimal lat/lon
      //https://www.google.com/maps/place/40°19'57.3%22N+80°04'14.1%22W/@40.33259,-80.0711372,19z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!7e2!8m2!3d40.3325897!4d-80.0705899
      if (url.search("maps/place/") > 0) {
        const end = url.indexOf("/@");
        const start = url.indexOf("/place/");
        const res = url.substring(end, start + 7);
        const sp = res.split("+");
        const llStr = getDecimalValueFromCoord(sp[0]) + ", " + getDecimalValueFromCoord(sp[1]);
        if (this.isValidCoords(llStr)) {
          resolve(llStr);

        } else {
          resolve(null);
        }

        //Directions links for google (used from Gym Huntr)
        //https://www.google.com/maps/dir/Current+Location/40.376768,-80.051049
      } else if (url.search("maps/dir/") > 0) {
        const def = "maps/dir/";
        const defPos = url.indexOf(def);
        const res1 = url.substring(url.length, defPos + def.length);
        const strt = res1.indexOf("/");
        const llStr = res1.substring(res1.length, strt + 1);
        if (this.isValidCoords(llStr)) {
          resolve(llStr);
        } else {
          resolve(null);
        }
      } else {
        resolve(null);
      }

      //Short URLs from Google Maps mobile apps
      //https://goo.gl/maps/r54jMZxh1TC2
    } else if (url.search("goo.gl/maps/") > 0) {

      const that = this;
      request(url, function (error, response, body) {
        if (!error && response.statusCode === 200) {
          const start = '<meta content="origin" name="referrer">   <meta content=\'';
          const end = "' itemprop=";
          const find = body.indexOf(start);
          const first = body.substring(find + start.length, body.length);

          const findEnd = first.indexOf(end);
          let result = first.substring(0, findEnd);

          result = result.replace(/&#39;/g, "\'");

          const parsedCoords = ParseDMS(result);
          const coords = parsedCoords.lat + ", " + parsedCoords.lng;

          if (that.isValidCoords(coords)) {
            resolve(coords);
          } else {
            resolve(null);
          }
        } else {
          log.error(error);
          resolve(null);
        }
      });
    } else if (url.search("maps.apple.com") > 0 && url.search("&ll=") > 0) {
      //Pin links from Apple Maps app
      let place = url.indexOf("&ll=");
      const ll = url.substring(place + 4);
      const llStr = ll.split("&")[0];
      if (this.isValidCoords(llStr)) {
        resolve(llStr);
      } else {
        resolve(null);
      }
    } else if (url.indexOf("ingress.com/intel?ll=") > 0 && url.indexOf("pll=") > 0) {
      //https://www.ingress.com/intel?ll=40.348194,-79.944592&z=13&pll=40.357043,-80.051771
      // let start = "ingress.com/intel?ll="
      let start = "pll=";
      let place = url.indexOf(start);
      let reg = /.+?(?=&)/;
      const ll = url.substring(place + start.length, url.length);
      const parts = reg.exec(ll);
      if (parts && parts.length > 0) {
        if (this.isValidCoords(parts[0])) {
          resolve(parts[0]);
          return;
        }
      } else if (ll.length > 0) {
        if (this.isValidCoords(ll)) {
          resolve(ll);
          return;
        }
      }
      resolve(null);
    } else {
      log.info("invalid url");
      resolve(null);
    }
  }

  async coordStringFromText(text) {
    const that = this;
    return new Promise(async function (resolve, reject) {
      if (that.isValidCoords(text)) {
        resolve(text);
      } else {
        that.getCoordStringFromURL(text, resolve, reject);
      }
    });
  }

  pointFromCoordString(str) {
    let trimmed = str.replaceAll(" ", "");
    let items = trimmed.split(",");
    if (items.length > 1) {
      return {
        "x": Number(items[0]),
        "y": Number(items[1])
      };
    } else {
      return null;
    }
  }

  async parseRegionData(url) {
    const that = this;
    return new Promise(async function (resolve, reject) {
      if (url != null) {
        const lower = url.toLowerCase().substring(url.length - 4);
        if (lower === ".kml" || lower === ".xml") {
          //request contents of said file
          const request = https.get(url, function (res) {
            let data = '';
            res.on('data', function (chunk) {
              data += chunk;
            });
            res.on('end', function () {
              //convert KML file from data -> string -> XML DOM Object
              const kml = new DOMParser().parseFromString(data.toString());

              //convert DOM object to JSON object
              const converted = tj.kml(kml);
              resolve(converted);
            });
          });
          request.on('error', function (e) {
            reject(error);
          });
          request.end();
        } else {
          reject("Invalid KML File");
        }
      } else {
        reject("Invalid KML File");
      }
    });
  }

  async deletePreviousRegion(channel) {
    const that = this;
    return new Promise(async function (resolve, reject) {
      that.getRegionId(channel)
        .then(regionId => {
          ImageCacher.deleteCachedImage(`images/regions/${regionId}.png`);
          dbhelper.query("DELETE FROM Region WHERE id = ?", [regionId])
            .then(result => {
              resolve(true);
            })
            .catch(error => {
              log.error(error);
              resolve(false);
            });
        })
        .catch(error => {
          log.error(error);
          resolve(false);
        });
    });
  }

  storeRegion(polydata, channel, gymCache) {
    const that = this;
    return new Promise(async function (resolve, reject) {
      //make sure first and last points are equal (closed polygon)
      const first = polydata[0][1] + " " + polydata[0][0];
      const last = polydata[polydata.length - 1][1] + " " + polydata[polydata.length - 1][0];
      if (first !== last) {
        return false;
      }

      const points = [];
      let polystring = "POLYGON((";
      for (let i = 0; i < polydata.length; i++) {
        const coords = polydata[i];
        const lon = coords[0];
        const lat = coords[1];
        points[i] = {
          "x": lat,
          "y": lon
        };

        polystring += lat + " " + lon;
        if (i + 1 < polydata.length) {
          polystring += ",";
        }
      }
      polystring += "))";

      await that.deletePreviousRegion(channel);
      const insertQuery = "INSERT INTO Region (channelId,bounds) VALUES(?, ST_PolygonFromText(?));";
      dbhelper.query(insertQuery, [channel, polystring])
        .then(result => {
          log.info('Added region for channel id: ' + channel);
          if (gymCache) {
            gymCache.markChannelsForReindex([channel]);
          }
          resolve(true);
        }).catch(error => reject(error));
    });
  }

  async getAllBoundedChannels() {
    return new Promise(async function (resolve, reject) {
      const channels = await dbhelper.query("SELECT DISTINCT channelId FROM Region")
        .catch(error => {
          log.error(error);
          reject(false);
        });

      resolve(channels);
    });
  }

  channelNameForFeature(feature) {
    const name = feature.properties.name;
    return name.toLowerCase()
      .split(" ")
      .join("-")
      .replace(/[^0-9\w\-]/g, '');
  }

  categoryNameForFeature(feature) {
    const name = feature.properties.name;
    const desc = feature.properties.description;
    if (desc) {
      return desc
    } else {
      return name.replace('#', '')
    }
  }

  createNewRegion(feature, msg, gymCache) {
    const that = this;
    return new Promise(function (resolve, reject) {
      //data["features"][0]["geometry"]["coordinates"][0];
      const polydata = feature.geometry.coordinates[0];
      const name = feature.properties.name;
      const categoryName = that.categoryNameForFeature(feature);
      const channelName = that.channelNameForFeature(feature);

      msg.channel.guild.channels.create(categoryName, {
        type: "category"
      }, "For a region")
        .then(newCategory => {
          msg.channel.guild.channels.create(channelName, {
            type: "text",
            parent: newCategory,
            overwrites: newCategory.permissionOverwrites
          }, "For a region")
            .then(newChannel => {
              log.info("created new channel for " + name + " with id " + newChannel.id + " under category with id " + newCategory.id);
              that.storeRegion(polydata, newChannel.id, gymCache)
                .catch(error => {
                  log.error(error);
                  reject("An error occurred storing the region for " + name);
                })
                .then(result => {
                  resolve(newChannel.id);
                })
            }).catch(error => reject(error))
        }).catch(error => reject(error))
    })
  }

  async addGym(args, gymCache) {
    const that = this;
    return new Promise(async function (resolve, reject) {

      that.coordStringFromText(args.location).then(async function (coords) {
        let point = that.pointFromCoordString(coords);
        const insertQuery = `INSERT INTO Gym (lat,lon,name) VALUES(${point.x},${point.y},\"${args.name}\")`;
        let metaQuery = "INSERT INTO GymMeta (gymId";
        let values = "";

        log.info("Adding gym...");
        log.info(point);
        log.info(args.name);

        const gym = {
          "name": args.name,
          "point": coords
        };

        if (args.nickname.toLowerCase() !== "skip" && args.nickname.toLowerCase() !== "n") {
          log.info(args.nickname);
          metaQuery += ",nickname";
          values += `,\"${args.nickname}\"`;
          gym.nickname = args.nickname;
        }

        if (args.description.toLowerCase() !== "skip" && args.description.toLowerCase() !== "n") {
          log.info(args.description);
          metaQuery += ",description";
          values += `,\"${args.description}\"`;
          gym.description = args.description;
        }

        const results = await dbhelper.query(insertQuery)
          .catch(error => {
            log.error(error);
            reject(error);
          });

        const id = results.insertId;
        gym.id = id;
        gym.lat = point.x;
        gym.lon = point.y;

        metaQuery += `) VALUES(${id}${values})`;
        await dbhelper.query(metaQuery)
          .catch(error => {
            log.error(error);
            reject(error);
          })
          .then(async function () {
            Meta.beginGeoUpdates(gym, gymCache)
              .catch(error => resolve(gym))
              .then(result => resolve(result));
          });
      }).catch(error => {
        log.error(error);
        reject(error);
      })
    });
  }

  async setGymLocation(gym, location, gymCache) {
    const that = this;
    return new Promise(async function (resolve, reject) {
      that.coordStringFromText(location).then(async function (coords) {
        let point = that.pointFromCoordString(coords);
        let query = "UPDATE Gym SET lat='?', lon='?' WHERE id=?;";
        await dbhelper.query(query, [point.x, point.y, gym])
          .catch(error => {
            log.error(error);
            reject(error);
          })
          .then(async function (results) {
            const gymInfo = await dbhelper.query("SELECT * FROM Gym LEFT JOIN GymMeta ON Gym.id = GymMeta.gymId WHERE id = ?", [gym]).catch(error => {
              reject(error);
            });

            gym = gymInfo[0];
            ImageCacher.deleteCachedImage(`images/gyms/${gym}.png`);
            Meta.beginGeoUpdates(gym, gymCache)
              .catch(error => {
                log.error(error);
                resolve(gym);
              })
              .then(result => resolve(result));
          });
      }).catch(error => {
        log.error(error);
        reject(error);
      });
    });
  }

  getGymMapLink(gym) {
    let point = gym.point;
    if (!point) {
      point = `${gym.lat},${gym.lon}`;
    }
    point = point.replaceAll(" ", "");
    return `http://maps.google.com/maps/api/staticmap?size=500x300&format=png&center=${point}&markers=${point}&sensor=false&scale=2&key=${privateSettings.googleApiKey}`;
  }

  async showGymDetail(msg, gym, heading, user, showGeo) {
    let point = gym.point;
    if (!point) {
      point = gym.lat + ", " + gym.lon;
    }

    let title = gym.name;
    if (gym.nickname && gym.nickname !== "skip") {
      title += " (" + gym.nickname + ")";
    }

    const attachments = [];
    let thumbnail = false;
    if (gym.imageUrl) {
      thumbnail = gym.imageUrl;
    } else {
      const thumb = new Discord.MessageAttachment('images/gym_marker.png');
      attachments.push(thumb);
    }

    const embed = new Discord.MessageEmbed()
      .setAuthor(heading)
      .setTitle(title)
      .setURL(this.googlePinLinkForPoint(point));

    if (thumbnail) {
      embed.setThumbnail(thumbnail);
    } else {
      embed.setThumbnail('attachment://gym_marker.png');
    }

    let path = `images/gyms/${gym.id}.png`;
    let url = this.getGymMapLink(gym);
    let imagePath = await ImageCacher.fetchAndCache(url, path)
      .catch(error => {
        log.error(error);
        return false;
      });

    if (imagePath) {
      let parts = imagePath.split("/");
      let imageName = parts[parts.length - 1];
      const attachment = new Discord.MessageAttachment(imagePath);
      attachments.push(attachment);
      embed.setImage(`attachment://${imageName}`);
    }

    embed.attachFiles(attachments);

    if (gym.description && gym.description !== "skip" && gym.description !== "null") {
      embed.setDescription(gym.description);
    }

    if (gym.keywords) {
      embed.addField("Keywords", gym.keywords);
    }

    if (gym.confirmedEx || gym.taggedEx) {
      const status = gym.taggedEx && gym.confirmedEx ? "This gym is eligible and has previously hosted an EX Raid" : gym.taggedEx ? "This gym is eligible to host an EX Raid" : "This gym has previously hosted an EX Raid but is not currently listed as eligible.";
      embed.addField("EX Raid Eligible", status);
    }

    if (gym.notice) {
      embed.addField("Notice :no_entry:", gym.notice);
    }

    if (showGeo) {
      if (gym.geodata) {
        log.info(`geo: ${gym.geodata}`);
        //Add Geocode Information
        let geoinfo = "";
        const geodata = JSON.parse(gym.geodata);
        const addressComponents = geodata["addressComponents"];
        for (const [key, value] of Object.entries(addressComponents)) {
          geoinfo += "**" + key + "**: " + value + "\n";
        }

        embed.addField("Secret Sauce", geoinfo);
      }

      if (gym.places) {
        log.info(`places: ${gym.places}`);
        embed.addBlankField(true);
        embed.addField("Nearby Places", gym.places);
        embed.addBlankField(true);
      }
    }

    let footer = "Gym #" + gym.id;
    if (user) {
      footer += " | Edited by " + user
    }

    embed.setFooter(footer);

    // returns message promise for optional chaining
    return msg.channel.send({
      embed
    });
  }

  async getGymCount(channel) {
    const regionRaw = await this.getRegionsRaw(channel).catch(error => false);
    return new Promise(function (resolve, reject) {
      if (regionRaw) {
        const gymQuery = `SELECT * FROM Gym WHERE ST_CONTAINS(ST_GeomFromText('${regionRaw}'), POINT(lat, lon))`;
        dbhelper.query(gymQuery)
          .then(result => resolve(result.length))
          .catch(error => {
            log.error(error);
            reject(error);
          })
      } else {
        log.error("No region defined for this channel");
        reject("No region defined for this channel");
      }
    });
  }

  async getAllGyms() {
    return new Promise(async function (resolve, reject) {
      const gymQuery = "SELECT * FROM Gym LEFT JOIN GymMeta ON Gym.id=GymMeta.gymId";
      const results = await dbhelper.query(gymQuery)
        .catch(error => {
          log.error(error);
          return false;
        });
      if (results && results.length > 0) {
        resolve(results);
      } else {
        resolve([])
      }
    });
  }

  async getGyms(region) {
    return new Promise(async function (resolve, reject) {
      if (region) {
        const gymQuery = `SELECT * FROM Gym LEFT JOIN GymMeta ON Gym.id=GymMeta.gymId WHERE ST_CONTAINS(ST_GeomFromText('${region}'), POINT(lat, lon))`;
        const results = await dbhelper.query(gymQuery)
          .catch(error => {
            log.error(error);
            return false;
          });
        if (results && results.length > 0) {
          resolve(results);
        } else {
          resolve([]);
        }
      } else {
        log.error("no region define");
        reject("No region defined");
      }
    });
  }

  async getGym(gymId) {
    return new Promise(function (resolve, reject) {
      const gymQuery = "SELECT * FROM Gym LEFT JOIN GymMeta ON Gym.id=GymMeta.gymId WHERE id = ?";
      dbhelper.query(gymQuery, [gymId])
        .catch(error => {
          log.error(error);
          reject(error);
        })
        .then(async function (results) {
          resolve(results[0]);
        });
    });
  }

  async deleteGym(gymId, gymCache) {
    const that = this;
    return new Promise(async function (resolve, reject) {
      let preaffected = await that.findAffectedChannels(gymId);

      const gymQuery = "DELETE FROM Gym WHERE id = ?";
      dbhelper.query(gymQuery, [gymId])
        .catch(error => {
          log.error(error);
          reject(error);
        })
        .then(async function (results) {
          ImageCacher.deleteCachedImage(`images/gyms/${gymId}.png`);
          //Get Geocode Data
          //Recalculate all nearest gyms
          Meta.calculateNearestGyms()
            .then(affected => {
              //Sort ids that need updated into single array
              const gymIds = [];
              affected["new"].filter(value => {
                if (gymIds.indexOf(value) === -1) {
                  gymIds.push(value);
                }
                return true;
              });

              affected["changed"].filter(value => {
                if (gymIds.indexOf(value) === -1) {
                  gymIds.push(value);
                }
                return true;
              });

              log.info("Gym IDs need updated: " + gymIds);
              log.info("Places need updated on (" + affected["new"].length + ") new gyms and (" + affected["changed"].length + ") existing gyms");

              //Kick off all additional places updates in the background
              gymCache.markChannelsForReindex(preaffected);
              gymCache.markGymsForPlacesUpdates(gymIds);
              resolve(results.affectedRows === 1);

            }).catch(error => {
            log.error(error);
            log.error("Unable to update nearest gyms");
            resolve(results.affectedRows === 1);
          })
        });
    });
  }

  async regionChannelForGym(gym) {
    return new Promise(async function (resolve, reject) {
      let query = `SELECT CAST(channelId as CHAR(55)) as channel FROM Region WHERE ST_CONTAINS(bounds, Point(${gym.lat}, ${gym.lon}))`;
      const result = dbhelper.query(query)
        .then(result => {
          if (result.length > 0 && result[0].channel) {
            resolve(result[0].channel);
          } else {
            reject("No region found");
          }
        }).catch(error => {
          log.error(error);
          reject(error);
        });
    });
  }

  //This will compare location of gym to every channels region including its expanded range for outliers
  //All matching channels will be returned
  //Necessary for determining which channels need their searches reindexed
  async findAffectedChannels(gymId) {
    let channels = await this.getAllBoundedChannels();
    const matching = [];

    const that = this;
    return new Promise(async function (resolve, reject) {
      for (const channel of channels) {
        const region = await that.getRegionsRaw(channel["channelId"])
          .catch(error => {
            log.error(error);
            return null;
          });
        if (region !== null) {
          let regionObject = region ? that.getCoordRegionFromText(region) : null;
          const expanded = region ? that.enlargePolygonFromRegion(regionObject) : null;
          const polygon = region ? that.polygonStringFromRegion(expanded) : null;

          const gymQuery = region ? `SELECT * FROM Gym LEFT JOIN GymMeta ON Gym.id=GymMeta.gymId WHERE ST_CONTAINS(ST_GeomFromText('${polygon}'), POINT(lat, lon)) AND Gym.id = ${gymId}` : null;
          const results = await dbhelper.query(gymQuery)
            .catch(error => {
              log.error(error);
              return false;
            });
          if (results.length > 0) {
            matching.push(channel["channelId"]);
          }
        }
      }

      resolve(matching);
    });
  }

  async findGym(channel, term, nameOnly, allowMultiple) {
    const regionRaw = channel ? await this.getRegionsRaw(channel)
      .catch(error => {
        log.error(error);
        return false;
      }) : null;
    const errorMessage = channel ?
      "No gyms found in this region matching the term '" :
      "No gyms found matching the term '";

    //Test expanding polygon
    try {
      let regionObject = regionRaw ? this.getCoordRegionFromText(regionRaw) : null;
      const expanded = regionRaw ? this.enlargePolygonFromRegion(regionObject) : null;
      const polygon = regionRaw ? this.polygonStringFromRegion(expanded) : null;

      const that = this;
      return new Promise(function (resolve, reject) {
        if (regionRaw || channel == null) {
          const gymQuery = regionRaw ? `SELECT * FROM Gym LEFT JOIN GymMeta ON Gym.id=GymMeta.gymId WHERE ST_CONTAINS(ST_GeomFromText('${polygon}'), POINT(lat, lon))` : "SELECT * FROM Gym LEFT JOIN GymMeta ON Gym.id=GymMeta.gymId";
          dbhelper.query(gymQuery)
            .then(async function (results) {
              const idx = lunr(function () {
                this.ref('id');
                this.field('name');
                if (!nameOnly) {
                  this.field('nickname');
                  this.field('description');
                  this.field('keywords');
                  this.field('notice');

                  // fields from geocoding data, can add more if / when needed
                  this.field('intersection');
                  this.field('route');
                  this.field('neighborhood');
                  this.field('colloquial_area');
                  this.field('locality');
                  this.field('premise');
                  this.field('natural_feature');
                  this.field('postal_code');
                  this.field('bus_station');
                  this.field('establishment');
                  this.field('point_of_interest');
                  this.field('transit_station');

                  // field for places
                  this.field('places');
                }

                results.forEach(gym => {
                  // Gym document is a object with its reference and fields to collection of values
                  const gymDocument = Object.create(null);
                  gymDocument["id"] = gym.id;
                  gymDocument["name"] = gym.name;
                  if (gym.nickname) {
                    gymDocument["nickname"] = gym.nickname;
                  }

                  if (gym.description) {
                    gymDocument["description"] = gym.description;
                  }

                  if (gym.keywords) {
                    gymDocument["keywords"] = gym.keywords;
                  }

                  if (gym.notice) {
                    gymDocument["notice"] = gym.notice;
                  }

                  if (!gym.geodata) {
                    log.error('Gym "' + gym.name + '" has no geocode information!');
                  } else {
                    const geo = JSON.parse(gym.geodata);
                    const addressComponents = geo["addressComponents"];

                    for (const [key, value] of Object.entries(addressComponents)) {
                      gymDocument[key] = value;
                    }
                  }

                  if (!gym.places) {
                    gymDocument["places"] = gym.places;
                  }

                  this.add(gymDocument);
                }, this)
              });

              const searchResults = idx.search(term);
              if (searchResults.length > 0) {
                if (allowMultiple) {
                  const gyms = [];
                  for (let j = 0; j < results.length; j++) {
                    const gym = results[j];
                    for (let i = 0; i < searchResults.length; i++) {
                      const result = searchResults[i];
                      if (gym["id"] === result["ref"]) {
                        gyms.push(gym);
                      }
                    }
                  }

                  resolve(gyms);
                  return;
                } else {
                  const found = searchResults[0];
                  results.forEach(function (doc) {
                    if (doc["id"] === found["ref"]) {
                      resolve(doc);
                    }
                  }, this);
                }
              }

              reject(errorMessage + term + "'");
            }).catch(error => {
            log.error("GYM ERROR: " + error);
            reject("An error occurred looking for gyms");
          })
        } else {
          reject("No region defined in this channel");
        }
      });

    } catch (error) {
      log.error(error)
    }
  }

  keywordArrayFromString(string) {
    // noinspection ES6ConvertVarToLetConst
    const fixed = string.toLowerCase(); //strip trailing space from comma
    const items = fixed.split(",");
    const clean = [];
    items.forEach(item => {
      clean.push(item.replace(/^\s+|\s+$/g, ""));
    });

    return clean;
  }

  keywordStringFromArray(array) {
    return array.join(", ");
  }

  editGymKeywords(gym, action, keywords, gymCache) {
    const that = this;
    return new Promise(async function (resolve, reject) {
      const existing = (gym["keywords"] != null) ? that.keywordArrayFromString(gym["keywords"]) : [];
      let final;
      if (action === "add") {
        const additions = that.keywordArrayFromString(keywords);
        final = that.keywordStringFromArray(uniq(existing.concat(additions)));
      } else {
        if (keywords.toLowerCase() === "all") {
          final = NULL;
        } else {
          const removes = that.keywordArrayFromString(keywords);
          removes.forEach(item => {
            if (arrayContains(item, existing)) {
              existing.splice(existing.indexOf(item), 1);
            }
          });
          final = that.keywordStringFromArray(existing);
        }
      }

      let query;
      if (final) {
        query = `UPDATE GymMeta SET keywords = '${final}' WHERE gymId='${gym["id"]}'`;
      } else {
        query = `UPDATE GymMeta SET keywords = NULL WHERE gymId='${gym["id"]}'`;
      }

      let result = await dbhelper.query(query)
        .catch(error => {
          log.error(error);
          reject(error);
        });
      gym["keywords"] = final;

      Meta.markGymForReindexing(gym["id"], gymCache, that);

      resolve(gym);
    });
  }

  async setEXStatus(gym, tagged, previous, gymCache) {
    const that = this;
    return new Promise(async function (resolve, reject) {
      const query = `UPDATE GymMeta SET taggedEx = ${tagged ? 1 : 'NULL'}, confirmedEx = ${previous ? 1 : 'NULL'} WHERE gymId=${gym["id"]}`;
      log.info(query);

      const result = await dbhelper.query(query)
        .catch(error => {
          log.error(error);
          reject(error);
        })
        .then(async function (results) {
          const gymInfo = await dbhelper.query("SELECT * FROM Gym LEFT JOIN GymMeta ON Gym.id = GymMeta.gymId WHERE id = ?", [gym["id"]])
            .catch(error => {
              log.error(error);
              reject(error);
            });

          Meta.markGymForReindexing(gym["id"], gymCache, that);

          resolve(gymInfo[0]);
        });
    });
  }

  async setGymDescription(gym, description, gymCache) {
    const that = this;
    return new Promise(async function (resolve, reject) {
      let query;
      if (description.toLowerCase() === "remove") {
        query = `UPDATE GymMeta SET description = NULL WHERE gymId = ${gym["id"]}`;
      } else {
        query = `UPDATE GymMeta SET description = '${description}' WHERE gymId = ${gym["id"]}`;
      }

      const result = await dbhelper.query(query)
        .catch(error => {
          log.error(error);
          reject(error);
        })
        .then(async function (results) {
          const gymInfo = await dbhelper.query("SELECT * FROM Gym LEFT JOIN GymMeta ON Gym.id = GymMeta.gymId WHERE id = ?", [gym["id"]])
            .catch(error => {
              log.error(error);
              reject(error);
            });

          Meta.markGymForReindexing(gym["id"], gymCache, that);

          resolve(gymInfo[0]);
        });
    });
  }

  async setGymNickname(gym, nickname, gymCache) {
    const that = this;
    return new Promise(async function (resolve, reject) {
      let query = `UPDATE GymMeta SET nickname = '${nickname}' WHERE gymId = ${gym["id"]}`;
      if (nickname.toLowerCase() === "remove") {
        query = `UPDATE GymMeta SET nickname = NULL WHERE gymId = ${gym["id"]}`;
      }

      const result = await dbhelper.query(query)
        .catch(error => {
          log.error(error);
          reject(error);
        })
        .then(async function (results) {
          const gymInfo = await dbhelper.query("SELECT * FROM Gym LEFT JOIN GymMeta ON Gym.id = GymMeta.gymId WHERE id = ?", [gym["id"]])
            .catch(error => {
              log.error(error);
              reject(error);
            });

          Meta.markGymForReindexing(gym["id"], gymCache, that);

          resolve(gymInfo[0]);
        });
    });
  }

  async setGymName(gym, name, gymCache) {
    const that = this;
    return new Promise(async function (resolve, reject) {
      let query = "UPDATE Gym SET name = ? WHERE id = ?";
      const result = await dbhelper.query(query, [name, gym["id"]])
        .catch(error => {
          log.error(error);
          reject(error);
        })
        .then(async function (results) {
          const gymInfo = await dbhelper.query("SELECT * FROM Gym LEFT JOIN GymMeta ON Gym.id = GymMeta.gymId WHERE id = ?", [gym["id"]])
            .catch(error => {
              log.error(error);
              reject(error);
            });

          Meta.markGymForReindexing(gym["id"], gymCache, that);

          resolve(gymInfo[0]);
        });
    });
  }

  async setGymNotice(gym, notice, gymCache) {
    const that = this;
    return new Promise(async function (resolve, reject) {
      let query = `UPDATE GymMeta SET notice = '${notice}' WHERE gymId=${gym["id"]}`;
      if (notice.toLowerCase() === "remove") {
        query = `UPDATE GymMeta SET notice = NULL WHERE gymId=${gym["id"]}`;
      }
      const result = await dbhelper.query(query)
        .catch(error => reject(error))
        .then(async function (results) {
          const gymInfo = await dbhelper.query("SELECT * FROM Gym LEFT JOIN GymMeta ON Gym.id = GymMeta.gymId WHERE id = ?", [gym["id"]])
            .catch(error => {
              log.error(error);
              reject(error);
            });

          Meta.markGymForReindexing(gym["id"], gymCache, that);

          resolve(gymInfo[0]);
        });
    });
  }

  async importGym(statement, values) {
    return new Promise(async function (resolve, reject) {
      await dbhelper.query(statement, values)
        .catch(error => {
          log.error(error);
          reject(error);
        })
        .then(async function (results) {
          resolve(results);
        });
    });
  }

  //******
  //update
  //******

  findSimilarGymByLocation(gyms, coords) {
    const point = this.getPointFromText(coords);
    for (let i = 0; i < gyms.length; i++) {
      const item = gyms[i];
      if (distance(item.lat, item.lon, point.x, point.y, "K") < 0.01) {
        return item;
      }
    }
    return null;
  }

  findSimilarGym(raw, name, coords) {
    const point = this.getPointFromText(coords);
    for (let i = 0; i < raw.length; i++) {
      const item = raw[i];
      if (distance(item.lat, item.lon, point.x, point.y, "K") < 0.01) {
        const result = stringSimilarity.compareTwoStrings(name, item.name);
        if (result > 0.5) {
          return item;
        }
        log.info("name doesnt match close enough")
      }
    }

    return null;
  }
}

module.exports = new RegionHelper();
