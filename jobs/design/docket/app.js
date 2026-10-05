'use strict';
// Docket prototype — slice 1: Here (board, posting, Apply-at link) and Jobs.
// All data is synthetic. No network, no storage, no browser-extension APIs.

const TODAY = 'Oct 4';
const SITES = {
  linkedin:   { name: 'LinkedIn',   host: 'www.linkedin.com',          board: '/jobs/search/?keywords=software+engineer', post: id => `/jobs/view/${id}/` },
  jobright:   { name: 'Jobright',   host: 'jobright.ai',               board: '/jobs/recommend',                        post: id => `/jobs/info/${id}` },
  handshake:  { name: 'Handshake',  host: 'app.joinhandshake.com',     board: '/stu/postings',                          post: id => `/stu/jobs/${id}` },
  symplicity: { name: 'Symplicity', host: 'stateu-csm.symplicity.com', board: '/students/app/jobs/search',              post: id => `/students/app/jobs/detail/${id}` }
};
const FIELDS = [['company', 'Company'], ['role', 'Role'], ['location', 'Location'], ['type', 'Employment type'], ['mode', 'Work mode'], ['posted', 'Posted'], ['closes', 'Closes']];
const REASONS = ['Not a fit', 'Location', 'Seniority', 'Closed', 'Duplicate', 'Other'];
const MODE_TEXT = {
  Auto: 'Auto: cards you scroll past are saved as leads.',
  Manual: 'Manual: only jobs you save are kept. Saved jobs still update.',
  Paused: 'Paused: nothing is saved or updated on this site.'
};
const SYNC = { Synced: '✓ Synced', Syncing: '◷ Syncing', 'Saved here': '⇣ Saved here' };
const TABS = [['here', 'Here'], ['jobs', 'Jobs'], ['handoffs', 'Handoffs'], ['applied', 'Applied']];

// What the simulated pages show. A card shows less than its posting.
function L(key, site, company, role, location, posted, type, mode, closes, apply, excerpt, full) {
  return { key, site, id: key.split(':')[1], card: { company, role, location, posted }, post: { company, role, location, type, mode, posted, closes }, apply, excerpt, full };
}
const LISTINGS = [
  L('li:4012', 'linkedin', 'Acme', 'Platform Engineer', 'Remote (US)', 'Oct 1', 'Full-time', 'Remote', 'Oct 31',
    'https://boards.greenhouse.io/acme/jobs/4471023',
    'Join the platform team that runs Acme’s build and deploy systems. You’ll work on CI pipelines, internal tooling and…',
    'Join the platform team that runs Acme’s build and deploy systems. You’ll work on CI pipelines, internal tooling and service reliability alongside senior engineers. You have shipped code in Go, Python or TypeScript and are comfortable on Linux. 0–2 years of experience; new graduates welcome. Remote within the US, with one team week per quarter.'),
  L('li:4019', 'linkedin', 'Globex', 'Software Engineer I, Payments', 'Austin, TX', 'Oct 2', 'Full-time', 'Hybrid', null,
    'https://globex.wd5.myworkdayjobs.com/en-US/Careers/job/Austin-TX/Software-Engineer-I--Payments_R-20931/apply',
    'Globex Payments moves money for 4,000 merchants. As a Software Engineer I you will build ledger services in Java and…',
    'Globex Payments moves money for 4,000 merchants. As a Software Engineer I you will build ledger services in Java and Kotlin, write careful tests, and join an on-call rotation after six months. Hybrid: three days a week in the Austin office.'),
  L('li:4023', 'linkedin', 'Northwind Traders', 'Backend Engineer, New Grad', 'Seattle, WA', 'Sep 28', 'Full-time', 'On-site', 'Oct 20',
    'https://jobs.lever.co/northwind/7c2e9a10/apply',
    'Northwind’s logistics platform routes 2M shipments a day. New grads join a backend pod working in Go and Postgres…',
    'Northwind’s logistics platform routes 2M shipments a day. New grads join a backend pod working in Go and Postgres, pair with a mentor for the first quarter, and own a service by month six. On-site in Seattle.'),
  L('jr:88b4', 'jobright', 'Globex', 'Software Engineer I', 'Remote (US)', 'Oct 3', 'Full-time', 'Remote', null,
    'https://globex.wd5.myworkdayjobs.com/en-US/Careers/job/Remote-US/Software-Engineer-I_R-21107/apply',
    'Build internal tools for Globex’s support organization using React and Node…',
    'Build internal tools for Globex’s support organization using React and Node. You will ship weekly, talk to the people who use your tools, and grow into owning a product area.'),
  L('jr:88c0', 'jobright', 'Contoso', 'Associate Software Engineer', 'Chicago, IL', 'Sep 25', 'Full-time', 'Hybrid', null,
    'https://contoso.wd1.myworkdayjobs.com/External/job/Chicago-IL/Associate-Software-Engineer_R-1182/apply',
    'Contoso builds scheduling software for clinics. Associates rotate through two teams…',
    'Contoso builds scheduling software for clinics. Associates rotate through two teams in their first year, working in C# and TypeScript. Hybrid in Chicago, two days a week.'),
  L('hs:551', 'handshake', 'Fabrikam', 'Software Engineer, New Grad 2027', 'Remote (US)', 'Oct 2', 'Full-time', 'Remote', 'Nov 15',
    'https://boards.greenhouse.io/fabrikam/jobs/5520918',
    'Fabrikam’s New Grad 2027 cohort starts in July. You’ll join one of our product teams…',
    'Fabrikam’s New Grad 2027 cohort starts in July. You’ll join one of our product teams after a four-week onboarding program, working across web and API code. Fully remote in the US.'),
  L('sy:7790', 'symplicity', 'Litware', 'Software Engineer I', 'Raleigh, NC', 'Sep 30', 'Full-time', 'On-site', 'Oct 25',
    'https://jobs.lever.co/litware/0d44b2e1/apply',
    'Litware is hiring entry-level engineers for its document platform…',
    'Litware is hiring entry-level engineers for its document platform. Expect Python, AWS and a lot of code review. On-site in Raleigh.')
];
const BOARDS = { linkedin: ['li:4012', 'li:4019', 'li:4023'], jobright: ['jr:88b4', 'jr:88c0'], handshake: ['hs:551'], symplicity: ['sy:7790'] };

// The three saved jobs this slice starts with.
function seedJobs() {
  const north = LISTINGS[2], contoso = LISTINGS[4], fab = LISTINGS[5], lit = LISTINGS[6];
  return [
    { id: '4F2A', key: 'li:4012', status: 'lead',
      f: { company: 'Acme', role: 'Platform Engineer', location: 'Remote', type: null, mode: null, posted: null, closes: null },
      src: { company: 'LinkedIn card · Sep 30', role: 'LinkedIn card · Sep 30', location: 'LinkedIn card · Sep 30' },
      desc: null, descKind: null, postingUrl: 'https://www.linkedin.com/jobs/view/4012/', applyUrl: null, applyState: 'none',
      attempt: null, archived: null, sync: 'Synced', history: [{ at: 'Sep 30', text: 'Saved as lead from LinkedIn card' }] },
    { id: '9C01', key: 'li:4023', status: 'detailed', f: { ...north.post, mode: 'Hybrid' },
      src: { company: 'LinkedIn posting · Sep 28', role: 'LinkedIn posting · Sep 28', location: 'LinkedIn posting · Sep 28', type: 'LinkedIn posting · Sep 28',
        mode: 'you · Sep 29', posted: 'LinkedIn posting · Sep 28', closes: 'LinkedIn posting · Sep 28', desc: 'LinkedIn posting · Sep 28', apply: 'Apply click · Sep 29' },
      desc: north.full, descKind: 'Full', postingUrl: 'https://www.linkedin.com/jobs/view/4023/', applyUrl: north.apply, applyState: 'linked',
      attempt: null, archived: null, sync: 'Synced',
      history: [{ at: 'Sep 28', text: 'Saved from LinkedIn posting' }, { at: 'Sep 29', text: 'You edited Work mode' }, { at: 'Sep 29', text: 'Apply at linked (your Apply click)' }, { at: 'Oct 1', text: 'Applied · Receipt (you confirmed)' }] },
    { id: 'B7E3', key: 'jr:88c0', status: 'detailed', f: { ...contoso.post, location: 'Chicago, IL (West Loop)' },
      src: { company: 'Jobright posting · Sep 25', role: 'Jobright posting · Sep 25', location: 'scout-2 · Oct 3', type: 'Jobright posting · Sep 25',
        mode: 'Jobright posting · Sep 25', posted: 'Jobright posting · Sep 25', desc: 'scout-2 · Oct 3', apply: 'scout-2 · Oct 3' },
      desc: 'Contoso builds scheduling software for outpatient clinics. Associates rotate through two teams in their first year (Scheduling and Billing), working in C# and TypeScript with weekly releases. Hybrid in Chicago, two days a week in the West Loop office.',
      descKind: 'Full', postingUrl: 'https://jobright.ai/jobs/info/88c0', applyUrl: contoso.apply, applyState: 'linked',
      attempt: null, archived: null, sync: 'Synced',
      history: [{ at: 'Sep 25', text: 'Saved from Jobright posting' }, { at: 'Oct 3', text: 'scout-2 added description and location from employer page' }, { at: 'Oct 4', text: 'scout-2 queued a handoff (Review)' }] },
    { id: 'D41E', key: 'hs:551', status: 'detailed', f: { ...fab.post }, src: {}, desc: fab.full, descKind: 'Full',
      postingUrl: 'https://app.joinhandshake.com/stu/jobs/551', applyUrl: fab.apply, applyState: 'linked', attempt: null, archived: null, sync: 'Synced',
      history: [{ at: 'Oct 2', text: 'Saved from Handshake posting' }, { at: 'Oct 4', text: 'scout-1 queued a handoff (Login)' }] },
    { id: 'E5A9', key: 'sy:7790', status: 'detailed', f: { ...lit.post }, src: {}, desc: lit.excerpt, descKind: 'Excerpt',
      postingUrl: 'https://stateu-csm.symplicity.com/students/app/jobs/detail/7790', applyUrl: lit.apply, applyState: 'linked', attempt: null, archived: null, sync: 'Synced',
      history: [{ at: 'Sep 30', text: 'Saved from Symplicity posting' }, { at: 'Oct 3', text: 'You marked Ready to submit' }, { at: 'Oct 3', text: 'Submission unknown: no receipt seen' }] }
  ];
}

const S = {
  tab: 'here', page: 'board|linkedin', width: 400, theme: 'system',
  modes: { linkedin: 'Manual', jobright: 'Auto', handshake: 'Auto', symplicity: 'Paused' },
  jobs: seedJobs(),
  expanded: {},   // listing key -> "Show more" expanded on the page
  boardTags: {},  // listing key -> 'updated' | 'new lead' | 'saved' for the current board visit
  link: null,     // last Apply-at link, for Undo
  q: '', filter: 'all', openId: null, listScroll: 0,
  edit: null, archive: null, toast: null, focus: null, scroll: null
};

// ---------- helpers ----------
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const listing = k => LISTINGS.find(l => l.key === k);
const byId = id => S.jobs.find(j => j.id === id);
const byKey = k => S.jobs.find(j => j.key === k);
const postingUrl = l => 'https://' + SITES[l.site].host + SITES[l.site].post(l.id);
const hostOf = u => u.split('/')[2];
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const st = j => !j ? '<span class="st none">○ Not saved</span>'
  : (j.status === 'lead' ? '<span class="st lead">◐ Lead</span>' : '<span class="st detailed">● Detailed</span>')
    + (j.archived ? ' <span class="tag">Archived</span>' : '') + (appliedFor(j) ? ' <span class="tag">Applied</span>' : '');

function pageUrl() {
  const [type, a] = S.page.split('|');
  if (type === 'board') return 'https://' + SITES[a].host + SITES[a].board;
  if (type === 'post') return postingUrl(listing(a));
  if (type === 'apply') return listing(a).apply;
  return 'https://news.example.com/2026/10/hiring-season-notes';
}
function pageObs(l) {
  const full = !!S.expanded[l.key];
  return { ...l.post, desc: full ? l.full : l.excerpt, descKind: full ? 'Full' : 'Excerpt' };
}

