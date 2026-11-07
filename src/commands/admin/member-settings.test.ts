import { describe, expect, it } from 'vitest';
import { bossCommandsWith, MEMBER, textsOf } from '../../../test/support/boss-commands.js';
import { FAKE_GUILD_ID } from '../../../test/support/fake-interactions.js';
import { MemoryGymTargets } from '../../../test/support/gym-targets.js';
import { MemoryHistoryOptIns } from '../../../test/support/history.js';
import { MemoryLegacyFillIns, MemoryLegacyIndex } from '../../../test/support/legacy-fill-ins.js';
import { MemoryNewTrains } from '../../../test/support/new-trains.js';
import { MemoryTargetWants } from '../../../test/support/target-wants.js';
import { MemoryUsers } from '../../../test/support/users.js';
import { MemoryWants } from '../../../test/support/wants.js';
import { PartyStatus, RaidPrivacy } from '../../domain/party/status.js';

const ASH = '300000000000000001';
const OTHER_GUILD = '412345678901234599';

const textOf = (interaction: Parameters<typeof textsOf>[0]) => textsOf(interaction).join('\n');

async function setup(
  legacy: { legacyIndex?: MemoryLegacyIndex; legacyFillIns?: MemoryLegacyFillIns } = {},
) {
  const users = new MemoryUsers(
    new Map([
      [
        ASH,
        {
          mentions: false,
          autoStatus: PartyStatus.Coming,
          raidPrivacy: RaidPrivacy.Anonymous,
          friendCode: '1234 5678 9012',
          nickname: 'Ash_K',
          pokebattlerId: 26516,
        },
      ],
    ]),
  );
  const wants = new MemoryWants();
  for (const dex of [1, 4, 7, 25, 133, 150, 151]) wants.add(ASH, FAKE_GUILD_ID, dex, 'both');
  wants.add(ASH, FAKE_GUILD_ID, -7, 'spawn');
  wants.add(ASH, OTHER_GUILD, 384, 'raid');
  const gymTargets = new MemoryGymTargets();
  await gymTargets.add(ASH, FAKE_GUILD_ID, 2);
  await gymTargets.add(ASH, FAKE_GUILD_ID, 999);
  const newTrains = new MemoryNewTrains();
  await newTrains.set(ASH, FAKE_GUILD_ID, true, Date.now());
  const historyOptIns = new MemoryHistoryOptIns();
  await historyOptIns.optIn(ASH, FAKE_GUILD_ID, Date.now());
  return bossCommandsWith({
    context: { users, wants, gymTargets, newTrains, historyOptIns, ...legacy },
  });
}

const ash = (more: object = {}) => ({
  resolved: { member: { id: ASH, bot: false, username: 'ash', globalName: 'Ash', ...more } },
  resolvedMembers: { member: { displayName: 'Ash of Pallet' } },
});

