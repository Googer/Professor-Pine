import { DiscordAPIError } from 'discord.js';
import { describe, expect, it } from 'vitest';
import { createTestLogger } from '../../test/support/test-logger.js';
import { discordInvites } from './server-invites.js';

const SERVER = '412345678901234502';

/** Discord's answer to a request, as discord.js rejects it. */
function apiError(code: number, status: number): DiscordAPIError {
  return new DiscordAPIError(
    { code, message: 'Unknown Invite' },
    code,
    status,
    'GET',
    'https://discord.com/api/v10/invites/x',
    {},
  );
}

describe('discordInvites (plan 19E)', () => {
  it('reads the server of an invite from Discord’s invite endpoint', async () => {
    const asked: string[] = [];
    const invites = discordInvites(
      () => ({
        get: (route) => {
          asked.push(route);
          return Promise.resolve({ code: 'pewter-gym', guild: { id: SERVER, name: 'Pewter' } });
        },
      }),
      createTestLogger().log,
    );
    expect(await invites.serverOfInvite('pewter-gym')).toBe(SERVER);
    expect(asked).toEqual(['/invites/pewter-gym']);
  });

  it('answers nothing for an invite Discord does not know, one of no server, or a failure', async () => {
    const { log, entries } = createTestLogger();
    const answers: (() => Promise<unknown>)[] = [
      () => Promise.reject(apiError(10006, 404)),
      () => Promise.resolve({ code: 'group-dm' }),
      () => Promise.reject(new Error('socket hang up')),
    ];
    for (const answer of answers) {
      const invites = discordInvites(() => ({ get: answer }), log);
      expect(await invites.serverOfInvite('x')).toBeUndefined();
    }
    // Only the failure is logged; before the login there is nobody to ask.
    expect(entries.map((entry) => entry.msg)).toEqual(['could not read the server of an invite']);
    expect(await discordInvites(() => undefined, log).serverOfInvite('x')).toBeUndefined();
  });
});