let toastTimer;
function toast(msg, undo) {
  S.toast = { msg, undo };
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { S.toast = null; renderToast(); }, 7000);
}

// ---------- state changes (all local) ----------
function write(j, text) {
  j.history.push({ at: TODAY, text });
  j.sync = online() ? 'Syncing' : 'Saved here';
  if (online()) setTimeout(() => { if (j.sync === 'Syncing') { j.sync = 'Synced'; render(); } }, 1200);
}
function newId() {
  let id;
  do id = Math.floor(Math.random() * 0xffff).toString(16).toUpperCase().padStart(4, '0'); while (byId(id));
  return id;
}
function createJob(l, status, obs, from) {
  const j = { id: newId(), key: l.key, status, f: {}, src: {}, desc: null, descKind: null, postingUrl: postingUrl(l),
    applyUrl: null, applyState: 'none', attempt: null, archived: null, sync: 'Synced', history: [] };
  for (const [k] of FIELDS) { j.f[k] = obs[k] || null; if (obs[k]) j.src[k] = `${from} · ${TODAY}`; }
  if (obs.desc) { j.desc = obs.desc; j.descKind = obs.descKind; j.src.desc = `${from} · ${TODAY}`; }
  S.jobs.unshift(j);
  write(j, (status === 'lead' ? 'Saved as lead from ' : 'Saved from ') + from);
  return j;
}

// Visiting a board observes its cards. Saved jobs gain missing card fields; Auto also saves new cards.
function observeBoard(site) {
  const mode = S.modes[site], name = SITES[site].name;
  S.boardTags = {};
  if (mode === 'Paused') return;
  let saved = 0;
  for (const key of BOARDS[site]) {
    const l = listing(key), j = byKey(key);
    if (j) {
      const added = FIELDS.filter(([k]) => !j.f[k] && l.card[k]);
      if (!added.length) continue;
      added.forEach(([k]) => { j.f[k] = l.card[k]; j.src[k] = `${name} card · ${TODAY}`; });
      write(j, `Updated from ${name} card: ${added.map(a => a[1].toLowerCase()).join(', ')}`);
      S.boardTags[key] = 'updated';
    } else if (mode === 'Auto') {
      createJob(l, 'lead', l.card, `${name} card`);
      S.boardTags[key] = 'new lead';
      saved++;
    }
  }
  if (saved) toast(`Auto: ${plural(saved, 'card')} saved as ${saved === 1 ? 'a lead' : 'leads'}`);
}

// Compare the page with the saved job. 'new' and 'grow' (page extends saved text) are applied automatically;
// 'diff' rows conflict and wait for an explicit refresh. A longer saved description is always kept.
function diffRows(j, obs) {
  const rows = [];
  for (const [k, label] of [...FIELDS, ['desc', 'Description']]) {
    const pv = obs[k], sv = k === 'desc' ? j.desc : j.f[k];
    if (!pv) continue;
    if (!sv) { rows.push({ k, label, kind: 'new', pv }); continue; }
    const a = sv.replace(/…$/, ''), b = pv.replace(/…$/, '');
    if (a === b || a.startsWith(b)) continue; // page shows the same or less of the saved text
    if (b.startsWith(a)) rows.push({ k, label, kind: 'grow', sv, pv });
    else if (k !== 'desc' || b.length > a.length) rows.push({ k, label, kind: 'diff', sv, pv });
  }
  return rows;
}
function applyRows(j, l, rows, how) {
  const obs = pageObs(l), from = `${SITES[l.site].name} posting`;
  rows.forEach(r => {
    if (r.k === 'desc') { j.desc = r.pv; j.descKind = obs.descKind; } else j.f[r.k] = r.pv;
    j.src[r.k] = `${from} · ${TODAY}`;
  });
  j.status = 'detailed';
  write(j, `${how} from ${from}: ${rows.map(r => r.label.toLowerCase()).join(', ')}`);
}
// Visiting a posting fills in fields that don't conflict. Auto sites also save unsaved postings.
function enrichPosting(l) {
  const mode = S.modes[l.site];
  if (mode === 'Paused') return;
  const j = byKey(l.key);
  if (!j) {
    if (mode === 'Auto') S.auto = { key: l.key, text: `Auto saved this posting as #${createJob(l, 'detailed', pageObs(l), `${SITES[l.site].name} posting`).id}.` };
    return;
  }
  const rows = diffRows(j, pageObs(l)).filter(r => r.kind !== 'diff');
  if (!rows.length) return;
  applyRows(j, l, rows, 'Added automatically');
  S.auto = { key: l.key, text: `Added automatically: ${rows.map(r => r.label.toLowerCase()).join(', ')}.` };
}
function linkApply(j, l, how) {
  S.link = { id: j.id, prevUrl: j.applyUrl, prevState: j.applyState, prevSrc: j.src.apply };
  j.applyUrl = l.apply; j.applyState = 'linked';
  j.src.apply = (how === 'click' ? 'Apply click · ' : 'you · ') + TODAY;
  write(j, how === 'click' ? 'Apply at linked (your Apply click)' : 'Apply at linked (you picked this job)');
}
function go(page, via) {
  S.page = page; S.link = null; S.boardTags = {}; S.edit = null; S.auto = null;
  const [type, key] = page.split('|');
  if (type === 'board') observeBoard(key);
  if (type === 'post') enrichPosting(listing(key));
  if (type === 'apply' && via === 'click') {
    const j = byKey(key);
    if (j && !j.archived) linkApply(j, listing(key), 'click');
  }
}
function openDetail(id) {
  if (S.tab === 'jobs' && !S.openId) S.listScroll = $('#p-body').scrollTop;
  S.tab = 'jobs'; S.openId = id; S.edit = null; S.archive = null; S.focus = 'detail-h'; S.scroll = 0;
}
function back() {
  S.focus = 'row-' + S.openId; S.openId = null; S.edit = null; S.archive = null; S.scroll = S.listScroll;
}
function setTab(t) { S.tab = t; S.edit = null; S.archive = null; S.sys = false; S.capEdit = null; }

// ---------- shared pieces ----------
function fieldsHTML(j) {
  return `<dl class="fields">${FIELDS.map(([k, label]) => {
    const v = j.f[k];
    if (S.edit && S.edit.id === j.id && S.edit.k === k) {
      return `<div class="field"><dt><label for="in-${k}">${label}</label></dt><dd class="editing"><form data-act="save-edit">
        <input type="text" id="in-${k}" name="v" value="${esc(v || '')}" data-k="in-${k}" autocomplete="off">
        <button class="btn small primary">Save</button><button type="button" class="btn small" data-act="cancel-edit">Cancel</button></form></dd></div>`;
    }
    return `<div class="field"><dt>${label}</dt><dd>${v ? esc(v) : '<span class="nsy">not seen yet</span>'}</dd>
      <button class="btn link" data-act="edit" data-id="${j.id}" data-f="${k}" data-k="edit-${k}" aria-label="Edit ${label}">Edit</button></div>`;
  }).join('')}</dl>`;
}
function destHTML(j) {
  const none = hint => `<span class="st none">○ none yet</span><span class="meta">${hint}</span>`;
  const posting = j.postingUrl
    ? `<span class="st">✓ linked</span><span class="url mono">${esc(j.postingUrl)}</span><span class="meta">Where you found it</span>`
    : none('Seen on a job board when you save from one.');
  const apply = j.applyState === 'linked'
    ? `<span class="st">✓ linked</span><span class="url mono">${esc(j.applyUrl)}</span><span class="meta">Employer application page</span>`
    : none('Set when you click Apply on the posting, or pick this job on an application page.');
  return `<dl class="fields"><div class="dest"><dt>Posting</dt><dd>${posting}</dd></div><div class="dest"><dt>Apply at</dt><dd>${apply}</dd></div></dl>`;
}
function jobRow(j) {
  const meta = [j.f.company, j.f.location, j.f.mode].filter(Boolean).map(esc).join(' · ');
  const extra = j.archived ? `Archived ${esc(j.archived.at)} · ${esc(j.archived.reason)}` : `Posted ${j.f.posted ? esc(j.f.posted) : '<span class="nsy">not seen yet</span>'}`;
  return `<li><button class="row" data-act="open-job" data-id="${j.id}" data-nav data-k="row-${j.id}">
    <span class="row-title">${esc(j.f.role)}</span><span class="row-side id mono">#${j.id}</span>
    <span class="row-meta">${st(j)} · ${meta}</span>
    <span class="row-meta">${extra}${syncWord(j)}</span></button></li>`;
}
function head(url, kind, title, sub) {
  return `<section class="sec"><div class="ctx"><span class="mono">${esc(url)}</span><span>${kind}</span></div>
    <h2 class="title" tabindex="-1" data-k="here-h">${title}</h2>${sub || ''}</section>`;
}
function modeSeg(site) {
  const m = S.modes[site];
  return `<section class="sec"><fieldset class="seg"><legend class="sr">Collection on ${esc(SITES[site].host)}</legend>
    ${['Auto', 'Manual', 'Paused'].map(v => `<label><input type="radio" name="mode" value="${v}" data-act="mode" data-site="${site}" data-k="mode-${v}"${v === m ? ' checked' : ''}><span>${v}</span></label>`).join('')}
    </fieldset><p class="consequence">${MODE_TEXT[m]}</p></section>`;
}

// ---------- Here ----------
function hereBoard(site) {
  const s = SITES[site], mode = S.modes[site], keys = BOARDS[site];
  const rows = keys.map(key => {
    const l = listing(key), j = byKey(key), tag = S.boardTags[key];
    let side = '';
    if (j) side = `<button class="btn small" data-act="open-job" data-id="${j.id}" data-nav data-k="b-${key}" aria-label="Open #${j.id} in Jobs">#${j.id}</button>`;
    else if (mode === 'Manual') side = `<button class="btn small" data-act="save-card" data-key="${key}" data-nav data-k="b-${key}" aria-label="Save ${esc(l.card.role)} at ${esc(l.card.company)}">Save</button>`;
    return `<li class="card-row"><div class="grow"><div>${st(j)}${tag ? ` <span class="tag accent">${tag}</span>` : ''}</div>
      <div class="row-title">${esc(l.card.role)}</div>
      <div class="row-meta">${esc(l.card.company)} · ${esc(l.card.location)}${l.card.posted ? ' · ' + esc(l.card.posted) : ''}</div></div>${side}</li>`;
  }).join('');
  return head(pageUrl(), 'Board', `${s.name} · job list`) + modeSeg(site)
    + `<section class="sec flush"><h3 class="sec-h">On this page <span class="aside">${plural(keys.length, 'card')}</span></h3>
      <ul class="list${mode === 'Paused' ? ' dimmed' : ''}">${rows}</ul></section>`;
}

