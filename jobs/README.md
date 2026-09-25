# Jobs workflow

Canonical onboarding: https://www.kevinc.dev/api/job-workflow/discovery
Human reference: https://www.kevinc.dev/jobs/docs

This repository owns the backend contract, extension, updater, and bootstrap. API definitions live with the Next.js service; `npm run generate --prefix jobs` produces OpenAPI, client types, and the published guide. Generated files are committed and checked for drift. The older extension folder is not the source of new releases.

Development: install dependencies in `homepage`, `jobs`, and `jobs/extension` using `npm ci`. Run homepage typecheck and handler tests, `npm run validate --prefix jobs`, `npm test --prefix jobs`, and `npm run check --prefix jobs/extension`. Extension E2E uses disposable SQLite through real hosted handlers; `TRACKER_HOMEPAGE` can select a checkout. Never point write tests at production.

Release: update API/client versions and `jobWorkflowChanges`, regenerate, run checks, commit, and tag `jobs-v<client-version>`. Build with `npm run build --prefix jobs`. Upload the CLI and extension bundles to a draft GitHub release for that exact commit. Deploy the compatible backend and verify public docs and authenticated reads. Only then mark release.json verified, upload it, and publish the release. Do not overwrite published assets. Discovery advertises only a verified manifest whose contract hash matches the deployed server.

The public entry points are static metadata and must not initialize a database or accept mutations. All runtime job data retains existing authentication. Protocol changes require a changelog and compatibility review; a breaking contract change requires a major API version and migration instructions.

Hermes bootstrap adds a narrow managed pointer to SOUL.md because the inspected Hermes runtime loads that globally; a home-level AGENTS.md is not its global instruction source. Existing persona text is preserved.
