# JobsUtilityExtension

Canonical instructions: https://www.kevinc.dev/jobs/docs
Use `jobs-workflow extension install` or `extension update` for managed Chrome installation. Developer build output is not an installed profile and may be rebuilt freely.

Run `npm run check` to typecheck, test and build. `npm run test:e2e` exercises the extension against the actual hosted handlers with disposable SQLite. The `schema` directory and `src/server` are legacy test fixtures, not a production writer or a migration to run on the hosted database. No Turso credentials belong in the extension.