function herePost(l) {
  const s = SITES[l.site], j = byKey(l.key), obs = pageObs(l), paused = S.modes[l.site] === 'Paused';
  const diffs = j ? diffRows(j, obs).filter(r => r.kind === 'diff') : [];
  const lead = !j ? (paused ? `Collection is paused on ${esc(s.host)}. Switch to Manual to save jobs one at a time.` : 'Docket hasn’t kept this job.')
    : diffs.length ? `This page differs from your saved job in ${plural(diffs.length, 'field')}. Saved values stay unless you refresh.`
    : paused ? 'Collection is paused here, so this page isn’t added to the saved job.' : 'Saved job is up to date with this page.';
  const sub = `<div class="meta">${esc(obs.company)} · ${esc(obs.location)}</div>
    <p>${st(j)}${j ? ` <span class="id mono">#${j.id}</span>` : ''} <span class="muted">— ${lead}</span></p>
    ${S.auto && S.auto.key === l.key ? `<p class="meta" role="status">✓ ${esc(S.auto.text)}</p>` : ''}
    <div class="actions">${!j ? `<button class="btn primary" data-act="save-post" data-key="${l.key}"${paused ? ' disabled' : ''}>Save job</button>`
      : `${diffs.length ? `<button class="btn" data-act="refresh" data-key="${l.key}"${paused ? ' disabled' : ''}>Refresh from page</button>` : ''}
        <button class="btn link" data-act="open-job" data-id="${j.id}">Open in Jobs</button>`}</div>`;
  const descNote = obs.descKind === 'Excerpt' ? '<p class="meta">Only an excerpt is visible. Expand “Show more” on the page and Docket adds the full text.</p>' : '';
  let page;
  if (!j) {
    page = `<dl class="fields">${FIELDS.map(([k, label]) => `<div class="field"><dt>${label}</dt><dd>${obs[k] ? esc(obs[k]) : '<span class="nsy">not seen yet</span>'}</dd></div>`).join('')}</dl>
      <div class="diff"><div class="diff-h"><span>Description</span><span>${obs.descKind}</span></div><div class="diff-v clamp">${esc(obs.desc)}</div></div>${descNote}`;
  } else if (diffs.length) {
    page = diffs.map(r => `<div class="diff"><div class="diff-h"><span>${r.label}</span><span class="tag">Differs</span></div>
      <div class="diff-v${r.k === 'desc' ? ' clamp' : ''}"><span class="meta">Saved</span> ${esc(r.sv)}</div>
      <div class="diff-v${r.k === 'desc' ? ' clamp' : ''}"><span class="meta">Page</span> ${esc(r.pv)}</div></div>`).join('')
      + '<p class="meta">Refresh uses the page’s values for these fields. A longer saved description is always kept.</p>' + descNote;
  } else page = `<p class="muted">Nothing new or conflicting.</p>${descNote}`;
  return head(pageUrl(), `Posting · ${s.name}`, esc(obs.role), sub) + modeSeg(l.site)
    + `<section class="sec"><h3 class="sec-h">From this page</h3>${page}</section>`
    + (j ? `<section class="sec"><h3 class="sec-h">Links</h3>${destHTML(j)}</section>
      <section class="sec"><h3 class="sec-h">Saved fields</h3>${fieldsHTML(j)}</section>` : '');
}

function hereApply(l) {
  const linked = S.jobs.find(j => !j.archived && j.applyUrl === l.apply);
  let body;
  if (linked) {
    body = `<div class="banner accent"><p><strong>Linked to ${esc(linked.f.company)} · ${esc(linked.f.role)}</strong> <span class="id mono">#${linked.id}</span></p>
      <p class="meta">This page is now the job’s Apply at destination. The Posting link is unchanged.</p>
      <div class="actions">${S.link && S.link.id === linked.id ? `<button class="btn" data-act="unlink" data-k="unlink">Undo</button>` : ''}
      <button class="btn link" data-act="open-job" data-id="${linked.id}">Open in Jobs</button></div></div>
      <section class="sec"><h3 class="sec-h">Links</h3>${destHTML(linked)}</section>`;
  } else {
    const cands = S.jobs.filter(j => !j.archived)
      .map(j => ({ j, score: (j.f.company === l.post.company ? 2 : 0) + (j.f.role === l.post.role ? 1 : 0) }))
      .sort((a, b) => b.score - a.score);
    body = `<section class="sec"><h3 class="sec-h">Which saved job is this?</h3>
      <p>Docket doesn’t guess. Pick the job this application belongs to, or leave it unlinked.</p></section>
      <section class="sec flush"><ul class="list">${cands.map(({ j, score }) => `<li class="card-row"><div class="grow">
        <div class="row-title">${esc(j.f.role)}</div>
        <div class="row-meta">${esc(j.f.company)} · ${esc(j.f.location || 'location not seen yet')} · <span class="mono">#${j.id}</span>${score >= 2 ? ' · same company' : ''}</div></div>
        <button class="btn small" data-act="pick" data-id="${j.id}" data-nav data-k="pick-${j.id}">This one</button></li>`).join('')}</ul></section>
      <section class="sec"><button class="btn link" data-act="pick-none">None of these</button></section>`;
  }
  return head(pageUrl(), 'Application page', `${esc(l.post.company)} application`, `<p class="meta">Opening this page doesn’t change any application status.</p>`)
    + body + workHTML(linked, l);
}

function hereOther() {
  const recent = S.jobs.filter(j => !j.archived).slice(0, 3);
  return head(pageUrl(), 'Not a job site', 'Nothing to collect here', '<p class="muted">Docket doesn’t collect on this site. Nothing on this page is saved.</p>')
    + `<section class="sec flush"><h3 class="sec-h">Recently saved</h3><ul class="list">${recent.map(jobRow).join('')}</ul></section>
      ${hoSummary()}`;
}

function renderHere() {
  const [type, a] = S.page.split('|');
  if (type === 'board') return hereBoard(a);
  if (type === 'post') return herePost(listing(a));
  if (type === 'apply') return hereApply(listing(a));
  return hereOther();
}

// ---------- Jobs ----------
const FILTERS = [['all', 'All'], ['lead', 'Leads'], ['detailed', 'Detailed'], ['apply', 'Has apply link'], ['attention', 'Needs attention'], ['archived', 'Archived']];
const FILTER_FN = {
  all: j => !j.archived, lead: j => !j.archived && j.status === 'lead', detailed: j => !j.archived && j.status === 'detailed',
  apply: j => !j.archived && j.applyState === 'linked', attention: j => needsAttention(j), archived: j => !!j.archived
};
function jobsList() {
  const q = S.q.trim().toLowerCase().replace(/^#/, '');
  const match = j => !q || [j.f.role, j.f.company, j.f.location, j.id].some(v => v && v.toLowerCase().includes(q));
  const pool = S.jobs.filter(FILTER_FN[S.filter]), list = pool.filter(match);
  const empty = S.filter === 'archived' && !q
    ? '<strong>Nothing archived</strong>Archived jobs keep their history and can be restored.'
    : '<strong>No matches</strong>Search covers role, company, location and #ID.';
  return `<section class="sec"><label class="sr" for="q">Search jobs</label>
    <input class="search" id="q" type="search" data-k="q" placeholder="Search role, company, location, #ID" value="${esc(S.q)}" autocomplete="off">
    <div class="filters" role="group" aria-label="Filter jobs">${FILTERS.map(([f, n]) => `<button class="filter" data-act="filter" data-f="${f}" data-k="f-${f}" aria-pressed="${S.filter === f}">${n} ${S.jobs.filter(FILTER_FN[f]).length}</button>`).join('')}</div></section>
    <div class="kbd-help" aria-live="polite">${list.length} of ${pool.length} shown · j/k move · Enter opens · / search</div>
    ${list.length ? `<ul class="list">${list.map(jobRow).join('')}</ul>` : `<div class="empty">${empty}</div>`}`;
}

function archiveHTML(j) {
  const A = S.archive;
  if (!A) return `<p class="meta">Hides this job from Jobs. History stays and you can restore it.</p>
    <div class="actions"><button class="btn" data-act="arch-start" data-id="${j.id}" data-k="arch-start">Archive…</button></div>`;
  if (A.step === 'refused') return `<div class="banner amber" role="alert"><p><strong>Resolve the attempt first.</strong></p>
    <p>An application attempt is active (${esc(activeAtt(j).state)}). Archive after it’s confirmed, discarded or marked not submitted.</p>
    <div class="actions"><button class="btn" data-act="arch-cancel" data-k="arch-1">OK</button></div></div>`;
  return `<fieldset class="reasons"><legend>Why archive #${j.id}?</legend>
    ${REASONS.map((r, i) => `<label><input type="radio" name="reason" value="${r}" data-act="reason" data-k="r-${i}"${A.reason === r ? ' checked' : ''}>${r}</label>`).join('')}</fieldset>
    <label class="sr" for="arch-note">Note (optional)</label>
    <input class="input" id="arch-note" data-act="note" data-k="arch-note" placeholder="Note (optional)" value="${esc(A.note)}" autocomplete="off">
    <div class="actions"><button class="btn" data-act="arch-confirm" data-id="${j.id}"${A.reason ? '' : ' disabled'}>Archive</button>
    <button class="btn link" data-act="arch-cancel">Cancel</button></div>`;
}

function jobDetail(j) {
  const a = j.archived;
  const banner = a ? `<div class="banner"><p><strong>Archived ${esc(a.at)} · ${esc(a.reason)}</strong></p>${a.note ? `<p>${esc(a.note)}</p>` : ''}
    <p class="meta">Hidden from Jobs. Restoring keeps all history.</p>
    <div class="actions"><button class="btn primary" data-act="restore" data-id="${j.id}" data-k="restore">Restore</button></div></div>` : '';
  return `<button class="btn link back" data-act="back" data-k="back">← ${S.filter === 'archived' ? 'Archived' : 'Jobs'}</button>${banner}
    <section class="sec"><div class="ctx"><span>${st(j)} <span class="id mono">#${j.id}</span></span><span>${SYNC[j.sync]}</span></div>
      <h2 class="title" tabindex="-1" data-k="detail-h">${esc(j.f.role)}</h2>
      <div class="meta">${esc(j.f.company)} · ${j.f.location ? esc(j.f.location) : 'location not seen yet'}</div>
      ${j.status === 'lead' ? '<p class="muted">Lead from a list card. Open the posting to add the rest.</p>' : ''}
      <div class="actions"><button class="btn${a ? '' : ' primary'}" data-act="open-posting" data-id="${j.id}"${j.postingUrl ? '' : ' disabled'}>Open posting</button>
      <button class="btn" data-act="open-apply" data-id="${j.id}"${j.applyState === 'linked' ? '' : ' disabled'}>Open apply page</button></div></section>
    <section class="sec"><h3 class="sec-h">Links</h3>${destHTML(j)}</section>
    <section class="sec"><h3 class="sec-h">Fields</h3>${fieldsHTML(j)}</section>
    <section class="sec"><h3 class="sec-h">Description <span class="aside">${j.desc ? esc(j.descKind) : ''}</span></h3>
      ${j.desc ? `<p>${esc(j.desc)}</p>` : '<p class="nsy">not seen yet</p>'}</section>
    <section class="sec"><h3 class="sec-h">Attempts</h3>${attemptsHTML(j)}</section>
    <section class="sec"><h3 class="sec-h">History</h3><ol class="hist">${j.history.slice().reverse().map(h => `<li><time>${esc(h.at)}</time><span>${esc(h.text)}</span></li>`).join('')}</ol></section>
    ${a ? '' : `<section class="sec"><h3 class="sec-h">Archive</h3>${archiveHTML(j)}</section>`}`;
}

function renderJobs() {
  const j = S.openId && byId(S.openId);
  return j ? jobDetail(j) : jobsList();
}


// ---------- harness (outside the product) ----------
function renderHarness() {
  const [type, key] = S.page.split('|'), l = key && listing(key);
  const groups = [
    ['Boards', Object.keys(SITES).map(s => ['board|' + s, `${SITES[s].name} board`])],
    ['Postings', LISTINGS.map(x => ['post|' + x.key, `${SITES[x.site].name} posting · ${x.post.company} · ${x.post.role}`])],
    ['Application pages (opened directly)', LISTINGS.map(x => ['apply|' + x.key, `${hostOf(x.apply)} · ${x.post.company}`])],
    ['Other', [['other', 'Unrelated site · news.example.com']]]
  ];
  let page;
  if (type === 'board') {
    page = `<ul class="h-cards">${BOARDS[key].map(k => { const c = listing(k).card; return `<li><span>${esc(c.role)}<br><small>${esc(c.company)} · ${esc(c.location)}</small></span>
      <button data-h="go" data-page="post|${k}">Open posting</button></li>`; }).join('')}</ul>
      <p class="h-note">Arriving on a board = observing its cards. Auto saves them; Manual only updates already-saved jobs.</p>`;
  } else if (type === 'post') {
    page = `<div class="h-page"><p><strong>${esc(l.post.role)}</strong> — ${esc(l.post.company)}</p><p>${esc(l.post.location)} · ${esc(l.post.type)} · ${esc(l.post.mode)}</p>
      <p class="h-note">Description: ${S.expanded[key] ? 'expanded (full text visible)' : 'collapsed (excerpt visible)'}</p></div>
      <div class="h-row"><button data-h="expand" data-key="${key}"${S.expanded[key] ? ' disabled' : ''}>Click “Show more”</button>
      <button data-h="apply" data-key="${key}">Click “Apply” (employer site)</button>
      <button data-h="go" data-page="board|${l.site}">Back to board</button></div>`;
  } else if (type === 'apply') {
    const cur = S.step[key] || 0, out = S.outcome[key];
    page = `<div class="h-page"><p>Employer application for <strong>${esc(l.post.role)}</strong> (${esc(l.post.company)}).</p>
      <p>${out === 'receipt' ? '“Thank you for applying.” (receipt page)' : out === 'unclear' ? 'Error page after Submit: unclear whether it went through.' : `Showing ${esc(stepName(cur))}`}</p></div>
      <div class="h-row"><label for="h-step">Page step</label><select id="h-step" data-k="h-step">${FORM.map((s, i) => `<option value="${i}"${i === cur ? ' selected' : ''}>${esc(stepName(i))}</option>`).join('')}</select></div>
      <div class="h-row"><button data-h="submit" data-v="receipt" data-key="${key}">Owner clicks employer Submit → receipt</button>
      <button data-h="submit" data-v="unclear" data-key="${key}">→ error / unclear</button></div>
      <div class="h-row"><button data-h="go" data-page="post|${key}">Back to posting</button></div>`;
  } else page = '<div class="h-page"><p>An unrelated article.</p></div>';
  $('#h-body').innerHTML = `<div class="h-group"><h2>Simulated tab</h2>
    <label class="sr" for="h-page">Simulated page</label>
    <select id="h-page" data-k="h-page">${groups.map(([g, opts]) => `<optgroup label="${g}">${opts.map(([v, t]) => `<option value="${v}"${v === S.page ? ' selected' : ''}>${esc(t)}</option>`).join('')}</optgroup>`).join('')}</select>
    <span class="h-url mono" style="margin-top:6px">${esc(pageUrl())}</span></div>
    <div class="h-group"><h2>On the page</h2>${page}</div>
    <div class="h-group"><h2>Environment</h2>
      <div class="h-row"><label for="h-conn">Connection</label><select id="h-conn" data-k="h-conn">${CONN_STATES.map(c => `<option${c === S.conn ? ' selected' : ''}>${c}</option>`).join('')}</select></div>
      <div class="h-row"><button data-h="inj" data-v="timeout">Inject failed save</button><button data-h="inj" data-v="conflict">Inject “changed elsewhere”</button></div>
      ${S.attempts.some(a => a.lease && a.lease.st === 'yours') ? `<div class="h-row"><button data-h="clock">Advance clock 5 min</button>
        <button data-h="lose" data-v="expired">Lease expires</button><button data-h="lose" data-v="taken">Another worker takes over</button></div>` : ''}
      <div class="h-row"><label for="h-width">Panel width</label><select id="h-width" data-k="h-width">${[360, 400, 450].map(w => `<option${w === S.width ? ' selected' : ''}>${w}</option>`).join('')}</select>
        <label for="h-theme">Theme</label><select id="h-theme" data-k="h-theme">${['system', 'light', 'dark'].map(t => `<option${t === S.theme ? ' selected' : ''}>${t}</option>`).join('')}</select></div>
      <div class="h-row"><button data-h="reset">Reset prototype</button></div>
      <p class="h-note">Simulated clock: ${clock()}. Every side effect stays on this page.</p></div>`;
}

// ---------- render ----------
function renderToast() {
  const t = $('#toast');
  t.classList.toggle('show', !!S.toast);
  t.innerHTML = S.toast ? `<span>${esc(S.toast.msg)}</span>${S.toast.undo ? '<button type="button" data-act="toast-undo" data-k="toast-undo">Undo</button>' : ''}` : '';
}
function render() {
  const a = document.activeElement, k = a && a.dataset ? a.dataset.k : null;
  const sel = a && typeof a.selectionStart === 'number' ? [a.selectionStart, a.selectionEnd] : null;
  const panel = $('#panel'), body = $('#p-body');
  panel.style.setProperty('--w', S.width + 'px');
  panel.classList.toggle('narrow', S.width < 400);
  panel.dataset.theme = S.theme;
  renderHarness();
  $('#p-host').textContent = hostOf(pageUrl());
  const [chipText, warn] = chipState(), chip = $('#chip');
  chip.textContent = chipText;
  chip.dataset.k = 'chip';
  chip.classList.toggle('warn', warn);
  chip.setAttribute('aria-label', `Status: ${chipText}. Open System`);
  chip.setAttribute('aria-expanded', String(S.sys));
  const waiting = hoCount();
  $('#tabs').innerHTML = TABS.map(([t, n], i) => `<button class="tab" role="tab" id="tab-${t}" aria-selected="${S.tab === t}" aria-controls="p-body"
    tabindex="${S.tab === t ? 0 : -1}" data-act="tab" data-tab="${t}" data-k="tab-${t}">${n}${t === 'handoffs' && waiting ? `<span class="badge"><span class="sr">, </span>${waiting}<span class="sr"> waiting</span></span>` : ''}<kbd>${i + 1}</kbd></button>`).join('');
  body.setAttribute('aria-labelledby', 'tab-' + S.tab);
  body.innerHTML = S.sys ? systemHTML()
    : S.tab === 'here' ? renderHere()
    : S.tab === 'jobs' ? renderJobs()
    : S.tab === 'handoffs' ? renderHandoffs()
    : renderApplied();
  renderToast();
  const want = S.focus || k;
  S.focus = null;
  if (want) {
    const el = document.querySelector(`[data-k="${CSS.escape(want)}"]`);
    if (el) {
      el.focus();
      if (sel && want === k && el.setSelectionRange) el.setSelectionRange(sel[0], sel[1]);
    } else if (want.startsWith('row-') && $('#q')) $('#q').focus();
  }
  if (S.scroll != null) { body.scrollTop = S.scroll; S.scroll = null; }
}

// ---------- events ----------
document.addEventListener('click', e => {
  const h = e.target.closest('[data-h]');
  if (h) {
    const act = h.dataset.h;
    if (act === 'reset') return location.reload();
    if (act === 'go' || act === 'apply') {
      go(act === 'go' ? h.dataset.page : 'apply|' + h.dataset.key, act === 'apply' ? 'click' : '');
      S.tab = 'here'; S.sys = false;
    } else if (act === 'expand') { S.expanded[h.dataset.key] = true; enrichPosting(listing(h.dataset.key)); }
    else harnessMore(act, h);
    return render();
  }
  const el = e.target.closest('[data-act]');
  if (!el || el.tagName === 'INPUT' || el.tagName === 'FORM') return;
  const act = el.dataset.act, j = el.dataset.id ? byId(el.dataset.id) : null;
  switch (act) {
    case 'tab': setTab(el.dataset.tab); S.focus = 'tab-' + el.dataset.tab; break;
    case 'chip': S.sys = !S.sys; S.focus = S.sys ? 'sys-h' : 'chip'; S.scroll = 0; break;
    case 'toast-undo': { const u = S.toast && S.toast.undo; S.toast = null; if (u) u(); break; }
    case 'save-card': {
      const l = listing(el.dataset.key), n = createJob(l, 'lead', l.card, `${SITES[l.site].name} card`);
      S.boardTags[l.key] = 'saved'; S.focus = 'b-' + l.key;
      toast(`Saved as lead #${n.id}`);
      break;
    }
    case 'save-post': {
      const l = listing(el.dataset.key), n = createJob(l, 'detailed', pageObs(l), `${SITES[l.site].name} posting`);
      S.focus = 'here-h'; toast(`Saved #${n.id} with the details on this page`);
      break;
    }
    case 'refresh': {
      const l = listing(el.dataset.key), rj = byKey(l.key), rows = diffRows(rj, pageObs(l)).filter(r => r.kind === 'diff');
      applyRows(rj, l, rows, 'Refreshed');
      toast(`#${rj.id} refreshed · ${plural(rows.length, 'field')} from this page`); S.focus = 'here-h';
      break;
    }
    case 'open-job': openDetail(el.dataset.id); break;
    case 'back': back(); break;
    case 'open-posting': S.archive = null; go('post|' + j.key); S.tab = 'here'; S.focus = 'here-h'; break;
    case 'open-apply': go('apply|' + j.key); S.tab = 'here'; S.focus = 'here-h'; break;
    case 'filter': S.filter = el.dataset.f; S.focus = 'f-' + S.filter; break;
    case 'edit': S.edit = { id: j.id, k: el.dataset.f }; S.focus = 'in-' + el.dataset.f; break;
    case 'cancel-edit': S.focus = 'edit-' + S.edit.k; S.edit = null; break;
    case 'arch-start':
      S.archive = activeAtt(j) ? { step: 'refused' } : { step: 'reason', reason: '', note: '' };
      S.focus = S.archive.step === 'reason' ? 'r-0' : 'arch-1';
      break;
    case 'arch-cancel': S.archive = null; S.focus = 'arch-start'; break;
    case 'arch-confirm': {
      const { reason, note } = S.archive;
      j.archived = { reason, note, at: TODAY };
      write(j, `Archived · ${reason}${note ? ' — ' + note : ''}`);
      S.archive = null; back(); S.focus = 'q';
      toast(`Archived #${j.id} · ${reason}`, () => { j.archived = null; write(j, 'Archive undone'); });
      break;
    }
    case 'restore': j.archived = null; write(j, 'Restored from archive'); S.focus = 'detail-h'; toast(`Restored #${j.id}`); break;
    case 'unlink': {
      const lj = byId(S.link.id);
      lj.applyUrl = S.link.prevUrl; lj.applyState = S.link.prevState; lj.src.apply = S.link.prevSrc;
      write(lj, 'Apply at link undone'); S.link = null; S.focus = 'here-h';
      break;
    }
    case 'pick': linkApply(j, listing(S.page.split('|')[1]), 'pick'); S.focus = 'unlink'; toast(`Apply at linked to #${j.id}`); break;
    case 'pick-none': toast('Left unlinked. Opening this page changed nothing.'); break;
    default: if (!clickMore(act, el)) return;
  }
  render();
});

