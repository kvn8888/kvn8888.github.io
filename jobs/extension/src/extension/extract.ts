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
    if(job.application_url){const destination=new URL(job.application_url);if(/^\/(?:careers|jobs|apply)?\/?$/.test(destination.pathname)&&!['job','jobId','job_id','gh_jid','reqId'].some(k=>destination.searchParams.has(k)))job.application_url=null;}
    job.type = category(job.role || "");
    job.role_tags_json = JSON.stringify(job.type ? [job.type] : []);
    job.resolution_status = job.application_url ? "resolved" : job.resolution_status === "in_board" ? "in_board" : "unresolved";
    job.canonical_url = job.application_url;
    job.metadata_json = JSON.stringify({
      ...JSON.parse(job.metadata_json),
      adapter: "dom-v2-live",
      coverage: "observed_fields_only",
    });
    if (job.description && job.description.length > 50000) {
      job.description = job.description.slice(0, 50000);
      job.description_status = "partial";
      job.metadata_json = JSON.stringify({
        adapter: "dom-v1",
        coverage: "observed_fields_only",
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
        !/linkedin\.com|jobright\.ai|indeed\.com|joinhandshake\.com|symplicity\.com/.test(host)
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
  // Board-specific identities: never treat a recommendation/search URL as a job.
  const board = /(^|\.)jobright\.ai$/.test(host)?'jobright':/(^|\.)joinhandshake\.com$/.test(host)?'handshake':/(^|\.)symplicity\.com$/.test(host)?'symplicity':null;
  if(board){
    const selector=board==='jobright'?'a[href*="/jobs/info/"]':board==='handshake'?'a[href*="/stu/jobs/"],a[href*="/jobs/"],a[href*="/job-search/"]':'a[href*="/app/jobs/"],a[href*="job_id="],a[href*="jobid="]';
    const identity=(link:string)=>{const u=new URL(link);return board==='jobright'?u.pathname.match(/\/jobs\/info\/([a-z0-9-]+)/i)?.[1]:board==='handshake'?u.pathname.match(/\/(?:(?:stu\/)?jobs|job-search)\/(\d+)/)?.[1]:u.pathname.match(/\/app\/jobs\/([a-z0-9-]+)/i)?.[1]||u.searchParams.get('job_id')||u.searchParams.get('jobid');};
    for(const a of doc.querySelectorAll<HTMLAnchorElement>(selector)){
      const link=normalizeUrl(a.getAttribute('href')||'',url);if(!link||new URL(link).hostname!==host)continue;const id=identity(link);if(!id)continue;
      const card=board==='jobright'?a:(a.closest('[data-hook^="job-result-card"],[data-job-id],article,[data-testid*="job-card"],li')||a);
      const j=emptyJob(link);j.source_job_id=id;j.identity_key=board+':'+id;
      j.role=first(card,'h2,h3,[data-testid="job-title"],[class*="job-title"],.job-title')||(board==='jobright'?null:txt(a));

      j.company=first(card,'[class*="company-name"],[data-testid="employer-name"],[data-testid="company-name"],.employer-name');
      j.location=first(card,'[class*="primary-location"],[data-testid="job-location"],.job-location');
      if(board==='handshake' && card!==a){
        const region=card.querySelector('[role="region"][aria-labelledby]');const titleId=region?.getAttribute('aria-labelledby');
        if(titleId)j.role=txt(doc.getElementById(titleId))||j.role;
        j.company=card.querySelector('img[alt]')?.getAttribute('alt')||j.company;
        j.metadata_json=JSON.stringify({card_summary:a.getAttribute('aria-label')||txt(card)});
      }
      j.posted_at_raw=first(card,'[class*="publish-time"],time');
      if(!j.role||j.role.length>300)continue;
      finish(j);
    }
    const id=identity(url);
    if(id){const main=(board==='handshake'?doc.querySelector('[data-hook="right-content"]'):board==='jobright'?doc.querySelector('[id^="overview-"]'):null)||doc.querySelector('main,[role="main"],#jobs-page-main-content')||doc;const j=emptyJob(url);j.source_job_id=id;j.identity_key=board+':'+id;
      j.role=first(main,board==='jobright'?'h1':'h1,[data-testid="job-title"],[class*="job-title"]');
      j.company=first(main,'[class*="company-name"],[data-testid="employer-name"],[data-testid="company-name"],.employer-name');
      j.description=first(main,'[data-job-description],[itemprop="description"],[class*="job-description"],[data-testid="job-description"],.job-description');
      if(board==='handshake'){
        j.company=[...main.querySelectorAll('a[href^="/e/"]')].map(txt).find(Boolean)||j.company;
        const heading=[...main.querySelectorAll('h3')].find(e=>txt(e)==='Job description');
        const section=heading?.parentElement?.nextElementSibling;
        if(section){const copy=section.cloneNode(true) as Element;copy.querySelectorAll('button').forEach(b=>b.remove());j.description=txt(copy);}
        const glance=[...main.querySelectorAll('h3')].find(e=>txt(e)==='At a glance')?.parentElement?.textContent?.trim();
        if(glance)j.metadata_json=JSON.stringify({at_a_glance:glance});
        if([...main.querySelectorAll('button')].some(b=>/^(quick apply|apply on handshake)$/i.test(txt(b)||'')))j.resolution_status='in_board';
      }
      if(board==='jobright'){
        const sections=[...main.querySelectorAll('section')].filter(section=>/^(Responsibilities|Qualification|Benefits)$/i.test(first(section,'h2')||''));
        const parts=sections.map(section=>{const lines=[...new Set([...section.querySelectorAll('h4,[class*="listText"],li')].map(txt).filter(Boolean))];return [first(section,'h2'),...lines].join('\n');});
        if(parts.length)j.description=parts.join('\n\n');
        j.posted_at_raw=first(main,'[class*="publish-time"]');
        j.metadata_json=JSON.stringify({description_source:'jobright_rendered_sections',sections:sections.map(section=>first(section,'h2'))});
      }
      j.description_status=j.description?'partial':'missing'; // DOM may still be collapsed; never promise completeness.
      const apply=(board==='jobright'?doc:main).querySelector<HTMLAnchorElement>('a[data-testid="apply-button"],a[aria-label="Apply externally"],a[href*="myworkdayjobs.com"],a[href*="greenhouse.io"],a[href*="lever.co"],a[href*="ashbyhq.com"]');
      if(apply){const destination=normalizeUrl(apply.getAttribute('href')||'',url);if(destination&&new URL(destination).hostname!==host)j.application_url=destination;}
      if(j.role)finish(j);
    }
  }
  if(/(^|\.)linkedin\.com$/.test(host)){
    for(const a of doc.querySelectorAll<HTMLAnchorElement>('a[href*="currentJobId="]')){
      const link=normalizeUrl(a.getAttribute('href')||'',url);if(!link)continue;const id=new URL(link).searchParams.get('currentJobId');if(!id||!/^\d+$/.test(id))continue;
      const paragraphs=[...a.querySelectorAll('p')];if(paragraphs.length<2)continue;
      const j=emptyJob(`https://www.linkedin.com/jobs/view/${id}/`);j.source_job_id=id;j.identity_key='linkedin:'+id;
      j.role=first(paragraphs[0],'[aria-hidden="true"]')||txt(paragraphs[0]);j.company=txt(paragraphs[1]);
      const bullet=paragraphs.findIndex(p=>txt(p)==='•');if(bullet>=0)j.location=txt(paragraphs[bullet+1]);
      if(j.role&&j.role.length<=300)finish(j);
    }
  }
  // Current LinkedIn detail views no longer use the older jobs-details classes.
  if(/(^|\.)linkedin\.com$/.test(host)){
    const id=new URL(url).searchParams.get('currentJobId')||new URL(url).pathname.match(/\/jobs\/view\/(\d+)/)?.[1];
    const heading=[...doc.querySelectorAll('h2')].find(h=>txt(h)==='About the job');
    if(id&&/^\d+$/.test(id)&&heading){
      const titleLink=[...doc.querySelectorAll<HTMLAnchorElement>('a[href*="/jobs/view/"]')].find(a=>new URL(a.href,url).pathname.match(/\/jobs\/view\/(\d+)/)?.[1]===id);
      if(titleLink){
        const j=emptyJob(`https://www.linkedin.com/jobs/view/${id}/`);j.source_job_id=id;j.identity_key='linkedin:'+id;j.role=txt(titleLink);
        let header:Element|null=titleLink.parentElement;
        while(header&&!header.querySelector('a[href*="/company/"]'))header=header.parentElement;
        if(header){j.company=[...header.querySelectorAll('a[href*="/company/"]')].map(txt).find(Boolean)||null;
          const meta=[...header.querySelectorAll('p')].map(txt).find(t=>t&&t.includes(' · ')&&/ago|applicant/i.test(t));if(meta){j.location=meta.split(' · ')[0];j.posted_at_raw=meta;}
          const links=[...header.querySelectorAll('a')].map(txt);
          j.work_mode=links.includes('Remote')?'remote':links.includes('Hybrid')?'hybrid':links.includes('On-site')?'onsite':null;
          j.employment_type=links.find(t=>t&&/^(Full-time|Part-time|Contract|Internship)$/.test(t))||null;
        }
        const description=heading.parentElement?.nextElementSibling;
        j.description=txt(description||null);j.description_status=j.description?'partial':'missing';
        if([...doc.querySelectorAll('button')].some(b=>/Easy Apply/i.test(b.getAttribute('aria-label')||txt(b)||'')))j.resolution_status='in_board';
        if(j.role)finish(j);
      }
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
      (/(^|\.)linkedin\.com$/.test(host)?url.match(/\/jobs\/view\/(\d+)/)?.[1]:undefined);
    if (id && /(^|\.)linkedin\.com$/.test(host)) {
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
  const merged=new Map<string,Job>();
  for(const job of jobs){
    const prior=merged.get(job.identity_key);
    if(prior){
      for(const field of ['company','role','location','application_url','posted_at','posted_at_raw','employment_type','work_mode'] as const)if(!job[field]&&prior[field])(job as any)[field]=prior[field];
      if(prior.description && (!job.description || (prior.description_status==='full'&&job.description_status!=='full') || (prior.description_status===job.description_status&&job.description.length<prior.description.length))){job.description=prior.description;job.description_status=prior.description_status;}
      if(job.application_url){job.resolution_status='resolved';job.canonical_url=job.application_url;}
      job.metadata_json=JSON.stringify({...JSON.parse(prior.metadata_json),...JSON.parse(job.metadata_json)});
    }
    merged.set(job.identity_key,job);
  }
  return [...merged.values()];
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
