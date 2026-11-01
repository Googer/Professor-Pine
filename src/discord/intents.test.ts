import { GatewayIntentBits } from 'discord.js';
import { describe, expect, it } from 'vitest';
import { fallbackCandidates, intentsFor, isDisallowedIntentsError } from './intents.js';

const NONE = { ocrPassive: false, autoAssignRole: false };

describe('intentsFor', () => {
  it('requests only non-privileged intents by default', () => {
    expect(intentsFor(NONE)).toEqual([
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.DirectMessages,
    ]);
  });

  it('adds Message Content for passive OCR and Server Members for auto-assign', () => {
    expect(intentsFor({ ocrPassive: true, autoAssignRole: false })).toContain(
      GatewayIntentBits.MessageContent,
    );
    expect(intentsFor({ ocrPassive: true, autoAssignRole: false })).not.toContain(
      GatewayIntentBits.GuildMembers,
    );
    expect(intentsFor({ ocrPassive: false, autoAssignRole: true })).toContain(
      GatewayIntentBits.GuildMembers,
    );
  });

  it('never requests presences or reactions', () => {
    const all = intentsFor({ ocrPassive: true, autoAssignRole: true });
    expect(all).not.toContain(GatewayIntentBits.GuildPresences);
    expect(all).not.toContain(GatewayIntentBits.GuildMessageReactions);
  });
});

describe('fallbackCandidates', () => {
  it('is just the requested set when nothing privileged is requested', () => {
    expect(fallbackCandidates(NONE)).toEqual([NONE]);
  });

  it('tries the full set, then each single flag, then none', () => {
    expect(fallbackCandidates({ ocrPassive: true, autoAssignRole: true })).toEqual([
      { ocrPassive: true, autoAssignRole: true },
      { ocrPassive: true, autoAssignRole: false },
      { ocrPassive: false, autoAssignRole: true },
      NONE,
    ]);
  });
});

describe('isDisallowedIntentsError', () => {
  it('recognises the gateway close code and discord.js messages', () => {
    expect(isDisallowedIntentsError(Object.assign(new Error('closed'), { code: 4014 }))).toBe(true);
    expect(isDisallowedIntentsError(new Error('Used disallowed intents'))).toBe(true);
    expect(
      isDisallowedIntentsError(
        new Error('Privileged intent provided is not enabled or whitelisted.'),
      ),
    ).toBe(true);
  });

  it('ignores other errors', () => {
    expect(isDisallowedIntentsError(new Error('An invalid token was provided.'))).toBe(false);
    expect(isDisallowedIntentsError('4014')).toBe(false);
  });
});