document.addEventListener('change', e => {
  const t = e.target, act = t.dataset.act;
  if (act === 'mode') {
    S.modes[t.dataset.site] = t.value;
    if (S.page === 'board|' + t.dataset.site) observeBoard(t.dataset.site);
  } else if (act === 'reason') S.archive.reason = t.value;
  else if (t.id === 'h-page') { go(t.value); S.tab = 'here'; }
  else if (t.id === 'h-width') S.width = +t.value;
  else if (t.id === 'h-theme') S.theme = t.value;
  else if (!changeMore(t)) return;
  render();
});

document.addEventListener('input', e => {
  const t = e.target;
  if (t.id === 'q') { S.q = t.value; render(); }
  else if (t.dataset.act === 'note' && S.archive) S.archive.note = t.value;
});

document.addEventListener('submit', e => {
  e.preventDefault();
  if (formMore(e.target)) return render();
  if (e.target.dataset.act !== 'save-edit' || !S.edit) return;
  const j = byId(S.edit.id), k = S.edit.k, v = e.target.elements.v.value.trim() || null;
  if (v !== j.f[k]) {
    j.f[k] = v; j.src[k] = 'you · ' + TODAY;
    write(j, `You edited ${FIELDS.find(f => f[0] === k)[1]}`);
  }
  S.edit = null; S.focus = 'edit-' + k;
  render();
});

