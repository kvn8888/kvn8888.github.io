export {};
const $ = (id: string) => document.getElementById(id)!;
const esc = (s: unknown) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
let work: any = null,
  offset = 0,
  index = 0;
const cmd = async (type: string, data: any = {}) => {
  const r = await chrome.runtime.sendMessage({
    type: "handoff-" + type,
    ...data,
  });
  if (!r?.ok) throw Error(r?.error || "No extension response");
  return r.data;
};
async function refresh() {
  work = (await cmd("state")).work;
  const list = await cmd("list", { offset });
  $("queue").innerHTML =
    list.items
      .map(
        (j: any) =>
          `<article class="card"><h3>${esc(j.company)} — ${esc(j.role)}</h3><p>${esc(j.summary)}</p><p>${esc(j.reason_code)} · ${esc(j.created_at)}${j.active_attempt_id ? " · In progress" : ""}</p><button class="button" data-take="${esc(j.id)}">${work?.handoffId === j.id ? "Resume" : "Take handoff"}</button></article>`,
      )
      .join("") || "<p>No handoffs waiting on this page.</p>";
  ($("more") as HTMLButtonElement).hidden =
    offset + list.items.length >= list.total;
  if (work) {
    const p = work.document.packets[index] || work.document.packets[0];
    $("work").innerHTML =
      `<article class="card"><h2>${esc(work.job?.company || p.company || "Your current handoff")} — ${esc(work.job?.role || p.role || "")}</h2><p>${esc(work.error || "Ownership is renewed while its application tab stays open. Close or release it when done.")}</p><label>Saved page<select id="page">${work.document.packets.map((p: any, i: number) => `<option value="${i}" ${i === index ? "selected" : ""}>Page ${i + 1}: ${esc(p.notes?.[0] || p.application_url)}</option>`).join("")}</select></label><pre style="white-space:pre-wrap">${esc((p.notes || []).join("\n"))}\n${esc(work.document.resume_instructions || "")}\n${esc((work.document.gaps || []).join("\n"))}</pre><p>${esc(
        Object.values(p.files || {})
          .map((f: any) => "Attach manually: " + f.suggested_filename)
          .join(" · "),
      )}</p><p>Workday and other multi-page forms: log in yourself, navigate to the matching step, create missing repeated sections manually, then restore. Custom controls may need manual entry.</p><button data-action="open" class="button">Open application URL</button><label class="check"><input id="correct-page" type="checkbox">I am on the correct employer, role and saved application step.</label><button data-action="restore" class="button">Restore this page</button><hr><button data-action="submit-start" class="button">Record that I’m about to submit</button><p>This records your progress. It does not click Submit on the employer’s site. Do this before your final employer submission so interruption is treated as uncertain.</p><label class="check"><input id="submitted" type="checkbox">I personally submitted and saw confirmation on the employer’s site.</label><label>Confirmation note<textarea id="receipt"></textarea></label><button data-action="complete" class="button primary">Save confirmed application</button><button data-action="recover" class="button">Recover after interruption</button><button data-action="release" class="button">${work.stage === "submit_started" ? "Report uncertain result" : "Release back to queue"}</button>${work.error ? '<button data-action="forget-failed-claim" class="button">Clear failed local claim (checks server first)</button>' : ""}</article>`;
  } else $("work").replaceChildren();
}
async function permit() {
  if (!work?.tabId) throw Error("Open the application first");
  const t = await chrome.tabs.get(work.tabId);
  if (!t.url) throw Error("Application tab is gone");
  const origins = new Set([new URL(t.url).origin + "/*"]);
  const frames =
    (await chrome.webNavigation.getAllFrames({ tabId: work.tabId })) || [];
  for (const f of frames) {
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
    throw Error("Site permission declined");
}
async function action(fn: () => Promise<unknown>) {
  try {
    $("status").textContent = "Working…";
    await fn();
    await refresh();
    $("status").textContent = "Up to date.";
  } catch (e) {
    $("status").textContent = e instanceof Error ? e.message : "Action failed";
  }
}
$("refresh").onclick = () => {
  offset = 0;
  void action(refresh);
};
$("more").onclick = () => {
  offset += 50;
  void action(refresh);
};
document.addEventListener("change", (e) => {
  if ((e.target as HTMLElement).id === "page") {
    index = Number((e.target as HTMLSelectElement).value);
    void action(refresh);
  }
});
document.addEventListener("click", (e) => {
  const b = (e.target as Element).closest<HTMLButtonElement>(
    "[data-take],[data-action]",
  );
  if (!b) return;
  void action(async () => {
    if (b.dataset.take) {
      index = 0;
      await cmd("claim", { id: b.dataset.take });
      return;
    }
    const a = b.dataset.action!;
    const extra: any = { packetIndex: index };
    if (a === "restore") {
      extra.confirmPage = ($("correct-page") as HTMLInputElement).checked;
      if (!extra.confirmPage) throw Error("Confirm the correct page first");
      await permit();
    }
    if (a === "complete") {
      extra.confirm = ($("submitted") as HTMLInputElement).checked;
      extra.notes = ($("receipt") as HTMLTextAreaElement).value;
    }
    const r = await cmd(a, extra);
    if (a === "restore") $("report").textContent = JSON.stringify(r, null, 2);
    if (a === "complete")
      $("report").textContent =
        "Application saved and read back: " + r.application_id;
  });
});
void action(refresh);
