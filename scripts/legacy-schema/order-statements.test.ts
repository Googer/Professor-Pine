import { describe, expect, it } from 'vitest';
import { orderCreateStatements } from './order-statements.js';

const DUMP = `
/*!40101 SET @saved_cs_client = @@character_set_client */;
CREATE TABLE \`Alias\` (
  \`id\` int unsigned NOT NULL AUTO_INCREMENT,
  \`roleId\` int unsigned DEFAULT NULL,
  PRIMARY KEY (\`id\`),
  CONSTRAINT \`alias_roleid_foreign\` FOREIGN KEY (\`roleId\`) REFERENCES \`Role\` (\`id\`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4;
/*!40101 SET character_set_client = @saved_cs_client */;
CREATE TABLE \`Guild\` (
  \`id\` int unsigned NOT NULL AUTO_INCREMENT,
  PRIMARY KEY (\`id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE \`knex_migrations\` (
  \`id\` int unsigned NOT NULL AUTO_INCREMENT,
  PRIMARY KEY (\`id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE \`Role\` (
  \`id\` int unsigned NOT NULL AUTO_INCREMENT,
  \`guildId\` int unsigned DEFAULT NULL,
  PRIMARY KEY (\`id\`),
  CONSTRAINT \`role_guildid_foreign\` FOREIGN KEY (\`guildId\`) REFERENCES \`Guild\` (\`id\`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`;

const tableOf = (statement: string) => /CREATE TABLE `([^`]+)`/.exec(statement)?.[1];

describe('orderCreateStatements', () => {
  it('keeps only CREATE TABLE statements and drops knex bookkeeping tables', () => {
    expect(orderCreateStatements(DUMP).map(tableOf).sort()).toEqual(['Alias', 'Guild', 'Role']);
  });

  it('puts referenced tables first', () => {
    expect(orderCreateStatements(DUMP).map(tableOf)).toEqual(['Guild', 'Role', 'Alias']);
  });

  it('strips AUTO_INCREMENT counters', () => {
    expect(orderCreateStatements(DUMP).join('\n')).not.toMatch(/AUTO_INCREMENT=\d/);
  });

  it('rejects a foreign-key cycle', () => {
    const cyclic = `CREATE TABLE \`A\` (x int, CONSTRAINT f FOREIGN KEY (x) REFERENCES \`B\` (id)) ENGINE=InnoDB;
CREATE TABLE \`B\` (x int, CONSTRAINT g FOREIGN KEY (x) REFERENCES \`A\` (id)) ENGINE=InnoDB;`;
    expect(() => orderCreateStatements(cyclic)).toThrow(/cycle/);
  });
});
