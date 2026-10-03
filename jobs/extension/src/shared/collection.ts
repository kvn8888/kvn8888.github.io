import { normalizeUrl, type Job } from "./model";

export type CollectionMode = "auto" | "manual" | "paused";
export function collectionMode(
  state: { sites: string[]; siteModes?: Record<string, CollectionMode> },
  origin: string,
): CollectionMode {
  return (
    state.siteModes?.[origin] ||
    (state.sites.includes(origin) ? "auto" : "paused")
  );
}
export function selectedIdentity(url: string): string | null {
  const u = new URL(url),
    h = u.hostname;
  if (/(^|\.)linkedin\.com$/.test(h)) {
    const id =
      u.searchParams.get("currentJobId") ||
      u.pathname.match(/\/jobs\/view\/(\d+)/)?.[1];
    return id && /^\d+$/.test(id) ? `linkedin:${id}` : null;
  }
  if (/(^|\.)jobright\.ai$/.test(h)) {
    const id = u.pathname.match(/\/jobs\/info\/([a-z0-9-]+)/i)?.[1];
    return id ? `jobright:${id}` : null;
  }
  if (/(^|\.)joinhandshake\.com$/.test(h)) {
    const id = u.pathname.match(/\/(?:(?:stu\/)?jobs|job-search)\/(\d+)/)?.[1];
    return id ? `handshake:${id}` : null;
  }
  if (/(^|\.)symplicity\.com$/.test(h)) {
    const id =
      u.pathname.match(/\/app\/jobs\/([a-z0-9-]+)/i)?.[1] ||
      u.searchParams.get("job_id") ||
      u.searchParams.get("jobid");
    return id ? `symplicity:${id}` : null;
  }
  return null;
}
export function selectedJob(jobs: Job[], url: string): Job | null {
  const key = selectedIdentity(url);
  if (key) return jobs.find((j) => j.identity_key === key) || null;
  // A board search with one visible card is still a list, not an explicit selection.
  if (
    /(^|\.)(linkedin\.com|jobright\.ai|joinhandshake\.com|symplicity\.com)$/.test(
      new URL(url).hostname,
    )
  )
    return null;
  const same = jobs.filter(
    (j) => normalizeUrl(j.source_url) === normalizeUrl(url),
  );
  return same.length === 1 ? same[0] : null;
}
export function shouldObserve(
  mode: CollectionMode,
  known: Job | undefined,
): boolean {
  return (
    mode !== "paused" && !known?.archived_at && (mode === "auto" || !!known)
  );
}
export function descriptionStatusAfterEdit(
  prior: Job,
  description: string | null,
  confirmedFull: boolean,
) {
  if (!description) return "missing" as const;
  if (confirmedFull) return "full" as const;
  if (prior.description_status === "full" && prior.description === description)
    return "full" as const;
  return "partial" as const;
}

export type Destination = Pick<
  Job,
  | "application_url"
  | "canonical_url"
  | "ats_provider"
  | "ats_tenant"
  | "ats_job_id"
  | "resolution_status"
>;
export function applicationDestination(
  raw: string,
  allowGeneric = false,
): Destination | null {
  const normalized = normalizeUrl(raw);
  if (!normalized) return null;
  const u = new URL(normalized);
  if (
    /(^|\.)(linkedin\.com|jobright\.ai|joinhandshake\.com|symplicity\.com)$/.test(
      u.hostname,
    )
  )
    return null;
  if (
    /\/(?:login|signin|sign-in|oauth|auth|register)(?:\/|$)/i.test(u.pathname)
  )
    return null;
  // Greenhouse's numeric token is a public requisition ID, not an access token.
  for (const key of [...u.searchParams.keys()])
    if (
      /^(jr_id|trackingId|refId|eBP|access_token|id_token|refresh_token|session|sessionid|code|state|password|otp|csrf)$/i.test(
        key,
      ) ||
      (key === "token" &&
        !(
          /(^|\.)greenhouse\.io$/.test(u.hostname) &&
          /^\d+$/.test(u.searchParams.get(key) || "")
        ))
    )
      u.searchParams.delete(key);
  u.hash = "";
  let provider: string | null = null,
    tenant: string | null = null,
    id: string | null = null;
  const parts = u.pathname.split("/").filter(Boolean);
  if (/(^|\.)greenhouse\.io$/.test(u.hostname)) {
    id =
      u.pathname.match(/\/jobs\/(\d+)/)?.[1] ||
      u.searchParams.get("token") ||
      u.searchParams.get("gh_jid");
    tenant = u.searchParams.get("for") || parts[0];
    provider = "greenhouse";
    if (
      !id ||
      !/^\d+$/.test(id) ||
      !tenant ||
      ["embed", "jobs"].includes(tenant)
    ) {
      provider = null;
      tenant = null;
      id = null;
    }
  } else if (
    u.hostname === "jobs.ashbyhq.com" ||
    u.hostname === "jobs.lever.co"
  ) {
    [tenant, id] = parts;
    provider = u.hostname.includes("ashby") ? "ashby" : "lever";
    if (!id || !/^[a-z0-9-]{8,}$/i.test(id)) {
      provider = null;
      tenant = null;
      id = null;
    }
  } else if (/(^|\.)myworkdayjobs\.com$/.test(u.hostname)) {
    const pos = parts.indexOf("job");
    id =
      parts
        .filter((p) => p !== "apply")
        .at(-1)
        ?.match(/_([^_]+)$/)?.[1] || null;
    if (pos >= 1 && id && /[0-9]/.test(id)) {
      tenant = `${u.hostname.split(".")[0]}:${parts[pos - 1]}`;
      provider = "workday";
    } else id = null;
  }
  if (!provider && !allowGeneric) return null;
  if (
    !provider &&
    (!parts.length || /^(careers|jobs|apply)\/?$/.test(parts.join("/")))
  )
    return null;
  const canonical = new URL(u.href);
  if (provider === "greenhouse") {
    canonical.href = `https://job-boards.greenhouse.io/${encodeURIComponent(tenant!)}/jobs/${id}`;
  } else if (provider === "ashby" || provider === "lever") {
    canonical.pathname = `/${tenant}/${id}`;
    canonical.search = "";
  } else if (provider === "workday") {
    canonical.pathname = canonical.pathname.replace(/\/apply\/?$/, "");
    canonical.search = "";
  }
  return {
    application_url: u.href,
    canonical_url: canonical.href,
    ats_provider: provider,
    ats_tenant: tenant,
    ats_job_id: id,
    resolution_status: "resolved",
  };
}

export type DestinationWatch = {
  jobId: string;
  sourceTabId: number;
  targetTabId?: number;
  sourceOrigin: string;
  startedAt: number;
  resolvedKey?: string;
};
export function watchAccepts(
  watch: DestinationWatch,
  tabId: number,
  at = Date.now(),
) {
  return (
    at >= watch.startedAt &&
    at - watch.startedAt < 120000 &&
    (tabId === watch.sourceTabId || tabId === watch.targetTabId)
  );
}
