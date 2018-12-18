'use strict';

const Yaml = require('js-yaml');
const Fs = require('fs');
const Path = require('path');

class YamlMigration {
  constructor({ filename, migration_directory }) {

    const raw = Fs.readFileSync(Path.join(migration_directory, filename), 'utf8');
    const parsed = Yaml.safeLoad(raw);
    this.data = parsed;
  }


  forward(db) {
    if (this.data.forward) {
      return db.query(this.data.forward);
    }
  }
  backward(db) {
    if (this.data.backward) {
      return db.query(this.data.backward);
    }
  }
}

module.exports = YamlMigration;
