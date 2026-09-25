# ATS Captcha Handoff 1.0.0

A separate Chrome MV3 extension for moving a filled application from an agent's browser to your own browser. Packets stay local. It does not call the tracker API, submit applications, solve challenges, import cookies, or include a bundled personal profile.

Canonical source is this website repository's `jobs/handoff` directory. The referenced remote `/workspace/job-apps/apply-kit` was not available during implementation, so this ships beside ATS Profile Fill rather than modifying an unseen copy of it.

## Kevin's workflow

1. Unzip the release. In `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select `extension` from the release (or `dist/extension` in a developer checkout).
2. On the employer application page, open **ATS Captcha Handoff** from Chrome's toolbar. Import a `.json` packet or paste JSON and click **Validate & import**. Nothing fills automatically.
3. Check the company, role, URL, notes, and attachment filenames. **Open application URL** opens a fresh tab. Log in yourself if needed; passwords and account setup are not transferable.
4. Open the extension again on that application tab and click **Restore fields**. Approve access only to the shown application/ATS origins. If an application path/query changed, review it and explicitly check the correct-page confirmation. A different main-page origin is refused: correct the packet's reusable application URL before importing again.
5. Review the filled/skipped/missing report and each restored answer. Attach resume/documents manually; agent-box paths are references, never uploaded files. Hidden upload controls also produce attachment reminders.
6. **Solve the captcha yourself, then submit. This extension will not submit for you.**
7. Optionally confirm that you submitted, then **Mark submitted & download result**. This records a local user assertion only; it does not verify an employer receipt or log to the tracker.

The last five packets are stored in trusted extension-local storage. **Clear local packets** removes that history after confirmation; original downloaded files remain. Very large packet histories can hit Chrome's local storage quota; clear old copies if an import reports a quota error. There is no background sync or telemetry.

## Packet format

`handoff-packet.schema.json` is generated from `src/schema.mjs` and used by both the extension's precompiled validator and the Python producer. Supported schema: **1.0**. Unknown versions require an upgrade. Required fields: schema_version, id, created_at, application_url, status. ATS names are extensible strings.

- Fields need a nonempty selector list, name, label, or placeholder plus a value. Exact selectors take priority; missing/ambiguous matches remain unfilled.
- Text values preserve whitespace. Checkboxes use booleans. Radios may use a boolean plus `option_value`, or an explicit option value/label string. Native multi-selects use arrays of values/labels.
- `frame_url` identifies a frame origin and path; `frame_hint` can identify an iframe name/id. Exported controls include frame URLs. Add frame hints when repeated controls share a URL. Cross-frame ambiguity is reported instead of filling several candidates.
- `file` and `hidden` types are recognized but require null values and are never restored. Export does not include hidden/password/OTP/payment/security fields or file contents.
- `profile_overlay` supports the named contact, address, link and education fields in the schema. Empty fields[] enables profile fallback. Existing values are preserved unless they match an explicit `autofill_lies_to_overwrite` entry. No EEO answers or personal defaults are invented; EEO values must be explicitly captured in fields[].
- Explicit fields replace matched editable values when Restore is clicked. Profile fallback fills blanks or known incorrect autofill only. Controls that reject a value, such as a numeric salary input receiving “Negotiable,” are reported instead of silently cleared.
- Notes-only packets are valid: fields and profile_overlay may be absent. Their notes are displayed, and Restore reports that there is nothing to fill.
- Session/cookie objects are not accepted in 1.0. Credential-bearing URL parameters are refused/omitted. Do not put sensitive tokens or passwords in free-text notes; arbitrary prose cannot be reliably classified as a secret.

Limits: 2 MiB per packet, up to 500 fields, 50,000 characters per free-text answer, 10 selectors per field. Nothing is silently truncated. The included example is synthetic and contains no Kevin profile data.

## Agent producer

The standalone `bin/apply.py` can be called by an existing apply-kit without changing its other commands:

```sh
python3 -m pip install -r requirements.txt
python3 bin/apply.py handoff-write \
  --url 'https://example.com/apply/123' --ats greenhouse --blocker captcha \
  --company 'Example Company' --role 'Engineer' --fields fields.json \
  --profile-overlay profile-subset.json -o handoffs/example.json
python3 bin/apply.py handoff-validate handoffs/example.json
```

Without `-o`, output defaults to `/workspace/job-apps/handoffs/<uuid>.json`; `--output-dir` overrides it. Each write appends id/path/url/company/status/created_at to the adjacent `index.jsonl` under a file lock. New packets and index files have owner-only permissions; existing output paths are never overwritten. Validation exits 0/1 and does not print answers.

`--capture capture.json` consumes the output of `capture-form-state.js`. `--notes` adds a local note. `--fill-js` also emits a trusted local `<id>.fill.js` from the validated packet and packaged restore template. That script refuses a different origin/path and has the same no-submit/no-CAPTCHA control guards. Never execute JavaScript supplied by an untrusted packet author; JSON packets are data, not executable code.

Do not change employer skip lists or automatically mark attempts submitted. When CAPTCHA appears after filling, capture a packet and hand it to Kevin. The agent may separately record a tracker blocker using the existing workflow API, but this extension does not do that. File transfer/notification to Kevin is a separate user-authorized step.

## Capture script and chunks

`capture-form-state.js` returns url, title, fields, captcha_detected, captcha_vendors, file_inputs, and warnings. It traverses accessible same-origin frames and open shadow roots. It never reads CAPTCHA-frame controls. Cross-origin agent capture gaps are reported.

For an approximately 2k browser-use command limit, evaluate `capture-chunks/001.js`, `002.js`, etc. in order in the **same page context**. Each file is under 2,000 characters; the last returns JSON and removes its temporary global. This trusted CDP/DevTools helper uses evaluation and may be blocked by a page's CSP; use the extension if so. The MV3 extension uses packaged functions and a build-time-compiled schema validator, never runtime eval.

## Permissions and limitations

The release requests storage, activeTab, scripting, and webNavigation, with optional HTTPS origins and localhost HTTP for fixtures. It requests exact origins only when Restore/Export is clicked. It never requests cookies, debugger, or global pre-granted host access. Cross-origin injection is limited to recognized ATS domains and granted origins; CAPTCHA frames and their descendants are excluded before injection. Other third-party frames, closed shadow roots, inaccessible frames, custom controls, multi-page Workday account creation and expired login sessions may require manual help.

Restore is intentionally limited to the current page. A fresh Mac page cannot recreate the remote IP, fingerprint, login, or unobserved pages. Inspect every result before proceeding. A known iframe export's exact frame path may change between ATS sessions; such fields are reported missing for explicit correction rather than filled by guesswork.

## Development and validation

```sh
npm ci
npm test
npm run test:browser
```

`npm run build` creates the extension, standalone capture/restore helpers, and chunk files under dist. Unit tests use synthetic DOMs. Browser tests use a temporary profile and locally served Greenhouse/Lever/Ashby/SmartRecruiters-like fixtures, including a cross-origin Greenhouse frame; only fixture origins are pre-granted in that temporary test manifest. No real employer submission or production tracker write is performed. See TEST.md for manual live-layout QA.
