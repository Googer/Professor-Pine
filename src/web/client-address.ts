import { BlockList, isIP } from 'node:net';

/** This machine, private networks and link-local addresses: where a trusted proxy may be. */
const NEARBY = new BlockList();
NEARBY.addSubnet('127.0.0.0', 8, 'ipv4');
NEARBY.addSubnet('10.0.0.0', 8, 'ipv4');
NEARBY.addSubnet('172.16.0.0', 12, 'ipv4');
NEARBY.addSubnet('192.168.0.0', 16, 'ipv4');
NEARBY.addSubnet('169.254.0.0', 16, 'ipv4');
NEARBY.addAddress('::1', 'ipv6');
NEARBY.addSubnet('fc00::', 7, 'ipv6');
NEARBY.addSubnet('fe80::', 10, 'ipv6');

/** An IPv4 address written as IPv6 (`::ffff:127.0.0.1`), as Node gives a dual-stack peer. */
const MAPPED = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i;

/**
 * Whether a peer may be a proxy whose forwarding headers are believed (`settings.web.trustProxy`,
 * spec 2.1): loopback, RFC 1918, fc00::/7 and link-local addresses. Anything on the internet,
 * and anything that is no address, is not.
 */
export function isNearbyPeer(address: string): boolean {
  const mapped = MAPPED.exec(address)?.[1];
  const plain = mapped ?? address;
  const family = isIP(plain);
  if (family === 4) return NEARBY.check(plain, 'ipv4');
  if (family === 6) return NEARBY.check(plain, 'ipv6');
  return false;
}

/** The first four groups of an IPv6 address (its /64), as numbers; it is an IPv6 address. */
function firstGroups(address: string): number[] {
  let text = address.split('%')[0] ?? '';
  // An IPv4 tail (`64:ff9b::198.51.100.1`) is the last two groups.
  const tail = /(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(text);
  if (tail) {
    const [a, b, c, d] = tail.slice(1).map(Number) as [number, number, number, number];
    text = `${text.slice(0, tail.index)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const [head = '', rest] = text.split('::');
  const before = head === '' ? [] : head.split(':');
  const after = rest === undefined || rest === '' ? [] : rest.split(':');
  const zeros = rest === undefined ? [] : Array<string>(8 - before.length - after.length).fill('0');
  return [...before, ...zeros, ...after].slice(0, 4).map((group) => parseInt(group, 16));
}

/**
 * What a client is counted as by the rate limits, from its address (Fastify's `request.ip`:
 * the peer's, or with `trustProxy` the last address of `X-Forwarded-For` that no nearby proxy
 * added): IPv4, also written as IPv6, by the address; IPv6 by its /64, which one home or one
 * machine has whole, so that a client cannot get a fresh count by changing its address. What
 * is no address is kept as it is.
 */
export function addressBucket(address: string): string {
  const mapped = MAPPED.exec(address)?.[1];
  if (mapped !== undefined) return mapped;
  if (isIP(address) !== 6) return address;
  return `${firstGroups(address)
    .map((group) => group.toString(16))
    .join(':')}::/64`;
}
