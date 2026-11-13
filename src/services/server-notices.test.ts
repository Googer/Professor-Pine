import { describe, expect, it } from 'vitest';
import { FakePartyGateway } from '../../test/support/fake-gateway.js';
import { heldCall } from '../../test/support/held-call.js';
import { TestServers, testServerValues } from '../../test/support/server-values.js';
import { createTestLogger } from '../../test/support/test-logger.js';
import { noticeSender, ServerNotices } from './server-notices.js';

const SERVER = '412345678901234567';
const OTHER = '412345678901234599';
const LAB = '700000000000000005';
const OTHER_LAB = '700000000000000006';

function noticesWith(send?: (channelId: string, text: string) => Promise<void>) {
  const servers = new TestServers(testServerValues({ channels: { 'mod-bot-lab': LAB } }));
  servers.changed.set(OTHER, testServerValues({ channels: { 'mod-bot-lab': OTHER_LAB } }));
  servers.changed.set('412345678901234500', testServerValues({ channels: {} }));
  const { log, entries } = createTestLogger();
  const sent: Array<{ channelId: string; text: string }> = [];
  const notices = new ServerNotices({
    servers,
    send:
      send ??
      ((channelId, text) => {
        sent.push({ channelId, text });
        return Promise.resolve();
      }),
    log,
  });
  return { notices, sent, entries, servers };
}

