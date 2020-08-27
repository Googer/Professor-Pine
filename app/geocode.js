"use strict";

const privateSettings = require('../data/private-settings'),
  log = require('loglevel').getLogger('Geocoder'),
  dbhelper = require('./dbhelper'),
  googleMaps = require('@google/maps').createClient({
    key: privateSettings.googleApiKey
  });

function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // Radius of the earth in km
  const dLat = deg2rad(lat2 - lat1);  // deg2rad below
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const d = R * c; // Distance in km
  return d;
}

function deg2rad(deg) {
  return deg * (Math.PI / 180)
}


class MetaMachine {
  constructor() {
  }

  nearestGym(gym, gyms, print) {
    let shortestDistance = Number.MAX_VALUE;
    let nearest = null;

    for (let i = 0; i < gyms.length; i++) {
      const check = gyms[i];
      if (gym !== check) {
        const distance = getDistanceFromLatLonInKm(gym.lat, gym.lon, check.lat, check.lon);

        if (print) {
          log.info("l: " + gym.lat + " l: " + gym.lon);
          log.info("l: " + check.lat + " l: " + check.lon);
          log.info(distance);
        }
        if (distance < shortestDistance) {
          shortestDistance = distance;
          nearest = check;
        }
      }
    }

    return nearest;
  }

  async calculateNearestGyms() {
    const that = this;
    return new Promise(async (resolve, reject) => {
      const gymQuery = "SELECT * FROM Gym LEFT JOIN GymMeta ON Gym.id = GymMeta.gymId";
      const results = await dbhelper.query(gymQuery)
        .catch(error => {
          log.info(error);
          reject(error);
        });

      const changed = [];
      const newGyms = [];
      const res = {};

      let print = true;
      let updateQuery = "";
      results.forEach(gym => {
        log.info(gym.name + " - Lat: " + gym.lat + " Lon: " + gym.lon);

        const nearest = that.nearestGym(gym, results, print);

        if (nearest) {
          print = false;

          if (gym.nearestGym) {
            if (nearest.id !== gym.nearestGym) {
              changed.push(gym.id);
              changed.push(gym.nearestGym);
              changed.push(nearest.id);
            }
          } else {
            newGyms.push(gym.id);
            changed.push(nearest.id);
          }

          updateQuery += "UPDATE GymMeta SET nearestGym = " + nearest.id + " WHERE gymId = " + gym.id + ";";
        }
      });

      if (updateQuery !== "") {
        const result = await dbhelper.query(updateQuery)
          .catch(error => reject(error));
      }

      res["new"] = newGyms;
      res["changed"] = changed;

      resolve(res);
    });
  }

  async filterGeocodeComponents(json) {
    return new Promise(async (resolve, reject) => {
      const addressInfo = new Map();
      if (!json) {
        log.info("nothing");
        reject(false);
      } else {
        const results = {};
        log.info("lets parse");
        json.forEach(addressComponent => {
          addressComponent['address_components'].forEach(addComp => {
            addComp['types'].forEach(type => {
              const typeKey = type.toLowerCase();
              let values = addressInfo.get(typeKey);

              if (!values) {
                values = new Set();
                addressInfo.set(typeKey, values);
              }
              values.add(addComp['short_name']);
            });
          });
        });

        // Insert geocoded map info into map
        addressInfo.forEach((value, key) => {
          results[key] = Array.from(value).join(' ');
        });

        log.info(results);
        resolve(results);
      }
    });
  }

  async filterGeocodeComponentsPgP(gym) {
    return new Promise(async (resolve, reject) => {
      const addressInfo = new Map();
      if (!gym.geodata) {
        log.warn('Gym "' + gym.name + '" has no geocode information!');
        reject(false)
      } else {
        const results = {};
        const geo = JSON.parse(gym.geodata);
        const addressComponents = geo["addressComponents"];
        if (addressComponents && Array.isArray(addressComponents)) {
          addressComponents.forEach(addressComponent => {
            addressComponent.addressComponents.forEach(addComp => {
              addComp.types.forEach(type => {
                const typeKey = type.toLowerCase();
                let values = addressInfo.get(typeKey);

                if (!values) {
                  values = new Set();
                  addressInfo.set(typeKey, values);
                }
                values.add(addComp.shortName);
              });
            });
          });
        } else {
          resolve(null);
          return;
        }

        // Insert geocoded map info into map
        addressInfo.forEach((value, key) => {
          results[key] = Array.from(value).join(' ');
        });
        resolve(results);
      }
    });
  }

