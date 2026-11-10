import { describe, expect, it } from 'vitest';
import { startCheckpoint, StartStopped } from './start-stop.js';

describe('startCheckpoint', () => {
  it('lets the start go on until a stop is asked for, then ends it between two steps', async () => {
    let stopAsked = false;
    const done: string[] = [];
    const checkpoint = startCheckpoint(() => stopAsked);
    const steps = async () => {
      for (const step of ['migrations', 'game data', 'gyms']) {
        await Promise.resolve();
        done.push(step);
        // A stop asked for during the migrations lets them finish.
        if (step === 'migrations') stopAsked = true;
        checkpoint();
      }
    };

    await expect(steps()).rejects.toBeInstanceOf(StartStopped);
    expect(done).toEqual(['migrations']);
  });

  it('never stops a start nobody asked to stop', () => {
    expect(() => startCheckpoint(undefined)()).not.toThrow();
    expect(() => startCheckpoint(() => false)()).not.toThrow();
  });
});
