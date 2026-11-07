import { describe, expect, it } from 'vitest';
import { TEST_ENV } from '../../test/support/test-env.js';
import { TEST_SETTINGS_PATH } from '../../test/support/test-settings.js';
import { loadEnv } from '../config/env.js';
import type { Config } from '../config/index.js';
import { loadSettings, type Settings } from '../config/settings.js';
import type { CommandHelp, CommandModule, HelpFacts } from '../discord/command.js';
import { commands, messageCommands } from './index.js';
import { REPORT_MESSAGE_NAME } from './parties/report-message.js';

/** The longest paragraph `/help` may show (plan 8F-1): one idea, at most three sentences. */
const PARAGRAPH = 320;

const settings = loadSettings(TEST_SETTINGS_PATH);
const env = loadEnv(TEST_ENV);
/** The test settings with screenshots read and not read. */
const configs: Config[] = [true, false].map((enabled) => ({
  env,
  settings: { ...settings, ocr: { ...settings.ocr, enabled } },
}));

/** Every form of a command an installation may offer: as listed, and for each configuration. */
function formsOf(command: CommandModule): CommandModule[] {
  return [command, ...configs.map((config) => command.forConfig?.(config) ?? command)];
}

/** What an installation may have besides its settings: none of it, and all of it. */
const FACTS: HelpFacts[] = [{}, { oldHistory: true }];

/** Every details text of a command and of each of its subcommands, by where it stands. */
function detailsOf(command: CommandModule, given: Settings, facts: HelpFacts): [string, string][] {
  const name = `/${command.data.name}`;
  const said = (details: CommandHelp['details']): string | undefined =>
    typeof details === 'function' ? details(given, facts) : details;
  const own = said(command.help.details);
  const subs = command.subcommands
    ? [...command.subcommands].map(([path, sub]) => [`${name} ${path}`, said(sub.help?.details)])
    : [];
  return [[name, own], ...subs].filter((pair): pair is [string, string] => pair[1] !== undefined);
}

/**
 * Every details text `/help` may show, by where it stands: the slash commands' in each form and
 * configuration, and the Apps menu's message commands' (review BR-4).
 */
function everyDetails(): [string, string][] {
  const all: [string, string][] = [];
  for (const command of commands) {
    for (const form of formsOf(command)) {
      for (const config of configs) {
        for (const facts of FACTS) all.push(...detailsOf(form, config.settings, facts));
      }
    }
  }
  for (const command of messageCommands) {
    for (const config of configs) {
      const details = command.help.details;
      const text = typeof details === 'function' ? details(config.settings) : details;
      if (text !== undefined) all.push([command.data.name, text]);
    }
  }
  return all;
}

describe('/help in paragraphs (plan 8F-1)', () => {
  it('breaks every command’s and subcommand’s details into paragraphs of at most 320 characters', () => {
    const tooLong: string[] = [];
    const texts = everyDetails();
    for (const [where, text] of texts) {
      for (const paragraph of text.split('\n\n')) {
        if (paragraph.length > PARAGRAPH) {
          tooLong.push(`${where} (${paragraph.length}): ${paragraph.slice(0, 60)}…`);
        }
      }
    }
    expect(texts.length).toBeGreaterThan(100);
    expect(texts.map(([where]) => where)).toContain(REPORT_MESSAGE_NAME);
    expect([...new Set(tooLong)]).toEqual([]);
  });

  it('keeps no paragraph empty, nor one that starts or ends in white space', () => {
    for (const [where, text] of everyDetails()) {
      for (const paragraph of text.split('\n\n')) {
        expect(paragraph.trim(), where).toBe(paragraph);
        expect(paragraph, where).not.toBe('');
      }
    }
  });
});
