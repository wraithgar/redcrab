'use strict';

const Redcrab = require('../');
const Fixtures = require('./fixtures');
const Fs = require('fs');
const Path = require('path');

const lab = (exports.lab = require('@hapi/lab').script());
const { expect } = require('@hapi/code');
const { it, describe, beforeEach, before, after } = lab;
const { db, table_name } = Fixtures;

const defaults = { db, table_name };

describe('forward', () => {
  beforeEach(async () => {
    //Clean things up in case we exploded last time tests ran
    await Promise.all([Fixtures.reset_db(), Fixtures.reset_migrations()]);
  });

  after(async () => {
    //Clean things up normally
    await Promise.all([Fixtures.reset_db(), Fixtures.reset_migrations()]);
  });

  it('migrates forward', async () => {
    const r = new Redcrab({ ...defaults });
    await r.forward();
    const table_exists = await db.query(
      'select * from information_schema.tables where table_name=${table_name}',
      { table_name: 'foo' }
    );
    expect(table_exists.length).to.equal(1);
    const columns_exist = await db.query(
      'select * from information_schema.columns where table_name=${table_name}',
      { table_name: 'foo' }
    );
    expect(columns_exist.length).to.equal(2);
    const rows_exist = await db.query('select * from ${table_name#}', {
      table_name: 'foo'
    });
    expect(rows_exist.length).to.equal(1);
    const { migrations } = await r.getMigrations();
    for (const migration of migrations) {
      expect(migration.migrated_at).to.exist();
    }
  });

  describe('invalid migration file', async () => {
    before(async () => {
      await new Promise((resolve, reject) => {
        Fs.writeFile(
          Path.join('./templates', 'txt'),
          'Test txt template',
          'utf8',
          err => {
            if (err) {
              return reject(err);
            }
            return resolve();
          }
        );
      });
    });

    after(async () => {
      await new Promise((resolve, reject) => {
        Fs.unlink(Path.join('./templates', 'txt'), err => {
          if (err) {
            return reject(err);
          }
          return resolve();
        });
      });
    });

    it('errors when migrating', { plan: 2 }, async () => {
      let r = new Redcrab({ ...defaults });
      await r.create({ type: 'txt' });
      r = new Redcrab({ ...defaults });
      await r.forward().catch(err => {
        expect(err).to.exist();
        expect(err.message).to.include('file type is not supported');
      });
    });
  });
});
