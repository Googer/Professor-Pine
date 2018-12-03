"use strict";

const private_settings = require('../data/private-settings'),
	dbhelper = require('./dbhelper'),
	googleMaps = require('@google/maps').createClient({
  key: private_settings.googleApiKey
});

function getDistanceFromLatLonInKm(lat1,lon1,lat2,lon2) {
  var R = 6371; // Radius of the earth in km
  var dLat = deg2rad(lat2-lat1);  // deg2rad below
  var dLon = deg2rad(lon2-lon1);
  var a =
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon/2) * Math.sin(dLon/2)
    ;
  var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  var d = R * c; // Distance in km
  return d;
}

function deg2rad(deg) {
  return deg * (Math.PI/180)
}


class MetaMachine {

    constructor() {}

    nearestGym(gym,gyms,print) {
        var shortestDistance = Number.MAX_VALUE;
        var nearest = null;

        for(var i=0; i<gyms.length; i++) {
            var check = gyms[i];
            if(gym != check) {
                var distance = getDistanceFromLatLonInKm(gym.lat,gym.lon,check.lat,check.lon)

                if(print) {
                    console.log("l: " + gym.lat + " l: " + gym.lon);
                    console.log("l: " + check.lat + " l: " + check.lon);
                    console.log(distance);
                }
                if(distance < shortestDistance) {
                    shortestDistance = distance;
                    nearest = check;
                }
            }
        }

        return nearest;
    }

    async calculateNearestGyms() {
        var that = this;
        return new Promise(async function(resolve, reject) {
            const gym_query = "SELECT * FROM Gym LEFT JOIN GymMeta ON Gym.id=GymMeta.gym_id";
            var results = await dbhelper.query(gym_query).catch(error => {
                console.log(error);
                reject(error);
            });

            var changed = [];
            var newGyms = [];
            var collateral = [];
            var res = {};

            var print = true;
            var updateQuery = "";
            results.forEach(gym => {
                console.log(gym.name + " - Lat: " + gym.lat + " Lon: " + gym.lon);
                var nearest = that.nearestGym(gym,results,print);

                console.log(nearest.id);
                print = false;

                if(gym.nearestGym) {
                    if(nearest.id != gym.nearestGym) {
                        changed.push(gym.id)
                        changed.push(gym.nearestGym)
                        changed.push(nearest.id)
                    }
                } else {
                    newGyms.push(gym.id)
                    changed.push(nearest.id)
                }

                updateQuery += "UPDATE GymMeta SET nearestGym = " + nearest.id + " WHERE gym_id=" + gym.id +";";
            })

            var result = await dbhelper.query(updateQuery).catch(error => reject(error));

            res["new"] = newGyms;
            res["changed"] = changed;

            resolve(res);
        });
    }

    async filterGeocodeComponents(json) {
        return new Promise(async function(resolve, reject) {
            const addressInfo = new Map();
            if (!json) {
                console.log("nothing")
              reject(false)
            } else {
                var results = {}
                console.log("lets parse")
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

                console.log(results)
                resolve(results)
            }
        });
    }

    async filterGeocodeComponentsPgP(gym) {
        return new Promise(async function(resolve, reject) {
            const addressInfo = new Map();
            if (!gym.geodata) {
              log.warn('Gym "' + gym.name + '" has no geocode information!');
              reject(false)
            } else {
                var results = {}
                var geo = JSON.parse(gym.geodata);
                var addressComponents = geo["addressComponents"];
                if(addressComponents && Array.isArray(addressComponents)) {
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
                  resolve(null)
                  return
              }

                // Insert geocoded map info into map
                addressInfo.forEach((value, key) => {
                  results[key] = Array.from(value).join(' ');
                });
                if(gym.name == "47L Trolly at the Schoolhouse Arts Center") {
                    console.log(results)
                }
                resolve(results)
            }
        });
    }

    //Take PGP json data out of DB, format it like it will be for indexing, and then restore it.
    async updateGeocodeFormatForGyms() {
        var that = this;
        return new Promise(async function(resolve, reject) {
            const gym_query = "SELECT * FROM Gym LEFT JOIN GymMeta ON Gym.id=GymMeta.gym_id";
            var results = await dbhelper.query(gym_query).catch(error => {
                console.log(error);
                reject(error);
            });

            var total = 0;
            for(var i=0;i<results.length;i++) {
                var gym = results[i];
                var result = await that.filterGeocodeComponentsPgP(gym);
                if(result) {
                    var geo = JSON.parse(gym.geodata);
                    geo["addressComponents"] = result;
                    var json = JSON.stringify(geo).replace(/[\u0800-\uFFFF]/g, '');
                    console.log("\n" + json + "\n")
                    let updateQuery = "UPDATE GymMeta SET geodata = ? WHERE gym_id = ?";
                    let dbresult = await dbhelper.query(updateQuery,[json,gym.id]).catch(error => console.log("Failed to update geodata for " + gym.name));
                    total += 1;
                }
            }

            resolve({})
        });
    }

