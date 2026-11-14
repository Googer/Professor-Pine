import { Routes } from 'discord.js';
import { describe, expect, it } from 'vitest';
import { createTestLogger } from '../../test/support/test-logger.js';
import { botIsPublic } from './application-public.js';

/** A REST client that answers the application's read, or fails it. */
function restAnswering(answer: unknown) {
  const asked: string[] = [];
  return {
    asked,
    rest: {
      get: (route: string) => {
        asked.push(route);
        return answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer);
      },
    },
  };
}

describe('botIsPublic (plan 19C-1)', () => {
  it('reads Public Bot from the application', async () => {
    const { log } = createTestLogger();
    const on = restAnswering({ id: '1', bot_public: true });
    expect(await botIsPublic(on.rest, log)).toBe(true);
    expect(on.asked).toEqual([Routes.currentApplication()]);
    expect(await botIsPublic(restAnswering({ id: '1', bot_public: false }).rest, log)).toBe(false);
  });

  it('says it does not know where the read fails or says nothing, and logs it', async () => {
    const { log, entries } = createTestLogger();
    expect(
      await botIsPublic(restAnswering(new Error('Discord is away')).rest, log),
    ).toBeUndefined();
    expect(await botIsPublic(restAnswering({ id: '1' }).rest, log)).toBeUndefined();
    expect(entries.filter((entry) => entry.level === 40)).toHaveLength(2);
  });
});
