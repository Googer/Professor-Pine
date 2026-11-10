import { sectionFailure } from './history-days.js';
import { tallyLoginHref } from './history-tally.js';
import { RequestError } from './request-error.js';

/**
 * Says why a section of the history page cannot be shown, with "Log in with Discord" where it goes
 * with it; where raids by day (the `first` section) say it for the page (logged out, no member:
 * B9), every other section is hidden instead (`section`), so that the page says it once.
 */
export function showFailure(
  status: HTMLElement,
  err: unknown,
  login: 'discord' | 'links',
  section?: HTMLElement,
): void {
  const failure = sectionFailure(
    err instanceof RequestError ? err.status : undefined,
    login,
    section === undefined,
  );
  if (failure === null) {
    if (section !== undefined) section.hidden = true;
    return;
  }
  if (failure.login) {
    const link = document.createElement('a');
    link.href = tallyLoginHref(location.pathname);
    link.textContent = failure.text;
    status.replaceChildren(link);
  } else {
    status.textContent = failure.text;
  }
}
