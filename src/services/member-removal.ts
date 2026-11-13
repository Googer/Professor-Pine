import type {
  MemberData,
  MemberHoldings,
  MemberRemoved,
} from '../db/repositories/member-data-repository.js';
import { MemberRemovalError } from '../db/repositories/member-data-repository.js';
import { attendeeOf, isMeetup, type Party } from '../domain/party/party.js';
import type { Logger } from '../log.js';

/** What the store of kept screenshots does for the removal (`ScreenshotStore`). */
export interface MemberScreenshots {
  /** The screenshots the member sent, and other members' that hold feedback of theirs. */
  heldOf(memberId: string): Promise<{ sent: number; feedback: number }>;
  /** Removes both; `failed` counts screenshots of which something could not be removed. */
  forget(memberId: string): Promise<{ removed: number; feedback: number; failed: number }>;
}

export interface MemberRemovalOptions {
  /** The member's rows in the database (`MemberDataRepository`). */
  data: MemberData;
  screenshots: MemberScreenshots;
  /** The parties going on, to count those the member made or signed up for (they are left). */
  parties: { active(): readonly Party[] };
  /**
   * The servers whose member index of the old bot's history holds a file of the member
   * (`memberIndexServers` over `LEGACY_INDEX_DIR`); none where the installation has no index.
   */
  legacyFiles?: (memberId: string) => Promise<string[]>;
  /**
   * Ends the live streams opened under a web login (`LiveSignals.endSession`), as a logout
   * does; none where the web pages are off.
   */
  endSession?: (sessionId: string) => void;
  /**
   * The reasons of reports held in memory for the next report of their subject after a post
   * failed (`ModerationReports.forgetReporter`), which would otherwise write the member's id and
   * name back with somebody's next report.
   */
  heldReports?: { forgetReporter(memberId: string): void };
  log: Logger;
}

/** What Pine holds of a member, over every server: the look before a removal, and after it. */
export interface MemberLook {
  memberId: string;
  /** What the database holds, counted. */
  held: MemberHoldings;
  /** Kept screenshots: those they sent, and others' with feedback of theirs. */
  screenshots: { sent: number; feedback: number };
  /** The parties going on that they made or are signed up for: left, they end by themselves. */
  liveParties: number;
  /**
   * Of the same, those staff saved (`/admin save-party`, `Party.saved`), counted apart: kept from
   * the clock, they end only when staff let them go.
   */
  savedParties: number;
  /**
   * The servers whose member index holds a file of theirs, which the owner deletes by hand on
   * the host (the bot's mount is read-only): `<server>/<member>.json` under `LEGACY_INDEX_DIR`.
   */
  legacyFiles: string[];
}

/** What a removal did, and what is left of the member after it. */
export interface MemberRemovalOutcome {
  removed: MemberRemoved;
  screenshots: { removed: number; feedback: number; failed: number };
  /**
   * What is left, looked at once more after the removal; undefined where that look failed (the
   * removal stands all the same: run the command again to see it).
   */
  after: MemberLook | undefined;
}

/**
 * Whether a removal would take anything of what a look found (the one rule of the look's
 * button, of "there is nothing to remove" and of the service's tests): a row of settings, a
 * notice, anything of the history, a web login, access to the export tool, their id on a reason
 * of a report or on a meetup record that is over, a kept screenshot or feedback on one.
 */
export function removable(look: MemberLook): boolean {
  const { held, screenshots } = look;
  return (
    held.user !== undefined ||
    held.newTrains > 0 ||
    held.unownGifts > 0 ||
    held.history.optIns > 0 ||
    held.history.boards > 0 ||
    held.history.fillIns > 0 ||
    held.history.named > 0 ||
    held.sessions > 0 ||
    held.toolAccess ||
    held.reports.reasons > 0 ||
    held.meetups.over > 0 ||
    screenshots.sent > 0 ||
    screenshots.feedback > 0
  );
}

/**
 * The ids of the meetups going on that the member made: the approved requests they were made
 * from are not over yet, for the moderators are told of their changes by the request's maker
 * (`MeetupSafety.tellChange`, `approvedRequestOf`). The removal leaves their id and name on
 * those until the meetup has ended.
 */
function meetupsGoingOn(active: readonly Party[], memberId: string): string[] {
  return active
    .filter((party) => isMeetup(party) && party.createdById === memberId)
    .map((party) => party.id);
}

/**
 * Removing a member's data on request (plan 8G; the operators' `/operator forget member:`), across
 * every server: the policy's promise that what Pine holds of somebody goes when they ask.
 *
 * `look` counts what Pine holds and changes nothing. `remove` is the one way it goes: the
 * database first, in one transaction (`MemberData.remove`: either all of it or nothing, and a
 * failure is thrown on as it came, naming its step); then, once that has committed, what is
 * outside it: the live streams of the web logins it deleted are ended as a logout ends them,
 * the reasons of reports held in memory after a failed post drop theirs (`heldReports`), and
 * the kept screenshots the member sent or posted are removed from both folders, with their
 * feedback on others'. None of these fails the removal: a stream that cannot be ended ends within
 * its lifetime (its login is gone), and a screenshot that could not be removed is counted and
 * goes with the store's own sweep, or with a second run. Nor does the look at what is left that
 * follows (`after`): one that fails is logged, and the outcome goes without it.
 *
 * Nothing is sent to the member and nobody is asked on Discord: the id is enough. One line at
 * info says who was removed and who asked, with none of the data.
 */
export class MemberRemoval {
  constructor(private readonly options: MemberRemovalOptions) {}

  async look(memberId: string): Promise<MemberLook> {
    const { data, screenshots, parties, legacyFiles } = this.options;
    const active = parties.active();
    const [held, shots, files] = await Promise.all([
      data.held(memberId, meetupsGoingOn(active, memberId)),
      screenshots.heldOf(memberId),
      legacyFiles?.(memberId) ?? [],
    ]);
    const theirs = active.filter(
      (party) => party.createdById === memberId || attendeeOf(party, memberId) !== undefined,
    );
    const savedParties = theirs.filter((party) => party.saved).length;
    return {
      memberId,
      held,
      screenshots: shots,
      liveParties: theirs.length - savedParties,
      savedParties,
      legacyFiles: files,
    };
  }

  /** `by`: the operator who asked. Rejects, with nothing changed, when the database refuses. */
  async remove(memberId: string, by: string): Promise<MemberRemovalOutcome> {
    const { data, screenshots, parties, endSession, heldReports, log } = this.options;
    let removed: MemberRemoved;
    try {
      removed = await data.remove(memberId, meetupsGoingOn(parties.active(), memberId));
    } catch (err) {
      log.error(
        {
          err,
          member: memberId,
          by,
          ...(err instanceof MemberRemovalError ? { step: err.step } : {}),
        },
        'could not remove a member’s data; nothing changed',
      );
      throw err;
    }
    log.info({ member: memberId, by }, 'removed a member’s data on request');
    for (const sessionId of removed.sessions) {
      try {
        endSession?.(sessionId);
      } catch (err) {
        log.warn({ err }, 'could not end a removed login’s streams');
      }
    }
    try {
      heldReports?.forgetReporter(memberId);
    } catch (err) {
      log.warn({ err }, 'could not drop a removed member’s held report reasons');
    }
    const shots = await screenshots.forget(memberId);
    // The removal has committed: a look that fails now must not turn it into a failure.
    let after: MemberLook | undefined;
    try {
      after = await this.look(memberId);
    } catch (err) {
      log.warn(
        { err, member: memberId },
        'could not look at what is left of a member after the removal',
      );
    }
    return { removed, screenshots: shots, after };
  }
}
