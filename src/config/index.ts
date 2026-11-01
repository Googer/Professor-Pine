import { loadEnv, type Env } from './env.js';
import { loadSettings, type Settings } from './settings.js';

export { ConfigError } from './errors.js';
export type { Env } from './env.js';
export type { Settings } from './settings.js';

export interface Config {
  settings: Settings;
  env: Env;
}

export function loadConfig(raw: Record<string, string | undefined>): Config {
  const env = loadEnv(raw);
  return { env, settings: loadSettings(env.SETTINGS_PATH) };
}
