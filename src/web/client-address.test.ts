import { describe, expect, it } from 'vitest';
import { addressBucket, isNearbyPeer } from './client-address.js';

describe('addressBucket', () => {
  it('counts IPv4 by the address, also when it is written as IPv6', () => {
    expect(addressBucket('203.0.113.7')).toBe('203.0.113.7');
    expect(addressBucket('::ffff:203.0.113.7')).toBe('203.0.113.7');
  });

  it('counts IPv6 by its /64, which one home or one machine has whole', () => {
    expect(addressBucket('2001:db8:1:2:aaaa::1')).toBe('2001:db8:1:2::/64');
    expect(addressBucket('2001:db8:1:2:bbbb:cccc:dddd:eeee')).toBe('2001:db8:1:2::/64');
    expect(addressBucket('2001:DB8:1:2::9')).toBe('2001:db8:1:2::/64');
    expect(addressBucket('2001:db8:1:3::1')).toBe('2001:db8:1:3::/64');
    expect(addressBucket('2001:db8::1')).toBe('2001:db8:0:0::/64');
    expect(addressBucket('::1')).toBe('0:0:0:0::/64');
    expect(addressBucket('fe80::1%eth0')).toBe('fe80:0:0:0::/64');
    expect(addressBucket('64:ff9b:1:2::198.51.100.1')).toBe('64:ff9b:1:2::/64');
  });

  it('keeps what is no address as it is', () => {
    expect(addressBucket('')).toBe('');
    expect(addressBucket('not an address')).toBe('not an address');
  });
});

describe('isNearbyPeer', () => {
  it('trusts this machine and private networks, IPv4 and IPv6', () => {
    for (const address of [
      '127.0.0.1',
      '127.8.9.10',
      '10.0.0.5',
      '172.16.0.1',
      '172.31.255.254',
      '192.168.1.20',
      '169.254.10.10',
      '::1',
      'fc00::1',
      'fd12:3456::7',
      'fe80::1',
      '::ffff:127.0.0.1',
      '::ffff:192.168.0.3',
    ]) {
      expect(isNearbyPeer(address), address).toBe(true);
    }
  });

  it('trusts nobody on the internet, nor what is no address', () => {
    for (const address of [
      '8.8.8.8',
      '172.32.0.1',
      '172.15.255.255',
      '192.169.0.1',
      '203.0.113.7',
      '2001:db8::1',
      '::ffff:8.8.8.8',
      '',
      'localhost',
      'not an address',
    ]) {
      expect(isNearbyPeer(address), address).toBe(false);
    }
  });
});
