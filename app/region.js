const commando = require('discord.js-commando'),
	Discord = require('discord.js'),
	https = require('https'),
	oneLine = require('common-tags').oneLine,
	tj = require('togeojson-with-extended-style'),
	lunr = require('lunr'),
	dbhelper = require('./dbhelper'),
	Meta = require('./geocode'),
	DOMParser = require('xmldom').DOMParser,
	stringSimilarity = require('string-similarity'),
	private_settings = require('../data/private-settings'),
	request = require("request"),
	mysql = require('mysql'),
	turf = require('@turf/turf');

//This gets the decimal lat/lon value from a string of degree/minute/seconds
function getDecimalValueFromCoord(str) {
	//degrees + (minutes/60) + (seconds/3600)
    var degreePos = str.indexOf('°');
    var minutePos = str.indexOf("'");
    var secondPos = str.indexOf('%22');
    var degrees = str.substring(0,degreePos);
    var minutes = str.substring(minutePos,degreePos+1);
    var seconds = str.substring(secondPos,minutePos+1);

    var last = str.substring(str.length-1,str.length);
    var negative = last === "W" || last === "S"; //if the value is S (South) it is a negative latitude - if it is W (West) it is a negative longitude
    var result = parseFloat(degrees, 10) + (parseFloat(minutes, 10)/60) + (parseFloat(seconds, 10)/3600);

    return negative ? result * -1 : result;
}

function ParseDMS(input) {
    var parts = input.split(/[^\d\w.]+/);
    console.log(parts)

    var lat = ConvertDMSToDD(parts[0], parts[1], parts[2], parts[3]);
    var lng = ConvertDMSToDD(parts[4], parts[5], parts[6], parts[7]);

    return {
        "lat": Number(lat),
        "lng": Number(lng)
    };
}

