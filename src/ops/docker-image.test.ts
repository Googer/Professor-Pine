import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// The image's build stage runs `npm run build` (Dockerfile): every file of the checkout that
// build runs must reach the stage, through `.dockerignore` and a COPY. The web map's bundling
// (`scripts/web/build.ts`, plan 8M-1) once did not, and `./pine` could not build the image.

const root = path.resolve(import.meta.dirname, '../..');
const read = (file: string): string => readFileSync(path.join(root, file), 'utf8');

/** The `scripts/…` files an npm script runs, following the `npm run` inside it. */
function scriptFiles(name: string, scripts: Record<string, string>, seen = new Set<string>()) {
  if (seen.has(name)) return [];
  seen.add(name);
  const command = scripts[name] ?? '';
  const files = [...command.matchAll(/(?:^|\s)(scripts\/[\w./-]+)/g)].map((m) => m[1] ?? '');
  for (const run of command.matchAll(/npm run ([\w:-]+)/g)) {
    files.push(...scriptFiles(run[1] ?? '', scripts, seen));
  }
  return files;
}

/** The sources COPY puts into the stage named `stage` (`FROM … AS stage` to the next FROM). */
function copiedInto(stage: string, dockerfile: string): string[] {
  const lines = dockerfile.split(/\r?\n/);
  const start = lines.findIndex((line) => new RegExp(`^FROM .+ AS ${stage}$`, 'i').test(line));
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^FROM /i.test(line));
  return (end === -1 ? rest : rest.slice(0, end))
    .filter((line) => /^COPY /i.test(line) && !/--from=/i.test(line))
    .flatMap((line) =>
      line
        .replace(/^COPY\s+/i, '')
        .trim()
        .split(/\s+/)
        .slice(0, -1),
    );
}

