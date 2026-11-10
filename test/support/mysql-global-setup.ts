import { MySqlContainer } from '@testcontainers/mysql';
import type { TestProject } from 'vitest/node';
import { MYSQL_IMAGE } from './mysql.js';

/** One MySQL server for a whole run of the db project; `startDatabase` makes a database in it. */
export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  const container = await new MySqlContainer(MYSQL_IMAGE).withRootPassword('root').start();
  project.provide('sharedMysql', {
    host: container.getHost(),
    port: container.getPort(),
    adminUser: 'root',
    adminPassword: 'root',
  });
  return async () => {
    await container.stop();
  };
}
