import { describe, expect, it } from 'vitest';
import { FIXED_MIGRATION_TIME, normaliseMigrationTimes } from './normalise.js';

describe('normaliseMigrationTimes', () => {
  it('replaces every timestamp literal with the fixed one', () => {
    const dump =
      "INSERT INTO `knex_migrations` VALUES (1,'20180101-a.js',1,'2026-10-10 11:33:07'),(2,'20180102-b.js',1,'2026-10-10 11:33:08');";
    expect(normaliseMigrationTimes(dump)).toBe(
      `INSERT INTO \`knex_migrations\` VALUES (1,'20180101-a.js',1,'${FIXED_MIGRATION_TIME}'),(2,'20180102-b.js',1,'${FIXED_MIGRATION_TIME}');`,
    );
  });

  it('leaves migration names and other strings alone', () => {
    const dump = "INSERT INTO `knex_migrations` VALUES (1,'20221014-pokemon-elite.js',9,NULL);";
    expect(normaliseMigrationTimes(dump)).toBe(dump);
  });
});
