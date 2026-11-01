import { describe, expect, it } from 'vitest';
import { Throttles, waitText } from './throttle.js';

const RAID = { uses: 3, perSeconds: 900 };
const ALICE = '700000000000000001';
const BOB = '700000000000000002';
const T0 = 1_800_000_000_000;

describe('Throttles', () => {
  it('allows the configured number of uses, then says how long to wait', () => {
    const throttles = new Throttles();
    expect(throttles.use('raid', ALICE, RAID, T0)).toBeUndefined();
    expect(throttles.use('raid', ALICE, RAID, T0 + 1_000)).toBeUndefined();
    expect(throttles.use('raid', ALICE, RAID, T0 + 2_000)).toBeUndefined();
    expect(throttles.use('raid', ALICE, RAID, T0 + 3_000)).toBe(897);
    // A refused use does not extend the wait.
    expect(throttles.use('raid', ALICE, RAID, T0 + 899_001)).toBe(1);
  });

  it('opens a new window once the old one has closed', () => {
    const throttles = new Throttles();
    for (let i = 0; i < 3; i++) throttles.use('raid', ALICE, RAID, T0);
    expect(throttles.use('raid', ALICE, RAID, T0 + 899_999)).toBe(1);
    expect(throttles.use('raid', ALICE, RAID, T0 + 900_000)).toBeUndefined();
    expect(throttles.use('raid', ALICE, RAID, T0 + 900_001)).toBeUndefined();
  });

  it('counts each member and each command separately', () => {
    const throttles = new Throttles();
    const once = { uses: 1, perSeconds: 60 };
    expect(throttles.use('shout', ALICE, once, T0)).toBeUndefined();
    expect(throttles.use('shout', BOB, once, T0)).toBeUndefined();
    expect(throttles.use('request', ALICE, once, T0)).toBeUndefined();
    expect(throttles.use('gym create', ALICE, once, T0)).toBeUndefined();
    expect(throttles.use('shout', ALICE, once, T0)).toBe(60);
  });

  it('says how long a member would wait without counting a use', () => {
    const throttles = new Throttles();
    expect(throttles.wait('raid', ALICE, RAID, T0)).toBeUndefined();
    for (let i = 0; i < 3; i++) {
      expect(throttles.wait('raid', ALICE, RAID, T0)).toBeUndefined();
      throttles.use('raid', ALICE, RAID, T0);
    }
    expect(throttles.wait('raid', ALICE, RAID, T0 + 3_000)).toBe(897);
    expect(throttles.wait('raid', BOB, RAID, T0 + 3_000)).toBeUndefined();
    expect(throttles.wait('raid', ALICE, RAID, T0 + 900_000)).toBeUndefined();
    // Asking opened no window of its own.
    expect(throttles.size).toBe(1);
  });

  it('gives a use back, as many as the window allows at most, and only while it is open', () => {
    const throttles = new Throttles();
    for (let i = 0; i < 3; i++) throttles.use('raid', ALICE, RAID, T0);
    throttles.giveBack('raid', ALICE, RAID, T0 + 1_000, T0);
    expect(throttles.use('raid', ALICE, RAID, T0 + 2_000)).toBeUndefined();
    expect(throttles.use('raid', ALICE, RAID, T0 + 2_000)).toBe(898);
    // Three given back in all: a use that keeps failing is held to twice the limit.
    throttles.giveBack('raid', ALICE, RAID, T0 + 3_000, T0);
    throttles.giveBack('raid', ALICE, RAID, T0 + 3_000, T0);
    throttles.giveBack('raid', ALICE, RAID, T0 + 3_000, T0);
    expect(throttles.use('raid', ALICE, RAID, T0 + 4_000)).toBeUndefined();
    expect(throttles.use('raid', ALICE, RAID, T0 + 4_000)).toBeUndefined();
    expect(throttles.use('raid', ALICE, RAID, T0 + 4_000)).toBe(896);
    // Nothing to give back to another member, nor to a window that has closed.
    throttles.giveBack('raid', BOB, RAID, T0, T0);
    expect(throttles.size).toBe(1);
    throttles.giveBack('raid', ALICE, RAID, T0 + 900_000, T0);
    for (let i = 0; i < 3; i++) throttles.use('raid', ALICE, RAID, T0 + 900_000);
    expect(throttles.use('raid', ALICE, RAID, T0 + 900_000)).toBe(900);
  });

  it('gives back nothing to a window opened after the use was counted', () => {
    const throttles = new Throttles();
    throttles.use('raid', ALICE, RAID, T0);
    // The use of T0 failed only once its window had closed and a new one was full.
    for (let i = 0; i < 3; i++) throttles.use('raid', ALICE, RAID, T0 + 900_000);
    throttles.giveBack('raid', ALICE, RAID, T0 + 900_500, T0);
    expect(throttles.use('raid', ALICE, RAID, T0 + 901_000)).toBe(899);
    // A use counted in the new window is given back there.
    throttles.giveBack('raid', ALICE, RAID, T0 + 901_000, T0 + 900_000);
    expect(throttles.use('raid', ALICE, RAID, T0 + 901_000)).toBeUndefined();
  });

  it('forgets closed windows when it holds many', () => {
    const throttles = new Throttles();
    const once = { uses: 1, perSeconds: 60 };
    for (let i = 0; i < 5_000; i++) throttles.use('shout', String(i), once, T0);
    expect(throttles.size).toBe(5_000);
    throttles.use('shout', ALICE, once, T0 + 60_000);
    expect(throttles.size).toBe(1);
  });
});

describe('waitText', () => {
  it('speaks in seconds under a minute and in whole minutes above, rounded up', () => {
    expect(waitText(1)).toBe('1 second');
    expect(waitText(45)).toBe('45 seconds');
    expect(waitText(60)).toBe('1 minute');
    expect(waitText(61)).toBe('2 minutes');
    expect(waitText(897)).toBe('15 minutes');
  });
});
