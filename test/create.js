'use strict';

const Redcrab = require('../');
const Fixtures = require('./fixtures');
const Fs = require('fs');
const Path = require('path');

const lab = (exports.lab = require('lab').script());
const { expect } = require('code');
const { it, describe, beforeEach, before, after } = lab;
const { db, table_name } = Fixtures;

const defaults = { db, table_name };

describe('create', () => {
  beforeEach(async () => {
    //Clean things up in case we exploded last time tests ran
    await Promise.all([
      Fixtures.reset_db(),
      Fixtures.reset_migrations('./migrations')
    ]);
  });

  after(async () => {
    //Clean things up normally
    await Promise.all([
      Fixtures.reset_db(),
      Fixtures.reset_migrations('./migrations')
    ]);
  });

  it('migration is created with defaults', async () => {
    const r = new Redcrab(defaults);
    const migration = await r.create();
    expect(migration).to.exist();
    expect(migration).to.startWith('10004');
    expect(migration).to.endWith('.yaml');
    const file = await Fixtures.migration_exists(migration);
    expect(file).to.exist();
  });

  it('js migration is created', async () => {
    const r = new Redcrab(defaults);
    const migration = await r.create({ type: 'js' });
    expect(migration).to.exist();
    expect(migration).to.startWith('10004');
    expect(migration).to.endWith('.js');
    const file = await Fixtures.migration_exists(migration);
    expect(file).to.exist();
  });

  it('named migration', async () => {
    const r = new Redcrab(defaults);
    const migration = await r.create({ name: 'test-migration' });
    expect(migration).to.exist();
    expect(migration).to.startWith('10004');
    expect(migration).to.include('test-migration');
    expect(migration).to.endWith('.yaml');
    const file = await Fixtures.migration_exists(migration);
    expect(file).to.exist();
  });

  it('invalid template directory', { plan: 2 }, async () => {
    const r = new Redcrab({ ...defaults, template_directory: 'nonexistant' });
    await r.create({ name: 'test-migration' }).catch(err => {
      expect(err).to.exist();
      expect(err.message).to.include('no such file or directory');
    });
  });

  it('invalid template type', { plan: 2 }, async () => {
    const r = new Redcrab(defaults);
    await r.create({ type: 'nonexistant' }).catch(err => {
      expect(err).to.exist();
      expect(err.message).to.include('no such file or directory');
    });
  });

  describe('template is not a file', () => {
    before(async () => {
      await new Promise((resolve, reject) => {
        Fs.mkdir(Path.join('./templates', 'directory'), err => {
          if (err) {
            return reject(err);
          }
          return resolve();
        });
      });
    });

    after(async () => {
      await new Promise((resolve, reject) => {
        Fs.rmdir(Path.join('./templates', 'directory'), err => {
          if (err) {
            return reject(err);
          }
          return resolve();
        });
      });
    });

    it('errors', { plan: 2 }, async () => {
      const r = new Redcrab(defaults);
      await r.create({ type: 'directory' }).catch(err => {
        expect(err).to.exist();
        expect(err.message).to.include('not a valid file');
      });
    });
  });
});
