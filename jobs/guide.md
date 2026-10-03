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

## Legacy local CAPTCHA handoff packets

Use the combined Jobs Utility extension for current installations. The older ATS Captcha Handoff 1.0.2 package is retained only for compatibility with existing local packets; do not install it alongside the combined client. The packet schema and agent producer remain in https://github.com/kvn8888/kvn8888.github.io/tree/dia-design/jobs/handoff . The following local-file behavior describes that legacy package, not the current hosted queue.

When a remote agent has filled a form but a human gate blocks progress, write a local schema-1.0 packet and hand it to the owner. The standalone Python producer supports handoff-write and handoff-validate. Packet files contain personal data: keep them out of public repositories and transfer them only through a user-authorized channel.

The human imports the packet, opens the reusable application URL, explicitly restores fields, attaches files, solves the CAPTCHA, and submits. Restore never submits or interacts with CAPTCHA controls. No cookies, passwords, or verification codes transfer. The packet's supplied profile subset is the only fallback; no personal profile is bundled. Unsupported frames, expired accounts, and ambiguous mappings require manual correction.

This local extension does not call the tracker API or upload packets. If a workflow attempt exists, the agent can separately record a captcha blocker through the existing outcome API. A local Mark submitted result is a user assertion, not an ATS receipt and not automatic permission to complete a tracker attempt.

## Shared agent documents

The private job-search workspace is backed by Cloudflare R2. Discovery: https://job-search-workspace.kvn-c8888.workers.dev/discovery . Follow its OpenAPI and authenticate with the separately provisioned JOB_SEARCH_TOKEN; this is not the tracker JOBS_API_KEY. Read README.md, CHANGELOG.md, automation/SKILL.md, personal context and your agent file at startup. All document content and file listings require authentication.

Updates require the current ETag (If-Match); new files require If-None-Match: *. On 412, reread and merge. Record a sourced reason. Use the canonical paths rather than recreating folders. Previous committed revisions are retained; restores create a new revision. API limits and available history are documented in workspace OpenAPI.

The Google Drive job-search folder is a retained migration snapshot after the verified cutover; course material remains in Drive. Application state, claims, blockers, captures and confirmed submissions still use the existing tracker API and Turso. Agent credentials are managed separately in Doppler; do not place them in documents. Migration tests do not establish that each remote agent has adopted the endpoint.

## Unified collection and human handoffs (API 1.2, extension 0.4)

Install **JobsUtilityExtension 0.4** for collection, capture, and the **Needs your action** queue. Do not install a second handoff extension. The older ATS Captcha Handoff package remains a standalone compatibility tool; its packet schema 1.0 and agent producer are reused by the combined extension. Existing Jobs Utility installations must retain their loaded directory/extension ID and settings during update. Dia live acceptance is pending until Kevin installs and tests the combined build; fixture success is not certification of every live site.

Use `JOBS_API_KEY` for agent work and the separately configured `JOBS_EXTENSION_API_KEY` for the human extension. A signed-in website user can also perform manual actions. Never give the human extension key to an application agent to bypass a blocker. The R2 workspace token is a separate document credential.

Agent flow:
1. Collect/create the canonical opportunity; check prior applications, then claim and heartbeat as usual.
2. If blocked before Submit, create one schema-1.0 packet per observed application page. Preserve step labels in packet notes, repeated controls, filenames, exact answers, inaccessible fields and coverage gaps. Never capture cookies, passwords or verification tokens.
3. `POST /api/job-workflow/attempts/{id}/handoff` with a stable UUID `id`, original `claim_token`, `reason_code` (`captcha`, `manual_review`, `login_required`, or `missing_information`), `notes`, and `packets`. Optional `gaps` and `resume_instructions` explain missing steps and how to resume. This atomically stores the capture, finishes the owned agent attempt, and opens the blocker. Reuse the exact body on retries. It creates no application row.
4. The producer supports `python3 bin/apply.py handoff-queue page1.json page2.json --attempt-id UUID --notes 'Human gate on Questions step'`. Provide `JOBS_API_KEY` and `JOBS_CLAIM_TOKEN` privately through the environment. Agents do not need the extension. Do not hand packets or claim tokens to Kevin through chat.
5. If Submit may already have started, record `submission_unknown` and reconcile receipt evidence instead of queuing another submission.

Human flow: open **Needs your action**, take a queued item, open its URL, sign in yourself, choose the saved page and confirm the employer/role/step before restoring. Taking creates a new manual attempt, linked to the blocked parent, with a 30-minute renewable lease. The combined extension retains the claim for recovery and renews while its application tab is open. Before final employer submission, click **Record that I'm about to submit**; the extension also observes supported trusted Submit interactions, but that detection is best effort. The extension never clicks Submit or solves CAPTCHA. After seeing confirmation, choose **Save confirmed application**. This uses `confirmation_kind=user_confirmed`, resolves the linked handoff blocker, creates/links one application and reads it back. It never calls the legacy insert a second time.

