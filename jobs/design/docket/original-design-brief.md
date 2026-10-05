# Docket: Design Brief

**Stance.** Docket is context-first. Its default view answers "what is this page to me?" and offers one next action. The library, handoffs and tracker are places you visit on purpose. Maintenance sits behind a status chip.

## Architecture

- **Header:** the current site host and one **status chip** that combines sync and connection ("Synced", "3 syncing", "1 needs attention", "Offline"). The chip opens the **System** sheet.
- **Tabs:** four labeled tabs, **Here · Jobs · Handoffs · Applied** (keys 1–4).
- **Here** adapts to the active page: board, posting, employer application, or unrecognized site.

## Visual direction

- **"Ledger" palette:** graphite on warm off-white (near-black in dark mode). One ink-blue accent for primary actions, amber for attention. Red is used only for destructive actions and do-not-submit warnings.
- **Structure:** hairline dividers, no nested cards, no charts, no percentages.
- **Type:** system sans at 14px for body text, 12px minimum for metadata. Monospace for hosts, URLs and short record IDs.
- **Status:** always a glyph plus a word, never color alone.
- **Focus:** 2px accent ring with 2px offset on every control.
- **Keyboard (outside text fields):** j/k move through lists, Enter opens, Esc goes back, / searches.

## Status vocabulary (fixed wording)

- **Job:** ○ Not saved · ◐ Lead (list-card data) · ● Detailed (posting captured). The description is labeled **Excerpt** or **Full**; Full only when expanded text was actually observed. Missing fields read "not seen yet" in muted text, never as errors.
- **Site collection:** Auto · Manual · Paused.
- **Links:** **Posting** (board URL) and **Apply at** (employer URL), each none yet · linked · unmatched.
- **Attempt:** Drafting · Paused · Captured · Blocked · Ready to submit · Submission unknown.
- **Application:** Applied · Receipt, or Applied · You confirmed. Only these appear in Applied.
- **Lease:** Available · Yours (14:32 left) · Held by scout-2 · Lease lost.
- **Sync:** Saved here · Syncing · Synced · Needs attention. Conflicts read **Changed elsewhere**.
- **Connection:** Connected · Not recently checked (9 days) · Offline (saving here) · Update required · Not set up.

## Primary paths

**Board.**
- Here shows the site's mode as a segmented control with its consequence, e.g. "Manual: only jobs you save are kept."
- Below it, "On this page" lists cards with status glyphs.
- **Auto** saves cards as Leads.
- **Manual** gives each card a Save button. Browsing saves nothing, but already-saved cards still enrich and show "updated".
- **Paused** greys the list.

**Posting.**
- A job header with one primary action: **Save job** (if not saved) or **Add details** (if already saved).
- "From this page" previews new fields (company, role, location, type, work mode, dates, URLs, description) and any differences, with **Keep saved / Use page** per field. Longer prior text wins by default.
- Fields are inline-editable and show their source ("LinkedIn card · Oct 2", "you", "scout-2").

**Application page.**
- If the owner arrived by clicking Apply on a known posting: "Linked to Acme · Platform Engineer", with Undo.
- Otherwise: **Which saved job is this?** with ranked candidates and search. Docket never guesses silently.
- Opening the page does not change application status.

**Capture.**
- Start capture lists the sections of the current step, e.g. Contact ✓ · Work history (3 entries, each its own group) ✓ · Education (on page, not captured) · Disclosures (not seen yet).
- The primary button is **Capture this section**.
- Each answer shows its value, Entered or Prefilled, Edit and Exclude.
- Passwords, codes and files appear as "Not recorded".
- Pause and Resume keep a local draft.
- **Finish capture** sets the attempt to Captured, which does not mean submitted.
- No Docket control says "Submit", and Docket never clicks the page.

**Submit.**
1. **I'm about to submit** records intent (Ready to submit).
2. The owner clicks the employer's own button.
3. **Confirm submitted** happens automatically when a receipt page is detected. Otherwise it requires an explicit "I submitted this" checkbox.
4. The result is one Applied record, with a readback of captured answers and the timestamp.

**Handoffs.**
- Grouped as Available / Yours / Held by others.
- Each row shows company, role, blocker (Login · Review · Missing info · CAPTCHA), agent and age.
- The detail view shows the agent's resume instructions verbatim, then **Take**, which acquires a lease with a countdown and a Renew option.
- Next: Open application, choose the step ("Step 3 of 6 · My Experience"), then tick fields to restore.
- Login, files, CAPTCHA and unsupported controls show "Do by hand" and cannot be selected.
- **Fill selected fields** fills the current step only.
- An **Agent capture | Your edits** toggle shows both layers; neither overwrites the other.

**Jobs.**
- Search covers role, company, location and ID. Filters: Leads · Detailed · Has apply link · Needs attention · Archived.
- Each row shows role (clamped to 2 lines), company · location · work mode, posted date, and a short ID (#4F2A) to tell look-alike titles apart.
- Job detail offers **Open posting** and **Open apply page**.
- **Archive** requires a reason (Not a fit, Location, Seniority, Closed, Duplicate, Other). It is refused while an attempt is active, with the message "Resolve the attempt first".
- Archiving a Lead first asks "Add details instead?"
- Archive uses neutral styling with an Undo toast. Restore keeps full history.

## Recovery states

- **Lease lost:** red banner: "Your lease expired. Someone else may be on this application. Don't submit." Fill is disabled. Actions: Check status · Re-take if available.
- **Submission unknown:** the attempt is locked for every worker until the owner picks I see a receipt · Not submitted · Can't tell yet. It is never re-queued automatically.
- **Changed elsewhere:** a stacked compare per field (Yours / Theirs, with author and time). The owner chooses per field, and the draft is kept until resolved.
- **Needs attention:** System → Sync lists each failed write with its reason, plus Retry and Keep local copy.
- **Update required:** writes keep queuing locally. Guided steps (download → browser Extensions page → Reload → Check now) state that identity, settings and drafts are kept.
- **Discard draft** is the only red confirmation dialog in everyday use.

## Screen/state map

- **First run:** Not set up → Paste key → Check → Connected
- **Here:**
  - Board {Auto | Manual | Paused}
  - Posting {Not saved | Lead | Detailed}
  - Application {Linked | Unmatched → picker} → Capture
  - Unrecognized (recent jobs, handoff count)
- **Jobs:** list → Job detail {Links, Fields, Description, Attempts, History, Archive/Restore}
- **Handoffs:** item → Take → Step → Fill → Intent → Confirm, with branches for Lease lost and Submission unknown
- **Applied:** list → Readback
- **Status chip → System:** {Connection, Key, Version & what's new, Update guide, Sync queue, Conflicts, Export diagnostics}

**Key and diagnostics.** System shows the key only as "Key stored on this device · added Oct 1", with **Replace key**. Diagnostics export previews its sections and redaction list: no key, no answers, no field values.

**Prototype note.** All data is synthetic (Acme, Northwind, Globex). A clearly separated "Simulated page" switcher drives the Here contexts. No network calls or real persistence.

## 360px tradeoffs

- **Detail views:** they push over the list instead of splitting the panel. Back restores scroll position and focus.
- **Diffs and conflicts:** they stack vertically, which is slower to scan than side-by-side but stays legible.
- **Row metadata:** sync and agent provenance collapse to labeled glyphs, with full text in the detail view. Rows stay at two lines at some cost to discoverability.
- **Badges and long values:** tab badges become dots below 400px. Restore values truncate and expand on Enter.
- **Actions:** each view has one primary action; secondary actions move into a ⋯ menu.