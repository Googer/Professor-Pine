import { describe, expect, it } from 'vitest';
import { OTHER_GUILD_ROW, WEST_CHANNEL } from '../../test/support/gyms.js';
import { keptRow } from '../../test/support/wayspot-cases.js';
import { wayspotsWith } from '../../test/support/wayspots.js';
import { LIBRARY, MODERATOR } from '../../test/support/meetup-safety-cases.js';
import { meetupSafetyWith, MOD_CHANNEL } from '../../test/support/meetup-safety-service.js';
import { buttonsOf, textOf } from '../../test/support/messages.js';
import { BOB, CAROL } from '../../test/support/parties.js';
import type { RulingSource } from '../domain/meetups/records.js';

const DAY = 24 * 3_600_000;
const SERVER = '412345678901234567';
const KEY = { kind: 'stop' as const, id: LIBRARY.id };
const mod = { id: MODERATOR, name: 'Mod' };

/** Meetup safety with the Little Free Library refused by a moderator from a request's post. */
async function refused() {
  const made = await meetupSafetyWith();
  const source: RulingSource = {
    kind: 'request',
    id: '00000000-0000-4000-8000-000000000001',
    channelId: MOD_CHANNEL,
    messageId: '600000000000000042',
  };
  const ruledAt = made.clock.now;
  await made.storage.rule(
    SERVER,
    KEY,
    'refuse',
    { ...mod, at: ruledAt },
    { place: LIBRARY, source },
  );
  const ask = (memberId = BOB, text = 'It is a public park now.') =>
    made.safety.askAboutPlace({
      serverId: SERVER,
      nearChannelId: WEST_CHANNEL,
      member: { id: memberId, name: memberId === BOB ? 'Bob' : 'Carol' },
      key: KEY,
      text,
    });
  const askPost = () => made.gateway.messagesIn(MOD_CHANNEL).at(-1);
  return { ...made, ruledAt, source, ask, askPost };
}

describe('MeetupSafety: an ask about a place ruled without it, in two servers (plan 19B-3)', () => {
  it('shows the server’s own copy of the PokéStop, and takes one only another server keeps as gone', async () => {
    const theirs = 'b1b2c3d4e5f60718293a4b5c6d7e8f90.16';
    const { wayspots } = await wayspotsWith(
      [
        {
          ...keptRow(1, { title: LIBRARY.title, lat: LIBRARY.lat, lon: LIBRARY.lon }),
          id: LIBRARY.id,
        },
      ],
      undefined,
      undefined,
      [
        {
          guildId: OTHER_GUILD_ROW,
          rows: [
            {
              ...keptRow(1, { title: 'Their Library', lat: LIBRARY.lat, lon: LIBRARY.lon }),
              id: LIBRARY.id,
            },
            { ...keptRow(2, { title: 'Their Bench', lat: 40.0602, lon: -80.0602 }), id: theirs },
          ],
        },
      ],
    );
    const made = await meetupSafetyWith({ wayspots });
    const by = { ...mod, at: made.clock.now };
    // Ruled before rulings kept their place (8S-1): the place is read as it is now.
    await made.storage.rule(SERVER, KEY, 'refuse', by);
    await made.storage.rule(SERVER, { kind: 'stop', id: theirs }, 'refuse', by);
    made.clock.now += 15 * DAY;
    const ask = (key: { kind: 'stop'; id: string }) =>
      made.safety.askAboutPlace({
        serverId: SERVER,
        nearChannelId: WEST_CHANNEL,
        member: { id: BOB, name: 'Bob' },
        key,
        text: 'It is a public park now.',
      });
    expect(await ask(KEY)).toMatchObject({ kind: 'sent' });
    const text = textOf(made.gateway.messagesIn(MOD_CHANNEL).at(-1)?.message);
    expect(text).toContain('Near **Little Free Library** (PokéStop)');
    expect(text).not.toContain('Their Library');
    expect(await ask({ kind: 'stop', id: theirs })).toEqual({ kind: 'not-sent' });
    // The second server keeps it (positive control).
    expect(wayspots.stored(OTHER_GUILD_ROW, theirs)?.title).toBe('Their Bench');
  });
});

