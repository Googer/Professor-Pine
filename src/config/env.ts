import { z } from 'zod';
import { LOG_LEVELS } from '../log.js';
import { ConfigError } from './errors.js';

const SNOWFLAKE = /^\d{17,20}$/;

/**
 * A database name the stack's scripts can use as it is: it goes into SQL text and bare onto the
 * command lines of `mysqldump` and the `mysql` client (`docker/backup.sh`, `./pine restore`),
 * where a leading hyphen would be an option. `docker/backup.sh` and `pine` hold the same rule.
 */
const SCHEMA_NAME = /^[A-Za-z0-9_](?:[A-Za-z0-9_-]*[A-Za-z0-9_])?$/;

const blankToUndefined = (value: unknown) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

/** An optional variable where a blank value means "unset". */
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess(blankToUndefined, schema.optional());

export const envSchema = z
  .object({
    DISCORD_TOKEN: z.string().min(1),
    DISCORD_APP_ID: z.string().regex(SNOWFLAKE, 'must be a Discord ID'),
    OWNER_ID: z.string().regex(SNOWFLAKE, 'must be a Discord ID'),
    DB_HOST: z.string().min(1),
    DB_PORT: z.preprocess(
      blankToUndefined,
      z.coerce.number().int().min(1).max(65535).default(3306),
    ),
    DB_USER: z.string().min(1),
    DB_PASSWORD: z.string().default(''),
    DB_SCHEMA: z
      .string()
      .regex(SCHEMA_NAME, 'must be letters, digits, _ and - (a hyphen neither first nor last)'),
    /**
     * The legacy bot's address of Pokémon icons. Nothing reads it any more (pictures come from
     * the raid boss feed and the game data); kept optional so that an `.env` with it still loads.
     */
    POKEMON_IMAGE_BASE: optional(z.url()),
    GOOGLE_API_KEY: optional(z.string()),
    /**
     * The client secret of the Discord application (OAuth2), for "Log in with Discord" on the
     * web pages (`settings.web`); without it the login links of `/maps` still work.
     */
    DISCORD_CLIENT_SECRET: optional(z.string()),
    /**
     * A Google Maps key for browsers, restricted by referrer to `settings.web.publicUrl` and to
     * the Map Tiles API: the page's Google tiles (`settings.web.tiles: 'google'`). Not
     * `GOOGLE_API_KEY`, which is the server's and never reaches a page.
     */
    GOOGLE_MAPS_BROWSER_KEY: optional(z.string()),
    GITHUB_TOKEN: optional(z.string()),
    GITHUB_REPO: optional(z.string().regex(/^[\w.-]+\/[\w.-]+$/, 'must look like owner/repo')),
    LOG_LEVEL: z.preprocess(blankToUndefined, z.enum(LOG_LEVELS).default('info')),
    NODE_ENV: z.preprocess(
      blankToUndefined,
      z.enum(['development', 'production', 'test']).default('production'),
    ),
    SETTINGS_PATH: z.preprocess(blankToUndefined, z.string().default('data/settings.json')),
    /**
     * The legacy bot's `parties` folder (the one holding `active/`), read by `/admin
     * cleanup-legacy` for the channels of the legacy active parties. In the stack it is mounted
     * read-only at `/legacy-parties` and this names that path.
     */
    LEGACY_PARTIES_DIR: optional(z.string()),
    /**
     * The member index of the legacy history (plan 8H-10): `history:import` writes it there, the
     * bot reads it (in the stack mounted read-only at `/legacy-index`) when a member asks for
     * their old-bot history. Blank: no index, and no fill-in is offered.
     */
    LEGACY_INDEX_DIR: optional(z.string()),
  })
  .superRefine((env, ctx) => {
    if (Boolean(env.GITHUB_TOKEN) !== Boolean(env.GITHUB_REPO)) {
      ctx.addIssue({
        code: 'custom',
        path: [env.GITHUB_TOKEN ? 'GITHUB_REPO' : 'GITHUB_TOKEN'],
        message: 'GITHUB_TOKEN and GITHUB_REPO must be set together',
      });
    }
  });

export type Env = z.output<typeof envSchema>;

export function loadEnv(raw: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    throw new ConfigError(`Invalid environment:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
