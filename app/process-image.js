"use strict";

const path = require('path');
const jimp = require("jimp");
const tesseract = require('tesseract.js');


class ImageProcess {
	constructor() {
	}

	process(channel, url) {
		// url = path.join(__dirname, '/../assets/images/processing/Screenshot_006.png');
		const dst1 = path.join(__dirname, '/../assets/images/processing/cropped.png');
		const dst2 = path.join(__dirname, '/../assets/images/processing/cropped2.png');
		const dst3 = path.join(__dirname, '/../assets/images/processing/cropped3.png');
		const dst4 = path.join(__dirname, '/../assets/images/processing/cropped4.png');

		jimp.read(url).then((image) => {
			if (!image) { return; }

			// resize to some standard size to help tesseract
			image.scaleToFit(1440, 2560, jimp.RESIZE_HERMITE);

			// some phones are really wierd? and need this check to push cropping around a bit
			const check_phone_color = jimp.intToRGBA(image.getPixelColor(0, 85));

			// location of cropping / preprocessing for different pieces of information
			let phone_time = { x: 0, y: 0, width: image.bitmap.width, height: image.bitmap.height / 25 };
			let gym_location = { x: image.bitmap.width / 5.1, y: image.bitmap.height / 26, width: image.bitmap.width - (image.bitmap.width / 2.55), height: image.bitmap.height / 13 };
			let pokemon_name = { x: 0, y: image.bitmap.height / 6.4, width: image.bitmap.width, height: image.bitmap.height / 5 };
			let time_remaining = { x: image.bitmap.width - (image.bitmap.width / 3.4), y: image.bitmap.height - (image.bitmap.height / 2.2), width: image.bitmap.width / 4, height: image.bitmap.height / 12 };

			// special case for some kind of odd vertical phone
			if (check_phone_color.r <= 20 && check_phone_color.g <= 20 && check_phone_color.b <= 20) {
				gym_location.y += 100;
			}

			return new Promise((resolve, reject) => {
				let promises = [];

				// PHONE TIME
				promises.push(new Promise((res, rej) => {
					image.clone()
						.crop(phone_time.x, phone_time.y, phone_time.width, phone_time.height)
						.scan(0, 0, phone_time.width, phone_time.height, this.blacken)
						.write(dst1, (err, image) => {
							if (err) { rej(err); }

							tesseract.create().recognize(dst1)
								// .progress(message => console.log(message))
								.catch(err => rej(err))
								.then(result => {
									const match = result.text.match(/[0-9]{1,2}\:[0-9]{1,2}/g);
									if (match && match.length) {
										res(match[0]);
									} else {
										res(`Phone time could not be determined. ${result.text}`);
									}
								});
						});
				}));

				// GYM NAME
				promises.push(new Promise((res, rej) => {
					image.clone()
						.crop(gym_location.x, gym_location.y, gym_location.width, gym_location.height)
						.brightness(-0.1)
						.scan(0, 0, gym_location.width, gym_location.height, this.blacken)
						.write(dst2, (err, image) => {
							if (err) { rej(err); }

							tesseract.create().recognize(dst2)
								// .progress(message => console.log(message))
								.catch(err => rej(err))
								.then(result => {
									res(result.text.replace(/[-!$%^&*()_+|~=`{}\[\]:";'<>?,.\/\n]/g, ' ').trim());
								});
						});
				}));

				// POKEMON NAME
				promises.push(new Promise((res, rej) => {
					image.clone()
						.crop(pokemon_name.x, pokemon_name.y, pokemon_name.width, pokemon_name.height)
						.blur(3)
						.brightness(-0.2)
						.scan(0, 0, pokemon_name.width, pokemon_name.height, this.blacken)
						.write(dst3, (err, image) => {
							if (err) { rej(err); }

							tesseract.create().recognize(dst3)
								// .progress(message => console.log(message))
								.catch(err => rej(err))
								.then(result => {
									res(result.text.replace(/(CP|cp)?\s?[0-9]*/g, '').replace(/[-!$%^&*()_+|~=`{}\[\]:"“;'<>?,.\/\n\s]/g, ''));
								});
						});
				}));

				// RAID TIME REMAINING
				promises.push(new Promise((res, rej) => {
					image.clone()
						.crop(time_remaining.x, time_remaining.y, time_remaining.width, time_remaining.height)
						.scan(0, 0, time_remaining.width, time_remaining.height, this.blacken)
						.write(dst4, (err, image) => {
							if (err) { rej(err); }

							tesseract.create().recognize(dst4)
								.catch(err => rej(err))
								.then(result => {
									const match = result.text.match(/[0-9]{1,2}\:[0-9]{1,2}\:[0-9]{1,2}/g);
									if (match && match.length) {
										res(match[0]);
									} else {
										res('Time remaining could not be determined');
									}
								});
						});
				}));


				Promise.all(promises).then(values => {
					resolve(values);
				}).catch(err => {
					reject(err);
				})
			})
		}).then(values => {
			console.log(values);
			channel.send(values.join('\n'));
		}).catch(err => console.log(err));
	}

	blacken(x, y, idx) {
		// x, y is the position of this pixel on the image
		// idx is the position start position of this rgba tuple in the bitmap Buffer
		// this is the image

		var red   = this.bitmap.data[ idx + 0 ];
		var green = this.bitmap.data[ idx + 1 ];
		var blue  = this.bitmap.data[ idx + 2 ];
		var alpha = this.bitmap.data[ idx + 3 ];

		// rgba values run from 0 - 255
		// e.g. this.bitmap.data[idx] = 0; // removes red from this pixel

		if ((red >= 190 && green >= 200 && blue >= 200) || (red <= 50 && green <= 50 && blue <= 50)) {
			// black & white pixels should be white
			if (red >= 190 && green >= 200 && blue >= 200) {
				this.bitmap.data[ idx + 0 ] = 255;
				this.bitmap.data[ idx + 1 ] = 255;
				this.bitmap.data[ idx + 2 ] = 255;
			} else {
				this.bitmap.data[ idx + 0 ] = 0;
				this.bitmap.data[ idx + 1 ] = 0;
				this.bitmap.data[ idx + 2 ] = 0;
			}
		} else {
			this.bitmap.data[ idx + 0 ] = 255;
			this.bitmap.data[ idx + 1 ] = 0;
			this.bitmap.data[ idx + 2 ] = 0;
		}
	}
}

module.exports = new ImageProcess();
