import { describe } from 'vitest';
import { wayspotCases } from './wayspot-cases.js';
import { MemoryWayspots } from './wayspots.js';

describe('MemoryWayspots', () => {
  wayspotCases(
    () => Promise.resolve(new MemoryWayspots()),
    (storage, guildId, id, goneAt) => {
      (storage as MemoryWayspots).server(guildId).goneRows.set(id, {
        firstSeen: 1_000,
        lastSeen: goneAt,
        kind: null,
      });
      return Promise.resolve();
    },
  );
});
