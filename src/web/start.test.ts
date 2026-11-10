import { createServer, type Server } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { webServerWith, type TestWeb } from '../../test/support/web.js';
import { startWebServer } from './start.js';

/** A port on 127.0.0.1 that something else holds. */
async function takenPort(): Promise<{ port: number; holder: Server }> {
  const holder = createServer();
  await new Promise<void>((resolve) => holder.listen(0, '127.0.0.1', resolve));
  const address = holder.address();
  if (address === null || typeof address === 'string') throw new Error('no port');
  return { port: address.port, holder };
}

describe('startWebServer', () => {
  let web: TestWeb | undefined;
  let holder: Server | undefined;
  afterEach(async () => {
    await web?.app.close();
    await new Promise((resolve) => (holder ? holder.close(resolve) : resolve(undefined)));
    web = undefined;
    holder = undefined;
  });

  it('listens where it is told and says so', async () => {
    web = webServerWith();
    const started = await startWebServer(web.app, { host: '127.0.0.1', port: 0 }, web.log);
    expect(started).toBe(true);
    expect(web.app.server.listening).toBe(true);
    const address = web.app.server.address();
    if (address === null || typeof address === 'string') throw new Error('not listening');
    expect(web.entries).toContainEqual(
      expect.objectContaining({
        level: 30,
        msg: 'web server listening',
        host: '127.0.0.1',
        port: address.port,
      }),
    );
  });

  it('logs a port it cannot take, and the bot runs on without it', async () => {
    let port: number;
    ({ port, holder } = await takenPort());
    web = webServerWith();
    const started = await startWebServer(web.app, { host: '127.0.0.1', port }, web.log);
    expect(started).toBe(false);
    const failed = web.entries.find((entry) => entry.msg === 'the web server could not start');
    expect(failed).toMatchObject({ level: 50, host: '127.0.0.1', port });
    expect((failed?.err as { code?: string }).code).toBe('EADDRINUSE');
  });
});
