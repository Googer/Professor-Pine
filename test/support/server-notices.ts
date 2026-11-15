import { ServerNotices } from '../../src/services/server-notices.js';
import type { ServerSettingsLookup } from '../../src/services/server-settings.js';
import type { TestServers } from './server-values.js';
import { createTestLogger } from './test-logger.js';

/** A notice a server's staff were to be told (`ServerNotices.tell`). */
export interface TellNotice {
  server: string;
  key: string;
  text: string;
}

/**
 * The twin of `ServerNotices` for a service's test (plan 19B-1): records every notice asked for,
 * in order, each time it is asked (the once per server and key is `ServerNotices`' own, tested
 * there); `of(server)` gives a server's texts.
 */
export class RecordingNotices implements Pick<ServerNotices, 'tell'> {
  readonly told: TellNotice[] = [];

  tell(server: string, key: string, text: string): void {
    this.told.push({ server, key, text });
  }

  /** The texts a server was told, in order. */
  of(server: string): string[] {
    return this.told.filter((one) => one.server === server).map((one) => one.text);
  }
}

/**
 * A real `ServerNotices` over a test's servers, whose messages are recorded in `sent` (fix round
 * 2, G2): for a caller's test that a notice not said (the server had no lab yet) is said at the
 * caller's next occasion, once the staff set one (`setLab`). `flush()` waits for what is on its way.
 */
export function labNotices(servers: Pick<ServerSettingsLookup, 'of'>) {
  const sent: Array<{ channelId: string; text: string }> = [];
  const notices = new ServerNotices({
    servers,
    send: (channelId, text) => {
      sent.push({ channelId, text });
      return Promise.resolve();
    },
    log: createTestLogger().log,
  });
  return { notices, sent };
}

/** Gives a server of a test `lab` as its moderators' bot lab, or none (`undefined`). */
export function setLab(servers: TestServers, serverId: string, lab: string | undefined): void {
  const values = servers.of(serverId);
  const { 'mod-bot-lab': _lab, ...channels } = values.channels;
  servers.changed.set(serverId, {
    ...values,
    channels: lab === undefined ? channels : { ...channels, 'mod-bot-lab': lab },
  });
}
