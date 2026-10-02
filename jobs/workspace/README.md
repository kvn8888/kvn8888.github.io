# Private job-search document workspace

Cloudflare Worker + private R2 bucket, separate from the Turso application tracker. Source lives alongside the website and extension. Public `/discovery` and `/openapi.json` describe usage; all document names, content, history and writes require a bearer credential. The deploy URL is `https://job-search-workspace.kvn-c8888.workers.dev` once deployment succeeds. Do not advertise cutover before live migration verification.

## Access

Doppler project `personal`, config `dev_personal` holds `JOB_SEARCH_OWNER_TOKEN`, `JOB_SEARCH_CODEX_TOKEN`, `JOB_SEARCH_HERMES_TOKEN`, `JOB_SEARCH_MUSE_TOKEN`, `JOB_SEARCH_GROK_TOKEN`. Runtime credentials are random and separately revocable. The Worker receives only their SHA-256 verifiers. Rotate a token in Doppler and deploy its new verifier to invalidate the old one. Never print keys or publish document exports.

Cloudflare plugin OAuth is managed by the plugin, not copied from its secret store. Worker-to-R2 access uses a binding, so there is no S3 credential to distribute. Any future deployment API token belongs in Doppler as well.

All agents can read this intentionally shared workspace. Agents can update shared documents with a sourced reason and their own process file; another agent's process file and archive/snapshot paths are owner-only. There is no delete endpoint. These credentials do not authorize employer submissions or tracker mutations.

## Writes and history

Read a document and retain its quoted ETag. PUT `{content,reason}` with `If-Match` for an update or `If-None-Match: *` for a create. Missing preconditions return 428; stale or racing writes return 412. Reread and merge, never force overwrite. After a timeout, read back and compare contents before retrying.

A revision is written first, then its head pointer is changed by an atomic R2 conditional write. The committed head links to its parent revisions. Losing writers can leave unreachable objects; those are excluded from history, which traverses committed ancestry. The API exposes the latest 100 committed revisions. Restore by reading an old revision and saving its content against the current ETag. Listings paginate 100 documents at a time. Requests are capped at 256 KiB. No multi-document atomic transaction is promised.

## Development and deployment

`npm ci`, `npm test`, `npm run generate`, `npm run types`. Tests run in Cloudflare's local workerd runtime through Miniflare. `wrangler.jsonc` has deny-all placeholder verifiers for local defaults; production deployment must supply the Doppler-derived verifier registry. Do not deploy the placeholder config over production. Deploy modules worker.mjs/openapi.mjs with the DOCUMENTS R2 binding and BUILD/PRINCIPALS metadata through the authorized Cloudflare plugin. Workers preview URLs must remain disabled. R2 public access must remain disabled.

## Migration

Export the exact Drive tree to a private local JSON file of `{path,source_id,modified,content}`. `python3 migrate.py /private/export.json --report /private/report.json` imports without overwriting differences, records provenance and verifies all content/hashes. Keep exports outside Git. Recheck Drive for edits before cutover; stop if a source changed. Update the migrated README for R2 semantics and keep Drive as a clearly labeled snapshot only after verification. Do not claim real agent adoption from tests using their credentials on this machine.

`client.mjs` supports list/get/history/put with `JOB_SEARCH_TOKEN` from the caller's configured private store. It never discovers other credentials. Metadata and personal data remain private; only public technical API definitions belong in the repository.
