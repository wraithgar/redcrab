'use strict';

const Redcrab = require('../');
const Fixtures = require('./fixtures');
const Sql = require('../lib/sql');
const Fs = require('fs');
const Path = require('path');

const lab = (exports.lab = require('@hapi/lab').script());
const { expect } = require('@hapi/code');
const { it, describe, beforeEach, after } = lab;
const { db, table_name } = Fixtures;

const defaults = { db, table_name };

describe('constructor', () => {
  beforeEach(async () => {
    //Clean things up in case we exploded last time tests ran
    await Promise.all([Fixtures.reset_db(), Fixtures.reset_migrations()]);
  });

  after(async () => {
    //Clean things up normally
    await Promise.all([Fixtures.reset_db(), Fixtures.reset_migrations()]);
  });

  it('migration dotfile exists', async () => {
    //This file's existince is a test in and of itself, files like this should be ignored
    const filename = await Fixtures.migration_exists('.dotfile');
    expect(filename).to.exist();
  });

  it('instance created, and is ready', async () => {
    const r = new Redcrab(defaults);
    await r.ready;
    expect(r).to.exist();
    expect(r).to.be.an.instanceof(Redcrab);
  });

  it('connection failure', { plan: 1 }, () => {
    const r = new Redcrab({
      connection: {
        database: 'should_not_exist',
        username: 'mudcrab_fail',
        password: 'nope'
      }
    });
    return r.ready.catch(e => {
      expect(e).to.exist();
    });
  });

  it('throws on invalid migration directory', { plan: 1 }, () => {
    const r = new Redcrab({ ...defaults, migration_directory: 'nonexistant' });
    return r.ready.catch(e => {
      expect(e.message).to.include('ENOENT');
    });
  });

  it('invalid migration filename throws exception', { plan: 2 }, async () => {
    await new Promise((resolve, reject) => {
      Fs.writeFile(
        Path.join('./migrations', 'no_number_filename.yaml'),
        'description: no number in filename',
        'utf8',
        err => {
          if (err) {
            return reject(err);
          }
          return resolve();
        }
      );
    });
    const r = new Redcrab(defaults);
    return r.ready.catch(e => {
      expect(e).to.exist();
      expect(e.message).to.include('Invalid filename');
    });
  });

  it('migration in db but not on filesystem', async () => {
    const r = new Redcrab(defaults);
    await r.ready;
    await db.query(Sql.insertMigration, {
      table_name,
      order: 10004,
      filename: '10004_does_not_exist'
    });
    await r.create().catch(err => {
      expect(err).to.exist();
      expect(err.message).to.include('Missing migration file');
    });
  });

  it('migration in db with wrong filename', async () => {
    const r = new Redcrab(defaults);
    await r.ready;
    await db.query(
      'UPDATE ${table_name#} set name = ${filename} where id = ${order}',
      { table_name, order: 10000, filename: '10000_wrong_filename' }
    );
    await r.create().catch(err => {
      expect(err).to.exist();
      expect(err.message).to.include('incorrect filename');
    });
  });
});
