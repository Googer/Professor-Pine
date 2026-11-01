import type { ButtonInteraction } from 'discord.js';
import { describe, expect, it } from 'vitest';
import { fakeButton } from '../../test/support/fake-interactions.js';
import { teamOfRoles } from '../domain/party/party.js';
import { memberInfo } from './member-info.js';

const asButton = (fake: unknown) => fake as ButtonInteraction;

describe('teamOfRoles', () => {
  it('finds the team among the role names, however they are written', () => {
    expect(teamOfRoles(['Trainer', 'Mystic'])).toBe('mystic');
    expect(teamOfRoles([' VALOR '])).toBe('valor');
    expect(teamOfRoles(['instinct'])).toBe('instinct');
  });

  it('has no team for a member without such a role, or with a longer name', () => {
    expect(teamOfRoles([])).toBeUndefined();
    expect(teamOfRoles(['Team Mystic', 'moderator'])).toBeUndefined();
  });

  it('takes the first team in the fixed order when a member has several', () => {
    expect(teamOfRoles(['valor', 'instinct'])).toBe('instinct');
  });
});

describe('memberInfo', () => {
  it('reads the display name and the team from the interaction', () => {
    const click = fakeButton({ displayName: 'Alice', roleNames: ['Valor', 'Trainer'] });
    expect(memberInfo(asButton(click))).toEqual({ name: 'Alice', team: 'valor' });
  });

  it('has no team key for a member without a team', () => {
    const info = memberInfo(asButton(fakeButton({ displayName: 'Bob' })));
    expect(info).toEqual({ name: 'Bob' });
    expect(info).not.toHaveProperty('team');
  });

  it('says nothing outside a server', () => {
    expect(memberInfo(asButton(fakeButton({ isDm: true })))).toEqual({});
  });
});
