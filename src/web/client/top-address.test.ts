import { describe, expect, it } from 'vitest';
import { topAddressWithoutLogin } from './top-address.js';

describe('topAddressWithoutLogin', () => {
  it('takes `?login=failed` out of the address, keeping the rest', () => {
    expect(topAddressWithoutLogin({ pathname: '/', search: '?login=failed', hash: '' })).toBe('/');
    expect(
      topAddressWithoutLogin({ pathname: '/', search: '?x=1&login=failed', hash: '#top' }),
    ).toBe('/?x=1#top');
  });

  it('leaves an address without a login query alone', () => {
    expect(topAddressWithoutLogin({ pathname: '/', search: '', hash: '' })).toBeUndefined();
    expect(topAddressWithoutLogin({ pathname: '/', search: '?x=1', hash: '' })).toBeUndefined();
    // Not a value the server sets: nothing it would have said.
    expect(
      topAddressWithoutLogin({ pathname: '/', search: '?login=other', hash: '' }),
    ).toBeUndefined();
  });
});
