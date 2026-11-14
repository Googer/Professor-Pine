import { DiscordAPIError, RESTJSONErrorCodes, Routes, type Client } from 'discord.js';
import { describe, expect, it } from 'vitest';
import { DiscordServerExits } from './server-exits.js';

const SERVER = '412345678901234567';

function apiError(code: number, status: number): DiscordAPIError {
  return new DiscordAPIError({ code, message: 'no' }, code, status, 'DELETE', '/x', {});
}

/** `DiscordServerExits` over a client whose REST `delete` answers what `deleted` gives. */
function exitsWith(deleted: () => Promise<unknown>) {
  const asked: string[] = [];
  const client = {
    rest: {
      delete: (route: string) => {
        asked.push(route);
        return deleted();
      },
    },
  } as unknown as Client;
  const exits = new DiscordServerExits();
  exits.use(client);
  return { exits, asked };
}

describe('DiscordServerExits: leaving a server (plan 19C-1)', () => {
  it('leaves a server through REST', async () => {
    const { exits, asked } = exitsWith(() => Promise.resolve(undefined));
    expect(await exits.leave(SERVER)).toBe('left');
    expect(asked).toEqual([Routes.userGuild(SERVER)]);
  });

  it('takes Unknown Guild for a server Pine is not in any more', async () => {
    const { exits } = exitsWith(() =>
      Promise.reject(apiError(RESTJSONErrorCodes.UnknownGuild, 404)),
    );
    expect(await exits.leave(SERVER)).toBe('gone');
  });

  it('throws every other failure', async () => {
    const { exits } = exitsWith(() =>
      Promise.reject(apiError(RESTJSONErrorCodes.MissingAccess, 403)),
    );
    await expect(exits.leave(SERVER)).rejects.toBeInstanceOf(DiscordAPIError);
  });
});