  //Take PGP json data out of DB, format it like it will be for indexing, and then restore it.
  async updateGeocodeFormatForGyms() {
    const that = this;
    return new Promise(async (resolve, reject) => {
      const gymQuery = "SELECT * FROM Gym LEFT JOIN GymMeta ON Gym.id = GymMeta.gymId";
      const results = await dbhelper.query(gymQuery)
        .catch(error => {
          log.info(error);
          reject(error);
        });

      let total = 0;
      for (let i = 0; i < results.length; i++) {
        const gym = results[i];
        const result = await that.filterGeocodeComponentsPgP(gym);
        if (result) {
          const geo = JSON.parse(gym.geodata);
          geo["addressComponents"] = result;
          const json = JSON.stringify(geo).replace(/[\u0800-\uFFFF]/g, '');
          log.info("\n" + json + "\n");
          let updateQuery = "UPDATE GymMeta SET geodata = ? WHERE gymId = ?";
          let dbresult = await dbhelper.query(updateQuery, [json, gym.id])
            .catch(error => log.info("Failed to update geodata for " + gym.name));
          total += 1;
        }
      }

      resolve({});
    });
  }

  async geocodeGym(gym) {
    const that = this;
    return new Promise(async (resolve, reject) => {
      googleMaps.reverseGeocode({
        latlng: [gym.lat, gym.lon]
      }, async (err, response) => {
        if (!err) {
          log.info(JSON.stringify(response.json.results, null, 4));
          const json = JSON.parse(JSON.stringify(response.json.results));

          const results = await that.filterGeocodeComponents(json);
          if (results) {
            const geo = gym.geodata ? JSON.parse(gym.geodata) : {};
            geo["addressComponents"] = results;

            let json = JSON.stringify(geo);
            let updateQuery = "UPDATE GymMeta SET geodata = ? WHERE gymId = ?";
            let dbresult = await dbhelper.query(updateQuery, [json, gym.id])
              .catch(error => reject("Unable to store geocode data"));

            gym.geodata = json;
            resolve(gym);
          } else {
            reject("No valid geocode data");
          }
        } else {
          reject(err);
        }
      })
    });
  }

  evaluatePlace(place) {
    let allowed = ['accounting', 'airport', 'amusement_park', 'aquarium', 'art_gallery', 'atm', 'bakery', 'bank', 'bar', 'beauty_salon', 'bicycle_store', 'book_store', 'bowling_alley', 'bus_station', 'cafe', 'campground', 'car_dealer', 'car_rental', 'car_repair', 'car_wash', 'casino', 'cemetery', 'church', 'city_hall', 'clothing_store', 'convenience_store', 'courthouse', 'dentist', 'department_store', 'doctor', 'electrician', 'electronics_store', 'embassy', 'establishment', 'finance', 'fire_station', 'florist', 'food', 'funeral_home', 'furniture_store', 'gas_station', 'general_contractor', 'grocery_or_supermarket', 'gym', 'hair_care', 'hardware_store', 'health', 'hindu_temple', 'home_goods_store', 'hospital', 'insurance_agency', 'jewelry_store', 'laundry', 'lawyer', 'library', 'liquor_store', 'local_government_office', 'locksmith', 'lodging', 'meal_delivery', 'meal_takeaway', 'mosque', 'movie_rental', 'movie_theater', 'moving_company', 'museum', 'night_club', 'painter', 'park', 'parking', 'pet_store', 'pharmacy', 'physiotherapist', 'place_of_worship', 'plumber', 'police', 'post_office', 'real_estate_agency', 'restaurant', 'roofing_contractor', 'rv_park', 'school', 'shoe_store', 'shopping_mall', 'spa', 'stadium', 'storage', 'store', 'subway_station', 'synagogue', 'taxi_stand', 'train_station', 'travel_agency', 'university', 'veterinary_care', 'zoo'];

    let hit = false;
    for (let i = 0; i < place['types'].length; i++) {
      const type = place['types'][i];
      if (allowed.includes(type)) {
        hit = true;
      }
    }

    if (hit) {
      return true;
    } else {
      return false;
    }
  }

