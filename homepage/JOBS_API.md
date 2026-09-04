# Job Tracker API for agents

The tracker uses the same `/api/jobs` endpoints for the browser UI and agents.
Agent support becomes available after deploying this change and setting `JOBS_API_KEY`.

## Setup

1. Generate a random key with `openssl rand -hex 32`.
2. Save it as `JOBS_API_KEY` in `/tools/secrets`, or in the deployment environment. Environment-only changes require a redeploy. Runtime overrides take precedence.
3. Store that key in the agent's secret/environment configuration as `JOBS_API_KEY`.

Keys must be at least 32 characters. An unset, empty, or shorter configured key disables agent access. Replace the configured key to rotate it; an empty runtime override disables it. Deleting an override falls back to any environment value.

This is one shared tracker key. It grants read, create, and update access to the shared application tracker. It grants no delete access, job parsing, statistics, other APIs, or protected pages. Browser users still use their existing Google sessions and page grants. A supplied invalid Authorization header is rejected even if a browser session exists.

## Create an application

```bash
curl --fail-with-body https://kevinc.dev/api/jobs \
  -H "Authorization: Bearer $JOBS_API_KEY" \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: example-company-intern-2026-09-04' \
  --data '{
    "company": "Example Company",
    "role": "Software Engineering Intern",
    "date": "2026-09-04",
    "source": "LinkedIn",
    "resume_type": "Full Stack",
    "location": "New York, NY",
    "work_mode": "Hybrid"
  }'
```

First success: HTTP 201, `{"id":123,"message":"Created","replayed":false}`.
Retry: HTTP 200, `{"id":123,"message":"Already created","replayed":true}`.

`Idempotency-Key` is required for agent inserts. Choose one stable key per application and reuse it with the same payload after a timeout or failed response. Keys contain 1–128 ASCII letters, numbers, `.`, `_`, `:`, or `-`. Reusing a key with different input returns HTTP 409. A new key intentionally creates a new entry, even for the same company and role. Multiple agents coordinating the same application should share the same key. Retry protection persists in the database across restarts and key rotation.

If a record is edited later, retrying its original insert still returns the original ID and does not undo the edit. Omitted dates default to the UTC date of the initial insert; retries across midnight still match. Optional empty strings and null are stored as null. Field order and surrounding whitespace do not affect retry matching.

| Field | Rules |
| --- | --- |
| `company`, `role` | Required, nonempty strings, max 2,000 characters each |
| `date` | Optional valid `YYYY-MM-DD`; defaults to today in UTC |
| `description`, `cover_letter` | Optional string or null, max 50,000 characters each |
| `source`, `type`, `resume_type`, `location`, `work_mode` | Optional string or null, max 2,000 characters each |

`cover_letter` can contain the letter text or `"no"`, matching the existing UI. Unknown fields are rejected. Interview status initially defaults to false; use PATCH to change it.

## List and search

```bash
curl --fail-with-body 'https://kevinc.dev/api/jobs?q=Example&limit=50&offset=0' \
  -H "Authorization: Bearer $JOBS_API_KEY"
```

Returns `{"jobs":[...],"total":1}`. `q` searches company names; `limit` defaults to 50 and is capped at 200; `offset` defaults to 0. Entries are ordered by application date descending. Internal retry keys and hashes are not returned.

## Update an application

```bash
curl --fail-with-body -X PATCH https://kevinc.dev/api/jobs/123 \
  -H "Authorization: Bearer $JOBS_API_KEY" \
  -H 'Content-Type: application/json' \
  --data '{"interviewed":true}'
```

Accepts any create field plus `interviewed` (boolean, or 0/1 for compatibility with the browser UI). Only supplied fields change. Success returns `{"message":"Updated"}`. An unknown application ID returns HTTP 404.

## Errors and retries

- **400:** Malformed JSON, invalid fields, or missing/invalid insert retry key. Correct the request.
- **401:** Missing or invalid authentication. Check the configured API key.
- **403:** Browser account lacks the relevant page grant.
- **404:** PATCH target does not exist.
- **409:** Insert retry key was already used with different data. Use the original payload to retry, or PATCH the existing entry.
- **500:** Server/database failure. Retry an insert with its original key and payload, using a short backoff.

The optional Google Sheets mirror is best effort and runs only for newly inserted applications. Replays do not resend it. The tracker database is authoritative; a successful insert does not guarantee the Sheets mirror succeeded.

## Local verification

Run `node --test tests/jobs-api.test.cjs` from `homepage/`. Tests execute real route handlers and SQL against a temporary local database, with authentication and secret providers replaced. They do not access the production database or send the Sheets webhook. Proxy callback checks verify key scoping; browser session/grant behavior uses the existing authorization path.
