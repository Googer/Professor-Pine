import { describe, expect, it } from 'vitest';
import { addressText } from './geodata.js';
import { addressLine } from './google.js';
import { wayfarerAddressParts, wayfarerGeodata, wayspotAddressLine } from './wayfarer-address.js';

describe("a Wayspot's address line", () => {
  it('is the address as a gym that Wayspot became would show it, without the repeated tail', () => {
    expect(
      wayspotAddressLine('59-69 Ingram Avenue, Pittsburgh, PA 15205, USA, Pittsburgh, 15205, US'),
    ).toBe('59-69 Ingram Avenue, Pittsburgh, PA 15205, USA');
    expect(wayspotAddressLine('1800 Morris Avenue, Irwin, US')).toBe(
      '1800 Morris Avenue, Irwin, US',
    );
    expect(wayspotAddressLine(null)).toBe('');
    expect(wayspotAddressLine('  ,  ')).toBe('');
  });
});

/** Addresses of the shapes Wayfarer gave in Pittsburgh's first scan (2026-10-15), invented. */
describe("a Wayspot's address as address parts", () => {
  it('reads an address followed by the town, postal code and country again', () => {
    expect(
      wayfarerAddressParts('59-69 Ingram Avenue, Pittsburgh, PA 15205, USA, Pittsburgh, 15205, US'),
    ).toEqual({
      country: 'US',
      administrative_area_level_1: 'PA',
      postal_code: '15205',
      street_number: '59-69',
      route: 'Ingram Avenue',
      locality: 'Pittsburgh',
      formatted_address: '59-69 Ingram Avenue, Pittsburgh, PA 15205, USA',
    });
  });

  it('keeps a name in front as the premise', () => {
    expect(
      wayfarerAddressParts(
        'Monroeville Community Park West, 2399 Tilbrook Rd, Monroeville, PA 15146, USA, Monroeville, 15146, US',
      ),
    ).toMatchObject({
      premise: 'Monroeville Community Park West',
      street_number: '2399',
      route: 'Tilbrook Rd',
      locality: 'Monroeville',
      postal_code: '15146',
    });
  });

  it('reads a street without a number, and a state without a postal code', () => {
    expect(wayfarerAddressParts('Chestnut St, Donora, PA, Donora, 15033, US')).toEqual({
      country: 'US',
      administrative_area_level_1: 'PA',
      route: 'Chestnut St',
      locality: 'Donora',
      postal_code: '15033',
      formatted_address: 'Chestnut St, Donora, PA',
    });
  });

  it('reads a short address, and the postal code of the tail when the address has none', () => {
    expect(wayfarerAddressParts('1800 Morris Avenue, Irwin, US')).toMatchObject({
      country: 'US',
      street_number: '1800',
      route: 'Morris Avenue',
      locality: 'Irwin',
      formatted_address: '1800 Morris Avenue, Irwin, US',
    });
    expect(wayfarerAddressParts('12 Main St, Mars, USA, Mars, 16046, US')).toMatchObject({
      locality: 'Mars',
      postal_code: '16046',
    });
  });

  it('reads a plus code in front of a town as the town, and leaves an address without a street to Google', () => {
    expect(
      wayfarerAddressParts('FPXM+8Q Carnot-Moon, PA, USA, Carnot-Moon, 15108, US'),
    ).toMatchObject({ locality: 'Carnot-Moon', postal_code: '15108' });
    expect(wayfarerGeodata('FPXM+8Q Carnot-Moon, PA, USA, Carnot-Moon, 15108, US')).toBeNull();
    expect(wayfarerGeodata('Venetia, PA 15367, USA, Venetia, US')).toBeNull();
  });

  it('has nothing for no address', () => {
    expect(wayfarerAddressParts('')).toEqual({});
    expect(wayfarerAddressParts(' , ')).toEqual({});
    expect(wayfarerGeodata('')).toBeNull();
  });

  it('is shown and searched as the parts Google gives are', () => {
    const geodata = wayfarerGeodata(
      '219 Constitution Ave, Renfrew, PA 16053, USA, Renfrew, 16053, US',
    );
    expect(addressLine(geodata)).toBe('219 Constitution Ave, Renfrew, PA 16053, USA');
    expect(addressText(geodata)).toBe('Constitution Ave Renfrew 16053');
  });
});
