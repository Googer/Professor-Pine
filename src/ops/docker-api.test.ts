import { randomBytes } from 'node:crypto';
import http from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Tally } from '../../test/support/tally.js';
import { SocketDockerApi } from './docker-api.js';

/** What the fake Engine was asked: method and path with its query. */
const asked: string[] = [];
/** The requests that reached the fake Engine. */
let arrived = new Tally('requests to the fake Engine');
let server: http.Server | undefined;

/** A socket path of this machine's kind: a named pipe on Windows, a file elsewhere. */
function socketPath(): string {
  const name = `pine-docker-${randomBytes(6).toString('hex')}`;
  return process.platform === 'win32'
    ? `\\\\.\\pipe\\${name}`
    : path.join(tmpdir(), `${name}.sock`);
}

const PINE = {
  Id: 'abc123',
  Name: '/pine-pine-1',
  RestartCount: 2,
  Config: {
    Labels: { 'com.docker.compose.project': 'pine', 'com.docker.compose.service': 'pine' },
  },
  State: {
    Status: 'running',
    Running: true,
    ExitCode: 0,
    Health: {
      Status: 'unhealthy',
      FailingStreak: 3,
      Log: [
        { ExitCode: 0, Output: 'healthy: connected to Discord for 2 hours\n' },
        { ExitCode: 1, Output: 'the last heartbeat is 2 minutes old\n' },
      ],
    },
  },
};

/** The Docker Engine's API on a local socket, as far as the watchdog uses it. */
async function fakeEngine(): Promise<string> {
  const where = socketPath();
  server = http.createServer((request, response) => {
    asked.push(`${request.method} ${request.url}`);
    arrived.add();
    const answer = (status: number, body?: unknown) => {
      response.writeHead(status, { 'content-type': 'application/json' });
      response.end(body === undefined ? undefined : JSON.stringify(body));
    };
    const url = new URL(request.url ?? '/', 'http://engine');
    if (request.method === 'GET' && url.pathname === '/containers/json') {
      return answer(200, [{ Id: 'abc123' }, { Id: 'def456' }]);
    }
    if (request.method === 'GET' && url.pathname === '/containers/abc123/json') {
      return answer(200, PINE);
    }
    if (request.method === 'GET' && url.pathname === '/containers/plain/json') {
      return answer(200, {
        ...PINE,
        Id: 'plain',
        State: { Status: 'exited', Running: false, ExitCode: 137 },
      });
    }
    if (request.method === 'POST' && url.pathname === '/containers/abc123/restart') {
      return answer(204);
    }
    // A restart answers once the container has stopped and started again: up to its grace.
    if (request.method === 'POST' && url.pathname === '/containers/slow/restart') {
      setTimeout(() => answer(204), 150_000);
      return;
    }
    if (request.method === 'GET' && url.pathname === '/containers/stuck/json') return;
    if (request.method === 'POST' && url.pathname === '/containers/broken/restart') {
      return answer(500, { message: 'Cannot restart container broken: permission denied' });
    }
    return answer(404, { message: `No such container: ${url.pathname.split('/')[2]}` });
  });
  await new Promise<void>((resolve) => server?.listen(where, resolve));
  return where;
}

afterEach(async () => {
  vi.useRealTimers();
  asked.length = 0;
  arrived = new Tally('requests to the fake Engine');
  server?.closeAllConnections();
  await new Promise((resolve) => server?.close(resolve));
  server = undefined;
});

describe('SocketDockerApi', () => {
  it('lists the containers, stopped ones too, that carry every label asked for', async () => {
    const docker = new SocketDockerApi(await fakeEngine());

    const ids = await docker.containerIds(['com.docker.compose.project=pine', 'a=b']);

    expect(ids).toEqual(['abc123', 'def456']);
    const filters = JSON.stringify({ label: ['com.docker.compose.project=pine', 'a=b'] });
    expect(asked).toEqual([`GET /containers/json?all=true&filters=${encodeURIComponent(filters)}`]);
  });

  it('reads a container: running, its health and the last output of its health check', async () => {
    const docker = new SocketDockerApi(await fakeEngine());

    expect(await docker.container('abc123')).toEqual({
      id: 'abc123',
      running: true,
      health: 'unhealthy',
      healthOutput: 'the last heartbeat is 2 minutes old\n',
      restartCount: 2,
      exitCode: 0,
      labels: { 'com.docker.compose.project': 'pine', 'com.docker.compose.service': 'pine' },
    });
  });

  it('reads a container without a health check, and none that is not there', async () => {
    const docker = new SocketDockerApi(await fakeEngine());

    expect(await docker.container('plain')).toMatchObject({
      running: false,
      health: 'none',
      exitCode: 137,
    });
    expect(await docker.container('gone')).toBeUndefined();
  });

  it("restarts a container, and fails with the Engine's own words", async () => {
    const docker = new SocketDockerApi(await fakeEngine());

    await docker.restart('abc123');
    await expect(docker.restart('broken')).rejects.toThrow(
      'Cannot restart container broken: permission denied',
    );
    expect(asked).toEqual([
      'POST /containers/abc123/restart?t=150',
      'POST /containers/broken/restart?t=150',
    ]);
  });

  it('waits for a restart as long as the bot may take to stop, and no longer for a question', async () => {
    const docker = new SocketDockerApi(await fakeEngine());
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

    const restarting = docker.restart('slow');
    await arrived.reached(1);
    await vi.advanceTimersByTimeAsync(150_000);
    await expect(restarting).resolves.toBeUndefined();

    const asking = docker.container('stuck');
    const failed = expect(asking).rejects.toThrow(
      'the Docker Engine did not answer GET /containers/stuck/json',
    );
    await arrived.reached(2);
    await vi.advanceTimersByTimeAsync(10_000);
    await failed;
  });
});
