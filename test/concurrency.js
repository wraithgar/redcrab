'use strict';

const Redcrab = require('../');
const Fixtures = require('./fixtures');

const lab = (exports.lab = require('@hapi/lab').script());
const { expect } = require('@hapi/code');
const { it, describe, beforeEach, after } = lab;
const { db, table_name } = Fixtures;

const defaults = { db, table_name };

describe('concurrency', () => {
  beforeEach(async () => {
    //Clean things up in case we exploded last time tests ran
    await Promise.all([Fixtures.reset_db(), Fixtures.reset_migrations()]);
  });

  after(async () => {
    //Clean things up normally
    await Promise.all([Fixtures.reset_db(), Fixtures.reset_migrations()]);
  });

  it(
    "multiple instances don't collide with each other's setup",
    { plan: 5 },
    async () => {
      const redcrabs = [
        new Redcrab(defaults),
        new Redcrab(defaults),
        new Redcrab(defaults),
        new Redcrab(defaults),
        new Redcrab(defaults)
      ];
      for (const r of redcrabs) {
        await r.ready;
        expect(r).to.be.an.instanceof(Redcrab);
      }
    }
  );

  it("multiple instances don't collide with each other's forwards/backwards", async () => {
    const redcrabs = [
      new Redcrab(defaults),
      new Redcrab(defaults),
      new Redcrab(defaults),
      new Redcrab(defaults),
      new Redcrab(defaults)
    ];
    for (let x = 1; x < 20; x++) {
      const promises = [];
      for (const r of redcrabs) {
        if (Math.random() * 3 > 1) {
          promises.push(r.backward());
        } else {
          promises.push(r.forward());
        }
      }
      await Promise.all(promises);
    }
    expect(true).to.exist(); //We just have to get here.
  });
});
