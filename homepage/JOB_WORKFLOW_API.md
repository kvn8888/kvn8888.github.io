> Canonical agent onboarding: https://www.kevinc.dev/api/job-workflow/discovery — https://www.kevinc.dev/jobs/docs. These notes describe compatibility/history; use the current generated guide for new workflow integrations.

# Shared Job Workflow API v1

Production base: `https://www.kevinc.dev`.

Read the machine-readable contract using `GET /api/job-workflow/contract` with the existing Job Tracker Bearer key. The contract contains all request fields and transition rules and is the primary integration reference. Legacy `/api/jobs` and `/api/job-collection` remain available.

## What changed

Turso now also stores `job_attempts`, `job_blockers`, and `job_form_captures`. Existing `job_applications` rows and IDs were preserved. Nine nullable/defaulted fields add collection/attempt/capture links, confirmation details, a unique submission key, and a version. `job_collection` keeps its 35-column schema.

The September 8 migration preserved all 540 existing application rows. No historical Pi attempt/question tables were bulk imported. Run `scripts/migrate-job-workflow.cjs` with the jobs database environment to inspect schema; `--apply` applies the additive idempotent schema. Never replay the original extension migration against production.

## Typical agent flow

1. Find/create the job with `/api/job-collection`. Retain its returned canonical UUID and version. Check existing applications before submitting.
2. POST `/api/job-workflow/attempts` with a stable attempt UUID, collection ID/current version, a private random claim token (at least 32 characters), worker ID, and the actual model if known.
3. Renew the five-minute lease roughly every minute using `/attempts/{id}/heartbeat`. Mark `stage: submit_started` immediately before clicking the employer's Submit action. Do not continue after ownership is lost.
4. Save answer checkpoints through `/api/job-workflow/captures`, using stable capture-session IDs and increasing immutable revision numbers. Record exact question labels and answer values. Exclude passwords, security tokens/codes, and file contents.
5. If stopped, POST `/attempts/{id}/outcome` with blocked/skipped/failed/cancelled/submission_unknown, reason, notes, and available evidence/questions. Blocked/unknown outcomes create shared blocker rows.
6. If genuinely submitted, POST `/attempts/{id}/complete` with confirmation, actual submission timestamp, optional capture reference, and explicitly resolved blocker IDs. This atomically creates/links the tracker record and marks the opportunity applied. **Do not also POST `/api/jobs` for that same submission.**
7. Read back `/api/jobs/{application_id}` and `/api/job-workflow/jobs/{collection_id}`. Preserve the original request body, IDs, and token across retries.

`manual: true` is for a human-directed continuation; it permits a human to work on blocked opportunities. Existing blocked attempts remain in history. An expired attempt that reached Submit must be recovered as submission_unknown and verified before retry. The recover endpoint accepts a current version and only operates on expired running attempts.

## Portal

`/projects/job-tracker` now includes Opportunities and Needs attention. A job's detail contains attempts, blockers/resolutions, and answer captures loaded on expansion. Manual actions are Resolve & retry, Resolve only, Dismiss opportunity, and I submitted it manually. A confirmed manual submission creates/links one tracker row; blocker resolution alone does not increase statistics.

Statistics use America/New_York and actual submitted timestamps, falling back to legacy recorded dates. The old applied-only rule remains intact. The 14-day activity chart separates submission counts from attempt outcomes and open blockers.

## Extension 0.2.0

The extension calls the hosted API directly. Settings accepts the user's existing Job Tracker API key. No local backend or Turso token is needed in Chrome. It maps native JSON responses, canonical IDs and cursor pagination, and uses versioned enrichment. Finish & review syncs an answer revision; confirmed submission calls the shared completion endpoint.

## Boundaries

- Shared keys keep their existing scope; reader keys cannot mutate. New workflow routes use the same credential resolver and page grant as the tracker.
- New attempt ownership is protected by a claim token, independent of the shared Bearer key. Claimed worker/model names are metadata; the API separately records authenticated identity.
- There is one initial application cycle per opportunity. Intentional reapplication requires a future explicit flow.
- Legacy `/api/jobs` callers can still create unlinked submissions. Agent duplicate checks and optional existing tracker IDs remain necessary during transition.
- Completion only resolves explicitly selected blockers. The extension does not automatically close older agent blockers.
- Evidence paths remain local references unless separately uploaded; the UI does not turn Pi paths into downloadable files.
- Historical imports need a dry-run identity/tracker-ID audit first. Do not infer missing outcomes, timings, or receipts.

## Validation

`node --test tests/jobs-api.test.cjs tests/job-collection.test.cjs tests/job-workflow.test.cjs` runs the actual handlers/helpers against disposable SQLite. Coverage includes old API compatibility, reader rejection, claims/retries, CAPTCHA outcomes, capture revisions, manual completion, expired/uncertain submission recovery, and New York date boundaries.

The extension's browser integration test uses these actual handlers through a disposable HTTP fixture. The portal test covers the actual React UI through manual completion. No test applications are submitted to employers or inserted in production.
