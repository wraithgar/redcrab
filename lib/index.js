'use strict';

const Sql = require('./sql');
const Fs = require('fs');
const Path = require('path');
const PG = require('pg-promise');
const YamlMigration = require('./yaml');

const internals = {};

internals.defaults = {
  schema_start: 10000, //first integer schema number to use
  order_schema: 'integer', //integer or timestamp
  table_name: 'redcrab_migrations', //sql table in which to store migrations
  lock_table_name: 'redcrab_migrations_lock', //sql table in which to store db lock for migrations
  template_directory: './templates', //schema template directory
  migration_directory: './migrations' //db migration files directory
};

class Redcrab {
  constructor(options) {
    this.options = Object.assign({}, internals.defaults, options);

    const { pg, connection } = this.options;
    this._pg = PG(pg);
    this.db = this._pg(connection);
    this.ready = this.setup();
  }

  /*
   * Bootstrap the schema into the db
   * Concurrency is not an issue on these queries
   */
  async setup() {
    const { migration_directory } = this.options;
    await this.db.query(Sql.createTable, this.options);

    //Import migration files and insert new ones into the db
    const filenames = await new Promise((resolve, reject) => {
      Fs.readdir(migration_directory, (err, result) => {
        if (err) {
          return reject(err);
        }
        return resolve(result);
      });
    });
    const order_regex = /^[0-9]+/;
    //console.log(filenames);
    const inserts = [];
    this.file_migrations = filenames.reduce((acc, filename) => {
      if (!order_regex.test(filename)) {
        throw new Error(
          `Migration filenames must begin with an integer. Invalid filename "${filename}"`
        );
      }
      let [order] = order_regex.exec(filename);
      order = Number(order);
      inserts.push(this.db.query(Sql.insertMigration, { order, filename, ...this.options }));
      acc[order] = filename;
      return acc;
    }, {});
    await Promise.all(inserts);
  }

  /*
   * Attempt to get the lock from the db
   * Returns the lock if we got it
   */
  async getLock() {
    const [lock] = await this.db.query(Sql.getLock, this.options);
    return lock;
  };

  /*
   * Attempt to release the lock from the db
   * Returns the lock if we released it
   */
  async releaseLock() {
    const [lock] = await this.db.query(Sql.releaseLock, this.options);
    return lock;
  }

  /*
   * Sync file migrations into the db
   * Basic migration validation (none missing, renamed)
   * Return migration metadata (not actual contents)
   */
  async getMigrations() {
    const { migration_directory, table_name } = this.options;
    const db_migrations = await this.db.query(Sql.getMigrations, this.options);
    const forward = [];
    const backward = [];
    let next_order;

    //console.log(this.file_migrations);
    //look for db entries that don't have files, or the filename changed
    for (const db_migration of db_migrations) {
      next_order = db_migration.id + 1;
      if (!this.file_migrations[db_migration.id]) {
        await this.releaseLock();
        throw new Error(
          `Missing migration file "${
            db_migration.name
          }". Migrations db may be corrupt.`
        );
      }
      if (this.file_migrations[db_migration.id] !== db_migration.name) {
        await this.releaseLock();
        throw new Error(
          `Migration #${db_migration.id} has incorrect filename. Expected "${
            db_migration.name
          }" but found ${
            this.file_migrations[db_migration.id]
          }". Migrations db may be corrupt.`
        );
      }
      if (db_migration.migrated_at) {
        backward.push(db_migration);
      } else {
        forward.push(db_migration);
      }
    }

    return { migrations: db_migrations, forward, backward, next_order };
  }

  /*
   * Create a new migrations file
   */
  async create(name, type) {
    await this.ready;

    const { template_directory, migration_directory } = this.options;

    if (!type) {
      type = 'yaml';
    }
    if (!name) {
      name = 'migration';
    }
    await new Promise((resolve, reject) => {
      Fs.stat(Path.join(template_directory, type), (err, stats) => {
        if (err) {
          return reject(err);
        }

        if (!stats.isFile()) {
          return reject(
            `"${type}" in "${template_directory}" is not a valid file`
          );
        }
        return resolve();
      });
    });

    let id = 10000;
    const { migrations, next_order } = await this.getMigrations();
    if (next_order) {
      id = next_order;
    }
    const filename = `${id}-${name}.${type}`;
    //Only create the file, it will be picked up next time we run
    return new Promise((resolve, reject) => {
      Fs.copyFile(
        Path.join(template_directory, type),
        Path.join(migration_directory, filename),
        err => {
          if (err) {
            return reject(err);
          }
          return resolve(filename);
        }
      );
    });
  }

  async run({ migration, direction }) {
    let runner;
    const parts = Path.parse(migration.name);
    if (parts.ext !== '.yaml' && parts.ext !== '.js') {
      await this.releaseLock();
      throw new Error(`Invalid migration file "${migration.name}", that file type is not supported`);
    }
    if (parts.ext === '.yaml') {
      try {
        runner = new YamlMigration({ filename: migration.name, ...this.options })
      } catch (e) {
        await this.releaseLock();
        throw e;
      }
    }
    else {
      if (this.options.migration_directory.startsWith('/')) {
        runner = require(Path.join(this.options.migration_directory, migration.name));
      } else {
        runner = require(Path.join(Path.dirname(require.main.filename), this.options.migration_directory, migration.name));
      }

    }
    return this.db.tx(async (t) => {
      try {
        await runner[direction](t)
        if (direction === 'forward') {
          await t.query(Sql.markMigration, { id: migration.id, ...this.options });
        } else {
          await t.query(Sql.unmarkMigration, { id: migration.id, ...this.options });
        }
      } catch (e) {
        await this.releaseLock();
        throw e;
      };
    });
  }

  //Migrate the db forward
  async forward() {
    await this.ready;

    const lock = await this.getLock();
    if (!lock) {
      //We return an error in case the calling code cares
      return new Error('Could not acquire db lock');
    }

    const { migrations, forward } = await this.getMigrations();
    for (const migration of forward){
      try {
        await this.run({ migration, direction: 'forward' });
      } catch (e) {
        await this.releaseLock();
        throw e
      }

    }

    await this.releaseLock();
  }

  //Migrate the db backward
  async backward() {
    await this.ready;

    const lock = await this.getLock();
    if (!lock) {
      //We return an error in case the calling code cares
      return new Error('Could not acquire db lock');
    }
    const { migrations, backward } = await this.getMigrations();
    const migration = backward.pop();
    if (migration) {
      await this.run({ migration, direction: 'backward' });
    }
    await this.releaseLock();
  }
}

module.exports = Redcrab;
