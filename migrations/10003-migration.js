'use strict';
//$lab:coverage:off$

module.exports = {
  description: 'Redcrab Migration',
  forward: db => {
    db.query('insert into foo (bar) values ($1)', ['baz']);
  },
  backward: db => {
    db.query('delete from foo where bar = $1', ['baz']);
  }
};
//$lab:coverage:on$
