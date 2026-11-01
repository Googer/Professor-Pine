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

  it('fetches the newest MySQL and tunnel images on an update', () => {
    expect(commands.some((line) => /\brun pull --ignore-buildable\b/.test(line))).toBe(true);
  });
});
