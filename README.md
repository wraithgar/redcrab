# Redcrab

Postgresql DB Migrator built off of pg-promise

## CLI
Coming soon.

## Usage

```javascript
r = new Redcrab(options);
r.create(type, name); //Create new migration file
r.forward(); //Migrate the db forward as far as it will go
r.backward(); //Migrate the db backward one migration
```

### Options

- `connection` (default: undefined) Passed to pg-promise to make a connection to the database
- `advisory_lock` (default: 72656463726162) Unique number for advisory locks. See the note about database concurrency below.
- `schema_start` (default: 10000) This is the number that migrations will start with
- `table_name` (default: redcrab_migrations) Database table to store migration metadata in (i.e. which migrations have run)
- `template_directory` (default: ./templates) Directory to use for migration templates
- `migration_directory` (default: ./migrations) Directory to use for migration files
- `db` (default: internal) pg-promise connection to use for operations.  A reason to override this would be if you have other running code that also connects through pg-promise and you want to avoid the error it gives when instantiating it twice.
- `pg` (default: undefined) Parameters to pass to pg-promise when instantiating it before making the connection to the database.  If `db` is present as an option this is ignored.

### Create

```javascript
r.create(type, name);
```

`type` (default: yaml) specifies the type of migration to make.  The currently supported types are `js` and `yaml`.  The appropriate template for either type will be copied from the templates directory when making the new migration.
`name` (default: "migration") specifies the non-numbered part of the migration filename.  This should be a very short word or phrase used to generally indicate information about the migration.  Detailed information will go inside the migration file itself under its `description` field.

New migrations are made using the next highest schema number, as defined
by the migration files that already exist.  If none are found then
`schema_start` is used.

So, for example

```javascript
r.create('foo');
```

Will create a file in the migrations directory named `10000-foo.yaml`, if no other migrations are found. Running it again:

```javascript
r.create('bar');
```

Will create a file in the migrations directory named `10000-bar.yaml`.  Migrations are ran in the order of the number the filename starts with, this number is required.  The number must be unique, no two files can share a number.  The numbers do not have to be concurrent but it is recommended.

### Forward
```javascript
r.forward()
```

Will migrate the database forward until every migration has ran, or an
error occurs.  If an error occurs only the migration that generated the
error will fail, the ones preceding it will not be rolled back.


### Backward
```javascript
r.backward()
```

Will migrate the database backward by one migration.


## Migration files

Migration files have three parts, all are optional.

- `description` Information about the migration, what it does etc.
- `forward` sql or code used to migrate the database forward
- `backward` sql or code to undo the migration in `forward`

You can see the files in the ./migrations directory for examples

### Yaml

In the yaml migration files the `forward` and `backward` attributes are treated as pure sql that is passed through to pg-promise.  Multiple queries can be separated by a semicolon.

```yaml
description: This is an example migration
forward: >
  alter table foo add column bar text not null
backward: >
  alter table foo drop column bar
```

In the js migration files the `forward` and `backward` exports must be functions that are passed a pg-promise transaction with which they can run queries. This is particularly useful for things like data migrations.

```javascript
module.exports = {
  description: 'Redcrab Migration',
  forward: db => {
    db.query('insert into foo (bar) values ($1)', ['baz']);
  },
  backward: db => {
    db.query('delete from foo where bar = $1', ['baz']);
  }
};
```

## Concurrency

### Database
This library uses [advisory locks](https://www.postgresql.org/docs/current/explicit-locking.html#ADVISORY-LOCKS) in order to gain exclusive access to the migrations table and perform its actions.  Because they are "application-defined" the lock itself has to be defined by the application, in this case Redcrab.  Redcrab uses advisory lock number 72656463726162.  This is hopefully a sufficiently unique number that it doesn't collide with any other applications using your database.  However, in the unlikely even that it DOES collide you can override this with the `advisory_lock` option when instantiating Redcrab.

### File
Redcrab assumes that it has exclusive access to the filesystem.  Specifically to the migrations directory (i.e. no other processes will be adding/removing migration files during its runtime).
