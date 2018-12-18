# Redcrab

Postgresql DB Migrator built off of pg-promise

More docs to come.

## notes
It is assumped that the only concurrency concerns are with the database
connection (i.e. this process does not have exclusive access to the
database).  This means it assumes it has exclusive access to things like
the migrations directory (i.e. there are no other processes that will be
adding/removing migration files during its runtime).
