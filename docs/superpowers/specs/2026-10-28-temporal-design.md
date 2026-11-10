# Plan 8Y: Temporal in place of Luxon

Matt, 2026-10-28: Node 26 has Temporal built in, so Pine drops the third-party `luxon` (and
`@types/luxon`). Nothing a member sees changes: every test's expected text and time stays as it
is. The tests that build times keep their meaning; only how they build them changes.

## Scope

30 files outside the tests import `luxon` (measured 2026-10-28): `src/domain/time/*` (11),
`src/domain/{geo,ocr,party,pogo}` (7), `src/render/{raid-post,research,text,timed-post}.ts`,
`src/commands/{admin/boss-overrides,gyms/google,parties/timed}.ts`,
`src/services/{board-keeper,raid-event-service,stop-posts}.ts`,
`scripts/raid-bosses/check-feed.ts`, `test/support/{max-bosses,parties}.ts`; 23 test files. No
module the web page's bundle imports uses Luxon, and none may use Temporal (the bundle targets
browsers: `src/web/client` keeps lib ES2023 and its typecheck refuses Temporal there).

## One helper module

`src/domain/time/zoned.ts` (pure) is the one place Pine makes and reads zoned times, as the
one-path rule asks; every former Luxon caller goes through it or through Temporal's own
`ZonedDateTime` methods on what it returns.

- `zoned(ms, zone): Temporal.ZonedDateTime` (`Instant.fromEpochMilliseconds(ms)
  .toZonedDateTimeISO(zone)`), and `.epochMilliseconds` back.
- Starts: `.startOfDay()`; hour and month as small functions (`startOfHour`, `startOfMonth`);
  ISO weeks start on Monday, as Luxon's (`sameWeek(a, b)`: the Mondays' `startOfDay` equal).
- `sameDay(a, b)` for Luxon's `hasSame(…, 'day')`; `isoDate(ms, zone)` (`yyyy-mm-dd`) for
  `toISODate()`.
- `localTime({ year, month, day, hour, minute, second }, zone, offset?)`: a wall-clock time; a
  time in the spring gap moves forward an hour. In the fall overlap it takes `offset` where that
  is one of the two (`offset: 'prefer'`), else the earlier one (`disambiguation: 'compatible'`).
  Luxon's `fromObject` chose by the zone's offset at the moment it ran (the earlier before the
  clocks fell back, the later after), so a member's typed time passes now's offset (fix 8Y-1:
  at 01:10 EST, "1:30am" is the 01:30 EST to come). Returns `undefined` for a date that does
  not exist (Feb 30) where Luxon returned an invalid `DateTime`.
- `addDays(time, n)`: whole calendar days (weeks as 7) at the same wall-clock time, keeping the
  time's offset where it is valid, as Luxon's `plus({ days })` did; Temporal's `add({ days })`
  takes the earlier time in the overlap.
- `feedTime(text, zone): ZonedDateTime | undefined`: a time with an offset or `Z` is that
  instant, seen in `zone`; one without is a wall-clock time in `zone` (the earlier in the fall
  overlap, whenever it is read: a feed's time is not decided by our clock); a date alone is its
  midnight there; anything else (and an empty or malformed string) is `undefined`, never a throw.
- Words: `clockWords` for `h:mm a` ("3:05 PM", a plain space; built from the fields, not `Intl`,
  whose newer ICU puts U+202F before AM/PM), `dayWords` for `cccc, LLLL d` ("Wednesday,
  October 28") and `minuteStamp` for `yyyy-MM-dd HH:mm`, all from the fields.

Durations: days and weeks (`plus({ days })`, `plus({ weeks })`) through `addDays`, which counts
calendar days across a daylight-saving change as Luxon did; hours and minutes through Temporal's
own `add` (exact time); `diff` in days through `PlainDate.until`.

## Rules

- Pine never calls `Temporal.Now`: the clock is `Date.now()` or an injected `now`, as today, so
  tests that fake `Date` keep working.
- A zone comes only from `settings.timezone` (checked at load, `isTimeZone`) or the fixed zones
  of a feed (`GOOGLE_ZONE`); Temporal throws on a bad zone where Luxon went invalid, so no code
  may build a zone from member text.
- `luxon` and `@types/luxon` leave `package.json` and the lock by `npm uninstall
  --package-lock-only` (the worktrees share one `node_modules` through junctions, and other
  branches still import Luxon until they merge this; the leftover package there is harmless); CLAUDE.md's Data rule says "Temporal
  `ZonedDateTime`" in place of "Luxon `DateTime`". An ESLint `no-restricted-imports` entry
  refuses `luxon`.

## Delivery

A mechanical change guarded by the existing tests (Matt: they likely catch the edge cases
already), so no transcription step: `pine-prototyper` builds it on a branch in a worktree off
`typescript-migration`, one commit per group of files (the helper with its own tests first,
RED then GREEN; then `src/domain/time`; then the rest of domain; then render, commands, services
and scripts; then tests and test support; then the package removal and docs). A test whose
expected text or time would have to change is a stop: report it, do not change it. One Opus
review of the whole branch, fix rounds on affected tests only, then the full check, build and
database suite once, and a fast-forward of `typescript-migration`.
