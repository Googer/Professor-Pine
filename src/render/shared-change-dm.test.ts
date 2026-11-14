import { describe, expect, it } from 'vitest';
import { textOf } from '../../test/support/messages.js';
import { TEXT_BUDGET } from './party-post.js';
import { SERVER_NAME_CHARS } from './server-admission.js';
import { adoptedServersDm, waitingServersDm } from './shared-change-dm.js';

/** Twenty servers, each named by `name`. */
const named = (name: string) =>
  Array.from({ length: 20 }, (_, n) => ({
    id: `6123456789012345${String(n).padStart(2, '0')}`,
    name,
  }));

describe('the owner’s DMs about a new install’s servers (plan 19C-1)', () => {
  for (const [what, dm] of [
    ['kept', adoptedServersDm],
    ['waiting for the owner', waitingServersDm],
  ] as const) {
    it(`names twenty servers ${what} within what Discord takes, however long their names`, () => {
      // A hundred characters each, every one of them escaped where shown.
      const servers = named('*_~`|'.repeat(20));
      const text = textOf(dm(servers));
      expect(text.length).toBeLessThanOrEqual(TEXT_BUDGET);
      for (const server of servers) expect(text).toContain(server.id);
    });

    it(`cuts each name of the servers ${what} to SERVER_NAME_CHARS before it is escaped`, () => {
      const long = 'Pittsburgh Raids '.repeat(6);
      const text = textOf(dm(named(long)));
      const cut = `${long.slice(0, SERVER_NAME_CHARS - 1)}…`;
      expect(text).toContain(`**${cut}** · 612345678901234500`);
      expect(text).not.toContain(long.slice(0, SERVER_NAME_CHARS));
    });
  }

  it('names a server without a name, or one of spaces, as a server', () => {
    const text = textOf(
      adoptedServersDm([
        { id: '612345678901234500', name: undefined },
        { id: '612345678901234501', name: '   ' },
      ]),
    );
    expect(text).toContain('**A server** · 612345678901234500');
    expect(text).toContain('**A server** · 612345678901234501');
  });
});
