import { sql, type Kysely } from 'kysely';
import type { StoredAddress, WayspotAddressStorage } from '../../services/wayspot-addresses.js';
import type { DB } from '../types.js';

/**
 * The addresses Google gave for Power Spots the map asked about (`WayspotAddress`, migration
 * 035; design `2026-11-04-power-spot-address-design.md`). Its twin is `MemoryWayspotAddresses`;
 * both run `wayspotAddressCases`.
 */
export class WayspotAddressRepository implements WayspotAddressStorage {
  constructor(private readonly db: Kysely<DB>) {}

  async all(): Promise<StoredAddress[]> {
    const rows = await this.db
      .selectFrom('WayspotAddress')
      .select(['wayspotId', 'lat', 'lon', 'geodata', 'askedAt'])
      .execute();
    return rows.map((row) => ({
      wayspotId: row.wayspotId,
      lat: row.lat,
      lon: row.lon,
      geodata: row.geodata,
      askedAt: Number(row.askedAt),
    }));
  }

  async save(row: StoredAddress): Promise<void> {
    await this.db
      .insertInto('WayspotAddress')
      .values({ ...row, askedAt: String(row.askedAt) })
      .modifyEnd(
        sql`as new on duplicate key update lat = new.lat, lon = new.lon, geodata = new.geodata,
            askedAt = new.askedAt`,
      )
      .execute();
  }
}