Release before submission returns the item to the queue. After submission has started, release records uncertainty instead. Expired post-submit leases must be recovered and reconciled, never blindly retried. Workday packets are step-scoped: login/session transfer, dynamic repeated-section creation, custom widgets and inaccessible frames may require manual work. Files remain a manual attachment checklist. The combined hosted request limit is 1,000,000 JSON characters within the existing transport byte limit; do not silently truncate.

## Posting expiry and legacy cleanup

A closed posting is separate from a lost lease, a skipped application, or an old capture. `POST /api/job-workflow/jobs/{id}/availability` accepts the current numeric `version`, `notes`, and `evidence` (`url`, `observed_at`, `signal=expired_notice|employer_removed`, `excerpt`). Include the original `claim_token` if your pre-submit attempt is active. It stores `availability=expired` with evidence, prevents new claims, and removes it from the open handoff queue. It never deletes the opportunity or changes an applied record into an unapplied one. Authentication/CAPTCHA failures, network errors and old `last_seen_at` timestamps are not expiry evidence. Filter collection reads with `availability=expired` to inspect these retained rows.

Existing blocked/skipped/CAPTCHA rows in the legacy applications table remain untouched and excluded by the applied-only view. Legacy non-submitted inserts now return a deprecation link; update agents to workflow endpoints. Run `node jobs/scripts/audit-legacy.mjs PRIVATE_REPORT_PATH` with the writer key only to produce a read-only link-candidate and duplicate report. It never rewrites IDs, fabricates receipt evidence, or creates historical attempts. Review the mapping before a separate backfill.

### Dia tab access and current board layouts (0.4.4)

A side panel does not automatically inherit active-tab access when you navigate to a different site. If the current job tab cannot be identified, use **Allow supported job sites** to approve access to Jobright, LinkedIn, Handshake and RIT Career Connect, then return to the job page and enable collection. This uses the existing optional host permissions and adds no browser-wide tabs permission. Other sites still require their own explicit site access.

Collectors recognize current Handshake job-search IDs, LinkedIn currentJobId cards and selected descriptions, and Jobright rendered responsibility/qualification sections. Expanding a description enriches the same canonical record; collapsing/recycling a card must not erase the richer observed partial description. Observed board descriptions remain partial until deliberately reviewed as complete. Live installed-browser acceptance remains distinct from tests using saved DOM fragments.

## Collection modes, destinations and maintenance (0.5.0)

Choose a mode per site. **Auto** adds observed cards and enriches saved jobs as you browse. **Manual** adds no incidental listings: open a posting and choose **Add this job**, then continue browsing/expanding to enrich that saved identity. **Paused** stops both. Existing enabled sites retain Auto on upgrade; a previously unconfigured Symplicity site offers Manual by default. Mode activation is explicit. Incomplete cards are useful leads and must not be deleted simply because their descriptions or employer destinations are still missing.

Manual mode loads saved membership for the selected source through the API, including archive markers. **Add this job** requires a selected posting; it refuses to guess from a recommendation list. The manual details form remains available separately. Reviewing/editing an unrelated field no longer upgrades a partial description to full; the complete-description checkbox is explicit. Paragraphs and bullets are retained, and visible company, location, employment, work-mode and posting-date text is captured where the adapter can identify it. Relative posting text is preserved; do not fabricate an exact date from an approximate badge.

When a user clicks a recognized Apply control on a saved selected posting, the extension watches that tab and its first newly opened application tab for two minutes. Recognized Greenhouse, Workday, Lever and Ashby job destinations attach to the original collection ID, including employer-system identity. This uses the existing navigation permission and adds no browser-wide tabs permission. Login/homepage URLs and unrelated tabs are not accepted. A captured destination survives later source-page scans. Redirects outside these recognized paths may still need **Link an employer application page**: open the actual employer job page, select the correct saved company/role, and confirm the destination. Neither operation clicks Submit or creates an application record.

Job details includes **Archive this opportunity**, with a required reason. It hides the row from the local collection and normal API listings while retaining history and preventing new claims. A running attempt must be finished or recovered before archiving. Collection does not silently unarchive jobs. Server-side status transitions still use workflow operations once attempts exist.

The bundled CLI provides explicit maintenance tools:

```
jobs-workflow collection audit
jobs-workflow collection archive --id COLLECTION_UUID --reason "Reviewed: unrelated role"
jobs-workflow collection restore --id COLLECTION_UUID --reason "Reviewed: reconsider this opportunity"
```

Audit is read-only and reports enrichment needs and possible company/title duplicates. Those are review candidates, not proof of duplicate openings or instructions to discard incomplete records. Archive/restore requires a writer credential, fetches the current version, PATCHes with If-Match and verifies readback. Restore removes the archive marker; it does not erase attempts or change applied/blocked/not-applicable status. Version conflicts stop for reread. There is no background cleanup agent, bulk deletion, or automatic merge of existing records. Use evidence-backed availability changes for expired postings, and preserve unresolved submission history.
