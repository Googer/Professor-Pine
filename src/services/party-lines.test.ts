import { describe, expect, it } from 'vitest';
import { FakePartyGateway } from '../../test/support/fake-gateway.js';
import { createTestLogger } from '../../test/support/test-logger.js';
import { PartyLines } from './party-lines.js';

const POST = '500000000000000001';
const OTHER = '500000000000000002';

function setup(active: (postId: string) => boolean = () => true) {
  const gateway = new FakePartyGateway();
  const { log, entries } = createTestLogger();
  // Long enough that nothing after the first line goes out before `flush`.
  const lines = new PartyLines({
    gateway,
    whileOpen: (postId, work) => (active(postId) ? work() : Promise.resolve()),
    log,
    delayMs: 3_600_000,
  });
  const said = (postId = POST) =>
    gateway.messagesIn(postId).map((message) => message.message.content);
  return { gateway, lines, entries, said };
}

describe('PartyLines', () => {
  it('says the first line at once and gathers what follows into one message', async () => {
    const { lines, said } = setup();
    lines.say(POST, 'one');
    lines.say(POST, 'two');
    lines.say(POST, 'three');
    await lines.flush();
    expect(said()).toEqual(['one', 'two\nthree']);
    expect(lines.pending).toBe(0);
  });

  it('keeps the lines of two posts apart', async () => {
    const { lines, said } = setup();
    lines.say(POST, 'here');
    lines.say(OTHER, 'there');
    await lines.flush();
    expect(said(POST)).toEqual(['here']);
    expect(said(OTHER)).toEqual(['there']);
  });

  it('says only the newest of several unsent lines with one key, in the place of the first', async () => {
    const { lines, said } = setup();
    lines.say(POST, 'first');
    lines.say(POST, 'a is coming', 'a');
    lines.say(POST, 'b is here', 'b');
    lines.say(POST, 'a is coming with 1 more', 'a');
    lines.say(POST, 'somebody named a group');
    lines.say(POST, 'a is coming with 2 more', 'a');
    await lines.flush();
    expect(said()).toEqual(['first', 'a is coming with 2 more\nb is here\nsomebody named a group']);
  });

  it('does not replace a line that was sent already', async () => {
    const { lines, said } = setup();
    lines.say(POST, 'a is coming', 'a');
    await lines.flush();
    lines.say(POST, 'a is here', 'a');
    await lines.flush();
    expect(said()).toEqual(['a is coming', 'a is here']);
  });

  it('pings nobody', async () => {
    const { gateway, lines } = setup();
    lines.say(POST, '<@200000000000000002> is coming.');
    await lines.flush();
    expect(gateway.messagesIn(POST)[0]?.message.mention).toBeUndefined();
  });

  it('splits what does not fit into one message, never above 2,000 characters', async () => {
    const { lines, said } = setup();
    lines.say(POST, 'first');
    for (let n = 0; n < 60; n++) lines.say(POST, `${String(n).padStart(2, '0')} ${'x'.repeat(57)}`);
    await lines.flush();
    const texts = said();
    expect(texts).toHaveLength(3);
    for (const text of texts) expect(text?.length).toBeLessThanOrEqual(2000);
    expect(texts.join('\n').split('\n')).toHaveLength(61);
  });

  it('drops the lines for a post whose party is no longer active', async () => {
    let active = true;
    const { lines, said } = setup(() => active);
    lines.say(POST, 'one');
    lines.say(POST, 'two');
    active = false;
    await lines.flush();
    expect(said()).toEqual(['one']);
    active = true;
    lines.say(POST, 'three');
    await lines.flush();
    expect(said()).toEqual(['one', 'three']);
  });

  it('logs a warning when a message cannot be sent, and goes on', async () => {
    const { gateway, lines, entries, said } = setup();
    gateway.failing.set('sendMessage', new Error('no'));
    lines.say(POST, 'lost');
    await lines.flush();
    expect(entries.some((e) => e.level === 40 && e.msg === 'could not post a party line')).toBe(
      true,
    );
    gateway.failing.clear();
    lines.say(POST, 'kept');
    await lines.flush();
    expect(said()).toEqual(['kept']);
  });
});
