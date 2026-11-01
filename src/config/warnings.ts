import type { Settings } from './settings.js';

/**
 * What is wrong with the web pages' `trustProxy`, if anything: off with a public address, which
 * behind a tunnel or proxy makes every visitor one address, so one rate limit for everybody. Not
 * refused: the bot may be reached with nothing in front of it.
 */
export function trustProxyWarning(
  web: Pick<NonNullable<Settings['web']>, 'publicUrl' | 'trustProxy'>,
): string | undefined {
  if (web.trustProxy) return undefined;
  if (['localhost', '127.0.0.1', '[::1]'].includes(new URL(web.publicUrl).hostname))
    return undefined;
  return (
    'settings.web.trustProxy is off with a public address: behind a tunnel or proxy every ' +
    'visitor then counts as one address, and the rate limits refuse them all together. Set it ' +
    'to true, unless nothing stands in front of the bot'
  );
}

/**
 * What the start says once about a configuration that works but is likely not what was meant.
 * `REGION_MAP_LINK`: the spec named an environment variable for the map of `/maps`, which plan 6A
 * made the setting `regionMapLink`; a variable left in `.env` is read by nothing, and without the
 * setting `/maps` is not offered. The value is never repeated. The screenshot reader: when every
 * screenshot that may wait (`ocr.queue`) took as long as it may (`ocr.timeoutSeconds`), the last
 * would start after more than twelve minutes, when its interaction can hardly still be answered
 * (Discord allows fifteen): it is then answered as too busy. The review folder: when as many
 * screenshots as `ocr.reviewPerDay` a day for `ocr.reviewDays` (about 2 MB each) would exceed
 * `ocr.keepMegabytes`. The web pages: without `DISCORD_CLIENT_SECRET` nobody can log in with
 * Discord (the login links of `/maps` still work), and Google's tiles without
 * `GOOGLE_MAPS_BROWSER_KEY` are Stadia Maps' (plan 8M-7), and `trustProxy` is `trustProxyWarning`'s;
 * in rehearsal mode they are not served at all.
 */
export function configWarnings(
  raw: Record<string, string | undefined>,
  settings: Pick<Settings, 'regionMapLink'> & {
    web?: Pick<NonNullable<Settings['web']>, 'tiles' | 'publicUrl' | 'trustProxy'>;
    rehearsal?: Settings['rehearsal'];
    ocr?: {
      enabled: boolean;
      queue: number;
      timeoutSeconds: number;
      reviewPerDay: number;
      reviewDays: number;
      keepMegabytes: number;
    };
  },
): string[] {
  const warnings: string[] = [];
  if ((raw.REGION_MAP_LINK ?? '').trim() !== '' && settings.regionMapLink === undefined) {
    warnings.push(
      settings.web
        ? 'REGION_MAP_LINK is set in the environment but nothing reads it: /maps gives the map ' +
            'of the web pages, and in a DM the setting regionMapLink, which is unset'
        : 'REGION_MAP_LINK is set in the environment but nothing reads it: the map of /maps is ' +
            'the setting regionMapLink, which is unset, so /maps is not offered',
    );
  }
  const { ocr } = settings;
  if (ocr?.enabled && (ocr.queue + 1) * ocr.timeoutSeconds > 12 * 60) {
    warnings.push(
      `(ocr.queue + 1) × ocr.timeoutSeconds is ${(ocr.queue + 1) * ocr.timeoutSeconds} seconds: ` +
        'the last screenshot in line may wait longer than its command can be answered (twelve ' +
        'minutes), and is then refused as busy. Lower ocr.queue or ocr.timeoutSeconds',
    );
  }
  // A screenshot is about 2 MB: the review folder alone may outgrow the space given to all.
  if (ocr?.enabled && ocr.reviewPerDay * ocr.reviewDays * 2 > ocr.keepMegabytes) {
    warnings.push(
      `ocr.reviewPerDay × ocr.reviewDays × 2 MB is ${ocr.reviewPerDay * ocr.reviewDays * 2} MB, ` +
        `more than ocr.keepMegabytes (${ocr.keepMegabytes}): a busy server would fill the space of ` +
        'the kept screenshots with review copies, the oldest of which then go before their time',
    );
  }
  const set = (name: string) => (raw[name] ?? '').trim() !== '';
  // The web pages and their tunnel stay off during a rehearsal (`servedSettings`): nothing more
  // of them is worth saying.
  if (settings.web && settings.rehearsal) {
    warnings.push(
      'settings.web is set in rehearsal mode: the web pages stay off until the rehearsal is ' +
        'over. Take web out of the rehearsal settings, and COMPOSE_PROFILES=tunnel out of its .env',
    );
    return warnings;
  }
  const proxy = settings.web && trustProxyWarning(settings.web);
  if (proxy) warnings.push(proxy);
  if (settings.web && !set('DISCORD_CLIENT_SECRET')) {
    warnings.push(
      'settings.web is set but DISCORD_CLIENT_SECRET is not: the web pages offer no "Log in ' +
        'with Discord"; members log in with the link /maps gives them',
    );
  }
  if (settings.web?.tiles === 'google' && !set('GOOGLE_MAPS_BROWSER_KEY')) {
    warnings.push(
      "settings.web.tiles is 'google' but GOOGLE_MAPS_BROWSER_KEY is not set: the map shows " +
        "Stadia Maps' tiles only",
    );
  }
  return warnings;
}
