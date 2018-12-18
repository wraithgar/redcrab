'use strict';

const Redcrab = require('./');

const redcrab = new Redcrab({
  connection: {
    database: 'redcrab',
    user: 'redcrab',
    password: 'redcrab'
  }
});

redcrab.ready
  .then(async () => {
    await redcrab.forward();
    process.exit(0);
  })
  .catch(e => {
    console.log(e);
    process.exit(1);
  });
