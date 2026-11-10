/**
 * The triage of a review folder of the screenshot reader (a copy of production's
 * `var/ocr/review/`):
 *
 *   npm run ocr:review -- <folder> [--show-text]
 *
 * Reads the records beside the screenshots (`<id>.json`; never the screenshots themselves) and
 * prints how many there are, how they were decided, which doubts were raised, and per element
 * how often members said it was wrong, by where it went wrong (`wrongAt`): the gym's text read
 * but another gym chosen (a nickname may fix it) or no gym found, no clock or no countdown, the
 * heads counted, a CP read and no boss decided. Gym texts corrected the same way twice or more
 * are suggested as nicknames. Max battles' screenshots are counted apart, by their own report
 * (`maxWrongAt`: the Power Spot's text, the countdown, the heads and form, the boss's name). What members wrote, and who they are (their ids), is printed only
 * with `--show-text`: it stays on the machine it was copied to. The procedure around it is the skill
 * `.claude/skills/improve-screenshot-reading/SKILL.md`.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { reviewSummary, type ReviewRecord } from '../../src/domain/ocr/review.js';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { 'show-text': { type: 'boolean' } },
});
const folder = positionals[0];
if (!folder) {
  process.stderr.write('Usage: npm run ocr:review -- <folder> [--show-text]\n');
  process.exit(2);
}

const records: ReviewRecord[] = [];
let unreadable = 0;
for (const file of readdirSync(folder)
  .filter((name) => name.endsWith('.json'))
  .sort()) {
  try {
    const record = JSON.parse(readFileSync(path.join(folder, file), 'utf8')) as ReviewRecord & {
      v?: number;
    };
    if (record.v === 1 && record.report && Array.isArray(record.feedback)) records.push(record);
    else unreadable++;
  } catch {
    unreadable++;
  }
}

const summary = reviewSummary(records);
const out = (line = '') => process.stdout.write(`${line}\n`);
const listed = (counts: Record<string, number>) =>
  Object.entries(counts)
    .sort(([, a], [, b]) => b - a)
    .map(([key, n]) => `${key} ${n}`)
    .join(', ') || 'none';

out(
  `${summary.records} raid screenshots and other pictures${unreadable ? ` (${unreadable} records not read)` : ''}.`,
);
out(`Read for: ${listed(summary.byUse)}.`);
out(`Decided: ${listed(summary.byDecision)}.`);
out(`Doubts raised: ${listed(summary.doubts)}.`);
out(`Said all right: ${summary.right}; said wrong: ${summary.wrong}.`);
out();
for (const [element, counts] of Object.entries(summary.elements)) {
  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
  if (total === 0) continue;
  out(`${element}: wrong ${total} times`);
  for (const [where, n] of Object.entries(counts).sort(([, a], [, b]) => b - a)) {
    out(`  ${n}  ${where}`);
  }
}
const { max } = summary;
if (max.records > 0) {
  // Max battles' screenshots apart, by their own report (plan 8X-S).
  out();
  out(`Max battles: ${max.records} screenshots.`);
  out(`  Read for: ${listed(max.byUse)}.`);
  out(`  Decided: ${listed(max.byDecision)}.`);
  out(`  Doubts raised: ${listed(max.doubts)}.`);
  out(`  Said all right: ${max.right}; said wrong: ${max.wrong}.`);
  for (const [element, counts] of Object.entries(max.elements)) {
    const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
    if (total === 0) continue;
    out(`  ${element}: wrong ${total} times`);
    for (const [where, n] of Object.entries(counts).sort(([, a], [, b]) => b - a)) {
      out(`    ${n}  ${where}`);
    }
  }
}
if (summary.nicknames.length > 0) {
  out();
  out('Gym texts corrected the same way more than once (suggested nicknames, `/gym edit`):');
  for (const pair of summary.nicknames) {
    const correction = values['show-text'] ? ` -> "${pair.correction}"` : '';
    out(`  ${pair.times}x  "${pair.read}"${correction}`);
  }
  if (!values['show-text']) out('  (members’ corrections are shown with --show-text)');
}
if (summary.corrections.length > 0) {
  out();
  if (values['show-text']) {
    out('What members wrote (never to be copied out of this machine):');
    for (const c of summary.corrections) {
      out(`  ${c.id}  member ${c.memberId}  [${c.elements.join(', ')}]  "${c.correction}"`);
    }
  } else {
    out(
      `${summary.corrections.length} corrections by members (shown, with who, with --show-text).`,
    );
  }
}