describe('MeetupSafety: asks about a refused place', () => {
  it('lets members ask fourteen days after the refusal, not before', async () => {
    const made = await refused();
    expect(await made.safety.askState(SERVER, KEY, BOB)).toEqual({
      kind: 'wait',
      until: made.ruledAt + 14 * DAY,
    });
    expect(await made.ask()).toEqual({ kind: 'wait', until: made.ruledAt + 14 * DAY });
    made.clock.now = made.ruledAt + 14 * DAY;
    expect(await made.safety.askState(SERVER, KEY, BOB)).toMatchObject({ kind: 'may' });
    expect(await made.safety.askState(SERVER, { kind: 'stop', id: 'another.16' }, BOB)).toEqual({
      kind: 'not-refused',
    });
  });

  it('posts the ask with the place, its ruling and the member’s words, one at a time', async () => {
    const made = await refused();
    made.clock.now = made.ruledAt + 15 * DAY;
    expect(await made.ask()).toMatchObject({ kind: 'sent' });
    const post = made.askPost()?.message;
    const text = textOf(post);
    expect(text).toContain('### Ask to allow a refused place');
    expect(text).toContain(
      `**Bob** (<@${BOB}>) asks for meetups to be allowed at this place again.`,
    );
    expect(text).toContain('Near **Little Free Library** (PokéStop)');
    expect(text).toContain(
      `Refused by **Mod** (<@${MODERATOR}>) <t:${String(made.ruledAt / 1000)}:F>, from ` +
        `[a meetup request](<https://discord.com/channels/${SERVER}/${MOD_CHANNEL}/600000000000000042>)`,
    );
    expect(text).toContain('**Their words**\nIt is a public park now.');
    expect(buttonsOf(post).map((button) => button.label)).toEqual(['Allow place', 'Keep refused']);
    expect(await made.ask(CAROL)).toEqual({ kind: 'open' });
    expect(await made.safety.askState(SERVER, KEY, BOB)).toEqual({ kind: 'open' });
  });

  it('allows the place on Allow place, once, and tells the member by DM', async () => {
    const made = await refused();
    made.clock.now = made.ruledAt + 15 * DAY;
    const sent = await made.ask();
    if (sent.kind !== 'sent') throw new Error(sent.kind);
    const decided = await made.safety.decideAsk(sent.ask.id, 'allow', mod, SERVER, 'Pine Town');
    expect(decided).toMatchObject({ kind: 'done', ask: { status: 'allowed' } });
    expect(await made.storage.ruling(SERVER, KEY)).toBe('allow');
    expect(textOf(made.askPost()?.message)).toContain('**Allowed** by **Mod**');
    expect(buttonsOf(made.askPost()?.message)).toEqual([]);
    expect(textOf(made.dms.to(BOB)[0])).toContain(
      'A moderator allowed meetups at **Little Free Library** on **Pine Town**',
    );
    expect(
      await made.safety.decideAsk(sent.ask.id, 'keep', mod, SERVER, 'Pine Town'),
    ).toMatchObject({ kind: 'decided-before', ask: { status: 'allowed' } });
    expect(await made.safety.decideAsk(sent.ask.id, 'keep', mod, '412345678901234599')).toEqual({
      kind: 'gone',
    });
  });

  it('keeps the refusal on Keep refused: the fourteen days begin again', async () => {
    const made = await refused();
    made.clock.now = made.ruledAt + 15 * DAY;
    const sent = await made.ask();
    if (sent.kind !== 'sent') throw new Error(sent.kind);
    await made.safety.decideAsk(sent.ask.id, 'keep', mod, SERVER, 'Pine Town');
    expect(await made.storage.ruling(SERVER, KEY)).toBe('refuse');
    expect(await made.safety.askState(SERVER, KEY, BOB)).toEqual({
      kind: 'wait',
      until: made.clock.now + 14 * DAY,
    });
    expect(textOf(made.askPost()?.message)).toContain('**Kept refused** by **Mod**');
    expect(textOf(made.dms.to(BOB)[0])).toContain(
      'A moderator kept meetups refused at **Little Free Library** on **Pine Town**',
    );
  });

  it('keeps showing the ruling asked about once the ask is decided or its ruling undone', async () => {
    const asked = `Refused by **Mod** (<@${MODERATOR}>) <t:`;
    const fromRequest = `[a meetup request](<https://discord.com/channels/${SERVER}/${MOD_CHANNEL}/600000000000000042>)`;
    for (const end of ['allow', 'keep', 'undo'] as const) {
      const made = await refused();
      made.clock.now = made.ruledAt + 15 * DAY;
      const sent = await made.ask();
      if (sent.kind !== 'sent') throw new Error(sent.kind);
      if (end === 'undo') await made.safety.undoRuling(SERVER, KEY, mod);
      else await made.safety.decideAsk(sent.ask.id, end, mod, SERVER);
      const text = textOf(made.askPost()?.message);
      expect(text).toContain(
        `**Ruling**\n${asked}${String(made.ruledAt / 1000)}:F>, from ${fromRequest}`,
      );
      // Not the ruling that came of the decision: the outcome line says what was decided.
      expect(text).not.toContain('from [an ask]');
      expect(text).not.toContain('kept refused <t:');
    }
  });

  it('expires an ask nobody decided in seven days, and the member may ask again', async () => {
    const made = await refused();
    made.clock.now = made.ruledAt + 15 * DAY;
    await made.ask();
    made.clock.now += 7 * DAY;
    await made.safety.expire();
    expect(textOf(made.askPost()?.message)).toContain('**Expired**: no moderator decided in time.');
    expect(textOf(made.dms.to(BOB)[0])).toContain('You can ask again');
    expect(await made.safety.askState(SERVER, KEY, BOB)).toMatchObject({ kind: 'may' });
  });

  it('refuses a blocked member before it looks at the place', async () => {
    const made = await refused();
    made.clock.now = made.ruledAt + 15 * DAY;
    await made.storage.addBlock(SERVER, BOB, { ...mod, at: made.clock.now });
    expect(await made.safety.askState(SERVER, KEY, BOB)).toEqual({ kind: 'blocked' });
    expect(await made.ask()).toEqual({ kind: 'blocked' });
    expect(made.gateway.messagesIn(MOD_CHANNEL)).toEqual([]);
  });

  it('says nothing is kept refused where the ruling was undone meanwhile', async () => {
    const made = await refused();
    made.clock.now = made.ruledAt + 15 * DAY;
    const sent = await made.ask();
    if (sent.kind !== 'sent') throw new Error(sent.kind);
    await made.storage.rule(SERVER, KEY, 'allow', { ...mod, at: made.clock.now });
    expect(await made.safety.decideAsk(sent.ask.id, 'keep', mod, SERVER)).toEqual({
      kind: 'not-refused',
    });
    expect(made.dms.to(BOB)).toEqual([]);
  });

  it('lets one of two decisions of an ask win, and takes one of two asks at once', async () => {
    const made = await refused();
    made.clock.now = made.ruledAt + 15 * DAY;
    const both = await Promise.all([made.ask(BOB), made.ask(CAROL)]);
    expect(both.map((one) => one.kind).sort()).toEqual(['open', 'sent']);
    const sent = both.find((one) => one.kind === 'sent');
    if (sent?.kind !== 'sent') throw new Error('none sent');
    const decided = await Promise.all([
      made.safety.decideAsk(sent.ask.id, 'allow', mod, SERVER),
      made.safety.decideAsk(sent.ask.id, 'keep', mod, SERVER),
    ]);
    expect(decided.map((one) => one.kind).sort()).toEqual(['decided-before', 'done']);
    expect(made.dms.jobs).toHaveLength(1);
  });

  it('closes an ask that went astray when it is looked at, so that it may be asked again', async () => {
    const made = await refused();
    made.clock.now = made.ruledAt + 15 * DAY;
    await made.ask();
    made.clock.now += 8 * DAY;
    expect(await made.safety.askState(SERVER, KEY, CAROL)).toMatchObject({ kind: 'may' });
    expect([...made.storage.asks.values()].map((one) => one.status)).toEqual(['expired']);
  });

  it('keeps nothing when the moderators’ channel is not there', async () => {
    const made = await refused();
    made.clock.now = made.ruledAt + 15 * DAY;
    made.gateway.failing.set('sendMessage', new Error('Discord is away'));
    expect(await made.ask()).toEqual({ kind: 'not-sent' });
    made.gateway.failing.delete('sendMessage');
    expect(await made.safety.askState(SERVER, KEY, BOB)).toMatchObject({ kind: 'may' });
  });

  it('keeps where a ruling of a request came from', async () => {
    const made = await meetupSafetyWith();
    const request = await made.held();
    await made.safety.decide(request.id, 'refuse-forever', mod, SERVER);
    expect(await made.storage.rulingRecord(SERVER, KEY)).toMatchObject({
      ruling: 'refuse',
      ruledByName: 'Mod',
      place: LIBRARY,
      source: {
        kind: 'request',
        id: request.id,
        channelId: MOD_CHANNEL,
        messageId: request.messageId,
      },
    });
  });
});
