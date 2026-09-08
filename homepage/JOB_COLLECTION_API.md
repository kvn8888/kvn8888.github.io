# Job collection and application API

Base URL: **https://www.kevinc.dev**. Use `www` directly; following an apex-domain redirect may drop the Authorization header.

This API uses the existing `job_collection` table in the same Jobs Turso database as `job_applications`. Collection rows are opportunities, not submitted applications. No endpoint deletes rows or removes them after consumption. The extension's existing 29 columns are retained; six additive columns store processing status, notes, timestamps, application links, status history, and a version number.

## Credentials

Send `Authorization: Bearer <key>` from the extension's background/service-worker code or the agent's HTTP client. Never expose the Turso database token or place the API key in page content, URLs, or repository files.

| Server secret | Permissions |
| --- | --- |
| `JOBS_API_KEY` | Existing agent key: read/create/update applications and collection |
| `JOBS_EXTENSION_API_KEY` | Optional separate extension key: same bounded application and collection operations |
| `JOBS_READ_API_KEY` | Optional reader key: GET only on application lists/details, collection lists/details, and URL export |

The new credentials are optional and must be configured in `/tools/secrets` or Vercel before use. They are not generated automatically. Keys need at least 32 characters. They cannot access secrets, job parsing, statistics, unrelated APIs, or protected pages. Invalid Authorization never falls back to a browser session. Browser sessions with the Job Tracker page grant can use the endpoints. Reader keys must be distinct; if a value is configured as both reader and writer, reader restrictions win.

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/job-collection` | Create/deduplicate an opportunity |
| GET | `/api/job-collection` | Search summaries with filters and cursor pagination |
| GET | `/api/job-collection/{uuid}` | Full opportunity, JSON documents, status notes, and status history |
| PATCH | `/api/job-collection/{uuid}` | Enrich metadata, claim work, record an outcome, or archive; requires If-Match |
| GET | `/api/job-collection/export` | Paginated URL records with the same filters |
| POST | `/api/jobs` | Save a submitted application's metadata and serialized capture document |
| GET / PATCH | `/api/jobs/{numeric-id}` | Read/update an existing application |

The application routes retain the contract in [JOBS_API.md](JOBS_API.md). No DELETE route exists. The collection's original `resolution_status` describes URL resolution; the new `status` describes agent processing. They are independent.

## Create a collected job

```json
{
  "id": "830348da-e1fb-4b16-96da-be1081a9a270",
  "identity_key": "linkedin:123456",
  "source": "linkedin",
  "source_job_id": "123456",
  "source_url": "https://www.linkedin.com/jobs/view/123456/",
  "company": "Example Company",
  "role": "Cloud Engineering Intern",
  "description": "Verbatim captured description",
  "description_status": "full",
  "type": "cloud",
  "role_tags_json": ["cloud", "backend"],
  "employment_type": "internship",
  "work_mode": "remote",
  "location": "United States",
  "locations_json": [{"country": "US", "remote_eligibility": ["United States only"]}],
  "metadata_json": {"schema_version": 1, "adapter": "linkedin-v1", "coverage_gaps": []}
}
```

Required: `id` (client-generated UUID), `identity_key`, `source`, and an HTTP(S) `source_url`. Unknown company/role/description may be omitted or null. No company/title deduplication is attempted.

- New row: **201** with `{"job":{...},"created":true,"existing":false}`.
- Existing identity: **200** with `{"job":{...},"created":false,"existing":true}`. The existing row is unchanged, including its status and description. Use its returned ID and version for enrichment. Update the extension's local reference if its proposed UUID differs.
- Conflicting identities pointing to multiple rows: **409**, with the matching IDs. Both rows remain intact. Automatic cross-row merging/deletion from the earlier extension plan is deliberately not implemented.

Duplicate detection checks UUID/identity key, source + source job ID, exact source + source URL, source aliases, verified canonical URL, and complete ATS provider + tenant + job ID. Atomic insert conditions cover concurrent retries. Preserve the original UUID/identity across retries; collection POST does not require an additional Idempotency-Key header.

`description_status`: `missing` (default), `partial`, `full`. Partial/full requires nonempty description text. `resolution_status`: `unresolved` (default), `resolved`, `in_board`, `unavailable`; resolved requires `application_url`. Only supply a canonical URL or ATS identity after verifying it.

## Processing status: update rather than delete

| Status | Meaning |
| --- | --- |
| `pending` | Available to consider; default |
| `in_progress` | An agent has started work |
| `skipped` | Deliberately skipped; explain why in status_notes |
| `blocked` | Unable to proceed; explain the blocker |
| `applied` | Application submitted |
| `not_applicable` | Not relevant/eligible; `N/A` is accepted and normalized to this value |

All statuses remain queryable. Reopen a skipped/blocked entry by setting `pending`. Archival is separate: set `archived_at` to an ISO timestamp to hide a row from default searches; set it to null to restore it. It does not delete anything.

GET and successful writes return a numeric `job.version` and matching `ETag`, e.g. `"3"`. PATCH requires that exact value:

```http
PATCH /api/job-collection/830348da-e1fb-4b16-96da-be1081a9a270
Authorization: Bearer <writer-key>
Content-Type: application/json
If-Match: "3"

