import type { AppContext } from '../../src/app-context.js';
import type { Config } from '../../src/config/index.js';
import type { Settings } from '../../src/config/settings.js';

/** An operator of the instance the file names (`settings.operators`), who holds no role. */
export const OPERATOR_ID = '323456789012345678';

/**
 * The context's configuration with the instance's operators and servers of a test (plan 19B-1):
 * `operators` the file's operators (none unless given), `servers` a list or `"open"` (unset
 * unless given: an instance that is not open, as the test settings are).
 */
export function instanceConfig(
  ctx: Pick<AppContext, 'config'>,
  instance: { operators?: string[]; servers?: Settings['servers'] },
): Config {
  const settings: Settings = { ...ctx.config.settings };
  if (instance.operators !== undefined) settings.operators = instance.operators;
  if (instance.servers !== undefined) settings.servers = instance.servers;
  return { ...ctx.config, settings };
}
