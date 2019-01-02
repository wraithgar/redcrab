#!/bin/sh
#Helper script to demonstrate how to quickly create the test db using the default values in the test fixtures
psql -d postgres -c "CREATE ROLE redcrab_test with password 'redcrab_test' nosuperuser nocreatedb nocreaterole inherit login"
createdb redcrab_test -O redcrab_test
