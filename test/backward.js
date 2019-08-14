'use strict';

const Redcrab = require('../');
const Fixtures = require('./fixtures');
const Fs = require('fs');
const Path = require('path');

const lab = (exports.lab = require('@hapi/lab').script());
const { expect } = require('@hapi/code');
const { it, describe, beforeEach, after } = lab;
const { db, table_name } = Fixtures;

const defaults = { db, table_name };

describe('backward', () => {
  beforeEach(async () => {
    //Clean things up in case we exploded last time tests ran
    await Promise.all([Fixtures.reset_db(), Fixtures.reset_migrations()]);
  });

  after(async () => {
    //Clean things up normally
    await Promise.all([Fixtures.reset_db(), Fixtures.reset_migrations()]);
  });

  it('migrates backward', async () => {
    const r = new Redcrab({ ...defaults });
    await r.forward();
    await r.backward();
    const rows_exist = await db.query('select * from ${table_name#}', {
      table_name: 'foo'
    });
    expect(rows_exist.length).to.equal(0);
    const { migrations } = await r.getMigrations();
    for (const migration of migrations) {
      if (migration.id < 10003) {
        expect(migration.migrated_at).to.exist();
      } else {
        expect(migration.migrated_at).to.not.exist();
      }
    }
  });

  it('migrates all the way back, then one more', async () => {
    const r = new Redcrab({ ...defaults });
    await r.forward();
    await r.backward(); //10003
    await r.backward(); //10002
    await r.backward(); //10001
    await r.backward(); //10000
    await r.backward(); //Nothing left, should not error
    const table_exists = await db.query(
      'select * from information_schema.tables where table_name=${table_name}',
      { table_name: 'foo' }
    );
    expect(table_exists.length).to.equal(0);
    const { migrations } = await r.getMigrations();
    for (const migration of migrations) {
      expect(migration.migrated_at).to.not.exist();
    }
  });

  it('invalid backward migration', { plan: 2 }, async () => {
    await new Promise((resolve, reject) => {
      Fs.writeFile(
        Path.join('./migrations', '10004_bad_migration.yaml'),
        'backward: this is not valid sql',
        'utf8',
        err => {
          if (err) {
            return reject(err);
          }
          return resolve();
        }
      );
    });
    const r = new Redcrab({ ...defaults });
    await r.forward();
    await r.backward().catch(e => {
      expect(e).to.exist();
      expect(e.message).to.include('syntax error');
    });
  });
});
