'use strict';

const PG = require('pg-promise');
const Fs = require('fs');
const Path = require('path');

//Coverage turned off because we don't iterate through any of the process.env stuff
/*$lab:coverage:off$*/
const table_name = process.env.REDCRAB_TEST_TABLE || 'redcrab_test';
exports.table_name = table_name;

const connection = process.env.REDCRAB_TEST_CONNECTION || {
  database: process.env.REDCRAB_TEST_DATABASE || 'redcrab_test',
  user: process.env.REDCRAB_TEST_USER || 'redcrab_test',
  password: process.env.REDCRAB_TEST_PASSWORD || 'redcrab_test'
};
exports.connection = connection;
/*$lab:coverage:on$*/

const migration_directory = './migrations';
const pg = PG({});
const db = pg(connection);
exports.db = db;

exports.reset_db = async () => {
  await db.task(t => {
    return t.batch([
      t.query('DROP TABLE IF EXISTS $1#', table_name),
      t.query('DROP TABLE IF EXISTS $1#', 'foo')
    ]);
  });
};

const migration_exists = async filename => {
  return new Promise((resolve, reject) => {
    Fs.stat(Path.join(migration_directory, filename), (err, stats) => {
      if (err) {
        return reject(err);
      }
      return resolve(stats);
    });
  });
};
exports.migration_exists = migration_exists;

const remove_file = async filename => {
  return new Promise((resolve, reject) => {
    return Fs.unlink(filename, err => {
      if (err) {
        return reject(err);
      }
      return resolve();
    });
  });
};
exports.remove_file = remove_file;

exports.reset_migrations = async () => {
  await new Promise((resolve, reject) => {
    Fs.readdir(migration_directory, (err, result) => {
      if (err) {
        return reject(err);
      }
      return resolve(result);
    });
  }).then(async filenames => {
    const order_regex = /^[0-9]+/;
    for (const filename of filenames) {
      if (filename === '.dotfile') {
        continue;
      }
      if (!order_regex.test(filename)) {
        await remove_file(Path.join(migration_directory, filename));
        continue;
      }
      let [order] = order_regex.exec(filename);
      if (order > 10003) {
        await remove_file(Path.join(migration_directory, filename));
      }
    }
  });
};
