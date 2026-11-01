import { sql, type RawBuilder } from 'kysely';

const SNOWFLAKE = /^\d{15,20}$/;

export function isSnowflake(id: string): boolean {
  return SNOWFLAKE.test(id);
}

/**
 * A snowflake for comparison with a BIGINT column. The cast makes the comparison explicit and
 * exact, and it checks the text first so nothing but digits reaches the query. The real hazard is
 * comparing a BIGINT snowflake column with a VARCHAR column or a JavaScript number: MySQL turns
 * those into doubles, and a 19-digit ID loses its last digits.
 */
export function snowflakeParam(id: string): RawBuilder<string> {
  if (!isSnowflake(id)) throw new Error(`Not a Discord snowflake: ${JSON.stringify(id)}`);
  return sql<string>`cast(${id} as unsigned)`;
}
