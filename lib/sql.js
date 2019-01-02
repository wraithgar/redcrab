'use strict';

exports.createTable = `
 CREATE TABLE IF NOT EXISTS \${table_name#} (
  id integer NOT NULL PRIMARY KEY,
  name text,
  migrated_at timestamp with time zone
 );
`;

exports.insertMigration =
  'INSERT INTO ${table_name#} (id, name) values (${order}, ${filename}) ON CONFLICT (id) DO NOTHING RETURNING *';

exports.getMigrations =
  'SELECT id, name, migrated_at from ${table_name#} ORDER BY id';

exports.getTxLock = 'SELECT pg_advisory_xact_lock(${advisory_lock})';

exports.getLock = 'SELECT pg_advisory_lock(${advisory_lock})';

exports.releaseLock = 'SELECT pg_advisory_unlock(${advisory_lock})';

exports.markMigration =
  'UPDATE ${table_name#} SET migrated_at=NOW() WHERE id=${id} RETURNING *';

exports.unmarkMigration =
  'UPDATE ${table_name#} SET migrated_at=NULL WHERE id=${id} RETURNING *';
