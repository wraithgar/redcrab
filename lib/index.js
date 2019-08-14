'use strict';

const Sql = require('./sql');
const Fs = require('fs');
const Path = require('path');
const PG = require('pg-promise');
const YamlMigration = require('./yaml');

const internals = {};

internals.defaults = {
  advisory_lock: 72656463726162, //unique number for advisory locks
  schema_start: 10000, //first integer schema number to use
  table_name: 'redcrab_migrations', //sql table in which to store migrations
  template_directory: './templates', //schema template directory
  migration_directory: './migrations' //db migration files directory
};

class Redcrab {
  constructor(options) {
    this.options = Object.assign({}, internals.defaults, options);

    const { pg, connection, db } = this.options;
    if (!db) {
      const _pg = PG(pg);
      this.db = _pg(connection);
    } else {
      this.db = db;
    }
    this.ready = this.setup();
  }

  /*
   * Bootstrap the schema into the db
   */
  async setup() {
    const { migration_directory } = this.options;
    await this.db.tx(async t => {
      return t.batch([
        t.query(Sql.getTxLock, this.options),
        t.query(Sql.createTable, this.options)
      ]);
    });

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
    const inserts = [];
    this.file_migrations = filenames.reduce((acc, filename) => {
      if (filename.startsWith('.')) {
        return acc;
      }
      if (!order_regex.test(filename)) {
        throw new Error(
          `Migration filenames must begin with an integer. Invalid filename "${filename}"`
        );
      }
      let [order] = order_regex.exec(filename);
      order = Number(order);
      inserts.push(
        this.db.query(Sql.insertMigration, { order, filename, ...this.options })
      );
      acc[order] = filename;
      return acc;
    }, {});
    await Promise.all(inserts);
  }

  /*
   * Sync file migrations into the db
   * Basic migration validation (none missing, renamed)
   * Return migration metadata (not actual contents)
   */
  async getMigrations() {
    const db_migrations = await this.db.query(Sql.getMigrations, this.options);
    const forward = [];
    const backward = [];
    let next_order = 10000;

    //look for db entries that don't have files, or the filename changed
    for (const db_migration of db_migrations) {
      next_order = db_migration.id + 1;
      if (!this.file_migrations[db_migration.id]) {
        throw new Error(
          `Missing migration file "${db_migration.name}". Migrations db may be corrupt.`
        );
      }
      if (this.file_migrations[db_migration.id] !== db_migration.name) {
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
  async create(args) {
    await this.ready;

    const { name, type } = { type: 'yaml', name: 'migration', ...args };
    const { template_directory, migration_directory } = this.options;

    await new Promise((resolve, reject) => {
      Fs.stat(Path.join(template_directory, type), (err, stats) => {
        if (err) {
          return reject(err);
        }

        if (!stats.isFile()) {
          return reject(
            new Error(
              `"${type}" in "${template_directory}" is not a valid file`
            )
          );
        }
        return resolve();
      });
    });

    const { next_order } = await this.getMigrations();
    const filename = `${next_order}-${name}.${type}`;
    //Only create the file, it will be picked up next time we run
    return new Promise((resolve, reject) => {
      Fs.copyFile(
        Path.join(template_directory, type),
        Path.join(migration_directory, filename),
        err => {
          // Coverage disabled for now due to the overhead required to get this to throw
          // $lab:coverage:off$
          if (err) {
            return reject(err);
          }
          // $lab:coverage:on$
          return resolve(filename);
        }
      );
    });
  }

  async run({ migration, direction }) {
    let runner;
    const parts = Path.parse(migration.name);
    if (parts.ext !== '.yaml' && parts.ext !== '.js') {
      throw new Error(
        `Invalid migration file "${migration.name}", that file type is not supported`
      );
    }
    if (parts.ext === '.yaml') {
      runner = new YamlMigration({
        filename: migration.name,
        ...this.options
      });
    } else {
      runner = require(Path.resolve(
        this.options.migration_directory,
        migration.name
      ));
    }
    return this.db.tx(async t => {
      await runner[direction](t);
      if (direction === 'forward') {
        await t.query(Sql.markMigration, {
          id: migration.id,
          ...this.options
        });
      } else {
        await t.query(Sql.unmarkMigration, {
          id: migration.id,
          ...this.options
        });
      }
    });
  }

  //Migrate the db forward
  async forward() {
    await this.ready;

    await this.db.task(async t => {
      await t.query(Sql.getLock, this.options);

      try {
        const { forward } = await this.getMigrations();
        for (const migration of forward) {
          //These potentially run in a different connection
          await this.run({ migration, direction: 'forward' });
        }
      } catch (e) {
        await t.query(Sql.releaseLock, this.options);
        throw e;
      }

      await t.query(Sql.releaseLock, this.options);
    });
  }

  //Migrate the db backward
  async backward() {
    await this.ready;

    await this.db.task(async t => {
      await t.query(Sql.getLock, this.options);

      try {
        const { backward } = await this.getMigrations();
        const migration = backward.pop();
        if (migration) {
          await this.run({ migration, direction: 'backward' });
        }
      } catch (e) {
        await t.query(Sql.releaseLock, this.options);
        throw e;
      }
      await t.query(Sql.releaseLock, this.options);
    });
  }
}

module.exports = Redcrab;