{
  "status": "blocked",
  "status_notes": "The ATS requires manual MFA."
}
```

**Claim protocol:** query pending jobs, inspect the chosen job, then PATCH `status: in_progress` with its current version. Two workers claiming the same version cannot both succeed. A successful content change increments the version; a no-op keeps it unchanged. **412** means the row changed: GET it again, reconcile, and only retry if the desired update still makes sense. **428** means If-Match is missing. This is a claim, not an expiring lease: crashed agents leave in_progress rows for explicit recovery/requeue.

Changes to status or status_notes append a server-authored `{status, notes, at, actor}` entry to `status_history_json` and update `status_updated_at`. History/version fields are read-only.

## Enrichment and JSON merge behavior

PATCH accepts the collection fields except immutable `id`, `identity_key`, `source`, and `first_seen_at`, and server-owned `updated_at`, `version`, `status_updated_at`, `status_history_json`.

- Omit unknown observations. Null cannot erase a known metadata field. `status_notes` and `archived_at` can explicitly be cleared with null.
- Full descriptions cannot be downgraded to partial/missing or erased. Replacing full text must explicitly specify `description_status: full`.
- `last_seen_at` cannot go backward. First/last observation times are distinct from posted_at. Source-provided posted_at may be a date alone; other timestamps require a timezone and are normalized to UTC.
- JSON fields accept native arrays/objects or serialized JSON strings. Responses return native arrays/objects under the same `_json` property names.
- `role_tags_json`, `locations_json`, `sources_json`, and `application_ids_json` merge by union of JSON-identical entries. Distinct observations are retained. Do not send whole-page dumps or an unbounded observation log.
- `metadata_json` recursively merges object keys; arrays union; explicitly supplied leaf values replace those leaves. Omitted nested keys survive. Version checks prevent silent concurrent replacement.
- JSON nesting is limited to 32 levels. Locations are objects whose values are text, null, or lists of text. Each source alias needs `source` and `source_url`; optional `identity_key`, `source_job_id`, `first_seen_at`, and `last_seen_at` are validated.
- `application_ids_json` is an additive array of existing positive numeric tracker IDs. Multiple application attempts can reference the same collection row. Invalid/nonexistent application IDs are rejected.

Limits: 50,000 characters for description and status_notes, 1,000,000 serialized characters for metadata_json, 100,000 serialized characters for each other JSON field, at most 100 source aliases / 1,000 other array entries, 8,000 characters per URL, 2,000 for other text, and **2 MiB total request body**. Oversized requests return **413**; fields exceeding limits return **400**. No silent truncation.

## Search and export

Example: `GET /api/job-collection?status=pending&type=cloud&work_mode=remote&collected_since=2026-09-01&limit=20`

Supported filters:

- `q`: literal substring search over company/role; `company` and `location`: literal substring searches.
- `type` (or `role_type`): `full_stack`, `cloud`, `ai_ml`, `backend`, `frontend`, `data`, `mobile`, `embedded`, `security`, `other`.
- `work_mode`: `remote`, `hybrid`, `onsite`; `source`, `employment_type`: exact values.
- `status`: exact processing status. Omit to include all statuses; consuming a row never makes it disappear implicitly.
- `collected_since` (inclusive), `collected_until` (exclusive): first_seen_at range. `updated_since` is inclusive. Accept ISO timestamps or dates; date-only filters mean UTC midnight.
- `archived=false` (default), `true`, or `all`.
- `limit`: 1–100, default 20. `cursor`: opaque next_cursor from the previous response. Keep the same filters when continuing.

Response: `{"jobs":[...],"total":42,"next_cursor":"..."}`. The cursor orders by first_seen_at descending, then UUID descending. An empty final page returns next_cursor null. `total` describes the filtered set before the cursor. A changing status filter is a live view, not a frozen snapshot; re-query pending work after processing a batch.

Summaries omit description, source observations, full location JSON, status notes/history, and extraction metadata. GET by UUID returns them. `/export` returns only ID, source/application/canonical URLs, status, first_seen_at, and version, with the same pagination. It prefers no URL automatically; the agent chooses a verified application_url when present. These are fixed parameterized queries, never arbitrary SQL.

## Saving a confirmed application

1. After employer/user confirmation, POST `/api/jobs` using `Idempotency-Key: jobsutility:<capture-uuid>` and the application metadata. Put the versioned capture document in `other_details` as **serialized JSON text**. This existing field also accepts historical Markdown; the API does not impose the extension's capture-document schema. The extension must validate its capture shape and exclude passwords/security tokens before sending.
2. Persist the returned numeric application ID. Retrying uses the original key and exact original payload.
3. GET the collection row and PATCH its current version with `{"status":"applied","application_ids_json":[123]}`. The collection row remains. These are two independently retryable steps, not one cross-table transaction.
4. When an application already has a tracker ID, GET/PATCH that application instead of inserting again. Preserve existing other_details; for legacy text retain it under legacy_notes in the merged capture document. The existing application PATCH has no new collection-style version precondition; coordinate concurrent writers to application documents explicitly.

Unconfirmed/unfinished extension captures stay local. Merely collecting a listing or setting in_progress does not create an application. The server does not contact employer sites, submit applications, or enforce proof that an applied status is truthful; callers must follow the confirmation workflow.

## Verification

`node --test tests/jobs-api.test.cjs tests/job-collection.test.cjs` exercises real route handlers against disposable local libSQL databases: schema upgrade from 29 columns, duplicate and alias races, optimistic claims, history preservation, application links, archives, pagination/filter/export, size/JSON validation, and read-only credential denial. No employer applications are submitted.
