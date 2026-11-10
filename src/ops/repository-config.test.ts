import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// What GitHub runs for this repository: the workflows and Dependabot's settings. These read the
// files; GitHub alone proves what they do.

const root = path.resolve(import.meta.dirname, '../..');
const read = (file: string): string => readFileSync(path.join(root, file), 'utf8');

/** A file without its comments (from a `#` after a space or at a line's start). */
const bare = (text: string): string => text.replace(/(^|\s)#.*$/gm, '$1');

describe('the workflows', () => {
  const folder = '.github/workflows';
  const workflows = readdirSync(path.join(root, folder))
    .filter((name) => /\.ya?ml$/.test(name))
    .map((name) => ({ name, text: read(`${folder}/${name}`) }));

  it('are there', () => {
    expect(workflows.map(({ name }) => name)).toContain('ci.yml');
  });

  // Without it a job's token may write to the repository, whatever a step (or an action it
  // runs) does with it.
  it.each(workflows)('$name gives its jobs a token that only reads', ({ text }) => {
    expect(text).toMatch(/^permissions:\r?\n {2}contents: read\r?$/m);
    // No job asks for more.
    expect(bare(text)).not.toMatch(/:\s*write\b/);
  });

  // A tag of an action can be moved to other code; a commit cannot. The version stays beside
  // it as a comment, which Dependabot keeps current with the commit.
  it.each(workflows)('$name runs every action at a commit, its version beside it', ({ text }) => {
    const uses = text.split(/\r?\n/).filter((line) => /^\s*(- )?uses:/.test(line));
    expect(uses.length).toBeGreaterThan(0);
    for (const line of uses) {
      expect(line, line.trim()).toMatch(/uses: [\w.-]+\/[\w./-]+@[0-9a-f]{40} # v\d+\.\d+\.\d+$/);
    }
  });

  // 8Z-2 final fix F8: a tag of an image (`stable`) is whatever was pushed there last; the
  // digest of its index is the one image every platform pulls.
  it('run every image of a `docker run` at its version and digest', () => {
    const runs = workflows.flatMap(({ text }) =>
      bare(text)
        .split(/\r?\n/)
        .filter((line) => /\bdocker run\b/.test(line)),
    );
    expect(runs.length).toBeGreaterThan(0);
    for (const line of runs) {
      expect(line, line.trim()).toMatch(/\s[\w./-]+:v?\d+\.\d+\.\d+@sha256:[0-9a-f]{64}\s/);
    }
  });
});

describe('Dependabot', () => {
  const settings = read('.github/dependabot.yml');
  /** Each entry of `updates`, from its `- package-ecosystem:` line on. */
  const updates = bare(settings)
    .split(/^ {2}- (?=package-ecosystem:)/m)
    .slice(1);
  const ecosystem = (entry: string): string =>
    /^package-ecosystem: ['"]?([\w-]+)['"]?\r?$/m.exec(entry)?.[1] ?? '';

  it('watches the images of compose.yaml and the actions of the workflows, weekly', () => {
    expect(updates.map(ecosystem).sort()).toEqual(['docker-compose', 'github-actions']);
    for (const entry of updates) {
      expect(entry, ecosystem(entry)).toMatch(/^ {4}directory: ['"]?\/['"]?\r?$/m);
      expect(entry, ecosystem(entry)).toMatch(/^ {6}interval: ['"]?weekly['"]?\r?$/m);
    }
  });

  // Pine's work lands on main-dev, the default branch; master is the release, never a target.
  it('opens its pull requests against main-dev', () => {
    for (const entry of updates) {
      expect(entry, ecosystem(entry)).toMatch(/^ {4}target-branch: ['"]?main-dev['"]?\r?$/m);
    }
  });

  // MySQL follows its LTS by hand (the data directory upgrades in place; CLAUDE.md), with the
  // backup service and the tests on the same version.
  it('leaves MySQL alone', () => {
    const compose = updates.find((entry) => ecosystem(entry) === 'docker-compose') ?? '';
    expect(compose).toMatch(/^ {4}ignore:\r?\n {6}- dependency-name: ['"]?mysql['"]?\r?$/m);
  });
});