document.addEventListener('keydown', e => {
  const t = e.target;
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) && !['radio', 'checkbox'].includes(t.type);
  if (t.closest && t.closest('.harness')) return;
  if (e.key === 'Escape') {
    if (S.capEdit) { S.focus = 'cx-' + S.capEdit; S.capEdit = null; }
    else if (S.edit) { S.focus = 'edit-' + S.edit.k; S.edit = null; }
    else if (S.keyForm) { S.keyForm = false; S.focus = 'key-replace'; }
    else if (S.discardAsk) { S.discardAsk = null; S.focus = 'discard-ask'; }
    else if (S.archive) { S.archive = null; S.focus = 'arch-start'; }
    else if (typing) { t.blur(); return; }
    else if (S.sys) { S.sys = false; S.focus = 'chip'; }
    else if (S.tab === 'jobs' && S.openId) back();
    else if (S.tab === 'handoffs' && S.hoOpen) { S.focus = 'ho-' + S.hoOpen; S.hoOpen = null; }
    else if (S.tab === 'applied' && S.apOpen) { S.focus = 'ap-' + S.apOpen; S.apOpen = null; }
    else return;
    e.preventDefault(); return render();
  }
  if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
  const i = TABS.findIndex(x => x[0] === S.tab);
  if (t.getAttribute('role') === 'tab' && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
    const n = TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length][0];
    setTab(n); S.focus = 'tab-' + n;
  } else if (/^[1-4]$/.test(e.key)) {
    setTab(TABS[+e.key - 1][0]); S.focus = 'tab-' + S.tab;
  } else if (e.key === '/') {
    setTab('jobs'); S.openId = null; S.focus = 'q';
  } else if (e.key === 'j' || e.key === 'k') {
    const nav = [...$('#p-body').querySelectorAll('[data-nav]')];
    if (!nav.length) return;
    const at = nav.indexOf(document.activeElement);
    const next = nav[e.key === 'j' ? Math.min(at + 1, nav.length - 1) : Math.max(at - 1, 0)];
    e.preventDefault(); next.focus(); next.scrollIntoView({ block: 'nearest' });
    return;
  } else return;
  e.preventDefault(); render();
});

// =================== Capture, handoffs, Applied and System ===================

const CONN_STATES = ['Connected', 'Not recently checked', 'Offline', 'Update required', 'Not set up'];
// One synthetic three-step employer form shared by every application page.
const FORM = [
  { name: 'My Information', sections: [
    { id: 'contact', name: 'Contact', groups: [{ answers: [['Legal name', 'Sam Rivera'], ['Email', 'sam.rivera@example.com'], ['Phone', '(555) 010-0142'], ['City', 'Austin, TX']] }] },
    { id: 'account', name: 'Account', groups: [{ answers: [['Account email', 'sam.rivera@example.com'], ['Password', null, 'secret'], ['Verification code', null, 'secret']] }] }] },
  { name: 'My Experience', sections: [
    { id: 'work', name: 'Work history', groups: [
      { title: 'Entry 1 · Wingtip Labs', answers: [['Title', 'Software Engineering Intern'], ['Company', 'Wingtip Labs'], ['Dates', 'May 2025 – Aug 2025'], ['Summary', 'Built a feature-flag audit tool in TypeScript.']] },
      { title: 'Entry 2 · State University IT', answers: [['Title', 'Student Developer'], ['Company', 'State University IT'], ['Dates', 'Sep 2024 – May 2026'], ['Summary', 'Maintained the course-scheduling API.']] }] },
    { id: 'edu', name: 'Education', groups: [{ title: 'Entry 1 · State University', answers: [['School', 'State University'], ['Degree', 'B.S. Computer Science'], ['Graduation', 'May 2026']] }] },
    { id: 'resume', name: 'Resume', groups: [{ answers: [['Resume file', null, 'file']] }] }] },
  { name: 'Questions', sections: [
    { id: 'qs', name: 'Application questions', groups: [{ answers: [['Why this company?', 'I want to build software that people rely on every day.'], ['Earliest start date', 'Jan 5, 2027'], ['Require sponsorship?', 'No'], ['Skills', null, 'unsupported']] }] },
    { id: 'disc', name: 'Voluntary disclosures', groups: [{ answers: [['Veteran status', 'Prefer not to say'], ['Disability status', 'Prefer not to say']] }] }] }
];
const SECTIONS = FORM.flatMap((s, i) => s.sections.map(sec => ({ ...sec, step: i })));
const NOT_RECORDED = { secret: 'Not recorded (password or code)', file: 'Not recorded (file)', unsupported: 'Not recorded (unsupported control)' };
const CAP_STATES = [['Drafting', 'Unfinished capture'], ['Paused', 'Saved draft'], ['Captured', 'Saved capture'], ['Applied', 'Confirmed application']];
const CAP_GLYPH = { Drafting: '✎', Paused: '❚❚', Captured: '■', 'Ready to submit': '➤', 'Submission unknown': '⚠', Applied: '✓' };
const stepName = i => `Step ${i + 1} of ${FORM.length} · ${FORM[i].name}`;
// Secrets, files and unsupported controls are never recorded.
const capture = sec => sec.groups.flatMap(g => g.answers.map(([label, value, kind]) => ({ group: g.title || '', label, value: kind ? null : value, kind: kind || '', excluded: false })));

function seedAttempts() {
  return [
    { id: 'AT-31', jobId: 'B7E3', kind: 'handoff', state: 'Blocked', blocker: 'Review', agent: 'scout-2', age: '2h',
      lease: { st: 'available' }, steps: [0, 1, 2], mine: {}, restored: {}, pick: 0, src: 'agent',
      instructions: 'Steps 1–2 filled from the profile packet. Stopped on step 3 (Questions): "Why this company?" has my draft. Please rewrite it in your words. Sponsorship answered "No"; confirm before submitting. Resume upload not attempted (files are manual).' },
    { id: 'AT-29', jobId: 'D41E', kind: 'handoff', state: 'Blocked', blocker: 'Login', agent: 'scout-1', age: '25m',
      lease: { st: 'held', by: 'scout-4' }, steps: [0], mine: {}, restored: {}, pick: 0, src: 'agent',
      instructions: 'Greenhouse wants an account login with an emailed code. I can’t enter codes. Step 1 contact info is captured; steps 2–3 not reached.' },
    { id: 'AT-27', jobId: 'E5A9', kind: 'handoff', state: 'Submission unknown', blocker: 'Missing info', agent: 'scout-3', age: '1d',
      lease: { st: 'locked' }, steps: [0, 1, 2], mine: {}, restored: {}, pick: 0, src: 'agent',
      note: 'You marked Ready to submit on Oct 3 at 16:40. The tab closed before any confirmation page appeared.',
      instructions: 'Needed your graduation date (not in the profile). Everything else on steps 1–3 is captured.' }
  ];
}
function seedApplied() {
  const answers = {};
  SECTIONS.forEach(s => { answers[s.id] = capture(s); });
  return [{ id: 'AP-12', jobId: '9C01', how: 'Receipt', at: 'Oct 1, 14:20', answers }];
}
Object.assign(S, {
  conn: 'Connected', version: '0.9.3', lastCheck: 'today 09:02', keyAdded: 'Oct 1', mins: 14,
  sys: false, sysMsg: '', keyForm: false, upd: 0, queue: [],
  attempts: seedAttempts(), applied: seedApplied(),
  step: {}, outcome: {}, hoOpen: null, apOpen: null, capEdit: null, discardAsk: null, auto: null
});

