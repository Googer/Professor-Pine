/**
 * Records how the legacy bot's moment calls read time text, so the new parser can be tested
 * against them. Needs the legacy moment version, installed outside the project:
 *   npm install --prefix var/legacy-parity moment@2.29.4
 *   npx tsx scripts/legacy-parity/moment-time-cases.ts
 * Writes test/fixtures/legacy-time-cases.json. Re-run only if the input lists below change.
 */
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

interface MomentDate {
  isValid(): boolean;
  hour(): number;
  minute(): number;
  month(): number;
  date(): number;
  creationData(): { format: string };
}
interface MomentDuration {
  isValid(): boolean;
  asMinutes(): number;
  asMilliseconds(): number;
}
interface MomentStatic {
  (input: string, formats: string[]): MomentDate;
  duration(input: string | number, unit?: string): MomentDuration;
}

const repoRoot = path.resolve(import.meta.dirname, '../..');
const require = createRequire(path.join(repoRoot, 'var/legacy-parity/package.json'));
const moment = require('moment') as MomentStatic;

/** The formats in types/time.js, in the same order. */
const FORMATS = [
  'hmm a',
  'Hmm',
  'h:m a',
  'H:m',
  'M-D hmm a',
  'M-D Hmm',
  'M-D h:m a',
  'M-D H:m',
  'M-D h a',
  'M-D H',
];

const CLOCK_INPUTS = [
  '330pm',
  '330 pm',
  '3:30pm',
  '3:30 pm',
  '3:30 PM',
  '3:30p',
  '3:30',
  '330',
  '1530',
  '15:30',
  '3pm',
  '3 pm',
  '3',
  '9',
  '12am',
  '12pm',
  '12:05',
  '12:05am',
  '0:15',
  '09:05',
  '9:5',
  '7:15 a',
  '10-14 3:30pm',
  '10-14 330pm',
  '10-14 15:30',
  '10-14 1530',
  '10-14 3 pm',
  '10-14 6pm',
  '10-14 15',
  '1-5 9:00',
  '12/25 6pm',
  '45',
  '90',
  'abc',
  '',
  '25:00',
  '3:75',
  // Plausible variants (fix round 1): dot separators, "at" and commas before the time.
  '3.30pm',
  '6.30 pm',
  '10-14 at 6pm',
  '10-14, 6pm',
  '10-14, at 6pm',
  '10.14 6pm',
  '10-14 3.30pm',
  // Variants deliberately not supported; see KNOWN_CLOCK_DIFFERENCES.
  '6 30',
  '3 30 pm',
  '10/14/2026 6pm',
  '6:00pm!',
  '3:30pm please',
  '6:30ish',
  '3:30:00 pm',
  '6 a m',
  'tomorrow 6pm',
  '6pm 10-14',
  '10-14 6pm EST',
  // A bare "m" is not a meridiem.
  '5m',
];

const DURATION_INPUTS = [
  '45',
  '0',
  '90',
  '-5',
  '30 minutes',
  'abc',
  '',
  '1:30',
  '0:45',
  '1:30:00',
  '0:00',
  '3:30pm',
  '2:5',
  // Text that merely starts with digits (fix wave): legacy read the leading digits as minutes.
  '2 hours',
  '1.5 hours',
  '2h',
  '20m',
  '1e3',
  '10-20 6',
  '5 raids',
];

function clockCase(input: string) {
  const parsed = moment(input, FORMATS);
  if (!parsed.isValid()) return { input, valid: false };
  const format = parsed.creationData().format;
  const hasDate = format.includes('D');
  return {
    input,
    valid: true,
    hour: parsed.hour(),
    minute: parsed.minute(),
    hasMeridiem: format.endsWith('a'),
    ...(hasDate ? { month: parsed.month() + 1, day: parsed.date() } : {}),
  };
}

/** Mirrors the duration branch of types/time.js. */
function durationCase(input: string) {
  let duration: MomentDuration | undefined;
  if (!input.includes(':')) {
    duration = moment.duration(Number.parseInt(input, 10), 'minutes');
  } else {
    const anyDuration = input.split(':').some((part) => Number.parseInt(part, 10) !== 0);
    if (anyDuration) {
      duration = moment.duration(input);
      if (duration.isValid() && duration.asMilliseconds() === 0) duration = undefined;
    } else {
      duration = moment.duration(0);
    }
  }
  return duration?.isValid()
    ? { input, valid: true, minutes: duration.asMinutes() }
    : { input, valid: false };
}

const out = path.join(repoRoot, 'test/fixtures/legacy-time-cases.json');
writeFileSync(
  out,
  `${JSON.stringify({ clock: CLOCK_INPUTS.map(clockCase), duration: DURATION_INPUTS.map(durationCase) }, null, 2)}\n`,
);
process.stdout.write(`Wrote ${out}\n`);
