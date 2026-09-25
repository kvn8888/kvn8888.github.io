# Jobs workflow

Canonical discovery: https://www.kevinc.dev/api/job-workflow/discovery
Readable reference: https://www.kevinc.dev/jobs/docs

## Start here

Run `jobs-workflow sync` at the start of a jobs task and again before a new submission attempt. Read changed guidance when the contract hash changes. Use `jobs-workflow doctor` to check connectivity, compatibility, and credential access. Cached guidance is available offline, but offline state is not permission to start new remote work.

Use the hosted API. Only the server talks to Turso. Keep API keys in an explicitly configured environment variable or owner-only key file, never page content, arguments, documentation, or exports. Reader credentials permit reads only. Authentication is `Authorization: Bearer <key>`; use the canonical www domain directly.

## Data and workflow

- Opportunities remain in `job_collection`, including pending, in-progress, skipped, blocked, applied, and not-applicable outcomes. They are not deleted when consumed.
- `job_attempts` owns leases and execution history; `job_blockers` owns unresolved questions and manual resolutions.
- Exact answers are immutable `job_form_captures` revisions. Preserve repeated groups, answer types, and coverage gaps; exclude passwords, security tokens, MFA/CAPTCHA codes, and file contents.
- `job_applications` stores confirmed submissions and legacy tracker records. The site shows applied/submitted and legacy no-status records, not blocked work.

1. Search/create an opportunity with the collection API; keep its returned canonical UUID and version. Check existing application history before external submission.
2. Claim with `POST /api/job-workflow/attempts`, a stable attempt UUID, current opportunity version, and private random claim token of at least 32 characters.
3. Renew the five-minute lease approximately every minute. Stop if ownership is lost. Mark `submit_started` immediately before employer submission.
4. Save answer revisions through `/api/job-workflow/captures`. Record blocked/skipped/failed/cancelled/uncertain work through the attempt outcome endpoint.
5. After actual employer receipt or explicit user confirmation, use `/attempts/{id}/complete`. It atomically creates/links one application and updates the opportunity. **Do not also POST /api/jobs for the same submission.**
6. Read back the returned application and opportunity history. Retain exact payloads, IDs, and tokens for retries. Recover an expired post-submit attempt as uncertain; never blindly submit again.

Collection PATCH requires the quoted ETag version. Opportunities with attempt history use workflow endpoints for status transitions. Resolve only explicitly selected blockers. One initial submission cycle per opportunity is supported; intentional reapplication requires a future explicit flow. Historical local agent databases have not been bulk imported.

Legacy application writes remain for compatibility/corrections, not an alternative second write after workflow completion. Local evidence paths are references, not downloadable uploads. This guide does not authorize employer submission, CAPTCHA solving, or unrelated actions.

## Local tooling

Download the CLI asset listed by `/releases`, verify its SHA-256, and run `node jobs-workflow.mjs doctor`. No checkout is needed; Node.js 20+ is required. `agent setup` installs the command in the user's local bin directory and a narrowly scoped bootstrap skill. API keys are not included in release assets. `JOBS_API_KEY` or `JOBS_WORKFLOW_KEY_FILE` explicitly selects an existing credential.

Commands: `doctor`, `sync`, `extension install`, `extension update`, `extension verify`, `extension rollback`, and `agent setup --target codex|claude|hermes`. Use `--json` for structured output. Configuration and cached docs live in the user's jobs-workflow configuration directory; credentials remain separate.

## Chrome install and update

Installation is on demand; no daemon or store publication is involved. The CLI stages a verified immutable extension release separately from source/build output. Existing Chrome installations must be adopted using their exact loaded path and extension ID. Ambiguous profile discovery requires explicit selection; never uninstall/reinstall as an update shortcut.

Open the installed extension's Diagnostics page and download its sanitized report. It includes running version/build hash, extension ID, capture/queue counts, and reload readiness, never keys or answers. Pause collection and finish active captures/attempts and pending queue work first. Preserved review drafts do not need deletion.

`extension update --diagnostics <report-file>` verifies the report before replacing managed files. It keeps one previous version. Then use chrome://extensions to Reload; refresh previously open employer pages only when safe. Download a fresh Diagnostics report and run `extension verify --diagnostics <report-file>`. Changed files alone produce `reload_required`, not success.

Version 0.2.0 predates diagnostics. For that one-time upgrade only, inspect the existing Chrome extension UI, pause collection, finish captures and drain writes, then use `--legacy-idle-confirmed` with the exact loaded path and extension ID. This flag is rejected for newer installed versions. Verify the new version with Diagnostics after reloading.

Fresh installation uses a stable managed folder and Chrome's Load unpacked action. Choose that folder, open Diagnostics, then verify. If an existing unpacked installation is not discoverable, use `--path <exact-loaded-folder> --extension-id <id>`; do not guess. The build must never delete the installed folder.

## Compatibility and releases

Public metadata contains no job data and does not need a key or database. Discovery describes the deployed API, contract hash, documentation revision, and compatible clients. The legacy authenticated contract remains available.

Updated clients refuse new workflow work when incompatible or compatibility cannot be checked. Existing attempt recovery and heartbeats remain available; documentation changes do not cancel leases. Old clients are not suddenly rejected by this additive release. Backend breaking changes require an API major-version change, migration guidance, and a deliberate compatibility window.

Release assets are immutable and checksum verified. An extension release is advertised only after backend verification and publication of its verified release manifest. Rollback restores code, not an older copy of browser storage; incompatible storage migrations must block automatic rollback.

## Local CAPTCHA handoff packets

ATS Captcha Handoff 1.0.0 is a separate optional Chrome extension for fresh-page restoration on the human's Mac. Source and instructions: https://github.com/kvn8888/kvn8888.github.io/tree/dia-design/jobs/handoff . Downloads and the versioned packet schema: https://github.com/kvn8888/kvn8888.github.io/releases/tag/ats-handoff-v1.0.0 .

When a remote agent has filled a form but a human gate blocks progress, write a local schema-1.0 packet and hand it to the owner. The standalone Python producer supports handoff-write and handoff-validate. Packet files contain personal data: keep them out of public repositories and transfer them only through a user-authorized channel.

The human imports the packet, opens the reusable application URL, explicitly restores fields, attaches files, solves the CAPTCHA, and submits. Restore never submits or interacts with CAPTCHA controls. No cookies, passwords, or verification codes transfer. The packet's supplied profile subset is the only fallback; no personal profile is bundled. Unsupported frames, expired accounts, and ambiguous mappings require manual correction.

This local extension does not call the tracker API or upload packets. If a workflow attempt exists, the agent can separately record a captcha blocker through the existing outcome API. A local Mark submitted result is a user assertion, not an ATS receipt and not automatic permission to complete a tracker attempt.