describe('/admin member-settings', () => {
  it('shows everything Pine keeps about the member in this server, for staff alone', async () => {
    const made = await setup();
    const used = await made.use(null, 'member-settings', {}, ash());
    expect(used.deferReply).not.toHaveBeenCalled();
    expect(used.reply).toHaveBeenCalledWith(
      expect.objectContaining({ allowedMentions: { parse: [] }, flags: 64 }),
    );
    const text = textOf(used);
    expect(text.split('\n')).toEqual([
      `Settings of **Ash of Pallet** (<@${ASH}>):`,
      '- Pings in posts: **off**',
      '- Pings for new groups and meeting times: **on** (quiet while pings in posts are off)',
      '- Pings for shouts: **on** (quiet while pings in posts are off)',
      '- Pings when a train moves: **on** (quiet while pings in posts are off)',
      '- DM when an egg gets its boss: **off**',
      '- DM for a new train in this server: **on**',
      '- History in this server: **on**',
      '- On this server’s boards: **off**',
      '- Status on reports and trains: **Coming**',
      '- Name on reports and trains: **Anonymous**',
      '- Friend code: **1234 5678 9012**',
      '- In-game name: **Ash\\_K**',
      '- Pokebattler user id: **26516**',
      expect.stringMatching(
        /^- Wants in this server: \*\*7\*\* \(Bulbasaur, Charmander, Eevee, Mew, Mewtwo, …and 2 more\)/,
      ),
      '- Gym targets in this server: **2** (Old Stone Fountain, gym #999 (gone))',
    ]);
  });

  it('says where the member’s old-bot history stands, in neutral words (plan 8H-10)', async () => {
    const legacyIndex = new MemoryLegacyIndex();
    const legacyFillIns = new MemoryLegacyFillIns();
    const made = await setup({ legacyIndex, legacyFillIns });
    // The member index has a file of theirs and the history is on: it can be added.
    legacyIndex.add(ASH, FAKE_GUILD_ID);
    const lines = textOf(await made.use(null, 'member-settings', {}, ash())).split('\n');
    expect(lines).toContain('- Old-bot history: **not added**');
    expect(lines.indexOf('- Old-bot history: **not added**')).toBe(
      lines.indexOf('- On this server’s boards: **off**') + 1,
    );
    legacyFillIns.ended(ASH, FAKE_GUILD_ID, {
      state: 'failed',
      failure: 'The member index has no file of theirs (it was rebuilt without them).',
    });
    expect(textOf(await made.use(null, 'member-settings', {}, ash()))).toContain(
      '- Old-bot history: **could not be added** (The member index has no file of theirs (it was rebuilt without them).)',
    );
  });

  it('says a failed fill-in without a file of theirs, and no waiting one without an index (B5)', async () => {
    const legacyFillIns = new MemoryLegacyFillIns();
    // An index without a file of the member: why it failed still shows.
    const indexed = await setup({ legacyIndex: new MemoryLegacyIndex(), legacyFillIns });
    legacyFillIns.ended(ASH, FAKE_GUILD_ID, {
      state: 'failed',
      failure: 'The member index has no file of theirs (it was rebuilt without them).',
    });
    expect(textOf(await indexed.use(null, 'member-settings', {}, ash()))).toContain(
      '- Old-bot history: **could not be added** (The member index has no file of theirs (it was rebuilt without them).)',
    );
    // No index on this installation any more: a waiting request is waited for by nobody.
    const unindexed = await setup({ legacyFillIns });
    legacyFillIns.ended(ASH, FAKE_GUILD_ID, { state: 'queued' });
    expect(textOf(await unindexed.use(null, 'member-settings', {}, ash()))).not.toMatch(
      /Old-bot history/u,
    );
  });

  it('names the wants as the member’s own `/wants` lists them, costumes and both tables', async () => {
    const wants = new MemoryWants();
    wants.add(ASH, FAKE_GUILD_ID, 25, 'spawn', { costumed: true });
    wants.add(ASH, FAKE_GUILD_ID, 147, 'raid');
    const targetWants = new MemoryTargetWants();
    await targetWants.change(ASH, FAKE_GUILD_ID, {
      add: [
        { kind: 'research-item', item: 'rare-candy' },
        { kind: 'rocket', who: 'giovanni' },
        { kind: 'dynamax', dex: 68 },
      ],
      remove: [],
    });
    const made = await bossCommandsWith({ context: { wants, targetWants } });
    const text = textOf(await made.use(null, 'member-settings', {}, ash()));
    // By species name as `/wants` (Machamp's Dynamax a box of its line), then Rocket, rewards.
    expect(text).toContain(
      '- Wants in this server: **5** (Dratini, Machamp, Costumed Pikachu, Team GO Rocket, Rare Candy)',
    );
  });

  it('counts rows it cannot read', async () => {
    const made = await setup();
    const text = textOf(await made.use(null, 'member-settings', {}, ash()));
    expect(text).toMatch(/Wants in this server: \*\*7\*\* \(.*\), and 1 row I cannot read/);
  });

  it('names the account by its own name when the member has no server nickname', async () => {
    const made = await setup();
    const text = textOf(
      await made.use(null, 'member-settings', {}, { ...ash(), resolvedMembers: { member: {} } }),
    );
    expect(text).toContain(`Settings of **Ash** (<@${ASH}>):`);
  });

  it('refuses an account that is not a member of this server, showing none of its settings', async () => {
    const made = await setup();
    const text = textOf(
      await made.use(null, 'member-settings', {}, { ...ash(), resolvedMembers: { member: null } }),
    );
    expect(text).toBe('**Ash** is not a member of this server.');
  });

  it('shows the defaults of a member who never set anything', async () => {
    const made = await setup();
    const text = textOf(
      await made.use(
        null,
        'member-settings',
        {},
        {
          resolved: {
            member: { id: '300000000000000002', bot: false, username: 'misty', globalName: null },
          },
          resolvedMembers: { member: {} },
        },
      ),
    );
    expect(text).toContain('Settings of **misty**');
    expect(text).toContain('- Wants in this server: **0**\n- Gym targets in this server: **0**');
    expect(text).not.toContain('Friend code');
  });

  it('refuses a bot and a member who is not staff', async () => {
    const made = await setup();
    expect(textOf(await made.use(null, 'member-settings', {}, ash({ bot: true })))).toBe(
      'Bots have no settings.',
    );
    expect(
      textOf(
        await made.use(null, 'member-settings', {}, { ...ash(), userId: MEMBER, roleNames: [] }),
      ),
    ).toBe('Only admins, moderators and bot developers can do that.');
  });
});
