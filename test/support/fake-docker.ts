import type { ContainerState, DockerApi } from '../../src/ops/docker-api.js';

/** A container of the fake Docker Engine; tests change its fields between the watchdog's ticks. */
export interface FakeContainer extends ContainerState {
  name: string;
}

/** The labels Compose gives a service's container. */
export function composeLabels(project: string, service: string): Record<string, string> {
  return {
    'com.docker.compose.project': project,
    'com.docker.compose.service': service,
    'com.docker.compose.oneoff': 'False',
  };
}

/**
 * The Docker Engine as the watchdog sees it (`DockerApi`): containers by label, a container's
 * state, a restart (which it records, and which makes the container healthy and starting
 * anew). `failRestart` makes restarts fail; `failWith` makes every call fail, as an Engine that
 * does not answer.
 */
export class FakeDockerApi implements DockerApi {
  readonly containers: FakeContainer[] = [];
  readonly restarted: string[] = [];
  /** The names the watchdog asked about, in order. */
  readonly inspected: string[] = [];
  failRestart: Error | undefined;
  failWith: Error | undefined;

  add(container: Partial<FakeContainer> & { id: string; labels: Record<string, string> }) {
    const made: FakeContainer = {
      name: container.id,
      running: true,
      health: 'healthy',
      restartCount: 0,
      exitCode: 0,
      ...container,
    };
    this.containers.push(made);
    return made;
  }

  containerNames(labels: readonly string[]): Promise<string[]> {
    if (this.failWith) return Promise.reject(this.failWith);
    return Promise.resolve(
      this.containers
        .filter((container) =>
          labels.every((label) => {
            const [key = '', value] = label.split('=');
            return container.labels[key] === value;
          }),
        )
        .map((container) => container.name),
    );
  }

  container(name: string): Promise<ContainerState | undefined> {
    if (this.failWith) return Promise.reject(this.failWith);
    this.inspected.push(name);
    const found = this.containers.find((container) => container.name === name);
    if (!found) return Promise.resolve(undefined);
    const { name: _name, ...state } = found;
    return Promise.resolve({ ...state, labels: { ...state.labels } });
  }

  restart(name: string): Promise<void> {
    if (this.failWith) return Promise.reject(this.failWith);
    if (this.failRestart) return Promise.reject(this.failRestart);
    const found = this.containers.find((container) => container.name === name);
    if (!found) return Promise.reject(new Error(`No such container: ${name}`));
    this.restarted.push(name);
    found.health = 'starting';
    delete found.healthOutput;
    return Promise.resolve();
  }
}