    async geocodeGym(gym) {
        var that = this;
        return new Promise(async function(resolve, reject) {
            googleMaps.reverseGeocode({
                latlng: [gym.lat, gym.lon]
            }, async function(err, response) {
                if (!err) {
                    console.log(JSON.stringify(response.json.results, null, 4));
                    var json = JSON.parse(JSON.stringify(response.json.results));
                    // return filterGeocodeComponents(json)
                    var results = await that.filterGeocodeComponents(json)
                    if(results) {
                        var geo = gym.geodata ? JSON.parse(gym.geodata) : {}
                        geo["addressComponents"] = results;

                        let json = JSON.stringify(geo);
                        let updateQuery = "UPDATE GymMeta SET geodata = ? WHERE gym_id = ?";
                        let dbresult = await dbhelper.query(updateQuery,[json,gym.id]).catch(error => reject("Unable to store geocode data"));

                        gym.geodata = json;
                        resolve(gym)
                    } else {
                        reject("No valid geocode data")
                    }
                } else {
                    reject(err)
                }
            })
        });
    }

    evaluatePlace(place) {
        let allowed = ['accounting','airport','amusement_park','aquarium','art_gallery','atm','bakery','bank','bar','beauty_salon','bicycle_store','book_store','bowling_alley','bus_station','cafe','campground','car_dealer','car_rental','car_repair','car_wash','casino','cemetery','church','city_hall','clothing_store','convenience_store','courthouse','dentist','department_store','doctor','electrician','electronics_store','embassy','establishment','finance','fire_station','florist','food','funeral_home','furniture_store','gas_station','general_contractor','grocery_or_supermarket','gym','hair_care','hardware_store','health','hindu_temple','home_goods_store','hospital','insurance_agency','jewelry_store','laundry','lawyer','library','liquor_store','local_government_office','locksmith','lodging','meal_delivery','meal_takeaway','mosque','movie_rental','movie_theater','moving_company','museum','night_club','painter','park','parking','pet_store','pharmacy','physiotherapist','place_of_worship','plumber','police','post_office','real_estate_agency','restaurant','roofing_contractor','rv_park','school','shoe_store','shopping_mall','spa','stadium','storage','store','subway_station','synagogue','taxi_stand','train_station','travel_agency','university','veterinary_care','zoo'];
        // console.log(place['name'] + "\n")

        var hit = false
        for(var i=0;i<place['types'].length;i++) {
            var type = place['types'][i]
            // console.log(">>> " + type + "\n")
            if(allowed.includes(type)) {
                hit = true
            }
        }

        // console.log("\n")

        if(hit) {
            return true
        } else {
            return false
        }
    }

    async updatePlaces(gym_ids) {
        var that = this;
        gym_ids.forEach(id => {
            const gym_query = "SELECT * FROM Gym LEFT JOIN GymMeta ON Gym.id = GymMeta.gym_id WHERE id = " + id;
            dbhelper.query(gym_query).catch(error => {
                console.log(error);
                console.log("oh no")
            }).then(result => {
                if(result && result.length > 0 && result[0].id) {
                    let gym = result[0]
                    that.findPlacesNearGym(gym).then().catch(error => console.error("Error getting places for gym #" + gym.id))
                }
            })
        })
    }

    async findPlacesNearGym(gym) {
        var that = this;
        return new Promise(async function(resolve, reject) {
            console.log(gym.nearestGym)
            const gym_query = "SELECT * FROM Gym WHERE id = " + gym.nearestGym;
            var results = await dbhelper.query(gym_query).catch(error => {
                console.log(error);
                console.log("oh no")
                reject(error);
            });
            console.log(results)
            var nearest = results[0];

            let distance = getDistanceFromLatLonInKm(gym.lat,gym.lon,nearest.lat,nearest.lon)
            let radius = (distance / 2) * 1000; //convert to meters
            googleMaps.placesNearby({
                language: 'en',
                location: [gym.lat, gym.lon],
                radius: radius
            }, async function(err, response) {
                if (!err) {
                    // console.log(response.json.results);
                    var results = []
                    for(var i=0;i<response.json.results.length;i++) {
                        let place = response.json.results[i]
                        if(that.evaluatePlace(place)) {
                            results.push(place['name'])
                        }
                    }

                    var geo = gym.geodata ? JSON.parse(gym.geodata) : {};
                    geo["places"] = results;
                    var json = JSON.stringify(geo);
                    console.log("\n" + json + "\n")
                    let updateQuery = "UPDATE GymMeta SET geodata = ? WHERE gym_id = ?";
                    let dbresult = await dbhelper.query(updateQuery,[json,gym.id]).catch(error => console.log("Failed to update geodata for " + gym.name));

                    gym.geodata = json
                    resolve(gym)
                } else {
                    reject(error)
                }
            })
        });
    }
}

module.exports = new MetaMachine();