  async updatePlaces(gymCache) {
    this.updatePlacesForGyms(gymCache.getNextGymsForPlacesUpdate(), gymCache, null)
  }

  async updatePlacesForGyms(gyms, gymCache, region) {
    log.info(`Updating places for ${gyms.length} gyms...`);
    log.info(gyms);

    const that = this;
    gyms.forEach(async id => {
      log.info(id);
      const gymQuery = "SELECT * FROM Gym LEFT JOIN GymMeta ON Gym.id = GymMeta.gymId WHERE id = " + id;
      log.info(gymQuery);

      return dbhelper.query(gymQuery)
        .catch(error => log.error(error))
        .then(async result => {
          if (result && result.length > 0 && result[0].id) {
            let gym = result[0];
            that.findPlacesNearGym(gym)
              .catch(error => log.error(`Error getting places for gym #${gym.id}`))
              .then(async result => {
                if (region != null) {
                  //Get channels that need reindexed
                  //Add to queue
                  let affectedChannels = await region.findAffectedChannels(gym.id);
                  gymCache.markChannelsForReindex(affectedChannels);

                } else {
                  gymCache.markPlacesComplete(id);
                }
              })
          } else {
            log.info("no result for gym");
          }
        });
    });
  }

  async findPlacesNearGym(gym) {
    const that = this;
    return new Promise(async (resolve, reject) => {

      const gymQuery = "SELECT * FROM Gym WHERE id = ?";
      const results = await dbhelper.query(gymQuery, [gym.nearestGym])
        .catch(error => {
          log.error(error);
          log.info(`Error getting nearest gym (${gym.id}) for gym (${gym.nearestGym})`);
          reject(error);
        });

      const nearest = results[0];

      let distance = getDistanceFromLatLonInKm(gym.lat, gym.lon, nearest.lat, nearest.lon);
      let radius = (distance / 2) * 1000; //convert to meters

      log.info(`Getting places within ${radius} meters of ${gym.id}`);

      googleMaps.placesNearby({
        language: 'en',
        location: [gym.lat, gym.lon],
        radius: radius
      }, async (err, response) => {
        if (!err) {
          const places = [];
          for (let i = 0; i < response.json.results.length; i++) {
            let place = response.json.results[i];
            if (that.evaluatePlace(place)) {
              places.push(place['name']);
            }
          }

          log.info(`Places: ${places}`);
          let updateQuery = "UPDATE `GymMeta` SET `places` = ? WHERE `gymId` = ?";

          let dbresult = await dbhelper.query(updateQuery, [places.join(' '), gym.id])
            .catch(error => {
              log.error(`Failed to update nearby places in database for ${gym.name} (#${gym.id})`);
              reject(error);
            })
            .then(result => resolve(gym));
        } else {
          reject(err);
        }
      })
    });
  }

  //This geocodes a newly added gym (or gym with updated lat lon)
  //Recalculates nearest gyms
  //Identifies gyms that need geo updates as a result
  //Updates all gyms
  //Reindexes affected search regions
  async beginGeoUpdates(gym, gymCache) {
    const that = this;
    return new Promise(async (resolve, reject) => {
      //Get Geocode Data for gym
      that.geocodeGym(gym)
        .then(gym => {
          //Recalculate all nearest gyms
          that.calculateNearestGyms()
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

              log.info("Gym IDs to be updated: " + gymIds);
              log.info("Places need updated on (" + affected["new"].length + ") new gyms and (" + affected["changed"].length + ") existing gyms");

              gymCache.markGymsForPlacesUpdates(gymIds);
              resolve(gym);
            })
            .catch(error => {
              log.error(error);
              log.error("Unable to update nearest gyms");
              resolve(gym);
            });
        })
        .catch(error => {
          log.error(error);
          log.error("Unable to geocode gym #" + gym.id);
          resolve(gym);
        });
    });
  }

  async markGymForReindexing(gym, gymCache, region) {
    let affectedChannels = await region.findAffectedChannels(gym);
    gymCache.markChannelsForReindex(affectedChannels);
  }
}

module.exports = new MetaMachine();
