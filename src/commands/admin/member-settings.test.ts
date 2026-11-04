import { describe, expect, it } from 'vitest';
import { bossCommandsWith, MEMBER, textsOf } from '../../../test/support/boss-commands.js';
import { FAKE_GUILD_ID } from '../../../test/support/fake-interactions.js';
import { MemoryGymTargets } from '../../../test/support/gym-targets.js';
import { MemoryHistoryOptIns } from '../../../test/support/history.js';
import { MemoryNewTrains } from '../../../test/support/new-trains.js';
import { MemoryUsers } from '../../../test/support/users.js';
import { MemoryWants } from '../../../test/support/wants.js';
import { PartyStatus, RaidPrivacy } from '../../domain/party/status.js';

const ASH = '300000000000000001';
const OTHER_GUILD = '412345678901234599';

const textOf = (interaction: Parameters<typeof textsOf>[0]) => textsOf(interaction).join('\n');

async function setup() {
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
  return bossCommandsWith({ context: { users, wants, gymTargets, newTrains, historyOptIns } });
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
      '- Pings for groups and times: **on** (quiet while all pings are off)',
      '- Pings for shouts: **on** (quiet while all pings are off)',
      '- Pings when a train moves: **on** (quiet while all pings are off)',
      '- DM when an egg gets its boss: **off**',
      '- DM for a new train in this server: **on**',
      "- Named in this server's history: **on**",
      '- Status when they report a raid or make a train: **Coming**',
      '- Raid reports and trains: **Anonymous**',
      '- Friend code: **1234 5678 9012**',
      '- In-game name: **Ash\\_K**',
      '- Pokebattler user id: **26516**',
      expect.stringMatching(
        /^- Wants in this server: \*\*7\*\* \(Bulbasaur, Charmander, Squirtle, Pikachu, Eevee, …and 2 more\)/,
      ),
      '- Gym targets in this server: **2** (Old Stone Fountain, gym #999 (gone))',
    ]);
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
