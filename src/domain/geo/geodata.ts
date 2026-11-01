/**
 * The address parts the gym search looks at, as the legacy bot chose them from Google's
 * geocoding result. Other parts (country, county, street number) say nothing about one gym.
 */
export const ADDRESS_PARTS = [
  'intersection',
  'route',
  'neighborhood',
  'colloquial_area',
  'locality',
  'premise',
  'natural_feature',
  'postal_code',
  'bus_station',
  'establishment',
  'point_of_interest',
  'transit_station',
] as const;

function textOf(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(textOf).join(' ');
  return '';
}

/**
 * The searchable address words of a gym's stored geocoding result (`GymMeta.geodata`, a JSON
 * string holding `{ addressComponents: { route: 'Forbes Avenue', … } }`). Text that is missing,
 * is not JSON or has another shape gives an empty string: such a gym is found by its name only.
 */
export function addressText(geodata: string | null): string {
  if (!geodata) return '';
  let parsed: unknown;
  try {
    parsed = JSON.parse(geodata);
  } catch {
    return '';
  }
  if (typeof parsed !== 'object' || parsed === null) return '';
  const components = (parsed as { addressComponents?: unknown }).addressComponents;
  if (typeof components !== 'object' || components === null) return '';
  const parts = components as Record<string, unknown>;
  return ADDRESS_PARTS.map((part) => textOf(parts[part]))
    .filter((text) => text !== '')
    .join(' ');
}
