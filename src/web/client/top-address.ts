import { loginNotice } from './notice.js';

/**
 * The top page's address without `?login=failed` (review BR-1 of plan 8M-14, F4), for
 * `history.replaceState`, as the map takes `?login=` out (`loginNotice`): the page has said it
 * already, and a reload or a shared address should not say it again. Undefined when the address
 * carries no such query.
 */
export function topAddressWithoutLogin(location: {
  pathname: string;
  search: string;
  hash: string;
}): string | undefined {
  const notice = loginNotice(location.search);
  return notice && `${location.pathname}${notice.search}${location.hash}`;
}
