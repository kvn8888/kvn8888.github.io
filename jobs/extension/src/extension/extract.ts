import {
  emptyJob,
  normalizeUrl,
  category,
  type Job,
  type Field,
  type PageSnapshot,
} from "../shared/model";
const txt = (el: Element | null) =>
  el?.textContent?.replace(/\s+/g, " ").trim() || null;
const first = (root: ParentNode, selectors: string) =>
  txt(root.querySelector(selectors));
function plain(doc: Document, value: unknown) {
  if (typeof value !== "string") return null;
  const el = doc.createElement("div");
  el.innerHTML = value;
  return el.textContent?.trim() || null;
}
export function extractJobs(doc: Document, url: string): Job[] {
  const jobs: Job[] = [];
  const host = new URL(url).hostname;
  function finish(job: Job) {
    job.type = category(job.role || "");
    job.role_tags_json = JSON.stringify(job.type ? [job.type] : []);
    job.resolution_status = job.application_url ? "resolved" : "unresolved";
    job.canonical_url = job.application_url;
    job.metadata_json = JSON.stringify({
      adapter: "dom-v1",
      coverage: "observed_fields_only",
    });
    if (job.description && job.description.length > 50000) {
      job.description = job.description.slice(0, 50000);
      job.description_status = "partial";
      job.metadata_json = JSON.stringify({
        adapter: "dom-v1",
        gaps: ["Description exceeds 50,000 characters; stored preview only."],
      });
    }
    jobs.push(job);
  }
  // Standard JobPosting payloads are read without executing page JavaScript.
  const walk = (value: any) => {
    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }
    if (!value || typeof value !== "object") return;
    if ([value["@type"]].flat().includes("JobPosting")) {
      const link = normalizeUrl(value.url || url, url);
      if (!link) return;
      const j = emptyJob(link);
      j.role = typeof value.title === "string" ? value.title : null;
      j.company =
        typeof value.hiringOrganization?.name === "string"
          ? value.hiringOrganization.name
          : null;
      j.description = plain(doc, value.description);
      j.description_status = j.description ? "full" : "missing";
      j.posted_at =
        typeof value.datePosted === "string" ? value.datePosted : null;
      j.employment_type =
        typeof value.employmentType === "string" ? value.employmentType : null;
      const loc = [value.jobLocation]
        .flat()
        .filter(Boolean)
        .map((l: any) => l.address)
        .filter(Boolean);
      j.locations_json = JSON.stringify(loc);
      j.location =
        loc
          .map((a: any) =>
            [a.addressLocality, a.addressRegion, a.addressCountry]
              .filter(Boolean)
              .join(", "),
          )
          .join(" / ") || null;
      j.work_mode = value.jobLocationType === "TELECOMMUTE" ? "remote" : null;
      if (
        !/linkedin\.com|jobright\.ai|indeed\.com|joinhandshake\.com/.test(host)
      )
        j.application_url = link;
      const id = value.identifier?.value;
      if (typeof id === "string") {
        j.source_job_id = id;
        j.identity_key = `${j.source}:${id}`;
      }
      finish(j);
    }
    if (value["@graph"]) walk(value["@graph"]);
  };
  for (const script of doc.querySelectorAll(
    'script[type="application/ld+json"]',
  )) {
    try {
      walk(JSON.parse(script.textContent || ""));
    } catch {
      /* Malformed site JSON is not executable code. */
    }
  }
  // LinkedIn list/detail layouts: capture cards as they enter the DOM, including recycled lists.
  for (const card of doc.querySelectorAll(
    "[data-job-id], [data-occludable-job-id], .base-card, .job-card-container",
  )) {
    const a = card.querySelector<HTMLAnchorElement>('a[href*="/jobs/view/"]');
    if (!a) continue;
    const link = normalizeUrl(a.getAttribute("href") || "", url);
    if (!link) continue;
    const j = emptyJob(link);
    const id =
      card.getAttribute("data-job-id") ||
      card.getAttribute("data-occludable-job-id") ||
      link.match(/\/jobs\/view\/(?:.*-)?(\d+)/)?.[1];
    j.source_job_id = id || null;
    j.identity_key = id ? `${j.source}:${id}` : j.identity_key;
    j.role =
      first(
        card,
        ".job-card-list__title, .base-search-card__title, [data-test-job-title]",
      ) || txt(a);
    j.company = first(
      card,
      ".artdeco-entity-lockup__subtitle, .job-card-container__primary-description, .base-search-card__subtitle",
    );
    j.location = first(
      card,
      ".job-card-container__metadata-wrapper, .job-search-card__location",
    );
    finish(j);
  }
  const detail = doc.querySelector(
    '.jobs-search__job-details--container, .jobs-details, .job-view-layout, [data-automation-id="jobPostingPage"]',
  );
  if (detail) {
    const j = emptyJob(url);
    const id =
      new URL(url).searchParams.get("currentJobId") ||
      url.match(/\/jobs\/view\/(\d+)/)?.[1];
    if (id) {
      j.source_job_id = id;
      j.identity_key = `${j.source}:${id}`;
      j.source_url = `https://www.linkedin.com/jobs/view/${id}/`;
    }
    j.role = first(detail, "h1, .job-details-jobs-unified-top-card__job-title");
    j.company = first(
      detail,
      '.job-details-jobs-unified-top-card__company-name, [data-automation-id="companyName"]',
    );
    j.description = first(
      detail,
      '#job-details, .jobs-description-content__text, [data-automation-id="jobPostingDescription"]',
    );
    j.description_status = j.description ? "full" : "missing";
    j.location = first(
      detail,
      '.job-details-jobs-unified-top-card__primary-description-container, [data-automation-id="locations"]',
    );
    const apply = detail.querySelector<HTMLAnchorElement>(
      'a.jobs-apply-button, a[data-automation-id="applyButton"], a[href*="greenhouse.io"], a[href*="myworkdayjobs.com"], a[href*="lever.co"]',
    );
    if (apply) {
      const link = normalizeUrl(apply.getAttribute("href") || "", url);
      if (link && new URL(link).hostname !== host) j.application_url = link;
    }
    if (j.role) finish(j);
  }
  return [...new Map(jobs.map((j) => [j.identity_key, j])).values()];
}
function labelFor(doc: Document, el: HTMLElement) {
  const control = el as HTMLInputElement;
  return (
    [...(control.labels || [])]
      .map((l) => txt(l))
      .filter(Boolean)
      .join(" ") ||
    el.getAttribute("aria-label") ||
    (el.getAttribute("aria-labelledby") || "")
      .split(" ")
      .map((id) => txt(doc.getElementById(id)))
      .filter(Boolean)
      .join(" ") ||
    el
      .closest('[data-automation-id="formField"], .form-field')
      ?.querySelector("label")
      ?.textContent?.trim() ||
    el.getAttribute("placeholder") ||
    el.getAttribute("name") ||
    "Unlabeled field"
  );
}
export function capturePage(doc: Document, url: string): PageSnapshot {
  const at = new Date().toISOString();
  const fields: Field[] = [];
  const counts = new Map<string, number>();
  const gaps: string[] = [];
  const heading =
    first(
      doc,
      '[aria-current="step"], [data-automation-id="pageHeaderTitle"], main h1, form h2, h1',
    ) || doc.title;
  const page_id = `${new URL(url).pathname}${new URL(url).search}${new URL(url).hash}::${heading}`;
  const selector =
    'input,textarea,select,[contenteditable="true"],[role="combobox"],[role="checkbox"],[role="radio"]';
  for (const el of doc.querySelectorAll<HTMLElement>(selector)) {
    const control = el as HTMLInputElement;
    const type = (
      control.type ||
      el.getAttribute("role") ||
      "contenteditable"
    ).toLowerCase();
    const label = labelFor(doc, el);
    if (
      ["hidden", "password", "submit", "button", "reset"].includes(type) ||
      /password|one.?time|verification.code|security.code|credit.card|card.number|\bcvv\b/i.test(
        [label, el.getAttribute("autocomplete"), control.name].join(" "),
      ) ||
      el.getAttribute("autocomplete")?.startsWith("cc-")
    )
      continue;
    if (
      el.closest('[hidden], [aria-hidden="true"]') ||
      el.style.display === "none" ||
      (typeof el.checkVisibility === "function" &&
        !el.checkVisibility({ checkVisibilityCSS: true }))
    )
      continue;
    const group = el.closest(
      'fieldset, [data-automation-id="workExperienceSection"], [data-automation-id="educationSection"]',
    );
    const groupLabel = group ? first(group, "legend,h3,h2") || "group" : "";
    const key = `${groupLabel}:${control.name || el.id || label}`;
    const n = counts.get(key) || 0;
    counts.set(key, n + 1);
    let answer: unknown = null,
      state: Field["answer_state"] = "answered";
    if (type === "checkbox" || type === "radio")
      answer =
        control.tagName === "INPUT"
          ? { checked: control.checked, value: control.value }
          : el.hasAttribute("aria-checked")
            ? {
                checked: el.getAttribute("aria-checked") === "true",
                value: txt(el),
              }
            : null;
    else if (type === "file")
      answer = [...(control.files || [])].map((f) => ({
        filename: f.name,
        mime_type: f.type,
        size_bytes: f.size,
      }));
    else if (el.tagName === "SELECT")
      answer = [...(el as HTMLSelectElement).selectedOptions].map((o) => ({
        value: o.value,
        label: o.text,
      }));
    else if (el.tagName === "INPUT" || el.tagName === "TEXTAREA")
      answer = control.value;
    else if (
      el.isContentEditable ||
      el.getAttribute("contenteditable") === "true"
    )
      answer = el.textContent || "";
    else {
      answer = el.getAttribute("aria-valuetext");
      if (answer === null) {
        state = "unobserved";
        gaps.push(`Custom control needs review: ${label}`);
      }
    }
    if (answer === "" || (Array.isArray(answer) && answer.length === 0))
      state = "blank";
    fields.push({
      field_id: `${page_id}:${key}:${n}`,
      label,
      control_type: type,
      required: control.required || el.getAttribute("aria-required") === "true",
      answer_state: state,
      answer,
      captured_at: at,
    });
  }
  if (doc.querySelector("iframe"))
    gaps.push(
      "Embedded frames are not captured; review their answers separately.",
    );
  if (!fields.length)
    gaps.push("No supported form fields were found on this section.");
  return {
    page_id,
    title: heading,
    url,
    captured_at: at,
    fields,
    gaps: [...new Set(gaps)],
  };
}
