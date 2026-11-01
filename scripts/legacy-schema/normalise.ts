/** Every knex_migrations row in the fixture gets this time, so re-running the generator is a no-op. */
export const FIXED_MIGRATION_TIME = '2022-10-14 00:00:00';

const TIMESTAMP_LITERAL = /'\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}'/g;

/** Replaces the wall-clock times mysqldump wrote for knex_migrations.migration_time. */
export function normaliseMigrationTimes(sql: string): string {
  return sql.replace(TIMESTAMP_LITERAL, `'${FIXED_MIGRATION_TIME}'`);
}
