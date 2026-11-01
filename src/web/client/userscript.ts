import {
  answerWords,
  bodyOf,
  keepDone,
  NOT_THROUGH,
  pressed,
  takeDone,
  type ButtonData,
} from './tool-actions.js';

/**
 * The script of the page `/userscript` (plan 8W-P): its buttons POST to the page with the CSRF
 * token of `<body data-csrf>` (`X-Pine-CSRF`), a button that asks a second press ("Make a new
 * link", "Revoke") first shows its `data-confirm` words, and a done answer loads the page anew,
 * which shows the state as it is now and says the answer's words in `#notice` once (kept in the
 * tab's `sessionStorage` across the reload); anything else is said in `#notice` at once. Log out
 * POSTs `/auth/logout` and loads the page anew. Everything is set as text.
 */

const notice = document.querySelector<HTMLElement>('#notice');
const csrf = document.body.dataset.csrf ?? '';
const tabStorage = () => window.sessionStorage;

function say(text: string): void {
  if (!notice) return;
  notice.textContent = text;
  notice.hidden = false;
}

// The words of the press that loaded this page anew, once.
const done = takeDone(tabStorage);
if (done) say(done);

async function send(url: string, body: unknown): Promise<{ status: number; json: unknown }> {
  const answer = await fetch(url, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json', 'x-pine-csrf': csrf },
    body: JSON.stringify(body),
  });
  let json: unknown;
  try {
    json = await answer.json();
  } catch {
    json = undefined;
  }
  return { status: answer.status, json };
}

async function logOut(): Promise<void> {
  try {
    const answer = await fetch('/auth/logout', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'x-pine-csrf': csrf },
    });
    if (answer.ok) {
      location.reload();
      return;
    }
  } catch {
    // Said below.
  }
  say('Log out failed; try again.');
}

async function press(button: HTMLButtonElement): Promise<void> {
  const data = button.dataset as ButtonData;
  if (data.action === 'logout') {
    await logOut();
    return;
  }
  if (pressed(data) === 'arm') {
    button.dataset.armed = 'yes';
    button.textContent = data.confirm ?? '';
    return;
  }
  const community = document.querySelector<HTMLInputElement>('#community')?.value ?? '';
  const made = bodyOf(data, community);
  if (!made) return;
  if ('refused' in made) {
    say(made.refused);
    return;
  }
  button.disabled = true;
  try {
    const { status, json } = await send('/userscript', made.body);
    const words = answerWords(status, json);
    if (words.done) {
      keepDone(tabStorage, words.text);
      location.reload();
      return;
    }
    say(words.text);
  } catch {
    say(NOT_THROUGH);
  }
  button.disabled = false;
}

document.addEventListener('click', (event) => {
  const target = event.target instanceof Element ? event.target : null;
  const button = target?.closest<HTMLButtonElement>('button[data-action]');
  if (!button) return;
  event.preventDefault();
  void press(button);
});

// Enter in the community line asks, as its button does.
document.querySelector<HTMLFormElement>('#ask')?.addEventListener('submit', (event) => {
  event.preventDefault();
  document.querySelector<HTMLButtonElement>('button[data-action="ask"]')?.click();
});
