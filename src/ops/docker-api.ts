import http from 'node:http';

/** What the watchdog needs to know of a container. */
export interface ContainerState {
  id: string;
  running: boolean;
  /** Its health check's verdict; `none` for a container without one. */
  health: 'starting' | 'healthy' | 'unhealthy' | 'none';
  /** What the last run of its health check printed. */
  healthOutput?: string;
  /** How often Docker restarted it by its restart policy (after it exited). */
  restartCount: number;
  /** How its process ended the last time. */
  exitCode: number;
  labels: Record<string, string>;
}

/** The Docker Engine, as far as the watchdog asks it. */
export interface DockerApi {
  /** The containers, stopped ones too, that carry every label (`key=value`). */
  containerIds(labels: readonly string[]): Promise<string[]>;
  /** A container by id or name; nothing when there is none. */
  container(id: string): Promise<ContainerState | undefined>;
  /** Restarts a container (stopped with its own stop timeout, then started). */
  restart(id: string): Promise<void>;
}

const HEALTH = new Set(['starting', 'healthy', 'unhealthy']);

/** The parts of the Engine's answer to `GET /containers/{id}/json` that are read. */
interface EngineContainer {
  Id: string;
  RestartCount?: number;
  Config?: { Labels?: Record<string, string> | null };
  State?: {
    Running?: boolean;
    ExitCode?: number;
    Health?: { Status?: string; Log?: Array<{ Output?: string }> | null };
  };
}

/**
 * The Docker Engine's API over its socket (`/var/run/docker.sock`, mounted into the watchdog),
 * with Node's own `http`: no client library. Answers that are not 2xx reject with the Engine's
 * message, except a container that is not there, which is `undefined`.
 */
export class SocketDockerApi implements DockerApi {
  constructor(
    private readonly socketPath: string,
    private readonly options: {
      /** How long a question may take. Ten seconds. */
      timeoutMs?: number;
      /**
       * How long Docker gives the container to stop at a restart (`?t=`): the bot's
       * `stop_grace_period` of compose.yaml, 150 seconds.
       */
      stopSeconds?: number;
    } = {},
  ) {}

  async containerIds(labels: readonly string[]): Promise<string[]> {
    const filters = encodeURIComponent(JSON.stringify({ label: labels }));
    const answer = await this.request('GET', `/containers/json?all=true&filters=${filters}`);
    return (answer.body as Array<{ Id: string }>).map((container) => container.Id);
  }

  async container(id: string): Promise<ContainerState | undefined> {
    const answer = await this.request('GET', `/containers/${encodeURIComponent(id)}/json`, [404]);
    if (answer.status === 404) return undefined;
    const container = answer.body as EngineContainer;
    const health = container.State?.Health;
    const status = health?.Status ?? 'none';
    const last = health?.Log?.at(-1)?.Output;
    return {
      id: container.Id,
      running: container.State?.Running ?? false,
      health: HEALTH.has(status) ? (status as ContainerState['health']) : 'none',
      ...(last === undefined ? {} : { healthOutput: last }),
      restartCount: container.RestartCount ?? 0,
      exitCode: container.State?.ExitCode ?? 0,
      labels: container.Config?.Labels ?? {},
    };
  }

  async restart(id: string): Promise<void> {
    // The Engine answers once the container has stopped and started again: the stop may take
    // the whole grace period, so the wait is longer than that by the start.
    const stopSeconds = this.options.stopSeconds ?? 150;
    await this.request(
      'POST',
      `/containers/${encodeURIComponent(id)}/restart?t=${stopSeconds}`,
      [],
      (stopSeconds + 50) * 1000,
    );
  }

  private request(
    method: 'GET' | 'POST',
    path: string,
    tolerated: readonly number[] = [],
    timeoutMs = this.options.timeoutMs ?? 10_000,
  ): Promise<{ status: number; body: unknown }> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => request.destroy(new Error(`the Docker Engine did not answer ${method} ${path}`)),
        timeoutMs,
      );
      timer.unref();
      const done =
        <T>(settle: (value: T) => void) =>
        (value: T) => {
          clearTimeout(timer);
          settle(value);
        };
      resolve = done(resolve);
      reject = done(reject);
      const request = http.request({ socketPath: this.socketPath, path, method }, (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('error', reject);
        response.on('end', () => {
          const status = response.statusCode ?? 0;
          const text = Buffer.concat(chunks).toString('utf8');
          let body: unknown;
          try {
            body = text ? JSON.parse(text) : undefined;
          } catch {
            body = text;
          }
          if ((status >= 200 && status < 300) || tolerated.includes(status)) {
            resolve({ status, body });
            return;
          }
          const message =
            typeof body === 'object' && body !== null && 'message' in body
              ? String(body.message)
              : `the Docker Engine answered ${status} to ${method} ${path}`;
          reject(new Error(message));
        });
      });
      request.on('error', reject);
      request.end();
    });
  }
}
