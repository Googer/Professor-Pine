import { DummyDriver, Kysely, MysqlAdapter, MysqlIntrospector, MysqlQueryCompiler } from 'kysely';
import { describe, expect, it } from 'vitest';
import { isSnowflake, snowflakeParam } from './snowflake.js';
import type { DB } from './types.js';

describe('snowflakes', () => {
  it('recognises Discord IDs', () => {
    expect(isSnowflake('1234567890123456789')).toBe(true);
    expect(isSnowflake('123456789012345678')).toBe(true);
    expect(isSnowflake('12345')).toBe(false);
    expect(isSnowflake('1234567890123456789; drop table Region')).toBe(false);
    expect(isSnowflake('')).toBe(false);
  });

  it('refuses to build a parameter from anything else', () => {
    expect(() => snowflakeParam('not-an-id')).toThrow(/snowflake/);
    expect(() => snowflakeParam('1234567890123456789')).not.toThrow();
  });

  it('compiles to an explicit cast with the ID as a string parameter', () => {
    const db = new Kysely<DB>({
      dialect: {
        createAdapter: () => new MysqlAdapter(),
        createDriver: () => new DummyDriver(),
        createIntrospector: (kysely) => new MysqlIntrospector(kysely),
        createQueryCompiler: () => new MysqlQueryCompiler(),
      },
    });
    const compiled = db
      .selectFrom('Region')
      .select('id')
      .where('channelId', '=', snowflakeParam('1234567890123456789'))
      .compile();
    expect(compiled.sql).toContain('cast(? as unsigned)');
    expect(compiled.parameters).toEqual(['1234567890123456789']);
  });
});
