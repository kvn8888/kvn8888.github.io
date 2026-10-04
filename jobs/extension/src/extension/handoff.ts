const esc = (s: unknown) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const cmd = async (type: string, data: object = {}) => {
  const r = await chrome.runtime.sendMessage({
    type: "handoff-" + type,
    ...data,
  });
  if (!r?.ok) throw Error(r?.error || "No extension response");
  return r.data;
};
export function mountHandoffs(root: HTMLElement) {
  let work: any = null,
    offset = 0,
    index = 0,
    disposed = false,
    busy = false;
  let notice = "",
    report = "",
    preview: any = null;
  const button = (
    action: string,
    label: string,
    primary = false,
    disabled = false,
  ) =>
    `<button type="button" class="button ${primary ? "primary" : ""}" data-handoff-action="${action}" ${disabled ? "disabled" : ""}>${label}</button>`;
  function detail() {
    const current = work || preview;
    if (!current) return "";
    const doc = current.document;
    const p = doc.packets[index] || doc.packets[0];
    const blocked = !!work?.error || !!work?.completion_pending;
    return `<section class="section handoff-detail"><p class="eyebrow">${work ? "Yours · " + (work.completion_pending ? "Confirmed save pending" : work.stage === "submit_started" ? "Submission intent recorded" : "Human handoff") : "Handoff preview"}</p><h2>${esc(current.job?.role || p.role || "Application")}</h2><p>${esc(current.job?.company || p.company || "")}</p>${work?.error ? `<div class="notice danger" role="alert">${esc(work.error)}<p>Ownership could not be verified. Do not restore fields or submit until it is recovered.</p></div>` : ""}${work?.stage === "submit_started" ? '<div class="notice warning">Submission may already have started. Confirm a receipt or report uncertainty; do not submit again to test it.</div>' : ""}<h3>Resume instructions</h3><div class="description">${esc(doc.resume_instructions || "Review the saved steps before continuing.")}</div>${doc.gaps?.length ? `<details class="notice"><summary>Capture gaps</summary>${doc.gaps.map((g: string) => `<p>${esc(g)}</p>`).join("")}</details>` : ""}<label class="field">Saved page<select id="page">${doc.packets.map((p: any, i: number) => `<option value="${i}" ${i === index ? "selected" : ""}>Page ${i + 1}: ${esc(p.notes?.[0] || p.application_url)}</option>`).join("")}</select></label><p class="tiny mono url">${esc(p.application_url)}</p><div class="description">${esc((p.notes || []).join("\n"))}</div><details><summary>Captured fields (${p.fields?.length || 0})</summary>${(p.fields || []).map((f: any) => `<div class="answer"><strong>${esc(f.label || f.name || "Field")}</strong><pre>${esc(typeof f.value === "string" ? f.value : JSON.stringify(f.value))}</pre></div>`).join("")}</details><div class="notice"><strong>Do by hand</strong><p>Sign in, navigate to this step, add missing repeated sections, attach files and handle unsupported controls yourself. CAPTCHA controls are never restored.</p>${Object.values(
      p.files || {},
    )
      .map((f: any) => `<p>Attach: ${esc(f.suggested_filename)}</p>`)
      .join("")}</div>
  ${!work ? `<div class="actions">${button("take-preview", "Take handoff", true)}${button("close-preview", "Back to queue")}</div>` : `<div class="actions">${button("open", "Open application URL", true, blocked)}${button("check", "Check ownership")}</div><label class="check"><input id="correct-page" type="checkbox" ${blocked ? "disabled" : ""}>I am on the correct employer, role and saved application step.</label>${button("restore", "Restore this page", false, blocked)}<section class="section"><h3>After reviewing the form</h3>${button("submit-start", "Record that I’m about to submit", false, blocked || work.stage === "submit_started")}<p class="tiny muted">Records intent only. Use the employer’s own Submit button after reviewing the form.</p><label class="check"><input id="submitted" type="checkbox">I personally submitted and saw confirmation on the employer’s site.</label><label class="field">Confirmation note<textarea id="receipt"></textarea></label>${button("complete", work.completion_pending ? "Retry confirmed save" : "Save confirmed application", true)}</section><details class="section"><summary>Recovery & release</summary><p>Recover an interrupted lease before starting again. An uncertain result requires receipt reconciliation in the tracker.</p><div class="actions">${button("recover", "Recover after interruption")}${button("release", work.stage === "submit_started" ? "Report uncertain result" : "Release back to queue")}${work.error ? button("forget-failed-claim", "Clear failed local claim (checks server first)") : ""}</div></details>`}</section>`;
  }
  async function refresh() {
    const oldReceipt =
      (root.querySelector("#receipt") as HTMLTextAreaElement)?.value || "";
    const submitted =
      (root.querySelector("#submitted") as HTMLInputElement)?.checked || false;
    const priorId = work?.id;
    work = (await cmd("state")).work;
    const list = await cmd("list", { offset });
    if (disposed) return;
    if (priorId !== work?.id) index = 0;
    root.innerHTML = `<div class="section-heading"><div><h1>Handoffs</h1><p class="muted">Blocked work that needs your action.</p></div>${button("refresh", "Refresh queue")}</div><p id="handoff-status" role="status" class="tiny">${esc(notice)}</p>${report ? `<pre class="notice readback" id="report">${esc(report)}</pre>` : ""}${detail()}<section><h2>${work ? "Other queued work" : "Waiting for you"}</h2>${list.items.length ? list.items.map((j: any) => `<article class="job-row"><h3>${esc(j.role || "Application")}</h3><p class="job-meta">${esc(j.company)} · ${esc(j.reason_code?.replaceAll("_", " "))}</p><p class="tiny muted">${esc(j.summary)} · ${esc(new Date(j.created_at).toLocaleDateString())}${j.active_attempt_id ? " · Has active attempt" : ""}</p><div class="actions">${j.id === work?.handoffId ? '<span class="tag">Yours</span>' : `<button class="button" data-preview="${esc(j.id)}">Review handoff</button><button class="button" data-take="${esc(j.id)}" ${work || j.active_attempt_id ? "disabled" : ""}>Take handoff</button>`}</div></article>`).join("") : '<div class="empty"><h3>No handoffs on this page</h3><p>Agents can queue blocked attempts here without sending you files.</p></div>'}<nav class="pagination" aria-label="Handoff pages">${button("previous", "Previous", false, offset === 0)}<span>Page ${offset / 50 + 1}</span>${button("more", "Next page", false, offset + list.items.length >= list.total)}</nav></section><p class="tiny muted">You handle the employer site. The extension restores supported fields and records confirmed results.</p>`;
    if (priorId === work?.id) {
      const receipt = root.querySelector<HTMLTextAreaElement>("#receipt");
      if (receipt) receipt.value = oldReceipt;
      const confirm = root.querySelector<HTMLInputElement>("#submitted");
      if (confirm) confirm.checked = submitted;
    }
  }
  async function permit() {
    if (!work?.tabId) throw Error("Open the application first.");
    const expected = work.document.packets[index]?.application_url;
    if (!expected) throw Error("Choose a saved page.");
    const origins = new Set([new URL(expected).origin + "/*"]);
    for (const f of (await chrome.webNavigation.getAllFrames({
      tabId: work.tabId,
    })) || []) {
      if (/captcha|turnstile|challenges\.cloudflare/i.test(f.url)) continue;
      try {
        const u = new URL(f.url);
        if (
          u.protocol === "https:" &&
          /(^|\.)(greenhouse\.io|lever\.co|ashbyhq\.com|myworkdayjobs\.com|myworkdaysite\.com|myworkday\.com|smartrecruiters\.com|icims\.com|taleo\.net|successfactors\.com)$/.test(
            u.hostname,
          )
        )
          origins.add(u.origin + "/*");
      } catch {}
    }
    if (!(await chrome.permissions.request({ origins: [...origins] })))
      throw Error("Site permission declined.");
  }
  async function action(fn: () => Promise<void>) {
    if (busy || disposed) return;
    busy = true;
    root.setAttribute("aria-busy", "true");
    try {
      await fn();
      await refresh();
    } catch (e) {
      notice = (e as Error).message;
      const status = root.querySelector("#handoff-status");
      if (status) status.textContent = notice;
      else
        root.innerHTML = `<h1>Handoffs</h1><div class="notice warning" role="alert">${esc(notice)}</div>${button("refresh", "Try again")}`;
    } finally {
      busy = false;
      root.removeAttribute("aria-busy");
    }
  }
  const click = (e: Event) => {
    const b = (e.target as Element).closest<HTMLElement>(
      "[data-handoff-action],[data-take],[data-preview]",
    );
    if (!b) return;
    e.preventDefault();
    void action(async () => {
      if (b.dataset.preview) {
        preview = await cmd("detail", { id: b.dataset.preview });
        index = 0;
        return;
      }
      if (b.dataset.take) {
        work = await cmd("claim", { id: b.dataset.take });
        preview = null;
        index = 0;
        return;
      }
      const a = b.dataset.handoffAction;
      if (a === "take-preview") {
        work = await cmd("claim", { id: preview.handoff.id });
        preview = null;
        return;
      }
      if (a === "close-preview") {
        preview = null;
        return;
      }
      if (a === "refresh") {
        offset = 0;
        return;
      }
      if (a === "more") {
        offset += 50;
        return;
      }
      if (a === "previous") {
        offset = Math.max(0, offset - 50);
        return;
      }
      const extra: any = { packetIndex: index };
      if (a === "restore") {
        extra.confirmPage =
          root.querySelector<HTMLInputElement>("#correct-page")?.checked;
        if (!extra.confirmPage)
          throw Error("Confirm the correct employer, role and step first.");
        await permit();
      }
      if (a === "complete") {
        extra.confirm =
          root.querySelector<HTMLInputElement>("#submitted")?.checked;
        extra.notes =
          root.querySelector<HTMLTextAreaElement>("#receipt")?.value;
      }
      const result = await cmd(a!, extra);
      if (a === "restore")
        report =
          "Restore results (no submission):\n" +
          JSON.stringify(result, null, 2);
      if (a === "complete")
        report = "Application saved and read back: #" + result.application_id;
      if (a === "release" || a === "recover")
        report =
          "Work released or recovered. Check the tracker for any uncertain submission before trying again.";
      notice = "Up to date.";
    });
  };
  const change = (e: Event) => {
    if ((e.target as HTMLElement).id === "page") {
      index = Number((e.target as HTMLSelectElement).value);
      void action(async () => {});
    }
  };
  root.addEventListener("click", click);
  root.addEventListener("change", change);
  const onChanged = (changes: {
    [key: string]: chrome.storage.StorageChange;
  }) => {
    if (changes.handoffWork && !busy && !root.contains(document.activeElement))
      void action(async () => {});
  };
  chrome.storage.onChanged.addListener(onChanged);
  void action(async () => {});
  return () => {
    disposed = true;
    root.removeEventListener("click", click);
    root.removeEventListener("change", change);
    chrome.storage.onChanged.removeListener(onChanged);
  };
}
const standalone = document.querySelector<HTMLElement>("#handoff-root");
if (standalone) mountHandoffs(standalone);
