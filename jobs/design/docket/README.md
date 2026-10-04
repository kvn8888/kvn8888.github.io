# Independent Docket design

Synthetic, local-only design reference authored by Claude Opus 5.5 with xhigh effort. The designer received requirements without the existing extension source or UI. The same persistent session completed collection, capture, handoff, applied and system scenarios. No production credentials or job data are included. Open index.html through a local static server; all effects are simulated in memory.

The original brief is historical design rationale, not the backend contract. Later instructions required explicit confirmation, automatic nonconflicting enrichment, whole-page restore and separation of unverified compatibility from unsupported clients. The prototype still invents example lease timing and recovery scenarios: production follows the canonical guide and server rules. Its "slice 1" document title is retained from the authored file; the later screens are present in app.js.

## Implementation boundaries

The extension adopts Here / Jobs / Handoffs / Applied navigation, warm neutral surfaces with blue actions, compact connection status, quieter incomplete leads, and separate posting/application links. System contains maintenance. It reuses the existing API, queue, leases and completion/readback operations. There is no automated employer submission or CAPTCHA action.

Production capture correction supports simple text and checkbox values. Complex selects/files remain recapture/manual actions. Complete per-field provenance, per-field conflict resolution, entered-versus-prefilled attribution and selective-field restore are not implemented by this UI change. A prototype interaction is not evidence that the backend supports that behavior.

Original files were copied unchanged from Claude output; checksums are in provenance.json. Syntax and the handoff navigation/take preview were checked locally. Production extension verification is through the separate disposable API/SQLite integration suite, including narrow views, local drafts, sync/restart and confirmed handoffs. Live board/Workday acceptance remains tracked in #28 and #29.

## Implemented extension evidence

`implementation/` contains screenshots from the actual built extension running against disposable fixtures, plus the verification report. These are separate from Claude's synthetic prototype files above. The 0.6.0 candidate has not replaced the installed release.