const under = (file: string, source: string): boolean => {
  const bare = source.replace(/^\.\//, '').replace(/\/$/, '');
  return file === bare || file.startsWith(`${bare}/`);
};

describe('the Docker image', () => {
  const scripts = (JSON.parse(read('package.json')) as { scripts: Record<string, string> }).scripts;
  const files = scriptFiles('build', scripts);

  it('runs at least the web map bundling in its build', () => {
    expect(files).toContain('scripts/web/build.ts');
  });

  it('lets every file the build runs through .dockerignore', () => {
    const allowed = read('.dockerignore')
      .split(/\r?\n/)
      .filter((line) => line.startsWith('!'))
      .map((line) => line.slice(1));
    for (const file of files) {
      expect(
        allowed.some((entry) => under(file, entry)),
        file,
      ).toBe(true);
    }
  });

  it('copies every file the build runs into its build stage', () => {
    const copied = copiedInto('build', read('Dockerfile'));
    for (const file of files) {
      expect(
        copied.some((source) => under(file, source)),
        file,
      ).toBe(true);
    }
  });
});

// Docker keeps a base image (`node:26-slim`) it once fetched and builds on it until told to look
// again, so without `--pull` an image kept being built on a Node without its security releases.
describe('./pine', () => {
  const pine = read('pine');
  const commands = pine.split(/\r?\n/).filter((line) => !/^\s*(#|say )/.test(line));

  it('fetches the newest base image whenever it builds the bot', () => {
    const builds = commands.filter((line) => /\brun build\b|\bdocker build\b/.test(line));
    expect(builds.length).toBeGreaterThan(0);
    for (const line of builds) expect(line, line.trim()).toMatch(/--pull\b/);
  });

  it('fetches MySQL’s newest image, and the pinned ones, on an update', () => {
    expect(commands.some((line) => /\brun pull --ignore-buildable\b/.test(line))).toBe(true);
  });

  // A dump's `\!` runs on the client, as root in the container, even inside a /*!…*/ comment.
  it('runs no client command a dump holds, on a restore or in the backup’s check', () => {
    expect(pine).toMatch(/\bmysql --commands=OFF --default-character-set=utf8mb4 -uroot /);
    expect(read('docker/backup.sh')).toMatch(
      /\bin_scratch --commands=OFF --default-character-set=utf8mb4 verify/,
    );
  });
});

// `compose pull --ignore-buildable` skips only a service with its own `build:`. The bot's image is
// on no registry, so one more service on it without a way to skip made `./pine update` stop there.
describe('compose.yaml', () => {
  const services = read('compose.yaml')
    .split(/^ {2}(?=[a-z-]+:\r?$)/m)
    .slice(1);

  it('never pulls the bot image, which only a build makes', () => {
    const onBotImage = services.filter((text) => /^ {4}image: professor-pine:/m.test(text));
    expect(onBotImage.length).toBeGreaterThan(1);
    for (const text of onBotImage) {
      expect(/^ {4}build:/m.test(text) || /^ {4}pull_policy: never\r?$/m.test(text), text).toBe(
        true,
      );
    }
  });

  const service = (name: string): string =>
    services.find((text) => text.startsWith(`${name}:`)) ?? '';

  it('gives the bot neither MySQL’s root password nor the tunnel’s token', () => {
    expect(service('pine')).toMatch(/^ {6}DB_ROOT_PASSWORD: ''\r?$/m);
    expect(service('pine')).toMatch(/^ {6}CLOUDFLARE_TUNNEL_TOKEN: ''\r?$/m);
  });

  // These read the file: what the proxy lets through was proved on an engine (plan 8Z's staging).
  describe('the Docker socket behind a proxy (plan 8Z)', () => {
    const ALLOW_GET =
      '(/v[0-9.]+)?/containers/(json|${COMPOSE_PROJECT_NAME:-pine}-pine-[0-9]+/json)';
    const ALLOW_POST = '(/v[0-9.]+)?/containers/${COMPOSE_PROJECT_NAME:-pine}-pine-[0-9]+/restart';

    it('holds the socket in the proxy alone', () => {
      const withSocket = services.filter((text) => /docker\.sock/.test(text.replace(/#.*$/gm, '')));
      expect(withSocket.map((text) => text.split(':')[0])).toEqual(['docker-proxy']);
      expect(service('docker-proxy')).toMatch(
        /^ {6}- \/var\/run\/docker\.sock:\/var\/run\/docker\.sock:ro\r?$/m,
      );
    });

    it('lets through what the watchdog asks, of this stack’s bot, and nothing else', () => {
      const proxy = service('docker-proxy');
      expect(proxy).toContain(`SP_ALLOW_GET: '${ALLOW_GET}'`);
      expect(proxy).toContain(`SP_ALLOW_POST: '${ALLOW_POST}'`);
      expect(proxy).not.toMatch(/SP_ALLOW_(PUT|DELETE|PATCH|HEAD)/);
    });

    it('keeps the proxy on an internal network of its own, shared with the watchdog alone', () => {
      expect(read('compose.yaml')).toMatch(/^ {2}docker-proxy:\r?\n {4}internal: true\r?$/m);
      expect(service('docker-proxy')).toMatch(/^ {4}networks: \[docker-proxy\]\r?$/m);
      expect(service('watchdog')).toMatch(/^ {4}networks: \[default, docker-proxy\]\r?$/m);
      const onIt = services.filter((text) => /^ {4}networks: .*docker-proxy/m.test(text));
      expect(onIt).toHaveLength(2);
    });

    // Whoever can route to the proxy (on a Linux host, any local process can reach a bridge
    // network's addresses) could read the bot's environment through its inspect: the proxy
    // answers only the address the name `watchdog` resolves to (plan 8Z-2).
    it('lets the proxy answer the watchdog alone, not every address', () => {
      const proxy = service('docker-proxy');
      expect(proxy).toMatch(/^ {6}SP_ALLOWFROM: watchdog\r?$/m);
      expect(proxy.replace(/#.*$/gm, '')).not.toContain('0.0.0.0/0');
      // The name is the service's on the network the two share.
      expect(services.some((text) => text.startsWith('watchdog:'))).toBe(true);
    });

    it('starts the watchdog after the proxy, naming its project, as the image’s user', () => {
      const watchdog = service('watchdog');
      expect(watchdog).toMatch(/^ {6}- docker-proxy\r?$/m);
      expect(watchdog).toMatch(/^ {6}WATCHDOG_PROJECT: \$\{COMPOSE_PROJECT_NAME:-pine\}\r?$/m);
      expect(watchdog).not.toMatch(/^ {4}user:/m);
    });

    it('gives the watchdog a place of its own to write, and the ops volume to read alone', () => {
      const watchdog = service('watchdog');
      expect(watchdog).toMatch(/^ {6}- ops:\/ops:ro\r?$/m);
      expect(watchdog).toMatch(/^ {6}- watchdog-state:\/watchdog\r?$/m);
      expect(read('compose.yaml')).toMatch(/^ {2}watchdog-state:\r?$/m);
      // A new volume takes the folder's owner: the image's user can write there.
      expect(read('Dockerfile')).toMatch(/^RUN .*mkdir -p .*\/watchdog\b.*chown .*node:node/m);
    });

    it('checks the proxy’s health with the binary its image carries', () => {
      const proxy = service('docker-proxy');
      expect(proxy).toMatch(/^ {6}SP_ALLOWHEALTHCHECK: 'true'\r?$/m);
      expect(proxy).toMatch(/^ {6}test: \['CMD', '\.\/healthcheck'\]\r?$/m);
    });

    it('runs the proxy with nothing to write and little to use', () => {
      const proxy = service('docker-proxy');
      expect(proxy).toMatch(/^ {4}read_only: true\r?$/m);
      expect(proxy).toMatch(/^ {4}restart: unless-stopped\r?$/m);
    });
  });

  it.each(['pine', 'watchdog', 'cloudflared', 'docker-proxy'])(
    'limits what %s may do and use',
    (name) => {
      const text = service(name);
      expect(text).toMatch(/^ {4}security_opt: \['no-new-privileges:true'\]\r?$/m);
      expect(text).toMatch(/^ {4}cap_drop: \['ALL'\]\r?$/m);
      expect(text).toMatch(/^ {4}mem_limit: \d+[mg]\r?$/m);
      expect(text).toMatch(/^ {4}pids_limit: \d+\r?$/m);
    },
  );

  // They start as root and step down (the image's entrypoint, the backup's gosu), so they keep
  // their capabilities; what they may use is bounded like the others' (plan 8Z-2).
  it.each(['mysql', 'backup'])('lets %s gain no privilege, and limits what it may use', (name) => {
    const text = service(name);
    expect(text).toMatch(/^ {4}security_opt: \['no-new-privileges:true'\]\r?$/m);
    expect(text).toMatch(/^ {4}mem_limit: \d+[mg]\r?$/m);
    expect(text).toMatch(/^ {4}pids_limit: \d+\r?$/m);
  });

  describe('the networks (plan 8Z-2)', () => {
    const networksOf = (name: string): string =>
      /^ {4}networks: \[(.*)\]\r?$/m.exec(service(name))?.[1] ?? 'default';

    it('keeps MySQL on a network without a way out, with the bot and the backups alone', () => {
      expect(read('compose.yaml')).toMatch(/^ {2}db:\r?\n {4}internal: true\r?$/m);
      expect(networksOf('mysql')).toBe('db');
      expect(networksOf('backup')).toBe('db');
      expect(networksOf('pine')).toBe('default, db');
    });

    it('lets neither the tunnel, the watchdog nor the socket proxy reach MySQL', () => {
      expect(networksOf('cloudflared')).toBe('default');
      expect(networksOf('watchdog')).toBe('default, docker-proxy');
      expect(networksOf('docker-proxy')).toBe('docker-proxy');
    });
  });

  // The backups read the database as the bot's account does; MySQL's root password is for the
  // mysql service alone (and for `./pine restore`, which runs inside it).
  it('gives the backups the bot’s account, never MySQL’s root password', () => {
    const backup = service('backup').replace(/#.*$/gm, '');
    expect(backup).not.toContain('ROOT_PASSWORD');
    expect(backup).toMatch(/^ {6}DB_USER: \$\{DB_USER:\?DB_USER must be set in \.env\}\r?$/m);
    expect(backup).toMatch(
      /^ {6}DB_PASSWORD: \$\{DB_PASSWORD:\?DB_PASSWORD must be set in \.env\}\r?$/m,
    );
    const withRoot = services
      .filter((text) => /ROOT_PASSWORD: \$\{DB_ROOT_PASSWORD/.test(text.replace(/#.*$/gm, '')))
      .map((text) => text.split(':')[0]);
    expect(withRoot).toEqual(['mysql']);
  });

  // An image named by a tag alone is whatever was last pushed there, fetched again at each
  // update: the socket proxy holds the Docker socket and the tunnel sees every cookie. Pinned by
  // version and digest (of the image index: the hosts are arm64 and amd64), which Dependabot
  // bumps by pull request. MySQL follows its LTS by its tag, and the bot's image is built here.
  it('pins every image but MySQL’s and the bot’s own by version and digest', () => {
    const images = services.flatMap((text) => /^ {4}image: (.+?)\r?$/m.exec(text)?.[1] ?? []);
    const others = images.filter(
      (image) => !image.startsWith('professor-pine:') && !image.startsWith('mysql:'),
    );
    expect(others.map((image) => image.split(':')[0])).toEqual([
      'wollomatic/socket-proxy',
      'cloudflare/cloudflared',
    ]);
    for (const image of others) {
      expect(image, image).toMatch(/^[\w./-]+:\d+(\.\d+)+@sha256:[0-9a-f]{64}$/);
    }
  });

  it('keeps the logs of every service to a size', () => {
    const running = services.filter((text) => /^ {4}image: /m.test(text));
    expect(running).toHaveLength(6);
    for (const text of running) expect(text, text).toMatch(/^ {4}logging: \*logging\r?$/m);
  });
});