describe('ServerNotices (plan 19B-1)', () => {
  it('tells a server’s moderators’ bot lab, once per server and key while the bot runs', async () => {
    const { notices, sent } = noticesWith();
    notices.tell(SERVER, 'meetup-safety:gone', 'The moderators’ channel is gone.');
    notices.tell(SERVER, 'meetup-safety:gone', 'The moderators’ channel is gone.');
    notices.tell(SERVER, 'bot-updates:gone', 'The bot updates channel is gone.');
    notices.tell(OTHER, 'meetup-safety:gone', 'The moderators’ channel is gone.');
    await notices.flush();
    expect(sent).toEqual([
      { channelId: LAB, text: 'The moderators’ channel is gone.' },
      { channelId: LAB, text: 'The bot updates channel is gone.' },
      { channelId: OTHER_LAB, text: 'The moderators’ channel is gone.' },
    ]);
  });

  it('logs with the server what it cannot say, without a lab or where the lab refuses', async () => {
    const { notices, entries } = noticesWith((channelId) =>
      channelId === LAB ? Promise.reject(new Error('Missing Access')) : Promise.resolve(),
    );
    notices.tell('412345678901234500', 'bot-updates:gone', 'The bot updates channel is gone.');
    notices.tell(SERVER, 'bot-updates:gone', 'The bot updates channel is gone.');
    await notices.flush();
    expect(entries).toContainEqual(
      expect.objectContaining({
        level: 40,
        server: '412345678901234500',
        notice: 'bot-updates:gone',
        text: 'The bot updates channel is gone.',
        msg: 'a server has no moderators’ bot lab: a notice for its staff is only logged',
      }),
    );
    expect(entries).toContainEqual(
      expect.objectContaining({
        level: 40,
        server: SERVER,
        notice: 'bot-updates:gone',
        msg: 'could not tell a server’s staff in its moderators’ bot lab',
      }),
    );
    // Logged once: the next occasion asks the lab again, and says nothing more in the log.
    notices.tell(SERVER, 'bot-updates:gone', 'The bot updates channel is gone.');
    await notices.flush();
    expect(entries.filter((entry) => entry['server'] === SERVER)).toHaveLength(1);
  });

  it('marks a notice said only once it was sent: a refusal or a lab set later tells it again', async () => {
    let refusing = true;
    const sent: string[] = [];
    const { notices, servers } = noticesWith((channelId, text) => {
      if (refusing) return Promise.reject(new Error('Missing Access'));
      sent.push(`${channelId} ${text}`);
      return Promise.resolve();
    });
    notices.tell(SERVER, 'bot-updates:gone', 'The bot updates channel is gone.');
    await notices.flush();
    expect(sent).toEqual([]);
    refusing = false;
    notices.tell(SERVER, 'bot-updates:gone', 'The bot updates channel is gone.');
    // Once on its way, the same notice is not asked again.
    notices.tell(SERVER, 'bot-updates:gone', 'The bot updates channel is gone.');
    await notices.flush();
    notices.tell(SERVER, 'bot-updates:gone', 'The bot updates channel is gone.');
    await notices.flush();
    expect(sent).toEqual([`${LAB} The bot updates channel is gone.`]);
    // A server without a lab: told once its staff set one.
    const LATE = '412345678901234500';
    notices.tell(LATE, 'events-forum:gone', 'The events forum is gone.');
    await notices.flush();
    servers.changed.set(LATE, testServerValues({ channels: { 'mod-bot-lab': OTHER_LAB } }));
    notices.tell(LATE, 'events-forum:gone', 'The events forum is gone.');
    await notices.flush();
    expect(sent).toEqual([
      `${LAB} The bot updates channel is gone.`,
      `${OTHER_LAB} The events forum is gone.`,
    ]);
  });

  // Fix round 2, G1: the gateway answers a lab that is gone, or takes no messages, with no id.
  it('counts a send through the party gateway that sent nothing as refused: told again once the lab is back', async () => {
    const gateway = new FakePartyGateway();
    const { log, entries } = createTestLogger();
    const notices = new ServerNotices({
      servers: new TestServers(testServerValues({ channels: { 'mod-bot-lab': LAB } })),
      send: noticeSender(gateway),
      log,
    });
    gateway.gone.add(LAB);
    notices.tell(SERVER, 'events-forum:gone', 'The events forum is gone.');
    await notices.flush();
    notices.tell(SERVER, 'events-forum:gone', 'The events forum is gone.');
    await notices.flush();
    expect(gateway.messages).toEqual([]);
    expect(
      entries.filter(
        (entry) => entry.msg === 'could not tell a server’s staff in its moderators’ bot lab',
      ),
    ).toEqual([
      expect.objectContaining({ level: 40, server: SERVER, notice: 'events-forum:gone' }),
    ]);
    gateway.gone.delete(LAB);
    notices.tell(SERVER, 'events-forum:gone', 'The events forum is gone.');
    await notices.flush();
    expect(gateway.messagesIn(LAB).map((sent) => sent.message)).toEqual([
      { content: 'The events forum is gone.' },
    ]);
  });

  // Fix round 3, J3: a lab the bot may not send to (View Channel, Send Messages) is not asked.
  it('sends nothing into a lab the bot may not send to, and tells it once the bot may', async () => {
    const gateway = new FakePartyGateway();
    const { log, entries } = createTestLogger();
    const notices = new ServerNotices({
      servers: new TestServers(testServerValues({ channels: { 'mod-bot-lab': LAB } })),
      send: noticeSender(gateway),
      log,
    });
    gateway.noSharing.add(LAB);
    notices.tell(SERVER, 'events-forum:gone', 'The events forum is gone.');
    await notices.flush();
    notices.tell(SERVER, 'events-forum:gone', 'The events forum is gone.');
    await notices.flush();
    expect(gateway.calls.filter((call) => call.startsWith('sendMessage'))).toEqual([]);
    expect(
      entries.filter(
        (entry) => entry.msg === 'could not tell a server’s staff in its moderators’ bot lab',
      ),
    ).toEqual([
      expect.objectContaining({ level: 40, server: SERVER, notice: 'events-forum:gone' }),
    ]);
    gateway.noSharing.delete(LAB);
    notices.tell(SERVER, 'events-forum:gone', 'The events forum is gone.');
    await notices.flush();
    expect(gateway.messagesIn(LAB).map((sent) => sent.message)).toEqual([
      { content: 'The events forum is gone.' },
    ]);
  });

  it('returns at once and never throws: the message goes on the side', async () => {
    const sending = heldCall('the notice');
    const { notices } = noticesWith(() => {
      sending.arrive();
      return sending.released;
    });
    notices.tell(SERVER, 'events-forum:gone', 'The events forum is gone.');
    await sending.reached;
    let flushed = false;
    const flushing = notices.flush().then(() => {
      flushed = true;
    });
    expect(flushed).toBe(false);
    sending.release();
    await flushing;
    expect(flushed).toBe(true);
  });
});
