import { describe, expect, it } from 'vitest';
import { FakeAlertRest } from '../../test/support/fake-rest.js';
import { createTestLogger } from '../../test/support/test-logger.js';
import { MemoryStamps, OwnerAlerts } from './owner-alerts.js';
import { TELL_LIMIT, tellOwner } from './tell-owner.js';

const OWNER = '223456789012345678';

function telling() {
  const rest = new FakeAlertRest();
  const { log } = createTestLogger();
  const alerts = new OwnerAlerts({ rest, ownerId: OWNER, log, stamps: new MemoryStamps() });
  const said: string[] = [];
  const warned: string[] = [];
  const out = { say: (line: string) => said.push(line), warn: (line: string) => warned.push(line) };
  return { rest, alerts, said, warned, out };
}

describe('tellOwner (./pine tell-owner)', () => {
  it('DMs the owner the words given, as one line of plain text that pings nobody', async () => {
    const { rest, alerts, said, out } = telling();

    const status = await tellOwner(
      ['The upload failed:', '**pine-backup-1.sql.gz**\nand <@123456789012345678>'],
      alerts,
      out,
    );

    expect(status).toBe(0);
    // A typed mention stays text (`plain` breaks it with a zero-width space).
    expect(rest.messages()).toEqual([
      'The upload failed: \\*\\*pine-backup-1.sql.gz\\*\\* and <\u200b@123456789012345678>',
    ]);
    expect(rest.requests[1]?.body).toMatchObject({ allowed_mentions: { parse: [] } });
    expect(said).toEqual(['The owner was told.']);
  });

  it('refuses an empty text, and sends nothing', async () => {
    for (const args of [[], [''], ['  ', '\n\t']]) {
      const { rest, alerts, warned, out } = telling();

      expect(await tellOwner(args, alerts, out)).toBe(2);
      expect(rest.requests).toEqual([]);
      expect(warned).toEqual(['There is nothing to tell. Usage: tell-owner <text>']);
    }
  });

  it('cuts a long text to its limit, saying so', async () => {
    const { rest, alerts, out } = telling();

    expect(await tellOwner(['x'.repeat(5_000)], alerts, out)).toBe(0);

    const [sent] = rest.messages();
    expect(sent).toHaveLength(TELL_LIMIT);
    expect(sent?.endsWith('x…')).toBe(true);
  });

  it('fails when Discord does not take the message', async () => {
    const { rest, alerts, warned, out } = telling();
    rest.failWith = new Error('getaddrinfo ENOTFOUND discord.com');

    expect(await tellOwner(['The upload failed.'], alerts, out)).toBe(1);
    expect(warned).toEqual(['The owner could not be told (the log above says why).']);
  });

  it('fails without the token or the owner, saying which settings it needs', async () => {
    const { warned, out } = telling();

    expect(await tellOwner(['The upload failed.'], undefined, out)).toBe(1);
    expect(warned).toEqual([
      'The owner cannot be told: DISCORD_TOKEN and OWNER_ID must be set (in .env).',
    ]);
  });
});
