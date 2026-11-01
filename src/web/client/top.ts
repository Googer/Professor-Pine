import { LOGOUT_FAILED } from './logout.js';
import { topAddressWithoutLogin } from './top-address.js';
import { afterTopLogout, topLogout } from './top-logout.js';

/**
 * The script of the top page (plan 8M-14, `/assets/top.js`): on the pages for a visitor logged
 * out it takes `?login=failed` out of the address, said already (review BR-1, F4); on a page
 * logged in its Log out POSTs `/auth/logout` with the token of the button's `data-csrf`
 * (`X-Pine-CSRF`), then loads `/` anew, which shows the login; a failure is said in `#notice`,
 * as text.
 */

const address = topAddressWithoutLogin(location);
if (address !== undefined) history.replaceState(null, '', address);

const button = document.querySelector<HTMLButtonElement>('button.top-logout');
const notice = document.querySelector<HTMLElement>('#notice');

button?.addEventListener('click', () => {
  button.disabled = true;
  void topLogout(button.dataset.csrf ?? '', {
    post: (token) =>
      fetch('/auth/logout', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'x-pine-csrf': token },
      }).then((answer) => answer.status),
    // A redirect is not followed (an opaque answer, status 0): it says neither, and fails.
    page: async () => {
      const answer = await fetch('/', {
        credentials: 'same-origin',
        cache: 'no-store',
        redirect: 'manual',
      });
      return { status: answer.status, html: answer.status === 200 ? await answer.text() : '' };
    },
  }).then((result) => {
    if (afterTopLogout(result) === 'load') {
      location.assign('/');
      return;
    }
    button.disabled = false;
    if (notice) {
      notice.textContent = LOGOUT_FAILED;
      notice.hidden = false;
    }
  });
});
