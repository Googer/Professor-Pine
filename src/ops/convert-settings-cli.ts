import { convertInstallation } from './convert-settings.js';

// The settings converter of a legacy installation:
//   node dist/ops/convert-settings-cli.js <legacy data folder> [--out <dir>] [--force]
// (`./pine convert-settings`, `npm run settings:convert`). Writes pine-settings.json and
// env-from-legacy.txt into the folder `--out` names (here by default), refusing to write over
// either without --force; prints the names of what it kept, dropped and mapped, never a secret.
const USAGE = 'Usage: convert-settings <legacy data folder> [--out <dir>] [--force]';
const args = process.argv.slice(2);
let legacyDir: string | undefined;
let outDir = '.';
let force = false;
for (let i = 0; i < args.length; i++) {
  const arg = args[i] ?? '';
  if (arg === '--force') {
    force = true;
  } else if (arg === '--out') {
    const next = args[++i];
    if (next === undefined) {
      process.stderr.write(`--out needs a folder.\n${USAGE}\n`);
      process.exit(2);
    }
    outDir = next;
  } else if (arg.startsWith('-') || legacyDir !== undefined) {
    process.stderr.write(`Unknown argument: ${arg}\n${USAGE}\n`);
    process.exit(2);
  } else {
    legacyDir = arg;
  }
}
if (legacyDir === undefined) {
  process.stderr.write(`Name the legacy bot's data folder.\n${USAGE}\n`);
  process.exit(2);
}

process.exitCode = convertInstallation({
  legacyDir,
  outDir,
  force,
  defaultsPath: 'data/settings.json',
  say: (line) => process.stdout.write(`${line}\n`),
});
