import { pino, type DestinationStream, type Logger, type LoggerOptions } from 'pino';

export type { Logger } from 'pino';

const SECRET_KEYS = ['DISCORD_TOKEN', 'DB_PASSWORD', 'GITHUB_TOKEN', 'GOOGLE_API_KEY'] as const;
/**
 * Where an env object usually sits in a log entry: bare, as `env`, inside a config or context, or one level down.
 *
 * Path-based redaction is a safety net, not a guarantee. A secret nested deeper than these paths, or inside an
 * array or an Error, is not caught. Never log config, env or credential objects deliberately.
 */
const PREFIXES = ['', 'env.', 'config.env.', 'ctx.config.env.', '*.'] as const;
/** Keys under which the app copies secrets into other objects (`DbConfig.password`, `LoginDeps.token`). */
const COPIED_KEYS = ['password', 'token'] as const;

/**
 * A failed Discord request, logged as `{ err }`, carries the address (for interaction callbacks and
 * follow-ups it contains the interaction token) and the request body (whole image files). A
 * failed query (mysql2) carries its statement as `sql`, formatted with its values on the client
 * (a key of the Wayspot export tool, say). Pino's serializer writes a cause's message and stack,
 * not its fields; the cause's paths are covered all the same.
 */
const REQUEST_DETAIL_PATHS = ['url', 'requestBody', 'sql'].flatMap((key) => [
  `err.${key}`,
  `err.cause.${key}`,
]);

export const REDACT_PATHS: string[] = [
  ...PREFIXES.flatMap((prefix) => SECRET_KEYS.map((key) => `${prefix}${key}`)),
  ...['', '*.'].flatMap((prefix) => COPIED_KEYS.map((key) => `${prefix}${key}`)),
  ...REQUEST_DETAIL_PATHS,
];

/** `destination` is for tests; production logs to stdout. It is ignored when `pretty` is on. */
export function createLogger(
  options: { level: string; pretty: boolean },
  destination?: DestinationStream,
): Logger {
  const config: LoggerOptions = {
    level: options.level,
    redact: { paths: REDACT_PATHS, censor: '[redacted]' },
    ...(options.pretty ? { transport: { target: 'pino-pretty' } } : {}),
  };
  return destination && !options.pretty ? pino(config, destination) : pino(config);
}

/** The levels `LOG_LEVEL` may name. */
export const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;

/**
 * A logger from the environment as it is, for what runs before the config is read or without it
 * (the owner's alerts at a failed start, the watchdog): `LOG_LEVEL`, or `info` when it names no
 * level; pretty in development.
 */
export function loggerFromEnv(env: Record<string, string | undefined>): Logger {
  const levels: readonly string[] = LOG_LEVELS;
  const level = env.LOG_LEVEL && levels.includes(env.LOG_LEVEL) ? env.LOG_LEVEL : 'info';
  return createLogger({ level, pretty: env.NODE_ENV === 'development' });
}