function ConvertDMSToDD(degrees, minutes, seconds, direction) {

    var s = seconds / (60*60);
    var m = minutes / 60;

    var dd = Number(degrees) + Number(m) + Number(s);

    if (direction == "S" || direction == "W") {
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
	var og = [];
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
	var radlat1 = Math.PI * lat1 / 180
	var radlat2 = Math.PI * lat2 / 180
	var theta = lon1 - lon2
	var radtheta = Math.PI * theta / 180
	var dist = Math.sin(radlat1) * Math.sin(radlat2) + Math.cos(radlat1) * Math.cos(radlat2) * Math.cos(radtheta);
	dist = Math.acos(dist)
	dist = dist * 180 / Math.PI
	dist = dist * 60 * 1.1515
	if (unit == "K") {
		dist = dist * 1.609344
	}
	if (unit == "N") {
		dist = dist * 0.8684
	}
	return dist
}

String.prototype.replaceAll = function(search, replace) {
	//if replace is not sent, return original string otherwise it will
	//replace search string with 'undefined'.
	if (replace === undefined) {
		return this.toString();
	}

	return this.replace(new RegExp('[' + search + ']', 'g'), replace);
};

Region.prototype.area = function() {
	var area = 0,
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

Region.prototype.centroid = function() {
	var x = 0,
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
	constructor() {}

	getPointFromText(text) {
		var final = text.replaceAll(" ", "");
		var items = final.split(",");
		return {
			"x": Number(items[0]),
			"y": Number(items[1])
		};
	}

	getCoordRegionFromText(text) {
		var trimmed = text.substring(9, text.length - 2);
		var items = trimmed.split(",");

		var points = [];
		for (var i = 0; i < items.length; i++) {
			var coords = items[i].split(" ");
			points[i] = {
				"x": Number(coords[0]),
				"y": Number(coords[1])
			};
		}

		return new Region(points);
	}

    regionFromGeoJSON(geojson) {
        var coordinates = geojson["geometry"]["coordinates"][0];
        var points = [];
		for (var i = 0; i < coordinates.length; i++) {
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
        var coords = []
        for(var p=0;p<region.length;p++) {
            let point = region.points[p];
            var points = [point.y,point.x]
            coords.push(points)
        }

        //console.log(coords)

        try {
            var poly = turf.polygon([coords])
            var buffer = turf.buffer(poly, '2.0')
            var options = {tolerance: 0.005};
            var enlarged = turf.simplify(buffer, options);
            //console.log(JSON.stringify(enlarged,null,4));

            return this.regionFromGeoJSON(enlarged);
        } catch(error) {
            console.error(error);
            return null;
        }

    }

	getJSONRegionFromText(text) {
		var trimmed = text.substring(9, text.length - 2);
		var items = trimmed.split(",");

		var points = [];
		for (var i = 0; i < items.length; i++) {
			var coords = items[i].split(" ");
			var point = [Number(coords[0]), Number(coords[1])]
			points[i] = point
		}

		return points;
	}

	googleMapsLinkForRegion(text) {
		var region = this.getCoordRegionFromText(text);
		var trimmed = text.substring(9, text.length - 2);
		var items = trimmed.split(",");
		var joined = items.join("|");
		var final = joined.replaceAll(" ", ",");

		this.dumpRegionJSON(region)

		var center = region.centroid();
		var base_url = "http://maps.google.com/maps/api/staticmap?size=500x300&format=png&center=" + center.x + "," + center.y + "&path=color:red|" + final + "&sensor=false&scale=2&key=" + private_settings.googleApiKey;

		return base_url;
	}

	googlePinLinkForPoint(coordString) {
		//https://www.google.com/maps/search/?api=1&query=40.3526935781,-79.8271793297
		return "https://www.google.com/maps/search/?api=1&query=" + coordString.replaceAll(" ", "");
	}

	async checkRegionsExist() {
		return new Promise(async function(resolve, reject) {
			var results = await dbhelper.query("SHOW TABLES LIKE 'Region';").catch(error => resolve(false));
			if (results.length > 0 && results[0] != undefined) {
				// console.log(results[0]["AsText(bounds)"]);
				resolve(true);
			} else {
				resolve(false);
			}
		});
	}

	async getRegionsRaw(channel) {
		return new Promise(async function(resolve, reject) {
			var results = await dbhelper.query("SELECT AsText(bounds) FROM Region WHERE channel_id = " + channel + ";").catch(error => reject(false));
			if (results.length > 0 && results[0] != undefined) {
				// console.log(results[0]["AsText(bounds)"]);
				resolve(results[0]["AsText(bounds)"]);
			} else {
				//console.log(results)
				reject(false);
			}
		});
	}

	async getChannelsForGym(gym) {
		return new Promise(async function(resolve, reject) {
			var q = "SELECT channel_id FROM Region WHERE ST_CONTAINS(bounds, POINT(" + gym.lat + ", " + gym.lon + "));";
			var results = await dbhelper.query(q).catch(error => reject(false));
			if (results.length > 0) {
				resolve(results);
			} else {
				reject(false);
			}
		});
	}

	polygonStringFromRegion(region) {
		var polystring = "POLYGON((";
		for (var i = 0; i < region.length; i++) {
			var coords = region.points[i];

			polystring += coords.x + " " + coords.y;
			if (i + 1 < region.length) {
				polystring += ",";
			}
		}

		polystring += "))"
		return polystring
	}

	dumpRegionJSON(region) {
		// console.log(JSON.stringify(region.points, null, 2));
	}

	pointStringFromPoint(point) {
		//POINT (418 411)
		return "POINT (" + point.x + " " + point.y + ")";
	}

	checkCoordForChannel(channel, coords, resolve, reject) {
		var that = this
		var select_query = "SELECT AsText(bounds) FROM Region WHERE channel_id = " + channel + ";"
		dbhelper.query(select_query).then(async function(results) {
			var region = that.getCoordRegionFromText(results[0]["AsText(bounds)"]);
			var query = "SELECT ST_CONTAINS( ST_GeomFromText('";
			query += that.polygonStringFromRegion(region);
			query += "'),";
			query += "ST_GeomFromText('";
			query += that.pointStringFromPoint(that.getPointFromText(coords));
			query += "'));";

			dbhelper.query(query).then(result => {
				console.log("RESULT: " + result[0][Object.keys(result[0])[0]]);
				var match = result[0][Object.keys(result[0])[0]];

				// debugger;
				if (match == 1) {
					resolve(true);
				} else {
					resolve("The coordinates provided are not within this channels bounds.");
				}
			}).catch(error => resolve("An unknown error occurred"))

		}).catch(error => resolve("An unknown error occurred"))
	}

	async getAllRegions() {
		const select_query = "SELECT * FROM Region;"
		return new Promise(async function(resolve, reject) {
			const results = await dbhelper.query(select_query).catch(error => NULL);
			if (results) {
				resolve(results)
			} else {
				reject("No regions defined in this server")
			}
		});
	}

  async deleteRegionsNotInChannels(channels) {
		if(channels.length > 0) {
			var select_query = "DELETE FROM Region WHERE ";
	        var orOptions = []

	        for(var i=0;i<channels.length;i++) {
	            var option = " channel_id <> " + channels[i];
	            orOptions.push(option)
	        }

	        select_query += orOptions.join(' AND')

	        console.log(select_query)

			return new Promise(async function(resolve, reject) {
				const results = await dbhelper.query(select_query).catch(error => NULL);
				if (results) {
					resolve(results)
				} else {
					reject("No regions defined in this server")
				}
			});
		} else {
			return new Promise(async function(resolve, reject) {
					reject("No regions defined in this server")
			});
		}

	}

	getRegionDetailEmbed(channel) {
		var that = this
		return new Promise(async function(resolve, reject) {
			const region = await that.getRegionsRaw(channel).catch(error => false);
			if (!region) {
				reject("No region defined for this channel")
				return
			}

			const gyms = await that.getGymCount(channel).catch(error => 0);

            var url = that.googleMapsLinkForRegion(region);
            if (url != null) {
                const embed = new Discord.MessageEmbed()
                    .setTitle("This channel covers the following area")
                    .setURL(url)
                    .setImage(url);

                if (gyms) {
                    embed.setDescription("There " + (gyms == 1 ? "is" : "are") + " " + (gyms != 0 ? gyms : "no") + " gym" + (gyms < 1 || gyms > 1 ? "s" : "") + " within this region");
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

	async getCoordStringFromURL(url,resolve,reject) {

        console.log("check if url");
		if(url.search("google.com") > 0) {

			//Google Maps Desktop Pin Links
			//**Decimal lat/lon in the url itself are incorrect values - so take the degree/hour/minute coords from URL and convert them to decimal lat/lon
			//https://www.google.com/maps/place/40°19'57.3%22N+80°04'14.1%22W/@40.33259,-80.0711372,19z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!7e2!8m2!3d40.3325897!4d-80.0705899
			if(url.search("maps/place/") > 0) {
				var end = url.indexOf("/@");
				var start = url.indexOf("/place/");
				var res = url.substring(end, start+7);
				var sp = res.split("+");
				var ll_str = getDecimalValueFromCoord(sp[0]) + ", " + getDecimalValueFromCoord(sp[1]);
				if(this.isValidCoords(ll_str)) {
					resolve(ll_str);
					return;
				} else {
					resolve(null);
				}

			//Directions links for google (used from Gym Huntr)
			//https://www.google.com/maps/dir/Current+Location/40.376768,-80.051049
			} else if(url.search("maps/dir/") > 0) {
				var def = "maps/dir/";
				var defPos = url.indexOf(def);
				var res1 = url.substring(url.length, defPos+def.length);
				var strt = res1.indexOf("/");
				var ll_str = res1.substring(res1.length,strt+1);
				if(this.isValidCoords(ll_str)) {
					resolve(ll_str);
					return;
				} else {
					resolve(null);
				}
			} else {
				resolve(null);
			}


		//Short URLs from Google Maps mobile apps
		//https://goo.gl/maps/r54jMZxh1TC2
		} else if(url.search("goo.gl/maps/") > 0) {
            console.log("IS SHORT URL");
			var that = this;
			request(url, function (error, response, body) {
				if (!error && response.statusCode == 200) {

                    var start = '<meta content="origin" name="referrer">   <meta content=\''
                    var end = "' itemprop="
                    var find = body.indexOf(start);
                    var first = body.substring(find+start.length,body.length)

					var findEnd = first.indexOf(end);
					var result = first.substring(0,findEnd);

                    result = result.replace(/&#39;/g,"\'");

                    var parsedCoords = ParseDMS(result);
                    var coords = parsedCoords.lat + ", " + parsedCoords.lng;
                    console.log(ParseDMS(result));
                    console.log(coords);

					if(that.isValidCoords(coords)) {
						resolve(coords);
					} else {
						resolve(null);
					}
				} else {
					console.warn(error);
					resolve(null);
				}
			});

			//Pin links from Apple Maps app
		} else if(url.search("maps.apple.com") > 0 && url.search("&ll=") > 0) {
			let place = url.indexOf("&ll=");
			var ll = url.substring(place + 4);
			var ll_str = ll.split("&")[0];
			if(this.isValidCoords(ll_str)) {
				resolve(ll_str);
			} else {
				resolve(null);
			}
		} else if(url.indexOf("ingress.com/intel?ll=") > 0 && url.indexOf("pll=") > 0) {
            //https://www.ingress.com/intel?ll=40.348194,-79.944592&z=13&pll=40.357043,-80.051771
            // let start = "ingress.com/intel?ll="
            let start = "pll="
            let place = url.indexOf(start);
            let reg = /.+?(?=&)/;
            var ll = url.substring(place + start.length,url.length);
            var parts = reg.exec(ll);
            if (parts && parts.length > 0) {
                console.log(parts[0]);
                if(this.isValidCoords(parts[0])) {
    				resolve(parts[0]);
                    return;
    			}
            } else if(ll.length > 0) {
                console.log(ll);
                if(this.isValidCoords(ll)) {
    				resolve(ll);
                    return;
    			}
            }
            resolve(null);
        } else {
            console.log("invalid url");
            resolve(null);
        }

	}

	async coordStringFromText(text) {
		var that = this;
		return new Promise(async function(resolve,reject) {
			if(that.isValidCoords(text)) {
				resolve(text);
			} else {
				that.getCoordStringFromURL(text,resolve,reject);
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
		var that = this;
		return new Promise(async function(resolve, reject) {

			if (url != null) {
				var lower = url.toLowerCase().substring(url.length - 4);
				console.log(lower);
				if (lower === ".kml" || lower === ".xml") {

					//request contents of said file
					var request = https.get(url, function(res) {
						var data = '';
						res.on('data', function(chunk) {
							data += chunk;
						});
						res.on('end', function() {

							//convert KML file from data -> string -> XML DOM Object
							var kml = new DOMParser().parseFromString(data.toString());

							//convert DOM object to JSON object
							var converted = tj.kml(kml);
							resolve(converted);
						});
					});
					request.on('error', function(e) {
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


	storeRegion(polydata, channel) {
		var that = this;
		return new Promise(async function(resolve, reject) {
			//make sure first and last points are equal (closed polygon)
			var first = polydata[0][1] + " " + polydata[0][0];
			var last = polydata[polydata.length - 1][1] + " " + polydata[polydata.length - 1][0];
			if (first != last) {
				return false;
			}

			var points = []
			var polystring = "POLYGON((";
			for (var i = 0; i < polydata.length; i++) {
				var coords = polydata[i];
				var lon = coords[0];
				var lat = coords[1];
				points[i] = {
					"x": lat,
					"y": lon
				};

				polystring += lat + " " + lon;
				if (i + 1 < polydata.length) {
					polystring += ",";
				}
			}

			polystring += "))"

			var delete_query = "DELETE FROM Region WHERE channel_id = " + channel + ";";
			var insert_query = "INSERT INTO Region (channel_id,bounds) VALUES(" + channel + ", PolygonFromText(@g));"

			dbhelper.query(delete_query).catch(error => reject(error)).then(result => {

				var sql = dbhelper.getConnection();
				sql.connect();
				sql.query("SET @g='" + polystring + "';");
				sql.query(insert_query, function(err, result) {
					sql.end();
					if (err) {
						console.log('Error inserting region');
						reject(error);
					} else {
						console.log('Added region for ' + channel);
						resolve(true);
					}
				});
			});
		});
	}

	async getAllBoundedChannels() {
		return new Promise(async function(resolve,reject) {
			var channels = await dbhelper.query("SELECT DISTINCT channel_id FROM Region" ).catch(error => {
				reject(false)
				return;
			});

			resolve(channels);
		});
	}

	channelNameForFeature(feature) {
		const name = feature.properties.name
		return name.toLowerCase().split(" ").join("-").replace(/[^0-9\w\-]/g, '')
	}

	createNewRegion(feature,msg) {
		var that = this;
		return new Promise(function(resolve,reject) {
			//data["features"][0]["geometry"]["coordinates"][0];
			const polydata = feature.geometry.coordinates[0]
			const name = feature.properties.name
			const channel_name = that.channelNameForFeature(feature)

			msg.channel.guild.channels.create(name, {
				type: "category"
			},"For a region")
			.then(new_category => {
				msg.channel.guild.channels.create(channel_name, {
					type: "text",
					parent: new_category,
					overwrites: new_category.permissionOverwrites
				},"For a region")
				.then(new_channel => {
					console.log("created new channel for " + name + " with id " + new_channel.id + " under category with id " + new_category.id)
					that.storeRegion(polydata,new_channel.id).catch(error => reject("An error occurred storing the region for " + name)).then(result => {
						resolve(new_channel.id)
					})
				}).catch(error => reject(error))
			}).catch(error => reject(error))
		})
	}

	async addGym(args) {
		var that = this;
		return new Promise(async function(resolve,reject) {

			that.coordStringFromText(args.location).then(async function(coords) {
				let point = that.pointFromCoordString(coords);
				var insert_query = "INSERT INTO Gym (lat,lon,name) VALUES(" + point.x + "," + point.y + ",\"" + args.name + "\")";
				var meta_query = "INSERT INTO GymMeta (gym_id";
				var values = "";

				console.log("Adding gym...");
				console.log(point);
				console.log(args.name);

                var gym = {
					"name" : args.name,
					"point" : coords
				}

				if(args.nickname.toLowerCase() != "skip" && args.nickname.toLowerCase() != "n") {
					console.log(args.nickname);
					meta_query += ",nickname";
					values += ",\"" + args.nickname + "\"";
                    gym.nickname = args.nickname;
				}

				if(args.description.toLowerCase() != "skip" && args.description.toLowerCase() != "n") {
					console.log(args.description);
					meta_query += ",description";
					values += ",\"" + args.description + "\"";
                    gym.description = args.description;
				}

				// console.log(insert_query);
				var results = await dbhelper.query(insert_query).catch(error => {
					reject(error);
					return;
				})

				var id = results.insertId
                gym.id = id
                gym.lat = point.x
                gym.lon = point.y

				meta_query += ") VALUES(" + id + values + ")";
				await dbhelper.query(meta_query).catch(error => {
					reject(error);
					return;
				}).then( async function() {

                    //Get Geocode Data
                    Meta.geocodeGym(gym).then(gym => {
                        //Recalculate all nearest gyms
                        Meta.calculateNearestGyms().then(affected => {

                            //Sort ids that need updated into single array
                            var gym_ids = []
                            affected["new"].filter(value => {
                                if(gym_ids.indexOf(value) == -1 && value != gym.id) {
                                    gym_ids.push(value)
                                }
                                return true
                            })

                            affected["changed"].filter(value => {
                                if(gym_ids.indexOf(value) == -1 && value != gym.id) {
                                    gym_ids.push(value)
                                }
                                return true
                            })
                            console.log(gym_ids)
                            console.log("Places need updated on (" + affected["new"].length + ") new gyms and (" + affected["changed"].length + ") existing gyms")

                            //Get places near newly added gym
                            //First grab nearest gym
                            const gym_query = "SELECT * FROM GymMeta WHERE gym_id = " + gym.id;
                            dbhelper.query(gym_query).catch(error => {
                                console.error(error)
                                console.log("Skipping places update and kicking off background job")
                                Meta.updatePlaces(gym_ids)
                                resolve(gym)
                            }).then(gymresult => {
                                console.log(JSON.stringify(gymresult,null,4))
                                if(gymresult && gymresult.length > 0 && gymresult[0].nearestGym) {
                                    gym.nearestGym = gymresult[0].nearestGym
                                    Meta.findPlacesNearGym(gym).then(final => {
                                        //Kick off all additional places updates in the background
                                        Meta.updatePlaces(gym_ids)

																				console.log("FINAL: " + final.lat + ", " + final.lon)
                                        resolve(final)
                                    }).catch(error => {
                                        console.error(error)
                        				console.error("Unable to get nearby places for gym #" + gym.id);
                                        resolve(gym)
                                    })
                                } else {
                                    console.log("Skipping places update and kicking off background job")
                                    Meta.updatePlaces(gym_ids)
                                    resolve(gym)
                                }
                            })

                        }).catch(error => {
                            console.error(error)
                            console.error("Unable to update nearest gyms");
                            resolve(gym)
                        })

        			}).catch(error => {
                        console.error(error)
        				console.error("Unable to geocode gym #" + gym.id);
                        resolve(gym)
        			})

                });
			}).catch(error => { reject(error); return; })

		});
	}


	async setGymLocation(gym,location) {
		var that = this;
		return new Promise(async function(resolve,reject) {

			that.coordStringFromText(location).then(async function(coords) {
				let point = that.pointFromCoordString(coords);

				var query = "UPDATE Gym SET lat='" + point.x + "', lon='" + point.y + "' WHERE id=" + gym + ";"
				await dbhelper.query(query).catch(error => {
					reject(error);
					return;
				}).then(async function(results) {

					var gym_info = await dbhelper.query("SELECT * FROM Gym LEFT JOIN GymMeta ON Gym.id = GymMeta.gym_id WHERE id=" + gym).catch(error => {
						reject(error)
						return;
					})

                    gym = gym_info[0];

                    //Get Geocode Data
                    Meta.geocodeGym(gym).then(gym => {
                        //Recalculate all nearest gyms
                        Meta.calculateNearestGyms().then(affected => {

                            //Sort ids that need updated into single array
                            var gym_ids = []
                            affected["new"].filter(value => {
                                if(gym_ids.indexOf(value) == -1 && value != gym.id) {
                                    gym_ids.push(value)
                                }
                                return true
                            })

                            affected["changed"].filter(value => {
                                if(gym_ids.indexOf(value) == -1 && value != gym.id) {
                                    gym_ids.push(value)
                                }
                                return true
                            })
                            console.log(gym_ids)
                            console.log("Places need updated on (" + affected["new"].length + ") new gyms and (" + affected["changed"].length + ") existing gyms")

                            //Get places near newly added gym
                            //First grab nearest gym
                            const gym_query = "SELECT * FROM GymMeta WHERE gym_id = " + gym.id;
                            dbhelper.query(gym_query).catch(error => {
                                console.error(error)
                                console.log("Skipping places update and kicking off background job")
                                Meta.updatePlaces(gym_ids)
                                resolve(gym)
                            }).then(gymresult => {
                                console.log(JSON.stringify(gymresult,null,4))
                                if(gymresult && gymresult.length > 0 && gymresult[0].nearestGym) {
                                    gym.nearestGym = gymresult[0].nearestGym
                                    Meta.findPlacesNearGym(gym).then(final => {
                                        //Kick off all additional places updates in the background
                                        Meta.updatePlaces(gym_ids)
                                        resolve(final)
                                    }).catch(error => {
                                        console.error(error)
                        				console.error("Unable to get nearby places for gym #" + gym.id);
                                        resolve(gym)
                                    })
                                } else {
                                    console.log("Skipping places update and kicking off background job")
                                    Meta.updatePlaces(gym_ids)
                                    resolve(gym)
                                }
                            })

                        }).catch(error => {
                            console.error(error)
                            console.error("Unable to update nearest gyms");
                            resolve(gym)
                        })

        			}).catch(error => {
                        console.error(error)
        				console.error("Unable to geocode gym #" + gym.id);
                        resolve(gym)
        			})


				});
			}).catch(error => { reject(error); return; });

		});
	}

	showGymDetail(msg, gym, heading, user) {
		var point = gym.point;
		if (!point) {
			point = gym.lat + ", " + gym.lon;
		}
		var url = "http://maps.google.com/maps/api/staticmap?size=500x300&format=png&center=" + point.replaceAll(" ", "") + "&markers=" + point.replaceAll(" ", "") + "&sensor=false&scale=2&key=" + private_settings.googleApiKey;
		var title = gym.name;
		if (gym.nickname && gym.nickname != "skip") {
			title += " (" + gym.nickname + ")";
		}

		var thumbnail = "https://vignette.wikia.nocookie.net/pokemongo/images/6/62/Pokemon-gym-final-red.png/revision/latest?cb=20160801180142";
		if (gym.image_url) {
			thumbnail = gym.image_url;
		}

		var embed = new Discord.MessageEmbed()
			.setAuthor(heading)
			.setTitle(title)
			.setURL(this.googlePinLinkForPoint(point))
			.setThumbnail(thumbnail)
			.setImage(url);

		if (gym.description && gym.description != "skip" && gym.description != "null") {
			embed.setDescription(gym.description);
		}

		if (gym.keywords) {
			embed.addField("Keywords", gym.keywords);
		}

		if (gym.ex_raid || gym.ex_tag) {
			var status = gym.ex_raid ? gym.ex_raid : "sponsored";
			if (status === "sponsored" || status === "park") {
				const type = (status === "sponsored") ? "sponsored" : "located in a park";
				embed.addField("EX Raid Eligible", "This gym is " + type + " and eligible as a potential EX Raid location");
			} else if (status === "previous") {
				embed.addField("EX Raid Eligible", "This gym has previously hosted an EX Raid.");
			}
		}

		if (gym.notice) {
			embed.addField("Notice :no_entry:", gym.notice);
		}

        if(gym.geodata) {
            //Add Geocode Information
						console.log(gym.geodata)

            var geoinfo = "";
            var geodata = JSON.parse(gym.geodata);

						console.log("PARSED: " + geodata)
            var addressComponents = geodata["addressComponents"];
            for (const [key, value] of Object.entries(addressComponents)) {
							console.log(key)
							console.log(value)
                geoinfo += "**" + key + "**: " + value + "\n";
            }

            embed.addField("Secret Sauce", geoinfo);

            var places = geodata["places"];
            if(places && places.length > 0) {
                embed.addBlankField(true);
                embed.addField("Nearby Places", places.join('\n'));
                embed.addBlankField(true);
            }
        }

		var footer = "Gym #" + gym.id;
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
		var region_raw = await this.getRegionsRaw(channel).catch(error => false);
		return new Promise(function(resolve, reject) {
			if (region_raw) {
				const gym_query = "SELECT * FROM Gym WHERE ST_CONTAINS(GeomFromText('" + region_raw + "'), POINT(lat, lon))";
				dbhelper.query(gym_query).then(result => resolve(result.length)).catch(error => reject(error))
			} else {
				console.log("error occurred???")
				reject("No region defined for this channel");
			}
		});
	}

	async getAllGyms(region) {
		return new Promise(async function(resolve, reject) {
			const gym_query = "SELECT * FROM Gym LEFT JOIN GymMeta ON Gym.id=GymMeta.gym_id";
			var results = await dbhelper.query(gym_query).catch(error => {
				console.log(error);
				return false
			});
			if (results && results.length > 0) {
				resolve(results);
			} else {
				resolve([])
			}
		});
	}

	async getGyms(region) {
		return new Promise(async function(resolve, reject) {
			if (region) {
				const gym_query = "SELECT * FROM Gym LEFT JOIN GymMeta ON Gym.id=GymMeta.gym_id WHERE ST_CONTAINS(GeomFromText('" + region + "'), POINT(lat, lon))";
				var results = await dbhelper.query(gym_query).catch(error => {
					console.log(error);
					return false
				});
				if (results && results.length > 0) {
					resolve(results);
				} else {
					// console.log(results)
					resolve([])
				}
			} else {

				console.log("no region")
				reject("No region defined");
			}
		});
	}

	async getGym(gym_id) {
		return new Promise(function(resolve, reject) {
			const gym_query = "SELECT * FROM Gym LEFT JOIN GymMeta ON Gym.id=GymMeta.gym_id WHERE id=" + gym_id;
			// console.log(gym_query)
			dbhelper.query(gym_query).catch(error => reject(error)).then(async function(results) {
				resolve(results[0]);
			});
		});
	}

	async deleteGym(gym_id) {
		return new Promise(function(resolve, reject) {
			const gym_query = "DELETE FROM Gym WHERE id=" + gym_id;
			console.log(gym_query)
			dbhelper.query(gym_query).catch(error => reject(error)).then(async function(results) {

                //Get Geocode Data
                //Recalculate all nearest gyms
                Meta.calculateNearestGyms().then(affected => {

                    //Sort ids that need updated into single array
                    var gym_ids = []
                    affected["new"].filter(value => {
                        if(gym_ids.indexOf(value) == -1) {
                            gym_ids.push(value)
                        }
                        return true
                    })

                    affected["changed"].filter(value => {
                        if(gym_ids.indexOf(value) == -1) {
                            gym_ids.push(value)
                        }
                        return true
                    })
                    console.log(gym_ids)
                    console.log("Places need updated on (" + affected["new"].length + ") new gyms and (" + affected["changed"].length + ") existing gyms")

                    //Kick off all additional places updates in the background
                    Meta.updatePlaces(gym_ids)
                    resolve(results.affectedRows == 1);

                }).catch(error => {
                    console.error(error)
                    console.error("Unable to update nearest gyms");
                    resolve(results.affectedRows == 1);
                })

			});
		});
	}

    async regionChannelForGym(gym) {
        return new Promise(async function(resolve, reject) {
            var query = "SELECT CAST(channel_id as CHAR(55)) as channel FROM Region WHERE ST_CONTAINS(bounds, Point(" + gym.lat + ", " + gym.lon + "))"
            var result = dbhelper.query(query).then(result => {
                if(result.length > 0 && result[0].channel) {
                    console.log(result)
                    resolve(result[0].channel)
                } else {
                    reject("No region found")
                }
            }).catch(error => reject(error))
        });
    }

  //This will compare location of gym to every channels region including its expanded range for outliers
	//All matching channels will be returned
	//Necessary for determining which channels need their searches reindexed
	async findAffectedChannels(gym_id) {

		let channels = await this.getAllBoundedChannels();
		var matching = []

		var that = this;
		return new Promise(async function(resolve, reject) {

			for(const channel of channels) {

				var region = await that.getRegionsRaw(channel["channel_id"]).catch(error => null)
				if(region != null) {
	      	let regionObject = region ? that.getCoordRegionFromText(region) : null;
					var expanded = region ? that.enlargePolygonFromRegion(regionObject) : null;
					var polygon = region ? that.polygonStringFromRegion(expanded) : null;

					//console.log(expanded)

					var gym_query = region ? "SELECT * FROM Gym LEFT JOIN GymMeta ON Gym.id=GymMeta.gym_id WHERE ST_CONTAINS(GeomFromText('" + polygon + "'), POINT(lat, lon)) AND Gym.id = " + gym_id : null;
					var results = await dbhelper.query(gym_query).catch(error => false);
					if(results.length > 0) {

						matching.push(channel["channel_id"]);
						console.log("channel: " + channel["channel_id"])
						console.log("has results")
						//console.log(results)
					}

				}
			}

			resolve(matching);
		});



	}

	async findGym(channel, term, name_only, allow_multiple) {
		var region_raw = channel ? await this.getRegionsRaw(channel).catch(error => false) : null;
        var error_message = channel ? "No gyms found in this region matching the term '" : "No gyms found matching the term '";

        //Test expanding polygon
        try {
            let regionObject = region_raw ? this.getCoordRegionFromText(region_raw) : null;
            var expanded = region_raw ? this.enlargePolygonFromRegion(regionObject) : null;
            var polygon = region_raw ? this.polygonStringFromRegion(expanded) : null;
            console.log(polygon)
            console.log(region_raw)

            var that = this;
    		return new Promise(function(resolve, reject) {
    			if (region_raw || channel == null) {

    				var gym_query = region_raw ? "SELECT * FROM Gym LEFT JOIN GymMeta ON Gym.id=GymMeta.gym_id WHERE ST_CONTAINS(GeomFromText('" + polygon + "'), POINT(lat, lon))" : "SELECT * FROM Gym LEFT JOIN GymMeta ON Gym.id=GymMeta.gym_id";
    				dbhelper.query(gym_query).then(async function(results) {
    					var idx = lunr(function() {
    						this.ref('id')
    						this.field('name')
    						if (!name_only) {
    						  this.field('nickname')
    						  this.field('description')
    						  this.field('keywords')
    						  this.field('notice')

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

                                // console.log(gym)

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


                                // Build a map of the geocoded information:
                                //   key is the address component's type
                                //   value is a set of that type's values across all address components
                                const addressInfo = new Map();
                                if (!gym.geodata) {
                                  console.error('Gym "' + gym.name + '" has no geocode information!');
                                } else {
                                  var geo = JSON.parse(gym.geodata);
                                  var addressComponents = geo["addressComponents"];
                                  var places = geo["places"];

                                  for (const [key, value] of Object.entries(addressComponents)) {
                                      gymDocument[key] = value;
                                  }


                                  // if(addressComponents) {
                                  //     addressComponents.forEach(addressComponent => {
                                  //       addressComponent.addressComponents.forEach(addComp => {
                                  //         addComp.types.forEach(type => {
                                  //           const typeKey = type.toLowerCase();
                                  //           let values = addressInfo.get(typeKey);
                                  //
                                  //           if (!values) {
                                  //             values = new Set();
                                  //             addressInfo.set(typeKey, values);
                                  //           }
                                  //           values.add(addComp.shortName);
                                  //         });
                                  //       });
                                  //     });
                                  // }

                                  if(places) {
                                      gymDocument["places"] = places.join(' ')
                                  }

                                }

                                // // Insert geocoded map info into map
                                // addressInfo.forEach((value, key) => {
                                //   gymDocument[key] = Array.from(value).join(' ');
                                // });

                                // console.log(gymDocument)
    							this.add(gymDocument)

    						}, this)
    					});

    					var searchResults = idx.search(term);
    					console.log("search results: " + JSON.stringify(searchResults));
    					if (searchResults.length > 0) {
    						if (allow_multiple) {
    							var gyms = []
    							for (var j = 0; j < results.length; j++) {
    								var gym = results[j]
    								for (var i = 0; i < searchResults.length; i++) {
    									var result = searchResults[i]
    									if (gym["id"] == result["ref"]) {
    										gyms.push(gym)
    									}
    								}
    							}

    							resolve(gyms)
    							return
    						} else {
    							const found = searchResults[0];
    							results.forEach(function(doc) {
    								// console.log("doc: " + doc["id"] + " result: " + found["ref"]);
    								if (doc["id"] == found["ref"]) {
    									resolve(doc);
    									return;
    								}
    							}, this)
    						}
    					}

    					reject(error_message + term + "'");
    				}).catch(error => {
                        console.log("GYM ERROR: " + error)
                        reject("An error occurred looking for gyms")
                    })
    			} else {
    				reject("No region defined in this channel");
    			}
    		});

        } catch(error) {
            console.error(error)
        }



	}

	keywordArrayFromString(string) {
		var fixed = string.toLowerCase(); //strip trailing space from comma
		var items = fixed.split(",");
		var clean = []
		items.forEach(item => {
			clean.push(item.replace(/^\s+|\s+$/g, ""));
		});

		return clean;
	}

	keywordStringFromArray(array) {
		return array.join(", ");
	}


	editGymKeywords(gym, action, keywords) {
		// console.log("adding keywords: " + keywords + " to gym: " + gym["id"]);
		var that = this;
		return new Promise(async function(resolve, reject) {
			var existing = (gym["keywords"] != null) ? that.keywordArrayFromString(gym["keywords"]) : [];
			var final;

			if (action === "add") {
				var additions = that.keywordArrayFromString(keywords);
				// console.log("existing: " + existing);
				// console.log("additions: " + additions);
				// console.log("combined: " + existing.concat(additions));
				final = that.keywordStringFromArray(uniq(existing.concat(additions)));
			} else {
				if (keywords.toLowerCase() === "all") {
					final = NULL;
				} else {
					var removes = that.keywordArrayFromString(keywords);
					// console.log("existing: " + existing);
					// console.log("removes: " + removes);
					removes.forEach(item => {
						if (arrayContains(item, existing)) {
							existing.splice(existing.indexOf(item), 1);
						}
					});
					// console.log("cleaned: " + existing);
					final = that.keywordStringFromArray(existing);
				}
			}

			// console.log("final: " + final);
			var query;
			if (final) {
				query = "UPDATE GymMeta SET keywords = '" + final + "' WHERE gym_id='" + gym["id"] + "'";
			} else {
				query = "UPDATE GymMeta SET keywords = NULL WHERE gym_id='" + gym["id"] + "'";
			}
			// console.log("query: " + query);

			var result = await dbhelper.query(query).catch(error => reject(error));
			var result = await dbhelper.query(query).catch(error => reject(error));
			gym["keywords"] = final;
			resolve(gym);

		});
	}


	async setEXStatus(gym, status) {
		// console.log("adding ex raid status: " + status + " to gym: " + gym["id"]);
		var that = this;
		return new Promise(async function(resolve, reject) {
			var query;
			if (status === "remove") {
				query = "UPDATE GymMeta SET ex_raid = NULL WHERE gym_id=" + gym["id"];
			} else {
				query = "UPDATE GymMeta SET ex_raid = '" + status + "' WHERE gym_id=" + gym["id"];
			}

            console.log(query)
			// console.log("query: " + query);
			var result = await dbhelper.query(query).catch(error => reject(error)).then(async function(results) {

				var gym_info = await dbhelper.query("SELECT * FROM Gym LEFT JOIN GymMeta ON Gym.id = GymMeta.gym_id WHERE id=" + gym["id"]).catch(error => {
					reject(error)
					return;
				})

				resolve(gym_info[0]);

			});
		});
	}


	async setGymDescription(gym, description) {
		// console.log("updating description: " + description + " for gym: " + gym["id"]);
		var that = this;
		return new Promise(async function(resolve, reject) {
			var query;
			if (description.toLowerCase() === "remove") {
				query = "UPDATE GymMeta SET description = NULL WHERE gym_id=" + gym["id"];
			} else {
				query = "UPDATE GymMeta SET description = '" + description + "' WHERE gym_id=" + gym["id"];
			}

			console.log(query)
			var result = await dbhelper.query(query).catch(error => reject(error)).then(async function(results) {

				var gym_info = await dbhelper.query("SELECT * FROM Gym LEFT JOIN GymMeta ON Gym.id = GymMeta.gym_id WHERE id=" + gym["id"]).catch(error => {
					reject(error)
					return;
				})

				resolve(gym_info[0]);

			});
		});
	}

	async setGymNickname(gym, nickname) {
		// console.log("updating nickname: " + nickname + " for gym: " + gym["id"]);
		var that = this;
		return new Promise(async function(resolve, reject) {
			var query = "UPDATE GymMeta SET nickname = '" + nickname + "' WHERE gym_id=" + gym["id"];
			if (nickname.toLowerCase() === "remove") {
				query = "UPDATE GymMeta SET nickname = NULL WHERE gym_id=" + gym["id"];
			}
			var result = await dbhelper.query(query).catch(error => reject(error)).then(async function(results) {

				var gym_info = await dbhelper.query("SELECT * FROM Gym LEFT JOIN GymMeta ON Gym.id = GymMeta.gym_id WHERE id=" + gym["id"]).catch(error => {
					reject(error)
					return;
				})

				resolve(gym_info[0]);

			});
		});
	}

	async setGymName(gym, name) {
		// console.log("updating name: " + name + " for gym: " + gym["id"]);
		var that = this;
		return new Promise(async function(resolve, reject) {
			var query = "UPDATE Gym SET name = '" + name + "' WHERE id=" + gym["id"];
			var result = await dbhelper.query(query).catch(error => reject(error)).then(async function(results) {

				var gym_info = await dbhelper.query("SELECT * FROM Gym LEFT JOIN GymMeta ON Gym.id = GymMeta.gym_id WHERE id=" + gym["id"]).catch(error => {
					reject(error)
					return;
				})

				resolve(gym_info[0]);

			});
		});
	}

	async setGymNotice(gym, notice) {
		// console.log("updating notice: " + notice + " for gym: " + gym["id"]);
		var that = this;
		return new Promise(async function(resolve, reject) {
			var query = "UPDATE GymMeta SET notice = '" + notice + "' WHERE gym_id=" + gym["id"];
			if (notice.toLowerCase() === "remove") {
				query = "UPDATE GymMeta SET notice = NULL WHERE gym_id=" + gym["id"];
			}
			var result = await dbhelper.query(query).catch(error => reject(error)).then(async function(results) {

				var gym_info = await dbhelper.query("SELECT * FROM Gym LEFT JOIN GymMeta ON Gym.id = GymMeta.gym_id WHERE id=" + gym["id"]).catch(error => {
					reject(error)
					return;
				})

				resolve(gym_info[0]);

			});
		});
	}

	//******
	//update
	//******

    findSimilarGymByLocation(gyms,coords) {
        const point = this.getPointFromText(coords);
        for(var i=0; i<gyms.length; i++) {
            var item = gyms[i];
            if(distance(item.lat, item.lon, point.x, point.y,"K") < 0.01) {
                return item;
            } else {
                // console.log("too far away: " + distance(item.lat, item.lon, point.x, point.y,"K"))
            }
        }

        return null;
    }

	findSimilarGym(raw, name, coords) {

		const point = this.getPointFromText(coords);
		for (var i = 0; i < raw.length; i++) {
			var item = raw[i];
			if (distance(item.lat, item.lon, point.x, point.y, "K") < 0.01) {
				var result = stringSimilarity.compareTwoStrings(name, item.name);
				if (result > 0.5) {
					return item;
				}
				console.log("name doesnt match close enough")
			} else {
				// console.log("too far away: " + distance(item.lat, item.lon, point.x, point.y, "K"))
			}
		}

		return null;
	}

}

module.exports = new RegionHelper();