const online = () => S.conn === 'Connected';
const clock = () => { const m = 600 + S.mins; return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`; };
const attById = id => S.attempts.find(a => a.id === id);
const activeAtt = j => S.attempts.find(a => a.jobId === j.id && a.state !== 'Applied');
const appliedFor = j => S.applied.find(a => a.jobId === j.id);
const needsAttention = j => S.queue.some(q => q.jobId === j.id && !q.kept);
const syncWord = j => needsAttention(j) ? ' · ▲ Needs attention' : j.sync !== 'Synced' ? ' · ' + SYNC[j.sync] : '';
const hoCount = () => S.attempts.filter(a => a.kind === 'handoff' && a.state !== 'Applied' && (a.lease.st === 'available' || a.state === 'Submission unknown')).length;
const GATE = {
  'Not recently checked': 'Connection not verified in 9 days. Check it in System before starting new work.',
  Offline: 'Offline. Starting new work needs a connection. Existing drafts stay available.',
  'Update required': 'This Docket version is no longer supported. Update from System; drafts are kept.',
  'Not set up': 'Docket isn’t set up. Add your key in System.'
};
const gate = () => online() ? '' : `<p class="meta" role="note">⚠ ${GATE[S.conn]} <button class="btn link" data-act="sys-open">Open System</button></p>`;
const leaseWord = a => ({ available: '○ Available', yours: `● Yours (${a.lease.mins}:00 left)`, held: `◑ Held by ${esc(a.lease.by)}`,
  lost: '✕ Lease lost', locked: '⊘ Locked', done: '✓ Done' })[a.lease.st];

function chipState() {
  const n = st => S.jobs.filter(j => j.sync === st).length, att = S.queue.filter(q => !q.kept).length;
  if (S.conn === 'Not set up') return ['○ Not set up', true];
  if (S.conn === 'Update required') return ['▲ Update required', true];
  if (S.conn === 'Offline') return [`⊘ Offline · ${n('Saved here')} saved here`, true];
  if (att) return [`▲ ${att} need${att === 1 ? 's' : ''} attention`, true];
  if (S.conn === 'Not recently checked') return ['◔ Not recently checked', true];
  if (n('Syncing')) return [`◷ ${n('Syncing')} syncing`, false];
  return ['✓ Synced', false];
}
function flush() {
  S.jobs.filter(j => j.sync === 'Saved here').forEach(j => {
    j.sync = 'Syncing';
    setTimeout(() => { if (j.sync === 'Syncing') { j.sync = 'Synced'; render(); } }, 1200);
  });
}

// ---------- shared attempt pieces ----------
function attemptsHTML(j) {
  const a = activeAtt(j), ap = appliedFor(j);
  if (!a && !ap) return '<p class="muted">None. Opening an application page doesn’t start one.</p>';
  return (a ? `<p><span class="st">${CAP_GLYPH[a.state] || '■'} ${esc(a.state)}</span> · ${a.kind === 'handoff' ? `handoff from ${esc(a.agent)} · ${leaseWord(a)}` : esc((CAP_STATES.find(c => c[0] === a.state) || [, a.state])[1])}</p>
      <div class="actions">${a.kind === 'handoff' ? `<button class="btn" data-act="open-ho" data-id="${a.id}">Open handoff</button>`
        : `<button class="btn" data-act="open-apply" data-id="${j.id}">Open application</button>`}</div>` : '')
    + (ap ? `<p><span class="st">✓ Applied · ${esc(ap.how)}</span> · ${esc(ap.at)}</p><div class="actions"><button class="btn" data-act="open-ap" data-id="${ap.id}">Readback</button></div>` : '');
}

function submitHTML(a, j) {
  if (a && a.state === 'Submission unknown') return `<div class="banner amber" role="alert"><p><strong>⚠ Submission unknown</strong></p>
    <p>${esc(a.note || 'Docket can’t tell whether this was sent.')} This attempt is locked for every worker until you answer. It won’t be re-queued.</p>
    <div class="actions"><button class="btn" data-act="unk" data-v="receipt" data-id="${a.id}" data-k="unk-1">I see a receipt</button>
    <button class="btn" data-act="unk" data-v="not" data-id="${a.id}">Not submitted</button>
    <button class="btn" data-act="unk" data-v="later" data-id="${a.id}">Can’t tell yet</button></div></div>`;
  if (S.outcome[j.key] === 'receipt') return `<div class="banner accent"><p><strong>Receipt page detected</strong></p>
    <p>“Thank you for applying to ${esc(j.f.company)}.” Nothing is recorded until you confirm.</p>
    <div class="actions"><button class="btn primary" data-act="confirm" data-how="Receipt" data-key="${j.key}" data-k="confirm">Confirm submitted</button></div></div>`;
  if (a && a.state === 'Ready to submit') return `<p><span class="st">➤ Ready to submit</span> <span class="meta">since ${esc(a.readyAt)}</span></p>
    <p class="meta">Use the employer’s own Submit button. Docket never clicks it.</p>
    <label class="check"><input type="checkbox" data-act="i-sub" data-id="${a.id}" data-k="i-sub"${a.iSub ? ' checked' : ''}> I submitted this</label>
    <div class="actions"><button class="btn primary" data-act="confirm" data-how="You confirmed" data-key="${j.key}"${a.iSub ? '' : ' disabled'}>Confirm submitted</button>
    <button class="btn link" data-act="intent-undo" data-id="${a.id}">Not yet</button></div>`;
  const ok = a && (a.kind === 'own' ? a.state === 'Captured' : a.lease.st === 'yours');
  const why = !a || ok ? '' : a.kind === 'own' ? 'Finish capture first.' : a.lease.st === 'lost' ? 'Disabled: your lease was lost.' : 'Take the handoff first.';
  return `<p class="meta">When the answers look right on the employer page, record your intent. This doesn’t submit anything.</p>
    <div class="actions"><button class="btn" data-act="intent" data-id="${a ? a.id : ''}" data-k="intent"${ok ? '' : ' disabled'}>I’m about to submit</button></div>${why ? `<p class="meta">${why}</p>` : ''}`;
}

function confirmSubmitted(key, how) {
  const j = byKey(key), a = activeAtt(j), answers = {};
  if (a && a.kind === 'own') Object.entries(a.cap).forEach(([id, list]) => { answers[id] = list.filter(x => !x.excluded); });
  if (a && a.kind === 'handoff') SECTIONS.filter(s => a.steps.includes(s.step)).forEach(s => { answers[s.id] = capture(s); });
  S.applied.unshift({ id: 'AP-' + (12 + S.applied.length), jobId: j.id, how, at: `${TODAY}, ${clock()}`, answers });
  if (a) { a.state = 'Applied'; if (a.lease) a.lease = { st: 'done' }; }
  delete S.outcome[key];
  write(j, `Applied · ${how}`);
  toast(`Recorded: applied to ${j.f.company} · ${how}`);
  // Show the readback right away.
  S.tab = 'applied'; S.apOpen = S.applied[0].id; S.hoOpen = null; S.focus = 'ap-h'; S.scroll = 0;
}

// ---------- Here: capture on an application page ----------
function workHTML(j) {
  if (!j) return '<section class="sec"><h3 class="sec-h">Capture</h3><p class="muted">Link this page to a saved job to capture your answers.</p></section>';
  const a = activeAtt(j), ap = appliedFor(j);
  if (a && a.kind === 'handoff') return `<section class="sec"><h3 class="sec-h">Handoff</h3>
    <p>${esc(a.agent)} queued this attempt · ${a.state === 'Submission unknown' ? '⚠ Submission unknown' : '■ ' + esc(a.blocker)} · ${leaseWord(a)}</p>
    <div class="actions"><button class="btn primary" data-act="open-ho" data-id="${a.id}">Open handoff</button></div></section>`;
  if (a) return captureHTML(a, j);
  if (ap) return `<section class="sec"><h3 class="sec-h">Capture</h3><p><span class="st">✓ Applied · ${esc(ap.how)}</span> · ${esc(ap.at)}</p>
    <div class="actions"><button class="btn" data-act="open-ap" data-id="${ap.id}">Readback</button></div></section>`;
  return `<section class="sec"><h3 class="sec-h">Capture</h3>${S.outcome[j.key] === 'receipt' ? submitHTML(null, j)
    : `<p>Capture records your answers as you fill in this application. It never clicks or submits anything.</p>
    <div class="actions"><button class="btn primary" data-act="cap-start" data-id="${j.id}" data-k="cap-start"${online() ? '' : ' disabled'}>Start capture</button></div>${gate()}`}</section>`;
}

function answersHTML(list, a, secId) {
  return [...new Set(list.map(x => x.group))].map(g => `${g ? `<p class="grp">${esc(g)}</p>` : ''}<dl class="fields">${list.map((x, i) => {
    if (x.group !== g) return '';
    const k = `${secId}-${i}`;
    if (a && S.capEdit === k) return `<div class="field"><dt><label for="ce-${k}">${esc(x.label)}</label></dt><dd class="editing">
      <form data-act="cap-save" data-id="${a.id}" data-sec="${secId}" data-i="${i}"><input type="text" id="ce-${k}" name="v" value="${esc(x.value)}" data-k="ce-${k}" autocomplete="off">
      <button class="btn small primary">Save</button><button type="button" class="btn small" data-act="cap-cancel">Cancel</button></form></dd></div>`;
    const val = x.kind ? `<span class="nsy">${NOT_RECORDED[x.kind]}</span>` : x.excluded ? `<s>${esc(x.value)}</s> <span class="tag">Excluded</span>` : esc(x.value);
    const tools = a && !x.kind ? `<span class="tools"><button class="btn link" data-act="cap-edit" data-key="${k}" data-k="cx-${k}" aria-label="Edit ${esc(x.label)}">Edit</button>
      <button class="btn link" data-act="cap-excl" data-id="${a.id}" data-sec="${secId}" data-i="${i}" data-k="cy-${k}" aria-label="${x.excluded ? 'Include' : 'Exclude'} ${esc(x.label)}">${x.excluded ? 'Include' : 'Exclude'}</button></span>` : '';
    return `<div class="field"><dt>${esc(x.label)}</dt><dd>${val}</dd>${tools}</div>`;
  }).join('')}</dl>`).join('');
}

function captureHTML(a, j) {
  const cur = S.step[j.key] || 0, drafting = a.state === 'Drafting', editable = ['Drafting', 'Paused', 'Captured'].includes(a.state);
  const text = { Drafting: 'Answers are kept on this device as you capture. Nothing is submitted.', Paused: 'Paused. Your draft is kept on this device; resume anytime.',
    Captured: 'Capture finished and saved. That doesn’t mean submitted.', 'Ready to submit': 'Capture saved. You said you’re about to submit.', 'Submission unknown': 'Capture saved. Submission unclear.' }[a.state];
  const unseen = SECTIONS.filter(s => !a.cap[s.id] && !a.seen.includes(s.step)).length;
  const sections = FORM.map((s, si) => `<p class="grp">${esc(stepName(si))}${si === cur ? ' · on page now' : ''}</p><ul class="list">${s.sections.map(sec => {
    const got = a.cap[sec.id];
    const status = got ? `✓ Captured · ${plural(got.filter(x => !x.kind).length, 'answer')}` : si === cur ? '◌ On page, not captured' : a.seen.includes(si) ? '◌ Seen, not captured' : '… Not seen yet';
    return `<li class="card-row"><div class="grow"><div class="row-title">${esc(sec.name)}${sec.groups.length > 1 ? ` <span class="meta">(${sec.groups.length} entries)</span>` : ''}</div><div class="row-meta">${status}</div></div>
      ${drafting && si === cur ? `<button class="btn small${got ? '' : ' primary'}" data-act="cap-sec" data-id="${a.id}" data-sec="${sec.id}" data-nav data-k="cs-${sec.id}">${got ? 'Recapture' : 'Capture this section'}</button>` : ''}</li>`;
  }).join('')}</ul>`).join('');
  const captured = SECTIONS.filter(s => a.cap[s.id]);
  const discard = !['Drafting', 'Paused'].includes(a.state) ? ''
    : S.discardAsk === a.id ? `<div class="banner danger" role="alertdialog" aria-label="Discard draft"><p><strong>Discard this draft?</strong> Captured answers on this device will be deleted. The employer page isn’t affected.</p>
      <div class="actions"><button class="btn danger" data-act="cap-discard" data-id="${a.id}">Discard draft</button><button class="btn" data-act="discard-no" data-k="discard-no">Keep draft</button></div></div>`
    : `<button class="btn link" data-act="discard-ask" data-id="${a.id}" data-k="discard-ask">Discard draft…</button>`;
  return `<section class="sec"><h3 class="sec-h">Capture <span class="aside mono">${a.id}</span></h3>
      <p tabindex="-1" data-k="cap-state"><span class="st">${CAP_GLYPH[a.state]} ${esc((CAP_STATES.find(c => c[0] === a.state) || [, a.state])[1])}</span></p><p class="meta">${text}</p>
      <ol class="states" aria-label="Capture states">${CAP_STATES.map(([s, t]) => `<li${s === a.state || (s === 'Captured' && /Ready|unknown/.test(a.state)) ? ' aria-current="step"' : ''}>${t}</li>`).join('')}</ol>
      <div class="actions">${drafting ? `<button class="btn" data-act="cap-pause" data-id="${a.id}">Pause</button><button class="btn" data-act="cap-finish" data-id="${a.id}"${captured.length ? '' : ' disabled'}>Finish capture</button>`
        : a.state === 'Paused' ? `<button class="btn primary" data-act="cap-resume" data-id="${a.id}" data-k="cap-resume">Resume</button>` : ''}</div>
      ${a.state === 'Paused' && !online() ? '<p class="meta">Resuming works offline; your draft stays on this device.</p>' : ''}</section>
    <section class="sec flush">${sections}</section>
    <section class="sec"><h3 class="sec-h">Review <span class="aside">${plural(captured.length, 'section')} captured${unseen ? ` · ${unseen} not seen yet` : ''}</span></h3>
      ${captured.length ? captured.map(s => `<p class="grp">${esc(s.name)}</p>${answersHTML(a.cap[s.id], editable ? a : null, s.id)}`).join('') : '<p class="muted">Nothing captured yet.</p>'}
      ${unseen && drafting ? '<p class="meta">Sections you haven’t reached stay empty if you finish now.</p>' : ''}${discard}</section>
    ${['Captured', 'Ready to submit', 'Submission unknown'].includes(a.state) || S.outcome[j.key] === 'receipt' ? `<section class="sec"><h3 class="sec-h">Submit (you)</h3>${submitHTML(a, j)}</section>` : ''}`;
}

function hoSummary() {
  const n = hoCount();
  return `<section class="sec"><h3 class="sec-h">Handoffs</h3><p>${n ? `${plural(n, 'handoff')} waiting for you.` : 'Nothing waiting.'}</p>
    <div class="actions"><button class="btn" data-act="tab" data-tab="handoffs">Open Handoffs</button></div></section>`;
}

// ---------- Handoffs ----------
function renderHandoffs() {
  const a = S.hoOpen && attById(S.hoOpen);
  if (a) return handoffDetail(a);
  const hs = S.attempts.filter(x => x.kind === 'handoff' && x.state !== 'Applied');
  const groups = [['Needs your answer', x => x.state === 'Submission unknown'], ['Available', x => x.lease.st === 'available' && x.state !== 'Submission unknown'],
    ['Yours', x => ['yours', 'lost'].includes(x.lease.st)], ['Held by others', x => x.lease.st === 'held']];
  const row = x => { const j = byId(x.jobId); return `<li><button class="row" data-act="open-ho" data-id="${x.id}" data-nav data-k="ho-${x.id}">
    <span class="row-title">${esc(j.f.company)} · ${esc(j.f.role)}</span><span class="row-side meta">${leaseWord(x)}</span>
    <span class="row-meta">${x.state === 'Submission unknown' ? '⚠ Submission unknown' : '■ ' + esc(x.blocker)} · ${esc(x.agent)} · ${esc(x.age)} ago</span></button></li>`; };
  const html = groups.map(([name, fn]) => { const list = hs.filter(fn); return list.length ? `<section class="sec flush"><h3 class="sec-h">${name} <span class="aside">${list.length}</span></h3><ul class="list">${list.map(row).join('')}</ul></section>` : ''; }).join('');
  return html || '<div class="empty"><strong>No handoffs</strong>When an agent is blocked by a login, review, missing info or a CAPTCHA, the attempt shows up here.</div>';
}

function restorePreview(a, onPage, tabStep) {
  const i = a.pick, all = SECTIONS.filter(s => s.step === i).flatMap(s => capture(s).map(x => ({ ...x, sec: s.name })));
  const fill = all.filter(x => !x.kind), hand = all.filter(x => x.kind), mine = a.src === 'mine' && a.mine[i];
  const why = a.lease.st !== 'yours' ? 'Your lease was lost.' : !onPage ? 'Open the application first.'
    : tabStep !== i ? `The tab shows Step ${tabStep + 1}. Go to Step ${i + 1} on the page to restore it.` : '';
  return `<p>Fills <strong>${plural(fill.length, 'field')}</strong> on ${esc(stepName(i))} from ${mine ? 'your edits' : `${esc(a.agent)}’s capture`}. Other steps are untouched.</p>
    <ul class="plain">${fill.map(x => `<li><span class="meta">${esc(x.sec)}${x.group ? ' · ' + esc(x.group) : ''} · ${esc(x.label)}</span>${esc(x.value)}</li>`).join('')}</ul>
    ${hand.length || (a.blocker === 'Login' && i === 0) ? `<h4 class="sec-h sub">Do by hand</h4><ul class="plain">${a.blocker === 'Login' && i === 0 ? '<li>✋ Sign in on the page yourself</li>' : ''}${hand.map(x => `<li>✋ ${esc(x.label)}<span class="meta">${NOT_RECORDED[x.kind]}</span></li>`).join('')}</ul>` : ''}
    <div class="actions"><button class="btn primary" data-act="restore-page" data-id="${a.id}" data-k="restore-page"${why ? ' disabled' : ''}>Restore this page</button>
    ${a.restored[i] ? `<button class="btn" data-act="save-mine" data-id="${a.id}"${why ? ' disabled' : ''}>Save my edits from this page</button>` : ''}</div>
    ${why ? `<p class="meta">${why}</p>` : ''}<p class="meta">Restores the whole page. Choosing individual fields isn’t supported yet.</p>`;
}

function handoffDetail(a) {
  const j = byId(a.jobId), L = a.lease, mine = L.st === 'yours', lost = L.st === 'lost';
  const [type, key] = S.page.split('|'), onPage = type === 'apply' && key === j.key, tabStep = S.step[j.key] || 0;
  const top = `<button class="btn link back" data-act="ho-back" data-k="back">← Handoffs</button>
    ${lost ? `<div class="banner danger" role="alert"><p><strong>✕ Your lease expired. Someone else may be on this application. Don’t submit.</strong></p>
      <p>Restore and submit are disabled.</p>${a.check ? `<p>${esc(a.check)}</p>` : ''}
      <div class="actions"><button class="btn" data-act="lease-check" data-id="${a.id}" data-k="lease-check">Check status</button>
      <button class="btn" data-act="take" data-id="${a.id}"${L.free && online() ? '' : ' disabled'}>Re-take if available</button></div></div>` : ''}
    <section class="sec"><div class="ctx"><span class="st">${CAP_GLYPH[a.state] || '■'} ${esc(a.state)}</span><span>${leaseWord(a)}</span></div>
      <h2 class="title" tabindex="-1" data-k="ho-h">${esc(j.f.role)}</h2>
      <div class="meta">${esc(j.f.company)} · <span class="mono">#${j.id}</span> · blocker: ${esc(a.blocker)} · ${esc(a.agent)} · ${esc(a.age)} ago</div></section>
    <section class="sec"><h3 class="sec-h">${esc(a.agent)}’s note <span class="aside">verbatim</span></h3><blockquote class="note">${esc(a.instructions)}</blockquote></section>`;
  if (a.state === 'Submission unknown') return top + `<section class="sec">${submitHTML(a, j)}</section>`;
  const lease = L.st === 'available' ? `<p class="meta">Taking it gives you a 15-minute lease so no agent or other device works on it at the same time.</p>
      <div class="actions"><button class="btn primary" data-act="take" data-id="${a.id}" data-k="take"${online() ? '' : ' disabled'}>Take</button></div>${gate()}`
    : L.st === 'held' ? `<p class="meta">${esc(L.by)} holds this. You can take it after their lease ends.</p>`
    : mine ? `<p class="meta">While you hold it, nobody else can work on this attempt.</p>
      <div class="actions"><button class="btn" data-act="renew" data-id="${a.id}"${online() ? '' : ' disabled'}>Renew</button><button class="btn link" data-act="release" data-id="${a.id}">Release</button></div>
      ${online() ? '' : '<p class="meta">Renewing needs a connection.</p>'}` : '';
  if (!mine && !lost) return top + `<section class="sec"><h3 class="sec-h">Lease <span class="aside">${leaseWord(a)}</span></h3>${lease}</section>`;
  const steps = FORM.map((s, i) => { const has = a.steps.includes(i); return `<label class="${has ? '' : 'dimmed'}"><input type="radio" name="ho-step" value="${i}" data-act="ho-step" data-id="${a.id}" data-k="hs-${i}"${a.pick === i ? ' checked' : ''}${has ? '' : ' disabled'}>
    <span>${esc(stepName(i))}<span class="meta">${has ? 'Saved by ' + esc(a.agent) : 'Not captured'}${a.mine[i] ? ' · your edits ' + esc(a.mine[i]) : ''}${a.restored[i] ? ' · restored ' + esc(a.restored[i]) : ''}</span></span></label>`; }).join('');
  const src = a.mine[a.pick] ? `<fieldset class="seg"><legend class="sr">Version to restore</legend>${[['agent', 'Agent capture'], ['mine', 'Your edits']].map(([v, t]) => `<label><input type="radio" name="ho-src" value="${v}" data-act="ho-src" data-id="${a.id}" data-k="src-${v}"${a.src === v ? ' checked' : ''}><span>${t}</span></label>`).join('')}</fieldset>
    <p class="meta">Both versions are kept. Restoring one never changes the other.</p>` : '';
  return top + (mine ? `<section class="sec"><h3 class="sec-h">Lease <span class="aside">${leaseWord(a)}</span></h3>${lease}</section>` : '')
    + `<section class="sec"><h3 class="sec-h">1 · Application tab</h3><p>${onPage ? `On the application · <strong>${esc(stepName(tabStep))}</strong>` : 'The tab isn’t on this application.'}</p>
      <div class="actions"><button class="btn" data-act="ho-open-app" data-id="${a.id}" data-k="open-app">Open application</button></div></section>
    <section class="sec"><h3 class="sec-h">2 · Saved page</h3><fieldset class="choice"><legend class="sr">Saved page to restore</legend>${steps}</fieldset>${src}</section>
    <section class="sec"><h3 class="sec-h">3 · Restore preview</h3>${restorePreview(a, onPage, tabStep)}</section>
    <section class="sec"><h3 class="sec-h">4 · Submit (you)</h3>${submitHTML(a, j)}</section>`;
}

// ---------- Applied ----------
function renderApplied() {
  const r = S.apOpen && S.applied.find(x => x.id === S.apOpen);
  if (r) {
    const j = byId(r.jobId), secs = SECTIONS.filter(s => r.answers[s.id] && r.answers[s.id].length);
    return `<button class="btn link back" data-act="ap-back" data-k="back">← Applied</button>
      <section class="sec"><div class="ctx"><span class="st">✓ Applied · ${esc(r.how)}</span><span class="id mono">#${j.id}</span></div>
      <h2 class="title" tabindex="-1" data-k="ap-h">${esc(j.f.role)}</h2><div class="meta">${esc(j.f.company)} · ${esc(r.at)}</div>
      <p class="meta">${r.how === 'Receipt' ? 'You confirmed it after a receipt page appeared.' : 'You confirmed this submission yourself.'} Below is what Docket recorded, not a copy from the employer.</p>
      <div class="actions"><button class="btn" data-act="open-job" data-id="${j.id}">Open job</button></div></section>
      ${secs.length ? secs.map(s => `<section class="sec"><h3 class="sec-h">${esc(s.name)} <span class="aside">Step ${s.step + 1}</span></h3>${answersHTML(r.answers[s.id], null, s.id)}</section>`).join('')
        : '<section class="sec"><p class="muted">No answers were captured for this application.</p></section>'}`;
  }
  if (!S.applied.length) return '<div class="empty"><strong>No applications yet</strong>Only applications you confirm, after a receipt or yourself, appear here.</div>';
  return `<p class="kbd-help">Only confirmed applications. Leads, attempts and blocked handoffs aren’t listed here.</p>
    <ul class="list">${S.applied.map(r => { const j = byId(r.jobId); return `<li><button class="row" data-act="open-ap" data-id="${r.id}" data-nav data-k="ap-${r.id}">
      <span class="row-title">${esc(j.f.role)}</span><span class="row-side id mono">#${j.id}</span>
      <span class="row-meta">${esc(j.f.company)} · ${esc(j.f.location || '')}</span>
      <span class="row-meta">✓ Applied · ${esc(r.how)} · ${esc(r.at)}</span></button></li>`; }).join('')}</ul>`;
}

// ---------- System ----------
const diagText = () => [
  `docket ${S.version} · chromium side panel`,
  `connection: ${S.conn} · last check ${S.lastCheck}`,
  `jobs: ${S.jobs.length} (${S.jobs.filter(j => j.status === 'lead').length} leads, ${S.jobs.filter(j => j.archived).length} archived)`,
  `sync: ${S.jobs.filter(j => j.sync === 'Saved here').length} waiting · ${S.queue.filter(q => !q.kept).length} need attention [${S.queue.map(q => q.code).join(', ') || 'none'}]`,
  `site modes: ${Object.keys(SITES).map(s => `${SITES[s].host}=${S.modes[s]}`).join(', ')}`,
  `attempts: ${S.attempts.map(a => `${a.id} ${a.state}`).join(', ')}`,
  'key: [redacted] · answers: [redacted] · field values: [redacted]'
].join('\n');

function checkNow() {
  if (S.conn === 'Offline') S.sysMsg = `Checked ${clock()}: still can’t reach the server.`;
  else if (S.conn === 'Update required' && S.version === '0.9.3') S.sysMsg = `Checked ${clock()}: the server still needs 0.10.0.`;
  else if (S.conn !== 'Not set up') {
    S.conn = 'Connected'; S.upd = 0; S.lastCheck = 'today ' + clock();
    S.sysMsg = `Checked ${clock()}: connected and compatible.`; flush();
  }
}

function systemHTML() {
  const word = { Connected: '✓ Connected', 'Not recently checked': '◔ Not recently checked (9 days)', Offline: '⊘ Offline (saving here)', 'Update required': '▲ Update required', 'Not set up': '○ Not set up' }[S.conn];
  const about = {
    Connected: `Server reachable and Docket ${esc(S.version)} is supported. Last checked ${esc(S.lastCheck)}.`,
    'Not recently checked': 'Last verified Sep 25. Saves wait on this device. Taking handoffs and starting captures need a fresh check.',
    Offline: 'Can’t reach the server. Job saves and edits wait on this device. Taking or renewing handoffs and starting captures need a connection; existing drafts stay available.',
    'Update required': `The server needs Docket 0.10.0 or newer; this is ${esc(S.version)}. Saves wait on this device and new work is blocked until you update.`,
    'Not set up': 'Paste the extension key from your Docket account to connect.'
  }[S.conn];
  const waiting = S.jobs.filter(j => j.sync === 'Saved here').length, open = S.queue.filter(q => !q.kept).length;
  const key = S.conn === 'Not set up' || S.keyForm
    ? `<form data-act="key-save"><label for="key-in">Extension key</label><input class="input" type="password" id="key-in" name="key" data-k="key-in" autocomplete="off" required>
      <p class="meta">Stored on this device only. Docket never shows it again.</p>
      <div class="actions"><button class="btn primary">Save and check</button>${S.keyForm ? '<button type="button" class="btn link" data-act="key-cancel">Cancel</button>' : ''}</div></form>`
    : `<p>Key stored on this device · added ${esc(S.keyAdded)}</p><div class="actions"><button class="btn" data-act="key-replace" data-k="key-replace">Replace key</button></div>`;
  const steps = [
    ['Download docket-0.10.0.zip', 'Download (simulated)'],
    ['Unzip it over your current Docket folder', 'Done'],
    ['Open <span class="mono">chrome://extensions</span> and click Reload on Docket', 'Reload (simulated)']
  ];
  const update = S.conn !== 'Update required' ? '' : `<section class="sec"><h3 class="sec-h">Update</h3>
    <p class="meta">Kept through the update: your identity, key, site settings and drafts.</p>
    <ol class="steps">${steps.map(([t, b], i) => `<li${i < S.upd ? ' class="done"' : ''}><span>${i < S.upd ? '✓ ' : ''}${t}</span>
      <button class="btn small" data-act="upd" data-v="${i + 1}" data-k="upd-${i + 1}"${S.upd === i ? '' : ' disabled'}>${b}</button></li>`).join('')}
      <li><span>Check the connection</span> <button class="btn small" data-act="check"${S.upd === 3 ? '' : ' disabled'}>Check now</button></li></ol></section>`;
  const queue = S.queue.map(q => { const j = byId(q.jobId); return `<li><p><strong>${esc(q.what)}</strong> · <span class="mono">#${j.id}</span> ${esc(j.f.company)}</p>
    <span class="meta">${q.kept ? '⌂ Your version is kept on this device. Nothing on the server was overwritten.' : '▲ ' + esc(q.reason)}</span>
    ${q.kept ? '' : `<div class="actions"><button class="btn small" data-act="q-retry" data-id="${q.id}" data-k="qr-${q.id}"${online() ? '' : ' disabled'}>Retry</button>
      <button class="btn small" data-act="q-keep" data-id="${q.id}">Keep local copy</button></div>`}</li>`; }).join('');
  return `<button class="btn link back" data-act="sys-close" data-k="sys-close">← Close</button>
    <section class="sec"><h2 class="title" tabindex="-1" data-k="sys-h">System</h2><p class="meta">Maintenance for this device. Esc closes.</p></section>
    <section class="sec"><h3 class="sec-h">Connection</h3><p><span class="st">${word}</span></p><p class="meta">${about}</p>
      <div class="actions"><button class="btn" data-act="check" data-k="check"${S.conn === 'Not set up' ? ' disabled' : ''}>Check now</button></div>
      ${S.sysMsg ? `<p class="meta" role="status">${esc(S.sysMsg)}</p>` : ''}</section>
    <section class="sec"><h3 class="sec-h">Key</h3>${key}</section>${update}
    <section class="sec"><h3 class="sec-h">Sync</h3><p class="meta">${S.jobs.filter(j => j.sync === 'Syncing').length} syncing · ${waiting} waiting on this device · ${open} need attention</p>
      ${queue ? `<ul class="plain">${queue}</ul>` : '<p class="muted">Nothing needs attention.</p>'}
      <p class="meta">Docket never overwrites a change made elsewhere. Merging field by field is future work.</p></section>
    <section class="sec"><h3 class="sec-h">Version</h3><p>Docket ${esc(S.version)}${S.version === '0.9.3' ? ' · 0.10.0 available' : ''}</p>
      <details><summary>What’s new in 0.10.0</summary><ul class="plain"><li>Page-by-page restore for handoffs</li><li>Clearer “Submission unknown” recovery</li><li>Diagnostics list hosts instead of full URLs</li></ul></details></section>
    <section class="sec"><h3 class="sec-h">Diagnostics</h3><p class="meta">Preview of the export:</p><pre class="diag">${esc(diagText())}</pre>
      <p class="meta">Never included: your extension key, captured answers, field values or full page URLs.</p>
      <div class="actions"><button class="btn" data-act="diag" data-k="diag">Export diagnostics</button></div></section>`;
}

// ---------- events for these surfaces ----------
function clickMore(act, el) {
  const id = el.dataset.id, a = id && attById(id), j = a ? byId(a.jobId) : id && byId(id);
  switch (act) {
    case 'sys-open': S.sys = true; S.focus = 'sys-h'; S.scroll = 0; break;
    case 'sys-close': S.sys = false; S.focus = 'chip'; break;
    case 'check': checkNow(); S.focus = 'check'; break;
    case 'key-replace': S.keyForm = true; S.focus = 'key-in'; break;
    case 'key-cancel': S.keyForm = false; S.focus = 'key-replace'; break;
    case 'upd':
      S.upd = +el.dataset.v; S.focus = 'upd-' + Math.min(S.upd + 1, 3);
      if (S.upd === 3) { S.version = '0.10.0'; S.sysMsg = 'Reloaded as 0.10.0. Your identity, key, settings and drafts are kept. Check the connection to finish.'; }
      break;
    case 'q-retry': {
      const q = S.queue.find(x => x.id === id), qj = byId(q.jobId);
      if (q.code === 'conflict') { q.reason = 'Still changed elsewhere (scout-2). Retrying won’t overwrite their change.'; break; }
      S.queue.splice(S.queue.indexOf(q), 1); qj.sync = 'Syncing';
      setTimeout(() => { qj.sync = 'Synced'; render(); }, 1200);
      toast('Retrying · syncing now');
      break;
    }
    case 'q-keep': S.queue.find(x => x.id === id).kept = true; toast('Your version is kept on this device. The server copy is unchanged.'); break;
    case 'diag': toast('Diagnostics file prepared locally (simulated). Nothing was sent.'); break;
    case 'open-ho': S.tab = 'handoffs'; S.hoOpen = id; S.sys = false; S.focus = 'ho-h'; S.scroll = 0; break;
    case 'ho-back': S.focus = 'ho-' + S.hoOpen; S.hoOpen = null; break;
    case 'open-ap': S.tab = 'applied'; S.apOpen = id; S.sys = false; S.focus = 'ap-h'; S.scroll = 0; break;
    case 'ap-back': S.focus = 'ap-' + S.apOpen; S.apOpen = null; break;
    case 'ho-open-app': go('apply|' + j.key); S.focus = 'open-app'; break;
    case 'take':
      if (!online()) break;
      a.lease = { st: 'yours', mins: 15 }; a.state = 'Drafting'; a.check = null;
      write(j, 'You took the handoff · 15-minute lease'); toast('Lease is yours for 15 minutes.'); S.focus = 'open-app';
      break;
    case 'renew': a.lease.mins = 15; toast('Lease renewed · 15 minutes'); break;
    case 'release': a.lease = { st: 'available' }; a.state = 'Blocked'; write(j, 'You released the handoff'); S.focus = 'take'; break;
    case 'lease-check':
      a.lease.free = a.lease.how === 'expired';
      a.check = a.lease.free ? 'Status: available. Nobody holds it now.' : `Status: held by scout-2 since ${clock()}. Leave it to them.`;
      S.focus = 'lease-check';
      break;
    case 'restore-page': {
      const i = a.pick, n = SECTIONS.filter(s => s.step === i).flatMap(capture).filter(x => !x.kind).length;
      a.restored[i] = clock();
      write(j, `Restored ${stepName(i)} from ${a.src === 'mine' && a.mine[i] ? 'your edits' : a.agent + '’s capture'}`);
      toast(`Filled ${n} fields on Step ${i + 1}. Check them on the page.`);
      break;
    }
    case 'save-mine': a.mine[a.pick] = clock(); write(j, `Saved your edits for Step ${a.pick + 1}; ${a.agent}’s capture kept`); toast('Your edits are saved separately. The agent capture is unchanged.'); break;
    case 'intent': a.state = 'Ready to submit'; a.readyAt = clock(); a.iSub = false; write(j, 'You: I’m about to submit'); S.focus = 'i-sub'; break;
    case 'intent-undo': a.state = a.kind === 'own' ? 'Captured' : 'Drafting'; write(j, 'Ready to submit withdrawn'); S.focus = 'intent'; break;
    case 'confirm': confirmSubmitted(el.dataset.key, el.dataset.how); break;
    case 'unk':
      if (el.dataset.v === 'receipt') confirmSubmitted(j.key, 'You confirmed');
      else if (el.dataset.v === 'not') {
        a.state = a.kind === 'own' ? 'Captured' : 'Blocked'; delete a.note;
        if (a.kind === 'handoff') a.lease = { st: 'available' };
        delete S.outcome[j.key];
        write(j, 'You said it was not submitted. Answers kept; nothing re-queued.'); toast('Marked not submitted. Nothing was re-queued.');
      } else toast('Still locked. Check your email for a receipt, then answer here.');
      break;
    case 'cap-start': {
      if (!online()) break;
      const cur = S.step[j.key] || 0;
      S.attempts.push({ id: 'AT-' + (40 + S.attempts.length), jobId: j.id, kind: 'own', state: 'Drafting', cap: {}, seen: [cur] });
      write(j, 'Started capture'); S.focus = 'cs-' + FORM[cur].sections[0].id;
      break;
    }
    case 'cap-sec': {
      const sec = SECTIONS.find(s => s.id === el.dataset.sec);
      a.cap[sec.id] = capture(sec); S.focus = 'cs-' + sec.id;
      toast(`Captured ${sec.name}${sec.groups.length > 1 ? ` (${sec.groups.length} entries)` : ''}. Kept on this device.`);
      break;
    }
    case 'cap-pause': a.state = 'Paused'; toast('Draft saved on this device. Resume anytime.'); S.focus = 'cap-resume'; break;
    case 'cap-resume': {
      const cur = S.step[j.key] || 0;
      a.state = 'Drafting'; if (!a.seen.includes(cur)) a.seen.push(cur); S.focus = 'cap-state';
      break;
    }
    case 'cap-finish': a.state = 'Captured'; write(j, 'Capture finished · not submitted'); toast('Capture saved. Nothing was submitted.'); S.focus = 'intent'; break;
    case 'cap-edit': S.capEdit = el.dataset.key; S.focus = 'ce-' + el.dataset.key; break;
    case 'cap-cancel': S.focus = 'cx-' + S.capEdit; S.capEdit = null; break;
    case 'cap-excl': { const x = a.cap[el.dataset.sec][+el.dataset.i]; x.excluded = !x.excluded; break; }
    case 'discard-ask': S.discardAsk = a.id; S.focus = 'discard-no'; break;
    case 'discard-no': S.discardAsk = null; S.focus = 'discard-ask'; break;
    case 'cap-discard':
      S.attempts.splice(S.attempts.indexOf(a), 1); S.discardAsk = null;
      write(j, 'Capture draft discarded'); toast('Draft discarded.'); S.focus = 'here-h';
      break;
    default: return false;
  }
  return true;
}

function changeMore(t) {
  const act = t.dataset.act, a = t.dataset.id && attById(t.dataset.id);
  if (t.id === 'h-conn') {
    S.conn = t.value; S.sysMsg = '';
    if (S.conn === 'Update required') { S.version = '0.9.3'; S.upd = 0; }
    if (S.conn === 'Connected') { S.lastCheck = 'today ' + clock(); flush(); }
  } else if (t.id === 'h-step') {
    const key = S.page.split('|')[1], j = byKey(key), own = j && activeAtt(j), i = +t.value;
    S.step[key] = i;
    if (own && own.kind === 'own' && own.state === 'Drafting' && !own.seen.includes(i)) own.seen.push(i);
  } else if (act === 'ho-step') a.pick = +t.value;
  else if (act === 'ho-src') a.src = t.value;
  else if (act === 'i-sub') a.iSub = t.checked;
  else return false;
  return true;
}

function formMore(f) {
  if (f.dataset.act === 'cap-save') {
    const x = attById(f.dataset.id).cap[f.dataset.sec][+f.dataset.i];
    x.value = f.elements.v.value.trim() || x.value;
    S.focus = 'cx-' + S.capEdit; S.capEdit = null;
    return true;
  }
  if (f.dataset.act === 'key-save') {
    f.elements.key.value = ''; // the key is never echoed or kept in page state
    S.keyForm = false; S.keyAdded = TODAY;
    if (S.conn === 'Not set up') S.conn = 'Not recently checked';
    checkNow(); S.focus = 'check';
    return true;
  }
  return false;
}

function harnessMore(act, h) {
  if (act === 'submit') {
    const key = h.dataset.key, j = byKey(key), a = j && activeAtt(j);
    S.outcome[key] = h.dataset.v;
    if (h.dataset.v === 'unclear' && a) {
      a.state = 'Submission unknown'; a.note = 'After Submit, the page showed an error. Docket can’t tell whether it went through.';
      if (a.lease) a.lease = { st: 'locked' };
      write(j, 'Submission unknown after employer Submit');
    }
    S.tab = 'here'; S.sys = false;
  } else if (act === 'inj') {
    const c = h.dataset.v === 'conflict';
    S.queue.push({ id: 'Q' + (S.queue.length + 1), jobId: c ? 'B7E3' : '4F2A', code: h.dataset.v, what: c ? 'Edit Location' : 'Save edits',
      reason: c ? 'Changed elsewhere: scout-2 edited this job at 09:12. Your change wasn’t applied.' : 'Server timed out (504). Stopped after 3 tries.' });
  } else if (act === 'clock') {
    S.mins += 5;
    S.attempts.forEach(a => { if (a.lease && a.lease.st === 'yours') { a.lease.mins -= 5; if (a.lease.mins <= 0) a.lease = { st: 'lost', how: 'expired' }; } });
  } else if (act === 'lose') {
    S.attempts.forEach(a => { if (a.lease && a.lease.st === 'yours') a.lease = { st: 'lost', how: h.dataset.v }; });
  }
}

go(S.page);
render();
