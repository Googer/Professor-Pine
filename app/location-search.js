"use strict";

const lunr = require('lunr'),
  he = require('he');

class LocationSearch {
  constructor() {
    this.index = lunr(function () {
      // reference will be the entire gym object so we can grab whatever we need from it (GPS coordinates, name, etc.)
      this.ref('object');

      // static fields for gym name and description
      this.field('name');
      this.field('description');

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

      let gymDatabase = require('./gyms');
      gymDatabase.forEach(function (gym) {
        // Gym document is a map with its reference and fields to their values
        const gymDocument = Object.create(null);

        // reference
        gymDocument['object'] = he.decode(JSON.stringify(gym));

        // static fields
        gymDocument['name'] = he.decode(gym.gymName);
        gymDocument['description'] = he.decode(gym.gymInfo.gymDescription);

        // Build a map of the geocoded information:
        //   key is the address component's type
        //   value is a set of that type's values across all address components
        const addressInfo = new Map();
        gym.gymInfo.addressComponents.forEach(function (addressComponent) {
          addressComponent.addressComponents.forEach(function (addComp) {
            addComp.types.forEach(function (type) {
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

        // Insert geocoded map info into map
        addressInfo.forEach(function (value, key) {
          this[key] = Array.from(value).join(' ');
        }, gymDocument);
        // Actually add this gym to the Lunr db
        this.add(gymDocument);
      }, this);
    });
  }

  search(terms) {
    /* TODO: Make this smarter than just searching exactly what they entered
      (i.e., use an increasingly fuzzy match for longer terms 'foobarbaz~2',
      add locality:, etc., terms automatically according to what channel they launched it from */

    // Initially search for what they entered just in the gym's name and description fields
    const nameTerms = terms.map(term => 'name:' + term);
    const descriptionTerms = terms.map(term => 'description:' + term);

    let results = [];
    try {
      results = this.index.search(nameTerms.join(' ') + ' ' + descriptionTerms.join(' '));
    } catch (error) {
    }

    if (results.length === 0) {
      // OK, let's try that again across all fields
      results = this.index.search(terms.join(' '));
    }

    return results.map(result => JSON.parse(result.ref));
  }
}

module.exports = new LocationSearch();
