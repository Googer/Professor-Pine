/** Invalid configuration. Startup aborts with this message. */
export class ConfigError extends Error {
  override name = 'ConfigError';
}
