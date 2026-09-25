# Handoff QA

Automated checks cover valid/invalid/future packets, password/OTP/hidden-field exclusion, native text/select/checkbox setters, exact multi-line answers, duplicate restore, missing/ambiguous selectors, profile-only fallback, known bad autofill, CAPTCHA non-interaction, manual file guidance, 100-field timing, and cross-origin frame injection in a disposable browser.

## Manual Greenhouse and Ashby QA

Use a demo or an application you own, with a synthetic test packet or your explicitly captured values. Do not submit a test application to a real employer.

1. Load dist/extension unpacked in a test Chrome profile. Open a Greenhouse or Ashby application page.
2. Export page state before filling. Confirm the packet validates and has no passwords, hidden tokens, CAPTCHA answers, or file contents.
3. Import a packet matching that template. Confirm import alone does not change controls.
4. Click Restore and approve only the intended host/ATS origins. Verify first/last/email/phone and a multi-line answer. For Greenhouse embed pages, check the inner frame and its permission prompt.
5. Verify unknown/ambiguous fields are listed, not guessed. Verify missing file inputs show manual attach guidance, including visually hidden upload controls.
6. Restore again: checkboxes retain their intended state, no duplicate actions occur, and no Submit event is triggered.
7. If CAPTCHA is visible, observe that the extension never clicks or checks it. The human handles it; do not test solving through an agent.
8. Capture/export again and inspect the exact answers. Test an empty-fields packet with only profile_overlay; existing values should be retained except explicit known incorrect autofill.
9. Import schema_version 2.0 and malformed JSON; both must show understandable errors. Try an unrelated active origin; Restore must refuse.
10. Check local-history persistence after closing/reopening Chrome and clear history using the UI. Verify “Mark submitted” requires human confirmation and only downloads a local result stub.

Performance/coverage numbers in automated reports describe controlled fixtures only. Real ATS templates change, and this release does not claim blanket live-site certification or parity with an unavailable copy of ATS Profile Fill v1.1.0.
