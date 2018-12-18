'use strict';

exports.createTable = `
 CREATE TABLE IF NOT EXISTS \${lock_table_name#} (
  id integer PRIMARY KEY,
  locked boolean not null default false
 );

 CREATE TABLE IF NOT EXISTS \${table_name#} (
  id integer NOT NULL PRIMARY KEY,
  name text,
  migrated_at timestamp with time zone
 );

 INSERT INTO \${lock_table_name#} (id) values (1) ON CONFLICT(id) DO NOTHING;
`;

exports.insertMigration =
  'INSERT INTO ${table_name#} (id, name) values (${order}, ${filename}) ON CONFLICT (id) DO NOTHING';

exports.getMigrations =
  'SELECT id, name, migrated_at from ${table_name#} ORDER BY id';

exports.getLock =
  'UPDATE ${lock_table_name#} SET locked=true WHERE locked=false RETURNING *';

exports.releaseLock =
  'UPDATE ${lock_table_name#} SET locked=false WHERE locked=true RETURNING *';

exports.markMigration =
  'UPDATE ${table_name#} SET migrated_at=NOW() WHERE id=${id} RETURNING *';

exports.unmarkMigration =
  'UPDATE ${table_name#} SET migrated_at=NULL WHERE id=${id} RETURNING *';
